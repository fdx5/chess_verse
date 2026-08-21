import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type {
  AnyMessage,
  ClientMessage,
  MatchFoundPayload,
  MoveAcceptedPayload,
  MoveRejectedPayload,
  GameEndPayload,
  MatchEndPayload,
  StateSyncPayload,
  OpponentDisconnectedPayload,
  PlayerIdentifiedPayload,
  RoomCreatedPayload,
  GameEndReason,
  TimeControlPreset,
  MatchFormat,
} from '@battle-chess/protocol';
import { envelope } from '@battle-chess/protocol';
import { toFEN, type Move } from '@battle-chess/chess-core';
import { SessionStore } from './session.js';
import { RoomManager } from './room.js';
import { MatchState, type MatchPlayer } from './match.js';
import type { PlayerRepository } from './db/PlayerRepository.js';
import type { MatchRepository } from './db/MatchRepository.js';

const HEARTBEAT_TIMEOUT_MS = 20_000;
const SWEEP_INTERVAL_MS = 5_000;
const DISCONNECT_GRACE_SECONDS = 60;
const MOVE_RATE_LIMIT_PER_SEC = 5;

export interface NetServerDeps {
  playerRepo: PlayerRepository;
  matchRepo: MatchRepository;
}

interface Connection {
  ws: WebSocket;
  connectionId: string;
  playerId: string | null;
  nickname: string;
  sessionToken: string | null;
  matchId: string | null;
  lastSeenAt: number;
  moveTimestamps: number[];
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

let connCounter = 0;

/** D6 §전체 — WS 메시지 라우팅, 매치 생명주기, 재접속, 치팅 방지(서버 재검증)를 총괄한다. */
export class NetServer {
  private readonly wss: WebSocketServer;
  private readonly sessions = new SessionStore();
  private readonly rooms = new RoomManager();
  private readonly connections = new Map<string, Connection>();
  private readonly connectionByPlayerId = new Map<string, Connection>();
  private readonly matches = new Map<string, MatchState>();
  private readonly sweepHandle: ReturnType<typeof setInterval>;

  constructor(
    httpServer: HttpServer,
    private readonly deps: NetServerDeps
  ) {
    this.wss = new WebSocketServer({ server: httpServer });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
    this.sweepHandle = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
  }

  close(): void {
    clearInterval(this.sweepHandle);
    for (const conn of this.connections.values()) if (conn.disconnectTimer !== null) clearTimeout(conn.disconnectTimer);
    this.wss.close();
  }

  private handleConnection(ws: WebSocket): void {
    connCounter += 1;
    const conn: Connection = {
      ws,
      connectionId: `c${connCounter}`,
      playerId: null,
      nickname: '',
      sessionToken: null,
      matchId: null,
      lastSeenAt: Date.now(),
      moveTimestamps: [],
      disconnectTimer: null,
    };
    this.connections.set(conn.connectionId, conn);

    ws.on('message', (raw) => {
      conn.lastSeenAt = Date.now();
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return;
      }
      try {
        this.handleMessage(conn, msg);
      } catch (err) {
        console.error('[netServer] handleMessage failed:', err);
      }
    });

    ws.on('close', () => this.handleDisconnect(conn));
  }

  private send(conn: Connection, msg: AnyMessage): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg));
  }

  private sendToPlayer(playerId: string, msg: AnyMessage): void {
    const conn = this.connectionByPlayerId.get(playerId);
    if (conn !== undefined) this.send(conn, msg);
  }

  private handleMessage(conn: Connection, msg: ClientMessage): void {
    switch (msg.type) {
      case 'HELLO':
        conn.lastSeenAt = Date.now();
        return;
      case 'PLAYER_IDENTIFY':
        void this.onPlayerIdentify(conn, msg.payload);
        return;
      case 'QUEUE_JOIN':
        return this.onQueueJoin(conn, msg.payload);
      case 'MOVE':
        return this.onMove(conn, msg.payload, msg.ts);
      case 'RESIGN':
        return this.onResign(conn, msg.payload.matchId);
      case 'RECONNECT':
        return this.onReconnect(conn, msg.payload.sessionToken, msg.payload.matchId);
      case 'DRAW_OFFER':
        return this.onDrawOffer(conn, msg.payload);
      case 'CHAT': {
        const match = conn.matchId !== null ? this.matches.get(conn.matchId) : undefined;
        if (match === undefined || conn.playerId === null) return;
        const opponent = match.getOpponent(conn.playerId);
        this.sendToPlayer(opponent.playerId, envelope('CHAT', { matchId: msg.payload.matchId, text: msg.payload.text.slice(0, 40) }));
        return;
      }
      case 'EMOTE': {
        const match = conn.matchId !== null ? this.matches.get(conn.matchId) : undefined;
        if (match === undefined || conn.playerId === null) return;
        const opponent = match.getOpponent(conn.playerId);
        this.sendToPlayer(opponent.playerId, envelope('EMOTE', msg.payload));
        return;
      }
      case 'INTERMISSION_READY':
        return this.onIntermissionReady(conn, msg.payload.matchId, msg.payload.gameIndex);
    }
  }

  private async onPlayerIdentify(conn: Connection, payload: { playerId: string; nickname: string; secret?: string }): Promise<void> {
    conn.playerId = payload.playerId;
    conn.nickname = payload.nickname.slice(0, 16);
    this.connectionByPlayerId.set(payload.playerId, conn);
    // D10-1 §서버 등록 흐름 — WS 세션에 playerId를 바인딩하는 시점에 players 테이블도 UPSERT한다.
    const { isNew, secretAccepted } = await this.deps.playerRepo.upsert({ id: payload.playerId, nickname: conn.nickname, ...(payload.secret !== undefined ? { secret: payload.secret } : {}) });
    const response: PlayerIdentifiedPayload = { playerId: payload.playerId, nickname: conn.nickname, isNew, secretAccepted, serverTimeMs: Date.now() };
    this.send(conn, envelope('PLAYER_IDENTIFIED', response));
  }

  private onQueueJoin(conn: Connection, payload: { mode: 'quick' | 'roomCode'; roomCode?: string; timeControl: TimeControlPreset; matchFormat: MatchFormat }): void {
    if (conn.playerId === null) return;
    const player: MatchPlayer = { playerId: conn.playerId, displayName: conn.nickname, sessionToken: '' };

    if (payload.mode === 'roomCode' && payload.roomCode === undefined) {
      const room = this.rooms.createRoom(player, payload.timeControl, payload.matchFormat);
      const ack: RoomCreatedPayload = { roomCode: room.roomCode, expiresAtMs: room.expiresAt, timeControl: room.timeControl, matchFormat: room.matchFormat };
      this.send(conn, envelope('ROOM_CREATED', ack));
      return;
    }

    const match =
      payload.mode === 'roomCode' && payload.roomCode !== undefined
        ? this.rooms.joinRoom(payload.roomCode, player)
        : this.rooms.enqueueQuick(player, payload.timeControl, payload.matchFormat);

    if (match !== null) this.startMatch(match);
  }

  private startMatch(match: MatchState): void {
    this.matches.set(match.matchId, match);
    this.bindPlayerToMatch(match, match.playerA);
    this.bindPlayerToMatch(match, match.playerB);
    this.announceGameStart(match);
  }

  /** D6-6: 세션 토큰은 매치 전체(모든 게임)에 걸쳐 1개, 연결과 매치 플레이어 레코드 양쪽에 기록한다. */
  private bindPlayerToMatch(match: MatchState, player: MatchPlayer): void {
    const conn = this.connectionByPlayerId.get(player.playerId);
    if (conn === undefined) return;
    conn.matchId = match.matchId;
    const session = this.sessions.create();
    session.playerId = player.playerId;
    session.matchId = match.matchId;
    conn.sessionToken = session.sessionToken;
    player.sessionToken = session.sessionToken;
  }

  /** 매치 시작 및 Bo3의 매 게임 시작마다 MATCH_FOUND를 재전송해 새 색/gameIndex를 알린다. */
  private announceGameStart(match: MatchState): void {
    for (const player of [match.playerA, match.playerB]) {
      const opponent = match.getOpponent(player.playerId);
      const payload: MatchFoundPayload = {
        matchId: match.matchId,
        opponentName: opponent.displayName,
        yourColor: match.getColorOf(player.playerId),
        timeControl: match.timeControl,
        matchFormat: match.format,
        gameIndex: match.gameIndex,
        sessionToken: player.sessionToken,
      };
      this.sendToPlayer(player.playerId, envelope('MATCH_FOUND', payload));
    }
  }

  private onMove(conn: Connection, payload: { matchId: string; gameIndex: number; move: Move; clientMoveId: string }, clientTs: number): void {
    if (conn.playerId === null) return;
    const match = this.matches.get(payload.matchId);
    if (match === undefined) return;

    if (!this.checkMoveRateLimit(conn)) return;

    const serverRecvTs = Date.now();
    const result = match.applyMove(conn.playerId, payload.move, clientTs, serverRecvTs);
    if (!result.accepted) {
      const rejected: MoveRejectedPayload = { matchId: match.matchId, clientMoveId: payload.clientMoveId, reason: result.reason, authoritativePosition: toFEN(match.position) };
      this.send(conn, envelope('MOVE_REJECTED', rejected));
      return;
    }

    const clockState = match.clock.getState();
    const accepted: MoveAcceptedPayload = {
      matchId: match.matchId,
      gameIndex: match.gameIndex,
      move: result.move,
      clientMoveId: payload.clientMoveId,
      resultingFen: result.resultingFen,
      whiteClockMs: clockState.whiteClockMs,
      blackClockMs: clockState.blackClockMs,
      serverAppliedTs: serverRecvTs,
    };
    this.sendToPlayer(match.playerA.playerId, envelope('MOVE_ACCEPTED', accepted));
    this.sendToPlayer(match.playerB.playerId, envelope('MOVE_ACCEPTED', accepted));
    if (match.playerA.sessionToken) this.sessions.touch(match.playerA.sessionToken);

    this.checkGameEnd(match);
  }

  private checkGameEnd(match: MatchState): void {
    const result = match.getResult();
    if (result.kind === 'in_progress') return;

    let outcome: 'white' | 'black' | 'draw';
    let reason: GameEndReason;
    if (result.kind === 'checkmate') {
      outcome = result.winner === 'w' ? 'white' : 'black';
      reason = 'checkmate';
    } else if (result.kind === 'stalemate') {
      outcome = 'draw';
      reason = 'stalemate';
    } else if (result.kind === 'draw') {
      outcome = 'draw';
      reason = result.reason === 'fifty_move' ? 'draw50' : result.reason === 'threefold' ? 'repetition' : result.reason === 'insufficient_material' ? 'insufficientMaterial' : 'agreement';
    } else {
      return;
    }
    this.finishGame(match, outcome, reason);
  }

  private finishGame(match: MatchState, outcome: 'white' | 'black' | 'draw', reason: GameEndReason): void {
    // recordGameEnd()가 gameIndex를 증가시키므로, 이번에 끝난 게임의 색-플레이어 매핑은 반드시 먼저 캡처한다
    // (아니면 다음 게임 기준의 뒤바뀐 배정으로 점수를 잘못된 플레이어에게 합산하게 된다).
    const endedGameWhitePlayerId = match.getPlayerByColor('w').playerId;
    const endedGameBlackPlayerId = match.getPlayerByColor('b').playerId;
    const endedGameIndex = match.gameIndex;
    const { matchComplete } = match.recordGameEnd(outcome, reason);
    const scoreWhite = match.scoreByPlayerId[endedGameWhitePlayerId] ?? 0;
    const scoreBlack = match.scoreByPlayerId[endedGameBlackPlayerId] ?? 0;
    const gameEnd: GameEndPayload = { matchId: match.matchId, gameIndex: endedGameIndex, result: outcome, reason, scoreWhite, scoreBlack };
    this.sendToPlayer(match.playerA.playerId, envelope('GAME_END', gameEnd));
    this.sendToPlayer(match.playerB.playerId, envelope('GAME_END', gameEnd));

    if (matchComplete) this.finishMatch(match);
  }

  /** D10-5 §write-then-notify — DB 커밋이 끝난 뒤에만 MATCH_END를 보낸다(위조 불가 서버 권위 기록). */
  private async finishMatch(match: MatchState): Promise<void> {
    const serverMatchId = await this.persistFinishedMatch(match);

    for (const player of [match.playerA, match.playerB]) {
      const opponent = match.getOpponent(player.playerId);
      const myScore = match.scoreByPlayerId[player.playerId] ?? 0;
      const oppScore = match.scoreByPlayerId[opponent.playerId] ?? 0;
      const payload: MatchEndPayload = {
        matchId: match.matchId,
        winnerColorForYou: myScore > oppScore ? 'you' : myScore < oppScore ? 'opponent' : 'draw',
        finalScoreYou: myScore,
        finalScoreOpponent: oppScore,
        serverMatchId,
      };
      this.sendToPlayer(player.playerId, envelope('MATCH_END', payload));
    }
    this.matches.delete(match.matchId);
  }

  /** DB 쓰기 실패 시에도 결과 통보 자체는 막지 않는다(D10-5) — 실패하면 null을 반환한다. */
  private async persistFinishedMatch(match: MatchState): Promise<string | null> {
    const whitePlayer = match.playerAColorGame1 === 'w' ? match.playerA : match.playerB;
    const blackPlayer = match.playerAColorGame1 === 'w' ? match.playerB : match.playerA;
    const scoreWhite = match.scoreByPlayerId[whitePlayer.playerId] ?? 0;
    const scoreBlack = match.scoreByPlayerId[blackPlayer.playerId] ?? 0;
    const result: 'white' | 'black' | 'draw' | 'aborted' = match.games.length === 0 ? 'aborted' : scoreWhite > scoreBlack ? 'white' : scoreWhite < scoreBlack ? 'black' : 'draw';

    try {
      return await this.deps.matchRepo.finalizeMatch({
        format: match.format,
        playerWhiteId: whitePlayer.playerId,
        playerBlackId: blackPlayer.playerId,
        whiteLabel: whitePlayer.displayName,
        blackLabel: blackPlayer.displayName,
        timeControl: match.timeControl.kind,
        scoreWhite,
        scoreBlack,
        result,
        startedAt: match.matchStartedAt,
        endedAt: Date.now(),
        games: match.games,
      });
    } catch (err) {
      console.error('[netServer] persistFinishedMatch failed:', err);
      return null;
    }
  }

  private onResign(conn: Connection, matchId: string): void {
    if (conn.playerId === null) return;
    const match = this.matches.get(matchId);
    if (match === undefined) return;
    const winnerColor = otherColorOf(match.getColorOf(conn.playerId));
    this.finishGame(match, winnerColor === 'w' ? 'white' : 'black', 'resign');
  }

  private onDrawOffer(conn: Connection, payload: { matchId: string; action: 'offer' | 'accept' | 'decline' }): void {
    if (conn.playerId === null) return;
    const match = this.matches.get(payload.matchId);
    if (match === undefined) return;
    const opponent = match.getOpponent(conn.playerId);
    this.sendToPlayer(opponent.playerId, envelope('DRAW_OFFER', payload));
    if (payload.action === 'accept') this.finishGame(match, 'draw', 'agreement');
  }

  private readonly intermissionReady = new Map<string, Set<string>>();

  private onIntermissionReady(conn: Connection, matchId: string, gameIndex: number): void {
    if (conn.playerId === null) return;
    const match = this.matches.get(matchId);
    if (match === undefined || match.phase !== 'intermission') return;
    void gameIndex;
    const readySet = this.intermissionReady.get(matchId) ?? new Set<string>();
    readySet.add(conn.playerId);
    this.intermissionReady.set(matchId, readySet);
    if (readySet.has(match.playerA.playerId) && readySet.has(match.playerB.playerId)) {
      this.intermissionReady.delete(matchId);
      match.startNextGame();
      this.announceGameStart(match);
    }
  }

  private checkMoveRateLimit(conn: Connection): boolean {
    const now = Date.now();
    conn.moveTimestamps = conn.moveTimestamps.filter((t) => now - t < 1000);
    if (conn.moveTimestamps.length >= MOVE_RATE_LIMIT_PER_SEC) return false;
    conn.moveTimestamps.push(now);
    return true;
  }

  private onReconnect(conn: Connection, sessionToken: string, matchId: string): void {
    const session = this.sessions.get(sessionToken);
    if (session === undefined || session.matchId !== matchId || session.playerId === null) return;
    const match = this.matches.get(matchId);
    if (match === undefined) return;

    const existing = this.connections.get(conn.connectionId);
    if (existing !== undefined && existing.disconnectTimer !== null) {
      clearTimeout(existing.disconnectTimer);
      existing.disconnectTimer = null;
    }

    conn.playerId = session.playerId;
    conn.matchId = matchId;
    conn.sessionToken = sessionToken;
    this.connectionByPlayerId.set(session.playerId, conn);
    this.sessions.touch(sessionToken);

    const clockState = match.clock.getState();
    const sync: StateSyncPayload = {
      matchId: match.matchId,
      gameIndex: match.gameIndex,
      fen: toFEN(match.position),
      moveHistory: match.moveHistory,
      whiteClockMs: clockState.whiteClockMs,
      blackClockMs: clockState.blackClockMs,
      status: match.phase === 'active' ? 'active' : match.phase === 'intermission' ? 'intermission' : 'matchEnded',
    };
    this.send(conn, envelope('STATE_SYNC', sync));
  }

  private handleDisconnect(conn: Connection): void {
    this.connections.delete(conn.connectionId);
    if (conn.playerId !== null && this.connectionByPlayerId.get(conn.playerId) === conn) {
      this.connectionByPlayerId.delete(conn.playerId);
    }
    if (conn.matchId === null || conn.playerId === null) return;
    const match = this.matches.get(conn.matchId);
    if (match === undefined) return;

    const opponent = match.getOpponent(conn.playerId);
    const notice: OpponentDisconnectedPayload = { matchId: match.matchId, graceSeconds: DISCONNECT_GRACE_SECONDS };
    this.sendToPlayer(opponent.playerId, envelope('OPPONENT_DISCONNECTED', notice));

    const disconnectedPlayerId = conn.playerId;
    conn.disconnectTimer = setTimeout(() => {
      const stillGone = this.connectionByPlayerId.get(disconnectedPlayerId) === undefined;
      if (!stillGone) return;
      const liveMatch = this.matches.get(match.matchId);
      if (liveMatch === undefined || liveMatch.phase === 'ended') return;
      this.finishGame(liveMatch, otherColorOf(liveMatch.getColorOf(disconnectedPlayerId)) === 'w' ? 'white' : 'black', 'abandon');
    }, DISCONNECT_GRACE_SECONDS * 1000);
  }

  private sweep(): void {
    const now = Date.now();
    this.rooms.pruneStaleQueueEntries(now);
    for (const conn of this.connections.values()) {
      if (now - conn.lastSeenAt > HEARTBEAT_TIMEOUT_MS) conn.ws.close();
    }
    for (const match of this.matches.values()) {
      if (match.phase !== 'active') continue;
      if (match.isTimeExpiredFor(match.position.turn, now)) {
        const loserColor = match.position.turn;
        this.finishGame(match, loserColor === 'w' ? 'black' : 'white', 'timeout');
      }
    }
  }
}

function otherColorOf(color: 'w' | 'b'): 'w' | 'b' {
  return color === 'w' ? 'b' : 'w';
}

export function attachNetServer(httpServer: HttpServer, deps: NetServerDeps): NetServer {
  return new NetServer(httpServer, deps);
}
