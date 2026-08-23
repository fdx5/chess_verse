import { describe, expect, it } from 'vitest';
import { fromFEN } from '../fen';
import { getGameResult } from '../result';

describe('50턴 무승부', () => {
  it('폰 이동 카운터와 관계없이 50턴 완료 후 무승부가 된다', () => {
    const before = fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 50');
    expect(getGameResult(before, [before])).toEqual({ kind: 'in_progress' });

    const completed = fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 51');
    expect(getGameResult(completed, [completed])).toEqual({ kind: 'draw', reason: 'fifty_move' });
  });
});
