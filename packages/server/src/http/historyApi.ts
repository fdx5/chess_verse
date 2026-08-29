import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import type { IdentifyRequestDto, SyncMatchDto, SyncRequestDto, SyncUploadResult } from '@battle-chess/protocol';
import type { PlayerRepository } from '../db/PlayerRepository.js';
import type { MatchRepository } from '../db/MatchRepository.js';
import type { HistoryQueries } from '../db/HistoryQueries.js';

export interface HistoryApiDeps {
  playerRepo: PlayerRepository;
  matchRepo: MatchRepository;
  historyQueries: HistoryQueries;
}

const MAX_SYNC_BATCH = 50;
const MAX_SYNC_BODY_BYTES = 512 * 1024;
const MAX_IDENTIFY_BODY_BYTES = 4096;

const rateBuckets = new Map<string, number[]>();
function checkRateLimit(key: string, limitPerMin: number): boolean {
  const now = Date.now();
  const timestamps = (rateBuckets.get(key) ?? []).filter((t) => now - t < 60_000);
  if (timestamps.length >= limitPerMin) {
    rateBuckets.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rateBuckets.set(key, timestamps);
  return true;
}

function sendJson(res: ServerResponse, status: number, body: unknown, req?: IncomingMessage): void {
  const jsonStr = JSON.stringify(body);
  const jsonBuf = Buffer.from(jsonStr, 'utf-8');
  const etag = `"${jsonBuf.length.toString(16)}-${createHash('sha1').update(jsonBuf).digest('base64url')}"`;

  const headers: Record<string, string | number> = {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': req?.headers['x-bcr-player-id'] === undefined
      ? 'public, max-age=0, must-revalidate'
      : 'private, max-age=0, must-revalidate',
    ETag: etag,
    Vary: 'Accept-Encoding',
  };

  if (req?.headers['if-none-match'] === etag && status === 200) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  const acceptEncoding = (req?.headers['accept-encoding'] ?? '') as string;
  if (jsonBuf.length > 512 && acceptEncoding.includes('br')) {
    try {
      const compressed = brotliCompressSync(jsonBuf);
      headers['content-encoding'] = 'br';
      headers['content-length'] = compressed.length;
      res.writeHead(status, headers);
      res.end(compressed);
      return;
    } catch {
      // Fall through to gzip or the uncompressed response.
    }
  }

  if (jsonBuf.length > 512 && acceptEncoding.includes('gzip')) {
    try {
      const gzipped = gzipSync(jsonBuf, { level: 6 });
      headers['content-encoding'] = 'gzip';
      headers['content-length'] = gzipped.length;
      res.writeHead(status, headers);
      res.end(gzipped);
      return;
    } catch {
      // 압축 실패 시 일반 전송
    }
  }

  headers['content-length'] = jsonBuf.length;
  res.writeHead(status, headers);
  res.end(jsonBuf);
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', () => resolve(null));
  });
}

function normalizeNickname(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 16) return null;
  return trimmed;
}

async function authenticate(req: IncomingMessage, deps: HistoryApiDeps): Promise<{ playerId: string } | null> {
  const playerId = req.headers['x-bcr-player-id'];
  const secret = req.headers['x-bcr-player-secret'];
  if (typeof playerId !== 'string' || typeof secret !== 'string') return null;
  if (!(await deps.playerRepo.verifySecret(playerId, secret))) return null;
  return { playerId };
}

async function insertOne(deps: HistoryApiDeps, submittedByPlayerId: string, m: SyncMatchDto): Promise<SyncUploadResult> {
  const source = m.source === 'online' ? 'local2p' : m.source; // 여기 도달 시점엔 이미 online은 걸러진 뒤(방어적 폴백)
  const result = await deps.matchRepo.insertSyncedMatch({
    clientLocalMatchId: m.clientLocalMatchId,
    submittedByPlayerId,
    source,
    format: m.format,
    myColorGame1: m.myColorGame1,
    opponentLabel: m.opponentLabel,
    ...(m.cpuDifficulty !== undefined ? { cpuDifficulty: m.cpuDifficulty } : {}),
    timeControl: m.timeControl,
    scoreMine: m.scoreMine,
    scoreOpponent: m.scoreOpponent,
    outcome: m.outcome,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    piecesLostMine: m.piecesLostMine,
    durationSeconds: m.durationSeconds,
    score: m.score,
    games: m.games,
  });
  return { clientLocalMatchId: m.clientLocalMatchId, serverMatchId: result.serverMatchId, conflict: result.conflict };
}

/** D10-6 §히스토리 REST API. `/api/v1/` 하위가 아니면 false를 반환해 상위 핸들러가 이어받게 한다. */
export async function handleHistoryApiRequest(req: IncomingMessage, res: ServerResponse, deps: HistoryApiDeps): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://internal');
  if (!url.pathname.startsWith('/api/v1/')) return false;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,x-bcr-player-id,x-bcr-player-secret',
    });
    res.end();
    return true;
  }

  const ip = req.socket.remoteAddress ?? 'unknown';

  try {
    if (url.pathname === '/api/v1/players/check-nickname' && req.method === 'POST') {
      const body = await readBody(req, MAX_IDENTIFY_BODY_BYTES);
      if (body === null) {
        sendJson(res, 413, { error: 'PAYLOAD_TOO_LARGE' }, req);
        return true;
      }
      const parsed = JSON.parse(body) as { nickname?: string; playerId?: string };
      const nickname = normalizeNickname(parsed.nickname);
      if (nickname === null) {
        sendJson(res, 200, { available: false, reason: 'invalid_length' }, req);
        return true;
      }
      const available = await deps.playerRepo.isNicknameAvailable(nickname, parsed.playerId);
      sendJson(res, 200, { available, reason: available ? undefined : 'taken' }, req);
      return true;
    }

    if (url.pathname === '/api/v1/leaderboard' && req.method === 'GET') {
      const difficulty = (url.searchParams.get('difficulty') ?? 'intermediate') as import('@battle-chess/protocol').Difficulty;
      const limit = Number(url.searchParams.get('limit') ?? 50);
      const entries = await deps.historyQueries.getLeaderboard(difficulty, limit);
      sendJson(res, 200, { difficulty, entries, totalCount: entries.length }, req);
      return true;
    }

    if (url.pathname === '/api/v1/guestbook' && req.method === 'GET') {
      const limit = Number(url.searchParams.get('limit') ?? 100);
      sendJson(res, 200, await deps.playerRepo.listGuestbook(limit), req);
      return true;
    }

    if (url.pathname === '/api/v1/guestbook' && req.method === 'PUT') {
      if (!checkRateLimit(`guestbook:${ip}`, 10)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' }, req);
        return true;
      }
      const auth = await authenticate(req, deps);
      if (auth === null) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' }, req);
        return true;
      }
      const body = await readBody(req, MAX_IDENTIFY_BODY_BYTES);
      if (body === null) {
        sendJson(res, 413, { error: 'PAYLOAD_TOO_LARGE' }, req);
        return true;
      }
      const parsed = JSON.parse(body) as { message?: unknown };
      const message = typeof parsed.message === 'string' ? parsed.message.replace(/[\r\n]+/g, ' ').trim() : '';
      if (message.length < 1 || message.length > 80) {
        sendJson(res, 400, { error: 'INVALID_MESSAGE' }, req);
        return true;
      }
      sendJson(res, 200, await deps.playerRepo.upsertGuestbook(auth.playerId, message), req);
      return true;
    }

    if (url.pathname === '/api/v1/matches' && req.method === 'GET') {
      if (!checkRateLimit(`get:${ip}`, 60)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' }, req);
        return true;
      }
      const limit = Number(url.searchParams.get('limit') ?? '50');
      const beforeParam = url.searchParams.get('before');
      const before = beforeParam !== null ? Number(beforeParam) : undefined;
      sendJson(res, 200, await deps.historyQueries.listPublicMatches(limit, before), req);
      return true;
    }

    if (url.pathname === '/api/v1/players/identify' && req.method === 'POST') {
      if (!checkRateLimit(`identify:${ip}`, 10)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' }, req);
        return true;
      }
      const body = await readBody(req, MAX_IDENTIFY_BODY_BYTES);
      if (body === null) {
        sendJson(res, 413, { error: 'PAYLOAD_TOO_LARGE' }, req);
        return true;
      }
      const parsed = JSON.parse(body) as IdentifyRequestDto;
      const nickname = normalizeNickname(parsed.nickname);
      if (nickname === null || typeof parsed.playerId !== 'string') {
        sendJson(res, 400, { error: 'INVALID_NICKNAME' }, req);
        return true;
      }
      const result = await deps.playerRepo.upsert({ id: parsed.playerId, nickname, ...(parsed.secret !== undefined ? { secret: parsed.secret } : {}) });
      sendJson(res, 200, { playerId: parsed.playerId, nickname, isNew: result.isNew, secretAccepted: result.secretAccepted }, req);
      return true;
    }

    if (url.pathname === '/api/v1/matches/sync' && req.method === 'POST') {
      if (!checkRateLimit(`sync:${ip}`, 6)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' }, req);
        return true;
      }
      const auth = await authenticate(req, deps);
      if (auth === null) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' }, req);
        return true;
      }
      const body = await readBody(req, MAX_SYNC_BODY_BYTES);
      if (body === null) {
        sendJson(res, 413, { error: 'PAYLOAD_TOO_LARGE' }, req);
        return true;
      }
      const parsed = JSON.parse(body) as SyncRequestDto;
      if (parsed.matches.length > MAX_SYNC_BATCH) {
        sendJson(res, 413, { error: 'PAYLOAD_TOO_LARGE' }, req);
        return true;
      }
      if (parsed.matches.some((m) => m.source === 'online')) {
        sendJson(res, 409, { error: 'ONLINE_RESULT_SERVER_ONLY' }, req);
        return true;
      }
      const results: SyncUploadResult[] = [];
      for (const m of parsed.matches) {
        results.push(await insertOne(deps, auth.playerId, m));
      }
      sendJson(res, 200, { results }, req);
      return true;
    }

    const listMatch = url.pathname.match(/^\/api\/v1\/players\/([^/]+)\/matches$/);
    if (listMatch !== null && req.method === 'GET') {
      if (!checkRateLimit(`get:${ip}`, 60)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' }, req);
        return true;
      }
      const auth = await authenticate(req, deps);
      if (auth === null) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' }, req);
        return true;
      }
      const targetId = listMatch[1];
      if (targetId !== auth.playerId) {
        sendJson(res, 403, { error: 'FORBIDDEN' }, req);
        return true;
      }
      const limit = Number(url.searchParams.get('limit') ?? '20');
      const beforeParam = url.searchParams.get('before');
      const before = beforeParam !== null ? Number(beforeParam) : undefined;
      const historyPage = await deps.historyQueries.listMatches(targetId, limit, before);
      sendJson(res, 200, historyPage, req);
      return true;
    }

    const detailMatch = url.pathname.match(/^\/api\/v1\/matches\/([^/]+)$/);
    if (detailMatch !== null && req.method === 'GET') {
      if (!checkRateLimit(`get:${ip}`, 60)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' }, req);
        return true;
      }
      const auth = await authenticate(req, deps);
      if (auth === null) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' }, req);
        return true;
      }
      const matchId = detailMatch[1];
      const detail = matchId !== undefined ? await deps.historyQueries.getMatchDetail(matchId, auth.playerId) : null;
      if (detail === null) {
        sendJson(res, 404, { error: 'NOT_FOUND' }, req);
        return true;
      }
      sendJson(res, 200, detail, req);
      return true;
    }

    const statsMatch = url.pathname.match(/^\/api\/v1\/players\/([^/]+)\/stats$/);
    if (statsMatch !== null && req.method === 'GET') {
      if (!checkRateLimit(`get:${ip}`, 60)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' }, req);
        return true;
      }
      const auth = await authenticate(req, deps);
      if (auth === null) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' }, req);
        return true;
      }
      const targetId = statsMatch[1];
      if (targetId !== auth.playerId) {
        sendJson(res, 403, { error: 'FORBIDDEN' }, req);
        return true;
      }
      const stats = await deps.historyQueries.getStats(targetId);
      if (stats === null) {
        sendJson(res, 404, { error: 'PLAYER_NOT_FOUND' }, req);
        return true;
      }
      sendJson(res, 200, stats, req);
      return true;
    }

    const deleteMatch = url.pathname.match(/^\/api\/v1\/players\/([^/]+)$/);
    if (deleteMatch !== null && req.method === 'DELETE') {
      if (!checkRateLimit(`delete:${ip}`, 3)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' }, req);
        return true;
      }
      const auth = await authenticate(req, deps);
      if (auth === null) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' }, req);
        return true;
      }
      const targetId = deleteMatch[1];
      if (targetId !== auth.playerId) {
        sendJson(res, 403, { error: 'FORBIDDEN' }, req);
        return true;
      }
      await deps.playerRepo.deleteCascade(auth.playerId);
      res.writeHead(204, { 'access-control-allow-origin': '*' });
      res.end();
      return true;
    }

    sendJson(res, 404, { error: 'NOT_FOUND' }, req);
    return true;
  } catch (err) {
    console.error('[historyApi] error:', err);
    sendJson(res, 400, { error: 'BAD_REQUEST' }, req);
    return true;
  }
}
