import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import WebSocket from 'ws';
import { attachNetServer, type NetServer } from '../netServer';
import { openDatabase } from '../db/connection';
import { PlayerRepository } from '../db/PlayerRepository';
import { MatchRepository } from '../db/MatchRepository';
import { HistoryQueries } from '../db/HistoryQueries';
import { envelope } from '@battle-chess/protocol';
import type { AnyMessage } from '@battle-chess/protocol';

let httpServer: Server | null = null;
let netServer: NetServer | null = null;

/** D10-10 §왕복 통합 테스트 — 테스트마다 독립된 인메모리 DB를 새로 연다. */
function startServer(): Promise<{ port: number; historyQueries: HistoryQueries }> {
  return new Promise((resolve) => {
    const db = openDatabase(':memory:');
    const playerRepo = new PlayerRepository(db);
    const matchRepo = new MatchRepository(db);
    const historyQueries = new HistoryQueries(db);
    httpServer = createServer();
    netServer = attachNetServer(httpServer, { playerRepo, matchRepo });
    httpServer.listen(0, () => {
      const address = httpServer?.address();
      resolve({ port: typeof address === 'object' && address !== null ? address.port : 0, historyQueries });
    });
  });
}

afterEach(async () => {
  netServer?.close();
  await new Promise<void>((resolve) => httpServer?.close(() => resolve()));
  httpServer = null;
  netServer = null;
});

class TestClient {
  readonly ws: WebSocket;
  readonly received: AnyMessage[] = [];
  private waiters: { predicate: (m: AnyMessage) => boolean; resolve: (m: AnyMessage) => void }[] = [];

  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}`);
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as AnyMessage;
      const waiterIdx = this.waiters.findIndex((w) => w.predicate(msg));
      if (waiterIdx !== -1) {
        const [waiter] = this.waiters.splice(waiterIdx, 1);
        waiter?.resolve(msg);
      } else {
        this.received.push(msg);
      }
    });
  }

  ready(): Promise<void> {
    return new Promise((resolve) => this.ws.on('open', () => resolve()));
  }

  send(msg: AnyMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * 매칭된 메시지를 `received`에서 즉시 소비(splice)한다 — 그냥 `find()`만 하면 호출부가 나중에
   * `received.length=0`으로 정리할 때 "아직 안 기다린" 다른 메시지(예: 같은 틱에 함께 도착한
   * GAME_END/MATCH_END)까지 같이 지워버리는 경합이 생긴다(실제로 이 버그로 테스트가 멈춘 적 있음).
   */
  waitFor(type: AnyMessage['type'], timeoutMs = 3000): Promise<AnyMessage> {
    const idx = this.received.findIndex((m) => m.type === type);
    if (idx !== -1) {
      const [msg] = this.received.splice(idx, 1);
      if (msg !== undefined) return Promise.resolve(msg);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
      this.waiters.push({
        predicate: (m) => m.type === type,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  close(): void {
    this.ws.close();
  }
}

function identify(client: TestClient, playerId: string, nickname: string): void {
  client.send(envelope('PLAYER_IDENTIFY', { playerId, nickname }));
}

/** D9 Sprint 9 DoD 1: 두 클라이언트가 온라인 대전(Bo1)을 처음부터 끝까지 완주한다. */
describe('NetServer 통합 — 두 소켓으로 온라인 대전 완주', () => {
  it('quick 매칭 → 폴즈 메이트까지 완주해 MATCH_END를 양쪽이 받는다', async () => {
    const { port, historyQueries } = await startServer();
    const alice = new TestClient(port);
    const bob = new TestClient(port);
    await Promise.all([alice.ready(), bob.ready()]);

    identify(alice, 'alice-id', 'Alice');
    identify(bob, 'bob-id', 'Bob');
    await Promise.all([alice.waitFor('PLAYER_IDENTIFIED'), bob.waitFor('PLAYER_IDENTIFIED')]);

    const timeControl = { kind: 'unlimited' as const };
    alice.send(envelope('QUEUE_JOIN', { mode: 'quick' as const, timeControl, matchFormat: 'bo1' as const }));
    bob.send(envelope('QUEUE_JOIN', { mode: 'quick' as const, timeControl, matchFormat: 'bo1' as const }));

    const aliceMatchFound = await alice.waitFor('MATCH_FOUND');
    const bobMatchFound = await bob.waitFor('MATCH_FOUND');
    expect(aliceMatchFound.type).toBe('MATCH_FOUND');
    expect(bobMatchFound.type).toBe('MATCH_FOUND');
    if (aliceMatchFound.type !== 'MATCH_FOUND' || bobMatchFound.type !== 'MATCH_FOUND') throw new Error('unreachable');
    expect(aliceMatchFound.payload.yourColor).not.toBe(bobMatchFound.payload.yourColor);

    const matchId = aliceMatchFound.payload.matchId;
    const white = aliceMatchFound.payload.yourColor === 'w' ? alice : bob;
    const black = aliceMatchFound.payload.yourColor === 'w' ? bob : alice;

    // Fool's mate: 1. f3 e5 2. g4 Qh4#  (백이 스스로 체크메이트당하는 최단 게임 — 서버 로직 검증에 충분)
    const moves: { from: string; to: string; mover: TestClient }[] = [
      { from: 'f2', to: 'f3', mover: white },
      { from: 'e7', to: 'e5', mover: black },
      { from: 'g2', to: 'g4', mover: white },
      { from: 'd8', to: 'h4', mover: black },
    ];

    function algebraicToRankFile(sq: string): { file: number; rank: number } {
      const file = sq.charCodeAt(0) - 'a'.charCodeAt(0);
      const rank = Number(sq[1]) - 1;
      return { file, rank };
    }
    function toSquareIndex(sq: string): number {
      const { file, rank } = algebraicToRankFile(sq);
      return rank * 16 + file;
    }

    let clientMoveIdCounter = 0;
    for (const { from, to, mover } of moves) {
      clientMoveIdCounter += 1;
      mover.send(
        envelope('MOVE', {
          matchId,
          gameIndex: 0,
          move: { from: toSquareIndex(from) as never, to: toSquareIndex(to) as never, flags: 0 },
          clientMoveId: `m${clientMoveIdCounter}`,
        })
      );
      await Promise.all([alice.waitFor('MOVE_ACCEPTED'), bob.waitFor('MOVE_ACCEPTED')]);
    }

    const aliceMatchEnd = await alice.waitFor('MATCH_END');
    const bobMatchEnd = await bob.waitFor('MATCH_END');
    expect(aliceMatchEnd.type).toBe('MATCH_END');
    expect(bobMatchEnd.type).toBe('MATCH_END');
    if (aliceMatchEnd.type === 'MATCH_END' && bobMatchEnd.type === 'MATCH_END') {
      // 흑이 체크메이트로 이겼으므로 black 쪽 winnerColorForYou==='you'
      const blackIsAlice = black === alice;
      const expectedAliceOutcome = blackIsAlice ? 'you' : 'opponent';
      expect(aliceMatchEnd.payload.winnerColorForYou).toBe(expectedAliceOutcome);

      // D10-10 §5 권위 기록 테스트 — MATCH_END 수신 시점에 이미 서버 DB(SQLite)에 검증된 로우가 있어야 한다.
      expect(aliceMatchEnd.payload.serverMatchId).not.toBeNull();
      const serverMatchId = aliceMatchEnd.payload.serverMatchId;
      if (serverMatchId !== null) {
        const detail = historyQueries.getMatchDetail(serverMatchId, 'alice-id');
        expect(detail).not.toBeNull();
        expect(detail?.verified).toBe(true);
        expect(detail?.source).toBe('online');
        expect(detail?.games.length).toBe(1);
        expect(detail?.games[0]?.reason).toBe('checkmate');
        expect(detail?.games[0]?.movesSan?.length ?? 0).toBeGreaterThan(0);
      }
    }

    alice.close();
    bob.close();
  }, 10_000);

  it('불법수를 보내면 MOVE_REJECTED를 받는다', async () => {
    const { port } = await startServer();
    const alice = new TestClient(port);
    const bob = new TestClient(port);
    await Promise.all([alice.ready(), bob.ready()]);
    identify(alice, 'alice-2', 'Alice2');
    identify(bob, 'bob-2', 'Bob2');
    await Promise.all([alice.waitFor('PLAYER_IDENTIFIED'), bob.waitFor('PLAYER_IDENTIFIED')]);

    const timeControl = { kind: 'unlimited' as const };
    alice.send(envelope('QUEUE_JOIN', { mode: 'quick' as const, timeControl, matchFormat: 'bo1' as const }));
    bob.send(envelope('QUEUE_JOIN', { mode: 'quick' as const, timeControl, matchFormat: 'bo1' as const }));
    const aliceMatchFound = await alice.waitFor('MATCH_FOUND');
    if (aliceMatchFound.type !== 'MATCH_FOUND') throw new Error('unreachable');
    const matchId = aliceMatchFound.payload.matchId;
    const white = aliceMatchFound.payload.yourColor === 'w' ? alice : bob;

    // 백 나이트가 존재하지 않는 방식의 불법 이동(e2 폰을 e5로 순간이동).
    white.send(envelope('MOVE', { matchId, gameIndex: 0, move: { from: 0x14 as never, to: 0x44 as never, flags: 0 }, clientMoveId: 'bad-1' }));
    const rejected = await white.waitFor('MOVE_REJECTED');
    expect(rejected.type).toBe('MOVE_REJECTED');

    alice.close();
    bob.close();
  }, 10_000);

  /** D9 Sprint 9 DoD 2: 재접속 시 FEN·기보·시계가 완전 일치. */
  it('재접속하면 STATE_SYNC로 정확한 FEN을 받는다', async () => {
    const { port } = await startServer();
    const alice = new TestClient(port);
    const bob = new TestClient(port);
    await Promise.all([alice.ready(), bob.ready()]);
    identify(alice, 'alice-3', 'Alice3');
    identify(bob, 'bob-3', 'Bob3');
    await Promise.all([alice.waitFor('PLAYER_IDENTIFIED'), bob.waitFor('PLAYER_IDENTIFIED')]);

    const timeControl = { kind: 'unlimited' as const };
    alice.send(envelope('QUEUE_JOIN', { mode: 'quick' as const, timeControl, matchFormat: 'bo1' as const }));
    bob.send(envelope('QUEUE_JOIN', { mode: 'quick' as const, timeControl, matchFormat: 'bo1' as const }));
    const aliceMatchFound = await alice.waitFor('MATCH_FOUND');
    const bobMatchFound = await bob.waitFor('MATCH_FOUND');
    if (aliceMatchFound.type !== 'MATCH_FOUND' || bobMatchFound.type !== 'MATCH_FOUND') throw new Error('unreachable');
    const matchId = aliceMatchFound.payload.matchId;
    expect(aliceMatchFound.payload.sessionToken.length).toBeGreaterThan(0);
    const white = aliceMatchFound.payload.yourColor === 'w' ? alice : bob;
    const whiteSessionToken = white === alice ? aliceMatchFound.payload.sessionToken : bobMatchFound.payload.sessionToken;

    // 백이 1.e4를 둔다.
    white.send(envelope('MOVE', { matchId, gameIndex: 0, move: { from: 0x14 as never, to: 0x34 as never, flags: 0 }, clientMoveId: 'r1' }));
    const [whiteAck] = await Promise.all([alice.waitFor('MOVE_ACCEPTED'), bob.waitFor('MOVE_ACCEPTED')]);
    const fenAfterMove1 = whiteAck.type === 'MOVE_ACCEPTED' ? whiteAck.payload.resultingFen : '';

    // 화이트가 접속을 끊었다가(탭 새로고침 시뮬레이션) 같은 세션 토큰으로 재접속한다.
    white.close();
    await new Promise((r) => setTimeout(r, 100));

    const reconnected = new TestClient(port);
    await reconnected.ready();
    reconnected.send(envelope('RECONNECT', { sessionToken: whiteSessionToken, matchId }));
    const sync = await reconnected.waitFor('STATE_SYNC');
    expect(sync.type).toBe('STATE_SYNC');
    if (sync.type === 'STATE_SYNC') {
      expect(sync.payload.fen).toBe(fenAfterMove1);
      expect(sync.payload.moveHistory.length).toBe(1);
      expect(sync.payload.status).toBe('active');
    }

    reconnected.close();
    (white === alice ? bob : alice).close();
  }, 10_000);
});
