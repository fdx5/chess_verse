import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { IndexedDbStore } from '../IndexedDbStore';
import { MatchRecorder } from '../MatchRecorder';
import { HistoryClient } from '../HistoryClient';
import { SyncEngine } from '../SyncEngine';
import { createIdentity } from '../identity';
import type { LocalGameRecord } from '../../game/MatchState';

// Node 테스트 환경에는 브라우저 localStorage가 없다 — identity.ts가 쓰는 최소 Map 기반 폴리필.
if (typeof globalThis.localStorage === 'undefined') {
  const backing = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => backing.get(key) ?? null,
    setItem: (key: string, value: string) => {
      backing.set(key, value);
    },
    removeItem: (key: string) => {
      backing.delete(key);
    },
    clear: () => backing.clear(),
    key: (index: number) => Array.from(backing.keys())[index] ?? null,
    get length() {
      return backing.size;
    },
  } as Storage;
}

const SAMPLE_MOVES_SAN = 'e4 e5 Qh5 Nc6 Bc4 Nf6';

function makeGame(localMatchId: string): LocalGameRecord {
  return {
    localGameId: `game-${localMatchId}`,
    localMatchId,
    gameIndex: 0,
    myColor: 'w',
    result: 'white',
    reason: 'checkmate',
    plyCount: 6,
    movesSan: SAMPLE_MOVES_SAN,
    movesTruncated: false,
    finalFen: 'rnbqkb1r/pppp1ppp/5n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 5 3',
    startedAt: Date.now() - 10_000,
    endedAt: Date.now(),
  };
}

/** 실제 서버 대신 sync 엔드포인트만 흉내내는 스텁 — 서버 로직 자체는 packages/server의 roundtrip 테스트가 검증한다. */
function startStubServer(mode: 'accept' | 'fail'): Promise<{ port: number; uploadedBodies: unknown[] }> {
  const uploadedBodies: unknown[] = [];
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === '/api/v1/matches/sync' && req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          if (mode === 'fail') {
            res.writeHead(500);
            res.end();
            return;
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as { matches: { clientLocalMatchId: string }[] };
          uploadedBodies.push(body);
          const results = body.matches.map((m) => ({ clientLocalMatchId: m.clientLocalMatchId, serverMatchId: `server-${m.clientLocalMatchId}`, conflict: 'inserted' as const }));
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ results }));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve({ port, uploadedBodies });
      stopHandle = server;
    });
  });
}
let stopHandle: Server | null = null;

afterEach(async () => {
  if (stopHandle !== null) {
    await new Promise<void>((resolve) => stopHandle?.close(() => resolve()));
    stopHandle = null;
  }
});

describe('D10-10 §1/4 오프라인 우선 저장 + 동기화 왕복', () => {
  let store: IndexedDbStore;

  beforeEach(async () => {
    store = new IndexedDbStore();
    await store.open();
    await store.clearAll(); // fake-indexeddb는 프로세스 전역 저장소라 테스트 간 상태를 초기화해야 한다.
  });

  it('CPU 매치를 기록하면 IndexedDB에 local 상태로 저장되고 syncQueue에 op가 쌓인다', async () => {
    const recorder = new MatchRecorder(store);
    const record = await recorder.record({
      localMatchId: 'match-1',
      source: 'cpu',
      format: 'bo1',
      myPlayerId: 'player-1',
      myColorGame1: 'w',
      opponentKind: 'cpu',
      opponentLabel: 'CPU (마스터)',
      cpuDifficulty: 'master',
      timeControl: 'unlimited',
      scoreMine: 1,
      scoreOpponent: 0,
      outcome: 'win',
      startedAt: Date.now() - 10_000,
      endedAt: Date.now(),
      games: [makeGame('match-1')],
    });
    expect(record?.syncState).toBe('local');

    const listed = await store.listMatches({ limit: 10 });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.localMatchId).toBe('match-1');

    const detail = await store.getMatchDetail('match-1');
    expect(detail?.games).toHaveLength(1);
    expect(detail?.games[0]?.movesSan).toBe(SAMPLE_MOVES_SAN);

    const ops = await store.pendingSyncOps(Date.now() + 1000, 10);
    expect(ops).toHaveLength(1);
    expect(ops[0]?.localMatchId).toBe('match-1');
  });

  it('온라인 매치는 syncState가 곧바로 synced로 저장되고 syncQueue에 쌓이지 않는다', async () => {
    const recorder = new MatchRecorder(store);
    await recorder.record({
      localMatchId: 'match-online-1',
      source: 'online',
      format: 'bo1',
      myPlayerId: 'player-1',
      myColorGame1: 'w',
      opponentKind: 'human-online',
      opponentLabel: 'Bob',
      opponentPlayerId: 'bob-id',
      timeControl: 'unlimited',
      scoreMine: 1,
      scoreOpponent: 0,
      outcome: 'win',
      startedAt: Date.now() - 10_000,
      endedAt: Date.now(),
      games: [makeGame('match-online-1')],
      serverMatchId: 'server-match-online-1',
    });

    const detail = await store.getMatchDetail('match-online-1');
    expect(detail?.match.syncState).toBe('synced');
    expect(detail?.match.serverMatchId).toBe('server-match-online-1');

    const ops = await store.pendingSyncOps(Date.now() + 1000, 10);
    expect(ops).toHaveLength(0);
  });

  it('SyncEngine.syncNow()가 서버 업로드에 성공하면 로컬 레코드를 synced로 갱신한다', async () => {
    const { port, uploadedBodies } = await startStubServer('accept');
    const recorder = new MatchRecorder(store);
    await recorder.record({
      localMatchId: 'match-sync-1',
      source: 'cpu',
      format: 'bo1',
      myPlayerId: 'player-1',
      myColorGame1: 'w',
      opponentKind: 'cpu',
      opponentLabel: 'CPU (마스터)',
      cpuDifficulty: 'master',
      timeControl: 'unlimited',
      scoreMine: 1,
      scoreOpponent: 0,
      outcome: 'win',
      startedAt: Date.now() - 10_000,
      endedAt: Date.now(),
      games: [makeGame('match-sync-1')],
    });

    const identity = createIdentity('SyncTester');
    const client = new HistoryClient(`http://127.0.0.1:${port}`);
    const engine = new SyncEngine(store, client);
    engine.setIdentity(identity);

    const result = await engine.syncNow();
    expect(result).toEqual({ uploaded: 1, failed: 0 });
    expect(uploadedBodies).toHaveLength(1);

    const detail = await store.getMatchDetail('match-sync-1');
    expect(detail?.match.syncState).toBe('synced');
    expect(detail?.match.serverMatchId).toBe('server-match-sync-1');

    const remainingOps = await store.pendingSyncOps(Date.now() + 1000, 10);
    expect(remainingOps).toHaveLength(0);
  });

  it('오프라인(서버 5xx) 상태에서는 재시도가 예약되고 레코드는 local로 남는다', async () => {
    const { port } = await startStubServer('fail');
    const recorder = new MatchRecorder(store);
    await recorder.record({
      localMatchId: 'match-offline-1',
      source: 'cpu',
      format: 'bo1',
      myPlayerId: 'player-1',
      myColorGame1: 'w',
      opponentKind: 'cpu',
      opponentLabel: 'CPU (마스터)',
      cpuDifficulty: 'master',
      timeControl: 'unlimited',
      scoreMine: 1,
      scoreOpponent: 0,
      outcome: 'win',
      startedAt: Date.now() - 10_000,
      endedAt: Date.now(),
      games: [makeGame('match-offline-1')],
    });

    const identity = createIdentity('OfflineTester');
    const client = new HistoryClient(`http://127.0.0.1:${port}`);
    const engine = new SyncEngine(store, client);
    engine.setIdentity(identity);

    const result = await engine.syncNow();
    expect(result).toEqual({ uploaded: 0, failed: 1 });

    const detail = await store.getMatchDetail('match-offline-1');
    expect(detail?.match.syncState).toBe('local');

    const ops = await store.pendingSyncOps(Date.now() + 400_000, 10);
    expect(ops).toHaveLength(1);
    expect(ops[0]?.attempts).toBe(1);
    expect(ops[0]?.nextAttemptAt).toBeGreaterThan(Date.now());
  });
});
