import { describe, it, expect } from 'vitest';
import { fromFEN } from '@battle-chess/chess-core';
import { evaluate } from '../evaluate';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('evaluate() — D3 평가 함수', () => {
  it('시작 포지션은 완전 대칭이므로 0에 가깝다(PST 등 자체는 좌우/진영 대칭 설계)', () => {
    const score = evaluate(fromFEN(START_FEN));
    expect(Math.abs(score)).toBeLessThan(5);
  });

  it('백이 퀸을 통째로 잃으면(흑 차례로 전환) 흑 시점 평가가 크게 양수다', () => {
    // 백 퀸 제거, 나머지 시작 배치 유지, 흑 차례.
    const pos = fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR b KQkq - 0 1');
    const score = evaluate(pos);
    expect(score).toBeGreaterThan(800); // 퀸 900cp 근접
  });

  it('같은 포지션을 백/흑 교대로 보면 부호만 반대다(negamax 부호 규약 검증)', () => {
    const whiteToMove = fromFEN('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1');
    const blackToMove = fromFEN('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(evaluate(whiteToMove)).toBeCloseTo(-evaluate(blackToMove), 5);
  });
});
