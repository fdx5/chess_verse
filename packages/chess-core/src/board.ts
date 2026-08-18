import { type Square, asSquare } from './types.js';

/** rank index 0 = rank '1' (white back rank), rank index 7 = rank '8'. */
export function fileOf(sq: Square): number {
  return sq & 7;
}
export function rankOf(sq: Square): number {
  return sq >> 4;
}
export function isOffboard(sq: number): boolean {
  return (sq & 0x88) !== 0;
}
export function squareOf(file: number, rank: number): Square {
  return asSquare(rank * 16 + file);
}

const FILES = 'abcdefgh';

export function squareToAlgebraic(sq: Square): string {
  return `${FILES[fileOf(sq)]}${rankOf(sq) + 1}`;
}

export function algebraicToSquare(s: string): Square {
  const file = FILES.indexOf(s[0] ?? '');
  const rank = Number(s[1]) - 1;
  if (file < 0 || Number.isNaN(rank)) {
    throw new Error(`Invalid algebraic square: ${s}`);
  }
  return squareOf(file, rank);
}

export const KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33] as const;
export const KING_OFFSETS = [-17, -16, -15, -1, 1, 15, 16, 17] as const;
export const BISHOP_OFFSETS = [-17, -15, 15, 17] as const;
export const ROOK_OFFSETS = [-16, -1, 1, 16] as const;
export const QUEEN_OFFSETS = KING_OFFSETS;

export const ALL_SQUARES: Square[] = (() => {
  const list: Square[] = [];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      list.push(squareOf(file, rank));
    }
  }
  return list;
})();
