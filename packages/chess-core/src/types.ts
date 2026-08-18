export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** 0x88 board index. Valid squares satisfy (sq & 0x88) === 0. */
export type Square = number & { readonly __brand: 'Square' };

export function asSquare(n: number): Square {
  return n as Square;
}

export interface Piece {
  readonly type: PieceType;
  readonly color: Color;
}

export const MoveFlag = {
  CAPTURE: 1 << 0,
  CASTLE_K: 1 << 1,
  CASTLE_Q: 1 << 2,
  EN_PASSANT: 1 << 3,
  PROMOTION: 1 << 4,
  DOUBLE_PUSH: 1 << 5,
} as const;

export interface Move {
  readonly from: Square;
  readonly to: Square;
  readonly promo?: PieceType;
  readonly flags: number;
}

export interface CastlingRights {
  readonly wk: boolean;
  readonly wq: boolean;
  readonly bk: boolean;
  readonly bq: boolean;
}

export interface Position {
  readonly board: readonly (Piece | null)[]; // length 128
  readonly turn: Color;
  readonly castling: CastlingRights;
  readonly epSquare: Square | null;
  readonly halfmoveClock: number;
  readonly fullmoveNumber: number;
  readonly hash: bigint;
}

export type GameResult =
  | { readonly kind: 'in_progress' }
  | { readonly kind: 'checkmate'; readonly winner: Color }
  | { readonly kind: 'stalemate' }
  | { readonly kind: 'draw'; readonly reason: 'fifty_move' | 'threefold' | 'insufficient_material' | 'agreement' }
  | { readonly kind: 'resignation'; readonly winner: Color }
  | { readonly kind: 'timeout'; readonly winner: Color };

export function otherColor(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}
