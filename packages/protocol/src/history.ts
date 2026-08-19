import type { Color } from '@battle-chess/chess-core';
import type { GameEndReason, MatchFormat } from './messages.js';

/** D10 §영속화 — client(MatchState)와 동일 어휘. 순환 의존 방지를 위해 protocol에 독립 정의한다. */
export type MatchSource = 'local2p' | 'cpu' | 'online';
export type MatchOutcome = 'win' | 'loss' | 'draw' | 'aborted';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'master';
export type TimeControlKind = 'blitz' | 'rapid' | 'unlimited';

export interface PlayerStatsBucket {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
}

// ── 조회 DTO (GET) ──────────────────────────────────────────────────────────
export interface MatchSummaryDto {
  matchId: string;
  source: MatchSource;
  format: MatchFormat;
  verified: boolean;
  opponentLabel: string;
  myColorGame1: Color;
  scoreMine: number;
  scoreOpponent: number;
  outcome: MatchOutcome;
  gameCount: number;
  startedAt: number;
  endedAt: number;
  timeControl: TimeControlKind;
}

export interface MatchHistoryPage {
  matches: MatchSummaryDto[];
  nextBefore: number | null;
  totalCount: number;
}

export interface GameRecordDto {
  gameIndex: number;
  myColor: Color;
  result: 'white' | 'black' | 'draw';
  reason: GameEndReason;
  plyCount: number;
  movesSan: string | null;
  movesTruncated: boolean;
  finalFen: string;
  startedAt: number;
  endedAt: number;
}

export interface MatchDetailDto extends MatchSummaryDto {
  games: GameRecordDto[];
}

export interface PlayerStatsDto {
  playerId: string;
  nickname: string;
  verified: PlayerStatsBucket;
  local: PlayerStatsBucket;
  bySource: Record<MatchSource, number>;
  firstPlayedAt: number | null;
  lastPlayedAt: number | null;
}

// ── POST /api/v1/players/identify ───────────────────────────────────────────
export interface IdentifyRequestDto {
  playerId: string;
  nickname: string;
  secret?: string;
}
export interface IdentifyResponseDto {
  playerId: string;
  nickname: string;
  isNew: boolean;
  secretAccepted: boolean;
}

// ── POST /api/v1/matches/sync ───────────────────────────────────────────────
export interface SyncGameDto {
  gameIndex: number;
  myColor: Color;
  result: 'white' | 'black' | 'draw';
  reason: GameEndReason;
  plyCount: number;
  movesSan: string;
  movesTruncated: boolean;
  finalFen: string;
  startedAt: number;
  endedAt: number;
}

/** source는 'local2p'|'cpu'만 허용 — 'online'은 서버가 항상 409로 거부한다(D10-5 위조 차단). */
export interface SyncMatchDto {
  clientLocalMatchId: string;
  source: 'local2p' | 'cpu' | 'online';
  format: MatchFormat;
  myColorGame1: Color;
  opponentLabel: string;
  cpuDifficulty?: Difficulty;
  timeControl: TimeControlKind;
  scoreMine: number;
  scoreOpponent: number;
  outcome: MatchOutcome;
  startedAt: number;
  endedAt: number;
  games: SyncGameDto[];
}

export interface SyncRequestDto {
  matches: SyncMatchDto[];
}

export interface SyncUploadResult {
  clientLocalMatchId: string;
  serverMatchId: string;
  conflict: 'inserted' | 'kept-existing';
}

export interface SyncResponseDto {
  results: SyncUploadResult[];
}
