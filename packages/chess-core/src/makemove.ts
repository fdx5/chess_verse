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
import { fileOf, squareOf } from './board.js';
import { CASTLING_KEYS, EP_FILE_KEYS, SIDE_TO_MOVE_KEY, pieceKey } from './zobrist.js';

/**
 * Applies `move` to `pos` and returns a new Position. Does not mutate `pos`.
 * `hash` is updated incrementally (XOR in/out only the squares/rights/side-to-move that
 * actually changed) instead of recomputed from scratch — see docs/DEVIATIONS.md
 * [Sprint 11] for the perft-verified before/after benchmark.
 */
export function makeMove(pos: Position, move: Move): Position {
  const board = pos.board.slice();
  const moving = board[move.from];
  if (!moving) {
    throw new Error(`No piece at source square ${move.from}`);
  }
  const us = moving.color;
  const them = otherColor(us);

  let hash = pos.hash;
  hash ^= pieceKey(moving.type, moving.color, move.from);

  board[move.from] = null;

  if (move.flags & MoveFlag.EN_PASSANT) {
    const dir = us === 'w' ? -16 : 16;
    const capturedSq = asSquare(move.to + dir);
    const capturedPawn = board[capturedSq];
    if (capturedPawn) hash ^= pieceKey(capturedPawn.type, capturedPawn.color, capturedSq);
    board[capturedSq] = null;
  } else {
    const capturedPiece = board[move.to];
    if (capturedPiece) hash ^= pieceKey(capturedPiece.type, capturedPiece.color, move.to);
  }

  const finalPiece: Piece =
    move.flags & MoveFlag.PROMOTION && move.promo
      ? { type: move.promo, color: us }
      : moving;
  board[move.to] = finalPiece;
  hash ^= pieceKey(finalPiece.type, finalPiece.color, move.to);

  if (move.flags & MoveFlag.CASTLE_K) {
    const rank = us === 'w' ? 0 : 7;
    const rookFrom = squareOf(7, rank);
    const rookTo = squareOf(5, rank);
    const rook = board[rookFrom];
    if (rook) {
      hash ^= pieceKey(rook.type, rook.color, rookFrom);
      hash ^= pieceKey(rook.type, rook.color, rookTo);
    }
    board[rookTo] = board[rookFrom] ?? null;
    board[rookFrom] = null;
  } else if (move.flags & MoveFlag.CASTLE_Q) {
    const rank = us === 'w' ? 0 : 7;
    const rookFrom = squareOf(0, rank);
    const rookTo = squareOf(3, rank);
    const rook = board[rookFrom];
    if (rook) {
      hash ^= pieceKey(rook.type, rook.color, rookFrom);
      hash ^= pieceKey(rook.type, rook.color, rookTo);
    }
    board[rookTo] = board[rookFrom] ?? null;
    board[rookFrom] = null;
  }

  const castling = updateCastlingRights(pos.castling, move, moving, us);
  if (pos.castling.wk && !castling.wk) hash ^= CASTLING_KEYS.wk;
  if (pos.castling.wq && !castling.wq) hash ^= CASTLING_KEYS.wq;
  if (pos.castling.bk && !castling.bk) hash ^= CASTLING_KEYS.bk;
  if (pos.castling.bq && !castling.bq) hash ^= CASTLING_KEYS.bq;

  let epSquare: Square | null = null;
  if (move.flags & MoveFlag.DOUBLE_PUSH) {
    const dir = us === 'w' ? 16 : -16;
    epSquare = asSquare(move.from + dir);
  }
  if (pos.epSquare !== null) {
    const key = EP_FILE_KEYS[fileOf(pos.epSquare)];
    if (key !== undefined) hash ^= key;
  }
  if (epSquare !== null) {
    const key = EP_FILE_KEYS[fileOf(epSquare)];
    if (key !== undefined) hash ^= key;
  }

  hash ^= SIDE_TO_MOVE_KEY;

  const isPawnMove = moving.type === 'p';
  const isCapture = (move.flags & MoveFlag.CAPTURE) !== 0;
  const halfmoveClock = isPawnMove || isCapture ? 0 : pos.halfmoveClock + 1;
  const fullmoveNumber = us === 'b' ? pos.fullmoveNumber + 1 : pos.fullmoveNumber;

  return {
    board,
    turn: them,
    castling,
    epSquare,
    halfmoveClock,
    fullmoveNumber,
    hash,
  };
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
