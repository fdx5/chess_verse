import { describe, it, expect } from 'vitest';
import { fromFEN, makeMove, toFEN, generateLegalMoves, algebraicToSquare } from '@battle-chess/chess-core';
import { OPENING_BOOK, pickBookMove } from '../openingBook';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function applyLongAlgebraic(fen: string, notation: string): string {
  const pos = fromFEN(fen);
  const from = algebraicToSquare(notation.slice(0, 2));
  const to = algebraicToSquare(notation.slice(2, 4));
  const move = generateLegalMoves(pos).find((m) => m.from === from && m.to === to);
  if (move === undefined) throw new Error(`illegal book move ${notation} in ${fen}`);
  return toFEN(makeMove(pos, move));
}

/** D3 오프닝북은 그래프처럼 서로 연결되어야 한다 — fenPrefix가 실제 도달 가능한 포지션과 어긋나면
 * `pickBookMove()`가 조용히 null을 반환해 북이 사실상 죽어있는 채로 방치될 수 있다. */
describe('오프닝북 — fenPrefix가 실제 체스 진행과 일치하는지', () => {
  it('시작 포지션 항목이 존재하고 pickBookMove가 합법수를 반환한다', () => {
    const pos = fromFEN(START_FEN);
    const move = pickBookMove(pos, () => 0);
    expect(move).not.toBeNull();
  });

  it('북에 등록된 모든 fenPrefix는 시작 포지션에서 북 수만 골라 진행했을 때 실제로 도달 가능하다', () => {
    // 시작 포지션에서 시작해, 각 북 항목의 첫 번째 수를 그리디하게 따라가며 도달한 fenPrefix 집합을 만든다.
    const reachable = new Set<string>();
    const frontier: string[] = [START_FEN];
    for (let ply = 0; ply < 6 && frontier.length > 0; ply += 1) {
      const next: string[] = [];
      for (const fen of frontier) {
        const prefix = fen.split(' ').slice(0, 3).join(' ');
        reachable.add(prefix);
        const entry = OPENING_BOOK.find((e) => e.fenPrefix === prefix);
        if (entry === undefined) continue;
        for (const candidate of entry.moves) {
          next.push(applyLongAlgebraic(fen, candidate.move));
        }
      }
      frontier.length = 0;
      frontier.push(...next);
    }
    for (const entry of OPENING_BOOK) {
      expect(reachable.has(entry.fenPrefix), `unreachable fenPrefix: ${entry.fenPrefix}`).toBe(true);
    }
  });
});
