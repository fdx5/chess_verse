import {
  type CastlingRights,
  type Move,
  MoveFlag,
  type Piece,
  type Position,
  type Square,
  asSquare,
  otherColor,
} from './types.js';
import { squareOf } from './board.js';
import { zobristHash } from './zobrist.js';

/**
 * Applies `move` to `pos` and returns a new Position. Does not mutate `pos`.
 * Correctness (not incremental hashing) is prioritized for Sprint 1; `hash` is
 * recomputed from scratch here rather than XOR-incrementally updated —
 * see docs/DEVIATIONS.md for the rationale and future optimization note.
 */
export function makeMove(pos: Position, move: Move): Position {
  const board = pos.board.slice();
  const moving = board[move.from];
  if (!moving) {
    throw new Error(`No piece at source square ${move.from}`);
  }
  const us = moving.color;
  const them = otherColor(us);

  board[move.from] = null;

  if (move.flags & MoveFlag.EN_PASSANT) {
    const dir = us === 'w' ? -16 : 16;
    const capturedSq = move.to + dir;
    board[capturedSq] = null;
  }

  const finalPiece: Piece =
    move.flags & MoveFlag.PROMOTION && move.promo
      ? { type: move.promo, color: us }
      : moving;
  board[move.to] = finalPiece;

  if (move.flags & MoveFlag.CASTLE_K) {
    const rank = us === 'w' ? 0 : 7;
    const rookFrom = squareOf(7, rank);
    const rookTo = squareOf(5, rank);
    board[rookTo] = board[rookFrom] ?? null;
    board[rookFrom] = null;
  } else if (move.flags & MoveFlag.CASTLE_Q) {
    const rank = us === 'w' ? 0 : 7;
    const rookFrom = squareOf(0, rank);
    const rookTo = squareOf(3, rank);
    board[rookTo] = board[rookFrom] ?? null;
    board[rookFrom] = null;
  }

  const castling = updateCastlingRights(pos.castling, move, moving, us);

  let epSquare: Square | null = null;
  if (move.flags & MoveFlag.DOUBLE_PUSH) {
    const dir = us === 'w' ? 16 : -16;
    epSquare = asSquare(move.from + dir);
  }

  const isPawnMove = moving.type === 'p';
  const isCapture = (move.flags & MoveFlag.CAPTURE) !== 0;
  const halfmoveClock = isPawnMove || isCapture ? 0 : pos.halfmoveClock + 1;
  const fullmoveNumber = us === 'b' ? pos.fullmoveNumber + 1 : pos.fullmoveNumber;

  const next: Position = {
    board,
    turn: them,
    castling,
    epSquare,
    halfmoveClock,
    fullmoveNumber,
    hash: 0n,
  };
  return { ...next, hash: zobristHash(next) };
}

function updateCastlingRights(
  rights: CastlingRights,
  move: Move,
  moving: Piece,
  us: 'w' | 'b',
): CastlingRights {
  let { wk, wq, bk, bq } = rights;

  if (moving.type === 'k') {
    if (us === 'w') {
      wk = false;
      wq = false;
    } else {
      bk = false;
      bq = false;
    }
  }

  const clearIfRookSquare = (sq: Square) => {
    if (sq === squareOf(0, 0)) wq = false;
    if (sq === squareOf(7, 0)) wk = false;
    if (sq === squareOf(0, 7)) bq = false;
    if (sq === squareOf(7, 7)) bk = false;
  };
  clearIfRookSquare(move.from);
  clearIfRookSquare(move.to);

  return { wk, wq, bk, bq };
}
