import { describe, it, expect } from 'vitest';
import { fromFEN, makeMove, getGameResult, type Position, type Color } from '@battle-chess/chess-core';
import { iterativeDeepen, type SearchLimits } from '../search';

/**
 * D9 Sprint 7 DoD: "마스터 vs 초급 자기대국 20판에서 마스터가 15승 이상".
 * 실제 난이도 설정(Beginner movetime 300ms / Master 4000ms)을 그대로 20판 돌리면 테스트가 지나치게
 * 오래 걸리므로, 두 난이도 간 "탐색 기능 격차"(깊이 + null-move/LMR/TT/killers/quiescence 유무)는
 * 그대로 유지한 채 depth를 낮춰 빠르게 재현한다(`docs/DEVIATIONS.md` [Sprint 7] 참조).
 */
const MASTER_LIKE: SearchLimits = {
  maxDepth: 5,
  useNullMove: true,
  useLMR: true,
  useAspiration: true,
  useTT: true,
  useKillersHistory: true,
  useQuiescence: true,
};

const BEGINNER_LIKE: SearchLimits = {
  maxDepth: 1,
  useNullMove: false,
  useLMR: false,
  useAspiration: false,
  useTT: false,
  useKillersHistory: false,
  useQuiescence: false,
};

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MAX_PLIES = 160;

type Outcome = 'master' | 'beginner' | 'draw';

function playOneGame(masterColor: Color): Outcome {
  let pos: Position = fromFEN(START_FEN);
  const history: Position[] = [pos];

  for (let ply = 0; ply < MAX_PLIES; ply += 1) {
    const result = getGameResult(pos, history);
    if (result.kind === 'checkmate') return result.winner === masterColor ? 'master' : 'beginner';
    if (result.kind !== 'in_progress') return 'draw';

    const isMasterTurn = pos.turn === masterColor;
    const limits = isMasterTurn ? MASTER_LIKE : BEGINNER_LIKE;
    const deadline = performance.now() + 4000;
    const { move } = iterativeDeepen(pos, limits, deadline);
    pos = makeMove(pos, move);
    history.push(pos);
  }
  return 'draw';
}

describe('AI 자기대국 — Master급 vs Beginner급 탐색 격차 검증', () => {
  it(
    '20판 중 마스터급이 15승 이상 거둔다(무승부/패배 5회 이하)',
    () => {
      let masterWins = 0;
      let beginnerWins = 0;
      let draws = 0;
      for (let game = 0; game < 20; game += 1) {
        const masterColor: Color = game % 2 === 0 ? 'w' : 'b';
        const outcome = playOneGame(masterColor);
        if (outcome === 'master') masterWins += 1;
        else if (outcome === 'beginner') beginnerWins += 1;
        else draws += 1;
      }
      console.log(`[selfPlay] master=${masterWins} beginner=${beginnerWins} draw=${draws}`);
      expect(masterWins).toBeGreaterThanOrEqual(15);
    },
    120_000
  );
});
