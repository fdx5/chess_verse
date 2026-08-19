import type { Color } from '@battle-chess/chess-core';
import type { Difficulty } from '../ai/AiWorkerHandle';
import type { MatchFormat, MatchOutcome, MatchSource } from '../game/MatchState';

export const DB_NAME = 'bcr-history';
export const DB_VERSION = 1;

/** D10-3 §SyncState — `games` 스토어는 `game/MatchState.ts`의 `LocalGameRecord`를 그대로 재사용한다. */
export type SyncState = 'local' | 'pending' | 'synced' | 'rejected' | 'deferred';

export interface LocalMatchRecord {
  localMatchId: string;
  serverMatchId?: string;
  source: MatchSource;
  format: MatchFormat;
  myPlayerId: string;
  myColorGame1: Color;
  opponentKind: 'human-local' | 'human-online' | 'cpu';
  opponentLabel: string;
  opponentPlayerId?: string;
  cpuDifficulty?: Difficulty;
  timeControl: 'blitz' | 'rapid' | 'unlimited';
  scoreMine: number;
  scoreOpponent: number;
  outcome: MatchOutcome;
  gameCount: number;
  startedAt: number;
  endedAt: number;
  syncState: SyncState;
  syncAttempts: number;
  appVersion: string;
  schemaVersion: 1;
}

export interface SyncOp {
  opId: string;
  kind: 'uploadMatch';
  localMatchId: string;
  state: 'queued' | 'inflight' | 'done' | 'failed';
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
}

export interface MetaRecord {
  key: string;
  value: number | string;
}
