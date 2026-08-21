import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { openDatabase } from '../connection';
import { PlayerRepository } from '../PlayerRepository';
import { MatchRepository } from '../MatchRepository';
import { HistoryQueries } from '../HistoryQueries';
import { handleHistoryApiRequest } from '../../http/historyApi';
import type { IdentifyResponseDto, MatchDetailDto, MatchHistoryPage, PlayerStatsDto, SyncMatchDto, SyncResponseDto } from '@battle-chess/protocol';

let httpServer: Server;
let baseUrl: string;

beforeEach(async () => {
  const db = await openDatabase({ filePath: ':memory:' });
  const playerRepo = new PlayerRepository(db);
  const matchRepo = new MatchRepository(db);
  const historyQueries = new HistoryQueries(db);
  httpServer = createServer((req, res) => {
    void handleHistoryApiRequest(req, res, { playerRepo, matchRepo, historyQueries }).then((handled) => {
      if (!handled) {
        res.writeHead(404);
        res.end();
      }
    });
  });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function makeSyncMatch(overrides: Partial<SyncMatchDto> = {}): SyncMatchDto {
  return {
    clientLocalMatchId: 'local-match-1',
    source: 'cpu',
    format: 'bo1',
    myColorGame1: 'w',
    opponentLabel: 'CPU (마스터)',
    cpuDifficulty: 'master',
    timeControl: 'unlimited',
    scoreMine: 1,
    scoreOpponent: 0,
    outcome: 'win',
    startedAt: Date.now() - 60_000,
    endedAt: Date.now(),
    games: [
      {
        gameIndex: 0,
        myColor: 'w',
        result: 'white',
        reason: 'checkmate',
        plyCount: 12,
        movesSan: 'e4 e5 Nf3 Nc6 Bb5 a6',
        movesTruncated: false,
        finalFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        startedAt: Date.now() - 60_000,
        endedAt: Date.now(),
      },
    ],
    ...overrides,
  };
}

async function identify(playerId: string, nickname: string, secret: string): Promise<IdentifyResponseDto> {
  const res = await fetch(`${baseUrl}/api/v1/players/identify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId, nickname, secret }),
  });
  return (await res.json()) as IdentifyResponseDto;
}

describe('D10-10 §1 왕복 통합 테스트', () => {
  it('CPU 매치 1건을 업로드하면 히스토리 목록/상세로 동일 값을 조회할 수 있다', async () => {
    const playerId = 'player-round-1';
    const secret = 'secret-round-1';
    const identified = await identify(playerId, 'RoundTester', secret);
    expect(identified.isNew).toBe(true);
    expect(identified.secretAccepted).toBe(true);

    const syncMatch = makeSyncMatch();
    const syncRes = await fetch(`${baseUrl}/api/v1/matches/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bcr-player-id': playerId, 'x-bcr-player-secret': secret },
      body: JSON.stringify({ matches: [syncMatch] }),
    });
    expect(syncRes.status).toBe(200);
    const syncBody = (await syncRes.json()) as SyncResponseDto;
    expect(syncBody.results).toHaveLength(1);
    expect(syncBody.results[0]?.conflict).toBe('inserted');
    const serverMatchId = syncBody.results[0]?.serverMatchId;
    expect(serverMatchId).toBeTruthy();

    const listRes = await fetch(`${baseUrl}/api/v1/players/${playerId}/matches?limit=20`, {
      headers: { 'x-bcr-player-id': playerId, 'x-bcr-player-secret': secret },
    });
    expect(listRes.status).toBe(200);
    const page = (await listRes.json()) as MatchHistoryPage;
    expect(page.matches).toHaveLength(1);
    expect(page.matches[0]?.matchId).toBe(serverMatchId);
    expect(page.matches[0]?.verified).toBe(false);
    expect(page.matches[0]?.outcome).toBe('win');

    const detailRes = await fetch(`${baseUrl}/api/v1/matches/${serverMatchId}`, {
      headers: { 'x-bcr-player-id': playerId, 'x-bcr-player-secret': secret },
    });
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as MatchDetailDto;
    expect(detail.games).toHaveLength(1);
    expect(detail.games[0]?.movesSan).toBe('e4 e5 Nf3 Nc6 Bb5 a6');
    expect(detail.endedAt).toBe(syncMatch.endedAt);

    const statsRes = await fetch(`${baseUrl}/api/v1/players/${playerId}/stats`, {
      headers: { 'x-bcr-player-id': playerId, 'x-bcr-player-secret': secret },
    });
    const stats = (await statsRes.json()) as PlayerStatsDto;
    expect(stats.local.matches).toBe(1);
    expect(stats.local.wins).toBe(1);
    expect(stats.verified.matches).toBe(0);
  });

  it('같은 배치를 3회 업로드해도 matches 증가분은 정확히 1이다(멱등성)', async () => {
    const playerId = 'player-idem-1';
    const secret = 'secret-idem-1';
    await identify(playerId, 'IdemTester', secret);

    let lastServerMatchId: string | undefined;
    for (let i = 0; i < 3; i += 1) {
      const res = await fetch(`${baseUrl}/api/v1/matches/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-bcr-player-id': playerId, 'x-bcr-player-secret': secret },
        body: JSON.stringify({ matches: [makeSyncMatch()] }),
      });
      const body = (await res.json()) as SyncResponseDto;
      const serverMatchId = body.results[0]?.serverMatchId;
      if (i === 0) expect(body.results[0]?.conflict).toBe('inserted');
      else expect(body.results[0]?.conflict).toBe('kept-existing');
      if (lastServerMatchId !== undefined) expect(serverMatchId).toBe(lastServerMatchId);
      lastServerMatchId = serverMatchId;
    }

    const listRes = await fetch(`${baseUrl}/api/v1/players/${playerId}/matches`, { headers: { 'x-bcr-player-id': playerId, 'x-bcr-player-secret': secret } });
    const page = (await listRes.json()) as MatchHistoryPage;
    expect(page.totalCount).toBe(1);
  });
});

describe('D10-10 §3 위조 차단 테스트', () => {
  it("source:'online' 레코드는 항상 409로 거부한다", async () => {
    const playerId = 'player-forge-1';
    const secret = 'secret-forge-1';
    await identify(playerId, 'ForgeTester', secret);

    const res = await fetch(`${baseUrl}/api/v1/matches/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bcr-player-id': playerId, 'x-bcr-player-secret': secret },
      body: JSON.stringify({ matches: [makeSyncMatch({ source: 'online' })] }),
    });
    expect(res.status).toBe(409);
  });

  it('타인의 playerId로 히스토리를 조회하면 403이다', async () => {
    const playerId = 'player-forge-2';
    const secret = 'secret-forge-2';
    await identify(playerId, 'ForgeTester2', secret);
    await identify('someone-else', 'Other', 'other-secret');

    const res = await fetch(`${baseUrl}/api/v1/players/someone-else/matches`, {
      headers: { 'x-bcr-player-id': playerId, 'x-bcr-player-secret': secret },
    });
    expect(res.status).toBe(403);
  });

  it('잘못된 secret으로 요청하면 401이다', async () => {
    const playerId = 'player-forge-3';
    const secret = 'secret-forge-3';
    await identify(playerId, 'ForgeTester3', secret);

    const res = await fetch(`${baseUrl}/api/v1/players/${playerId}/matches`, {
      headers: { 'x-bcr-player-id': playerId, 'x-bcr-player-secret': 'totally-wrong-secret' },
    });
    expect(res.status).toBe(401);
  });
});
