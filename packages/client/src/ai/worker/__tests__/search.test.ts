import { describe, it, expect } from 'vitest';
import { fromFEN, squareToAlgebraic, type Move } from '@battle-chess/chess-core';
import { iterativeDeepen, evaluateRootMovesShallow, type SearchLimits } from '../search';

const FULL_LIMITS: SearchLimits = {
  maxDepth: 6,
  useNullMove: true,
  useLMR: true,
  useAspiration: true,
  useTT: true,
  useKillersHistory: true,
  useQuiescence: true,
};

function moveToUci(m: Move): string {
  return `${squareToAlgebraic(m.from)}${squareToAlgebraic(m.to)}`;
}

describe('탐색 알고리즘 — 정확성 스모크 테스트', () => {
  it('back-rank 메이트-인-1을 찾는다(Rd8#)', () => {
    // 백 룩 d1, 백 킹 g1, 흑 킹 h8(폰벽으로 갇힘), 흑 차례 없이 백이 즉시 메이트.
    const pos = fromFEN('6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1');
    const deadline = performance.now() + 5000;
    const result = iterativeDeepen(pos, { ...FULL_LIMITS, maxDepth: 3 }, deadline);
    expect(moveToUci(result.move)).toBe('d1d8');
    expect(result.scoreCp).toBeGreaterThan(500_000); // MATE_SCORE 근접
  });

  it('공짜로 걸려있는 퀸을 잡는 수를 찾는다', () => {
    // 백 나이트 e5가 방어자 없는 흑 퀸 d7을 바로 잡을 수 있음.
    const pos = fromFEN('4k3/3q4/8/4N3/8/8/8/4K3 w - - 0 1');
    const deadline = performance.now() + 5000;
    const result = iterativeDeepen(pos, { ...FULL_LIMITS, maxDepth: 4 }, deadline);
    expect(moveToUci(result.move)).toBe('e5d7');
  });

  it('evaluateRootMovesShallow는 걸려있는 퀸을 잡는 수를 최상위로 정렬한다(Beginner/Intermediate 경로)', () => {
    const pos = fromFEN('4k3/3q4/8/4N3/8/8/8/4K3 w - - 0 1');
    const ranked = evaluateRootMovesShallow(pos, 1, {
      useNullMove: false,
      useLMR: false,
      useAspiration: false,
      useTT: false,
      useKillersHistory: false,
      useQuiescence: false,
    });
    expect(moveToUci(ranked[0]!.move)).toBe('e5d7');
  });
});
