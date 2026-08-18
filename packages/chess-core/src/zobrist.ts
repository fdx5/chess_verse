import type { Color, PieceType, Position, Square } from './types.js';
import { fileOf, rankOf } from './board.js';

/** Deterministic PRNG (mulberry32) — fixed seed so client/server produce identical tables. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBigint64(rng: () => number): bigint {
  const hi = BigInt(Math.floor(rng() * 0xffffffff) >>> 0);
  const lo = BigInt(Math.floor(rng() * 0xffffffff) >>> 0);
  return (hi << 32n) | lo;
}

const PIECE_ORDER: readonly PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];
const SEED = 0xc0ffee;

function pieceIndex(type: PieceType, color: Color): number {
  return PIECE_ORDER.indexOf(type) + (color === 'w' ? 0 : 6);
}

function realIndex(sq: Square): number {
  return rankOf(sq) * 8 + fileOf(sq);
}

const rng = mulberry32(SEED);
export const PIECE_KEYS: bigint[][] = Array.from({ length: 12 }, () =>
  Array.from({ length: 64 }, () => randomBigint64(rng)),
);
export const CASTLING_KEYS = {
  wk: randomBigint64(rng),
  wq: randomBigint64(rng),
  bk: randomBigint64(rng),
  bq: randomBigint64(rng),
};
export const EP_FILE_KEYS: bigint[] = Array.from({ length: 8 }, () => randomBigint64(rng));
export const SIDE_TO_MOVE_KEY = randomBigint64(rng);

export function pieceKey(type: PieceType, color: Color, sq: Square): bigint {
  const row = PIECE_KEYS[pieceIndex(type, color)];
  if (!row) throw new Error('invalid piece index');
  const key = row[realIndex(sq)];
  if (key === undefined) throw new Error('invalid square index');
  return key;
}

/** Compute the Zobrist hash of a position from scratch (used by fromFEN; makeMove updates incrementally instead). */
export function zobristHash(pos: Position): bigint {
  let h = 0n;
  for (const sq of pos.board.keys()) {
    const piece = pos.board[sq];
    if (!piece) continue;
    h ^= pieceKey(piece.type, piece.color, sq as Square);
  }
  if (pos.castling.wk) h ^= CASTLING_KEYS.wk;
  if (pos.castling.wq) h ^= CASTLING_KEYS.wq;
  if (pos.castling.bk) h ^= CASTLING_KEYS.bk;
  if (pos.castling.bq) h ^= CASTLING_KEYS.bq;
  if (pos.epSquare !== null) {
    const key = EP_FILE_KEYS[fileOf(pos.epSquare)];
    if (key !== undefined) h ^= key;
  }
  if (pos.turn === 'b') h ^= SIDE_TO_MOVE_KEY;
  return h;
}
