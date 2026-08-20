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
  piecesLostMine?: number | undefined;
  durationSeconds?: number | undefined;
  score?: number | undefined;
  syncState: SyncState;
  syncAttempts: number;
  appVersion: string;
  schemaVersion: 1;
}

/**
 * 사용자 요청 §순위 점수 계산 알고리즘:
 * - CPU 대전 승리 게임에 적용
 * - 빠른 승리: 60% 가중치 (최대 60,000점)
 * - 기물 피해 최소화: 40% 가중치 (최대 40,000점)
 * - 점수 범위: 10,000점 ~ 100,000점
 */
export function calculateLeaderboardScore(
  durationSeconds: number,
  piecesLost: number,
  difficulty?: Difficulty
): number {
  const safeDuration = Math.max(5, durationSeconds);
  const safePiecesLost = Math.min(15, Math.max(0, piecesLost));

  const timeRatio = Math.max(0.1, 1 - Math.min(1, safeDuration / 600));
  const timeScore = 60000 * timeRatio;

  const survivalRatio = Math.max(0.1, (16 - safePiecesLost) / 16);
  const survivalScore = 40000 * survivalRatio;

  const diffMultiplier: Record<Difficulty, number> = {
    beginner: 0.75,
    intermediate: 0.85,
    advanced: 0.95,
    master: 1.0,
  };
  const mult = difficulty ? (diffMultiplier[difficulty] ?? 0.85) : 0.85;

  const rawScore = Math.round((timeScore + survivalScore) * mult);
  return Math.min(100000, Math.max(10000, rawScore));
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
