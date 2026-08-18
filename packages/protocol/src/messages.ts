import type { Color, Move } from '@battle-chess/chess-core';

/** D6-2 §봉투(Envelope) 패턴 — 모든 메시지는 이 형태로 감싼다. */
export interface Envelope<T extends string, P> {
  type: T;
  seq: number;
  ts: number;
  payload: P;
}

export type GameStatus = 'countdown' | 'active' | 'gameEnded' | 'intermission' | 'matchEnded';
export interface MatchScore {
  you: number;
  opponent: number;
}

export type TimeControlPreset = { kind: 'blitz'; baseMs: number; incrementMs: number } | { kind: 'rapid'; baseMs: number; incrementMs: number } | { kind: 'unlimited' };

export const TIME_CONTROL_PRESETS: Record<'blitz' | 'rapid' | 'unlimited', TimeControlPreset> = {
  blitz: { kind: 'blitz', baseMs: 5 * 60_000, incrementMs: 3_000 },
  rapid: { kind: 'rapid', baseMs: 10 * 60_000, incrementMs: 0 },
  unlimited: { kind: 'unlimited' },
};

export type MatchFormat = 'bo1' | 'bo3';
export type GameEndReason = 'checkmate' | 'stalemate' | 'resign' | 'timeout' | 'draw50' | 'repetition' | 'insufficientMaterial' | 'agreement' | 'abandon';
export type MoveRejectReason = 'illegal' | 'stale' | 'notYourTurn' | 'gameOver';

// ── C→S payloads ────────────────────────────────────────────────────────
export interface HelloPayload {
  clientVersion: string;
  sessionToken?: string;
}
export interface PlayerIdentifyPayload {
  playerId: string;
  nickname: string;
  secret?: string;
}
export interface QueueJoinPayload {
  mode: 'quick' | 'roomCode';
  roomCode?: string;
  timeControl: TimeControlPreset;
  matchFormat: MatchFormat;
}
export interface MovePayload {
  matchId: string;
  gameIndex: number;
  move: Move;
  clientMoveId: string;
}
export interface ResignPayload {
  matchId: string;
  gameIndex: number;
}
export interface ReconnectPayload {
  sessionToken: string;
  matchId: string;
}
export interface DrawOfferPayload {
  matchId: string;
  action: 'offer' | 'accept' | 'decline';
}
export interface ChatPayload {
  matchId: string;
  text: string;
}
export type EmoteId = 'gg' | 'nice' | 'oops' | 'think';
export interface EmotePayload {
  matchId: string;
  emoteId: EmoteId;
}
export interface IntermissionReadyPayload {
  matchId: string;
  gameIndex: number;
}

// ── S→C payloads ─────────────────────────────────────────────────────────
export interface PlayerIdentifiedPayload {
  playerId: string;
  nickname: string;
  isNew: boolean;
  secretAccepted: boolean;
  serverTimeMs: number;
}
export interface RoomCreatedPayload {
  roomCode: string;
  expiresAtMs: number;
  timeControl: TimeControlPreset;
  matchFormat: MatchFormat;
}
export interface MatchFoundPayload {
  matchId: string;
  opponentName: string;
  yourColor: Color;
  timeControl: TimeControlPreset;
  matchFormat: MatchFormat;
  gameIndex: number;
  /** D6-6: "서버가 MATCH_FOUND 시점에 발급하는 opaque UUID v4" — D6-2 표에는 필드가 누락되어 있었다
   * (재접속 자체가 불가능해지는 설계 공백). 최소 보완으로 이 필드를 추가했다(`docs/DEVIATIONS.md` 참조). */
  sessionToken: string;
}
export interface MoveAcceptedPayload {
  matchId: string;
  gameIndex: number;
  move: Move;
  clientMoveId: string;
  resultingFen: string;
  whiteClockMs: number;
  blackClockMs: number;
  serverAppliedTs: number;
}
export interface MoveRejectedPayload {
  matchId: string;
  clientMoveId: string;
  reason: MoveRejectReason;
  authoritativePosition: string;
}
export interface StateSyncPayload {
  matchId: string;
  gameIndex: number;
  fen: string;
  moveHistory: Move[];
  whiteClockMs: number;
  blackClockMs: number;
  status: GameStatus;
}
export interface ClockSyncPayload {
  matchId: string;
  whiteClockMs: number;
  blackClockMs: number;
  serverTs: number;
}
export interface GameEndPayload {
  matchId: string;
  gameIndex: number;
  result: 'white' | 'black' | 'draw';
  reason: GameEndReason;
  scoreWhite: number;
  scoreBlack: number;
}
export interface MatchEndPayload {
  matchId: string;
  winnerColorForYou: 'you' | 'opponent' | 'draw';
  finalScoreYou: number;
  finalScoreOpponent: number;
  serverMatchId: string | null;
}
export interface OpponentDisconnectedPayload {
  matchId: string;
  graceSeconds: number;
}

// ── discriminated unions ──────────────────────────────────────────────────
export type ClientMessage =
  | Envelope<'HELLO', HelloPayload>
  | Envelope<'PLAYER_IDENTIFY', PlayerIdentifyPayload>
  | Envelope<'QUEUE_JOIN', QueueJoinPayload>
  | Envelope<'MOVE', MovePayload>
  | Envelope<'RESIGN', ResignPayload>
  | Envelope<'RECONNECT', ReconnectPayload>
  | Envelope<'DRAW_OFFER', DrawOfferPayload>
  | Envelope<'CHAT', ChatPayload>
  | Envelope<'EMOTE', EmotePayload>
  | Envelope<'INTERMISSION_READY', IntermissionReadyPayload>;

export type ServerMessage =
  | Envelope<'PLAYER_IDENTIFIED', PlayerIdentifiedPayload>
  | Envelope<'ROOM_CREATED', RoomCreatedPayload>
  | Envelope<'MATCH_FOUND', MatchFoundPayload>
  | Envelope<'MOVE_ACCEPTED', MoveAcceptedPayload>
  | Envelope<'MOVE_REJECTED', MoveRejectedPayload>
  | Envelope<'STATE_SYNC', StateSyncPayload>
  | Envelope<'CLOCK_SYNC', ClockSyncPayload>
  | Envelope<'GAME_END', GameEndPayload>
  | Envelope<'MATCH_END', MatchEndPayload>
  | Envelope<'OPPONENT_DISCONNECTED', OpponentDisconnectedPayload>
  | Envelope<'DRAW_OFFER', DrawOfferPayload>
  | Envelope<'CHAT', ChatPayload>
  | Envelope<'EMOTE', EmotePayload>
  | Envelope<'INTERMISSION_READY', IntermissionReadyPayload>;

/** D6-2: 총 20종(C→S 10 + S→C 14, DRAW_OFFER/CHAT/EMOTE/INTERMISSION_READY는 양방향이라 합집합 20개 고유 타입). */
export type AnyMessage = ClientMessage | ServerMessage;

let seqCounter = 0;
export function nextSeq(): number {
  seqCounter += 1;
  return seqCounter;
}

export function envelope<T extends string, P>(type: T, payload: P): Envelope<T, P> {
  return { type, seq: nextSeq(), ts: Date.now(), payload };
}
