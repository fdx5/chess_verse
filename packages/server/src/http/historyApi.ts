import type { IncomingMessage, ServerResponse } from 'node:http';
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
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

function authenticate(req: IncomingMessage, deps: HistoryApiDeps): { playerId: string } | null {
  const playerId = req.headers['x-bcr-player-id'];
  const secret = req.headers['x-bcr-player-secret'];
  if (typeof playerId !== 'string' || typeof secret !== 'string') return null;
  if (!deps.playerRepo.verifySecret(playerId, secret)) return null;
  return { playerId };
}

function insertOne(deps: HistoryApiDeps, submittedByPlayerId: string, m: SyncMatchDto): SyncUploadResult {
  const source = m.source === 'online' ? 'local2p' : m.source; // 여기 도달 시점엔 이미 online은 걸러진 뒤(방어적 폴백)
  const result = deps.matchRepo.insertSyncedMatch({
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
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,x-bcr-player-id,x-bcr-player-secret',
    });
    res.end();
    return true;
  }

  const ip = req.socket.remoteAddress ?? 'unknown';

  try {
    if (url.pathname === '/api/v1/players/identify' && req.method === 'POST') {
      if (!checkRateLimit(`identify:${ip}`, 10)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' });
        return true;
      }
      const body = await readBody(req, MAX_IDENTIFY_BODY_BYTES);
      if (body === null) {
        sendJson(res, 413, { error: 'PAYLOAD_TOO_LARGE' });
        return true;
      }
      const parsed = JSON.parse(body) as IdentifyRequestDto;
      const nickname = normalizeNickname(parsed.nickname);
      if (nickname === null || typeof parsed.playerId !== 'string') {
        sendJson(res, 400, { error: 'INVALID_NICKNAME' });
        return true;
      }
      const result = deps.playerRepo.upsert({ id: parsed.playerId, nickname, ...(parsed.secret !== undefined ? { secret: parsed.secret } : {}) });
      sendJson(res, 200, { playerId: parsed.playerId, nickname, isNew: result.isNew, secretAccepted: result.secretAccepted });
      return true;
    }

    if (url.pathname === '/api/v1/matches/sync' && req.method === 'POST') {
      if (!checkRateLimit(`sync:${ip}`, 6)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' });
        return true;
      }
      const auth = authenticate(req, deps);
      if (auth === null) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' });
        return true;
      }
      const body = await readBody(req, MAX_SYNC_BODY_BYTES);
      if (body === null) {
        sendJson(res, 413, { error: 'PAYLOAD_TOO_LARGE' });
        return true;
      }
      const parsed = JSON.parse(body) as SyncRequestDto;
      if (parsed.matches.length > MAX_SYNC_BATCH) {
        sendJson(res, 413, { error: 'PAYLOAD_TOO_LARGE' });
        return true;
      }
      if (parsed.matches.some((m) => m.source === 'online')) {
        sendJson(res, 409, { error: 'ONLINE_RESULT_SERVER_ONLY' });
        return true;
      }
      const results = parsed.matches.map((m) => insertOne(deps, auth.playerId, m));
      sendJson(res, 200, { results });
      return true;
    }

    const listMatch = url.pathname.match(/^\/api\/v1\/players\/([^/]+)\/matches$/);
    if (listMatch !== null && req.method === 'GET') {
      if (!checkRateLimit(`get:${ip}`, 60)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' });
        return true;
      }
      const auth = authenticate(req, deps);
      if (auth === null) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' });
        return true;
      }
      const targetId = listMatch[1];
      if (targetId !== auth.playerId) {
        sendJson(res, 403, { error: 'FORBIDDEN' });
        return true;
      }
      const limit = Number(url.searchParams.get('limit') ?? '20');
      const beforeParam = url.searchParams.get('before');
      const before = beforeParam !== null ? Number(beforeParam) : undefined;
      sendJson(res, 200, deps.historyQueries.listMatches(targetId, limit, before));
      return true;
    }

    const detailMatch = url.pathname.match(/^\/api\/v1\/matches\/([^/]+)$/);
    if (detailMatch !== null && req.method === 'GET') {
      if (!checkRateLimit(`get:${ip}`, 60)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' });
        return true;
      }
      const auth = authenticate(req, deps);
      if (auth === null) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' });
        return true;
      }
      const matchId = detailMatch[1];
      const detail = matchId !== undefined ? deps.historyQueries.getMatchDetail(matchId, auth.playerId) : null;
      if (detail === null) {
        sendJson(res, 404, { error: 'NOT_FOUND' });
        return true;
      }
      sendJson(res, 200, detail);
      return true;
    }

    const statsMatch = url.pathname.match(/^\/api\/v1\/players\/([^/]+)\/stats$/);
    if (statsMatch !== null && req.method === 'GET') {
      if (!checkRateLimit(`get:${ip}`, 60)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' });
        return true;
      }
      const auth = authenticate(req, deps);
      if (auth === null) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' });
        return true;
      }
      const targetId = statsMatch[1];
      if (targetId !== auth.playerId) {
        sendJson(res, 403, { error: 'FORBIDDEN' });
        return true;
      }
      const stats = deps.historyQueries.getStats(targetId);
      if (stats === null) {
        sendJson(res, 404, { error: 'PLAYER_NOT_FOUND' });
        return true;
      }
      sendJson(res, 200, stats);
      return true;
    }

    const deleteMatch = url.pathname.match(/^\/api\/v1\/players\/([^/]+)$/);
    if (deleteMatch !== null && req.method === 'DELETE') {
      if (!checkRateLimit(`delete:${ip}`, 3)) {
        sendJson(res, 429, { error: 'RATE_LIMITED' });
        return true;
      }
      const auth = authenticate(req, deps);
      if (auth === null) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' });
        return true;
      }
      const targetId = deleteMatch[1];
      if (targetId !== auth.playerId) {
        sendJson(res, 403, { error: 'FORBIDDEN' });
        return true;
      }
      deps.playerRepo.deleteCascade(auth.playerId);
      res.writeHead(204, { 'access-control-allow-origin': '*' });
      res.end();
      return true;
    }

    sendJson(res, 404, { error: 'NOT_FOUND' });
    return true;
  } catch (err) {
    console.error('[historyApi] error:', err);
    sendJson(res, 400, { error: 'BAD_REQUEST' });
    return true;
  }
}
