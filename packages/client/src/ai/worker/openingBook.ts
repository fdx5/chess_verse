import { algebraicToSquare, generateLegalMoves, toFEN, type Move, type PieceType, type Position } from '@battle-chess/chess-core';

/** D3 §Open Decisions — 옵션 A 채택: 경량 자체 JSON 포맷, 첫 6~8 ply 주요 오프닝만 커버. Master 전용. */
export interface BookEntry {
  fenPrefix: string; // toFEN()의 앞 3필드(board turn castling)만 비교 — ep/halfmove/fullmove는 무시
  moves: { move: string; weight: number }[]; // move: 롱 알제브릭, 예 'e2e4', 프로모션은 'e7e8q'
}

function fenPrefix(pos: Position): string {
  return toFEN(pos).split(' ').slice(0, 3).join(' ');
}

function parseLongAlgebraic(pos: Position, notation: string): Move | null {
  const from = algebraicToSquare(notation.slice(0, 2));
  const to = algebraicToSquare(notation.slice(2, 4));
  const promo = notation.length > 4 ? (notation[4] as PieceType) : undefined;
  const legal = generateLegalMoves(pos);
  return legal.find((m) => m.from === from && m.to === to && (promo === undefined || m.promo === promo)) ?? null;
}

// 첫 6~8 ply, King's Pawn·Queen's Pawn 두 계열만 완전히 연결된 체인으로 커버(D3: "Master 하나만을
// 위한 기능이므로 최소 구현으로 충분"). 각 fenPrefix는 실제 체스 진행으로 도달 가능함을
// `__tests__/openingBook.test.ts`가 전수 검증한다 — 끊긴 체인(도달 불가 fenPrefix)은 그 테스트가 잡는다.
export const OPENING_BOOK: readonly BookEntry[] = [
  {
    fenPrefix: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq',
    moves: [
      { move: 'e2e4', weight: 45 },
      { move: 'd2d4', weight: 45 },
      { move: 'c2c4', weight: 5 },
      { move: 'g1f3', weight: 5 },
    ],
  },
  // King's Pawn: 1.e4
  {
    fenPrefix: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq',
    moves: [{ move: 'e7e5', weight: 60 }, { move: 'c7c5', weight: 25 }, { move: 'e7e6', weight: 15 }],
  },
  {
    fenPrefix: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq',
    moves: [{ move: 'g1f3', weight: 60 }, { move: 'f1c4', weight: 20 }, { move: 'b1c3', weight: 20 }],
  },
  {
    fenPrefix: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq',
    moves: [{ move: 'b8c6', weight: 70 }, { move: 'g8f6', weight: 30 }],
  },
  {
    fenPrefix: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq',
    moves: [{ move: 'f1b5', weight: 50 }, { move: 'f1c4', weight: 30 }, { move: 'd2d4', weight: 20 }],
  },
  // Queen's Pawn: 1.d4
  {
    fenPrefix: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq',
    moves: [{ move: 'd7d5', weight: 50 }, { move: 'g8f6', weight: 50 }],
  },
  {
    fenPrefix: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq',
    moves: [{ move: 'c2c4', weight: 55 }, { move: 'g1f3', weight: 30 }, { move: 'b1c3', weight: 15 }],
  },
  {
    fenPrefix: 'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq',
    moves: [{ move: 'c2c4', weight: 50 }, { move: 'g1f3', weight: 35 }, { move: 'c1g5', weight: 15 }],
  },
];

/** 현재 포지션과 fenPrefix가 일치하는 북 항목을 찾아 가중치 기반으로 한 수를 뽑는다(없으면 null). */
export function pickBookMove(pos: Position, rng: () => number = Math.random): Move | null {
  const prefix = fenPrefix(pos);
  const entry = OPENING_BOOK.find((e) => e.fenPrefix === prefix);
  if (entry === undefined) return null;

  const totalWeight = entry.moves.reduce((sum, m) => sum + m.weight, 0);
  let roll = rng() * totalWeight;
  for (const candidate of entry.moves) {
    roll -= candidate.weight;
    if (roll <= 0) return parseLongAlgebraic(pos, candidate.move);
  }
  const last = entry.moves[entry.moves.length - 1];
  return last !== undefined ? parseLongAlgebraic(pos, last.move) : null;
}
