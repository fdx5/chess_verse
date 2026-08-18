import type { Color, GameResult } from '@battle-chess/chess-core';
import type { Difficulty } from '../ai/AiWorkerHandle';

/** D10 §D10-3 정본 타입 그대로 — Sprint 9의 MatchRecorder가 이 이벤트/타입을 그대로 구독한다. */
export type MatchSource = 'local2p' | 'cpu' | 'online';
export type MatchFormat = 'bo1' | 'bo3';
export type MatchOutcome = 'win' | 'loss' | 'draw' | 'aborted';
export type GameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'resign'
  | 'timeout'
  | 'draw50'
  | 'repetition'
  | 'insufficientMaterial'
  | 'agreement'
  | 'abandon';

export interface LocalGameRecord {
  localGameId: string;
  localMatchId: string;
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

export interface MatchConfig {
  source: MatchSource;
  format: MatchFormat;
  cpuDifficulty?: Difficulty;
  /** 로컬2인/CPU 대전 공통: 게임1에서 백을 잡는 쪽. CPU 대전이면 사람은 이 색으로 시작. */
  myColorGame1: Color;
}

function resultToGameEndReason(result: GameResult): GameEndReason {
  switch (result.kind) {
    case 'checkmate':
      return 'checkmate';
    case 'stalemate':
      return 'stalemate';
    case 'resignation':
      return 'resign';
    case 'timeout':
      return 'timeout';
    case 'draw':
      if (result.reason === 'fifty_move') return 'draw50';
      if (result.reason === 'threefold') return 'repetition';
      if (result.reason === 'insufficient_material') return 'insufficientMaterial';
      return 'agreement';
    case 'in_progress':
      throw new Error('resultToGameEndReason: game still in progress');
  }
}

function resultToGameOutcome(result: GameResult): 'white' | 'black' | 'draw' {
  if (result.kind === 'checkmate' || result.kind === 'resignation' || result.kind === 'timeout') return result.winner === 'w' ? 'white' : 'black';
  return 'draw';
}

/** 한 게임의 종료 결과로부터 D10 스키마 그대로의 `LocalGameRecord`를 만든다. */
export function buildGameRecord(input: {
  localGameId: string;
  localMatchId: string;
  gameIndex: number;
  myColor: Color;
  result: GameResult;
  movesSan: string[];
  finalFen: string;
  startedAt: number;
  endedAt: number;
}): LocalGameRecord {
  const MAX_MOVES_BYTES = 4096;
  const joined = input.movesSan.join(' ');
  const truncated = joined.length > MAX_MOVES_BYTES;
  return {
    localGameId: input.localGameId,
    localMatchId: input.localMatchId,
    gameIndex: input.gameIndex,
    myColor: input.myColor,
    result: resultToGameOutcome(input.result),
    reason: resultToGameEndReason(input.result),
    plyCount: input.movesSan.length,
    movesSan: truncated ? joined.slice(0, MAX_MOVES_BYTES) : joined,
    movesTruncated: truncated,
    finalFen: input.finalFen,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
  };
}
