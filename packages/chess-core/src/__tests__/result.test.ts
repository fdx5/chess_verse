import { describe, expect, it } from 'vitest';
import { fromFEN } from '../fen';
import { getGameResult } from '../result';

describe('턴수에 의한 자동 무승부 제거', () => {
  it('50턴을 초과해도 다른 종료 조건이 없으면 게임을 계속한다', () => {
    const position = fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 999');
    expect(getGameResult(position, [position])).toEqual({ kind: 'in_progress' });
  });
});
