import {
  type Color,
  type Move,
  MoveFlag,
  type PieceType,
  type Position,
  type Square,
  asSquare,
  otherColor,
} from './types.js';
import {
  BISHOP_OFFSETS,
  KING_OFFSETS,
  KNIGHT_OFFSETS,
  ROOK_OFFSETS,
  fileOf,
  isOffboard,
  rankOf,
  squareOf,
} from './board.js';
import { makeMove } from './makemove.js';

const PROMO_TYPES: readonly PieceType[] = ['q', 'r', 'b', 'n'];

function pushPawnMoves(
  moves: Move[],
  from: Square,
  to: Square,
  extraFlags: number,
  isPromoRank: boolean,
): void {
  if (isPromoRank) {
    for (const promo of PROMO_TYPES) {
      moves.push({ from, to, promo, flags: extraFlags | MoveFlag.PROMOTION });
    }
  } else {
    moves.push({ from, to, flags: extraFlags });
  }
}

export function generatePseudoLegalMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  const us = pos.turn;
  const them = otherColor(us);

  for (let sq = 0; sq < 128; sq++) {
    if (isOffboard(sq)) continue;
    const piece = pos.board[sq];
    if (!piece || piece.color !== us) continue;
    const from = asSquare(sq);

    switch (piece.type) {
      case 'p': {
        const dir = us === 'w' ? 16 : -16;
        const startRank = us === 'w' ? 1 : 6;
        const promoRank = us === 'w' ? 7 : 0;

        const oneStep = sq + dir;
        if (!isOffboard(oneStep) && pos.board[oneStep] === null) {
          pushPawnMoves(moves, from, asSquare(oneStep), 0, rankOf(asSquare(oneStep)) === promoRank);
          const twoStep = sq + dir * 2;
          if (rankOf(from) === startRank && pos.board[twoStep] === null) {
            moves.push({ from, to: asSquare(twoStep), flags: MoveFlag.DOUBLE_PUSH });
          }
        }
        for (const dfile of [-1, 1]) {
          const target = sq + dir + dfile;
          if (isOffboard(target)) continue;
          if (fileOf(asSquare(target)) - fileOf(from) !== dfile) continue; // wrap guard
          const targetPiece = pos.board[target];
          if (targetPiece && targetPiece.color === them) {
            pushPawnMoves(
              moves,
              from,
              asSquare(target),
              MoveFlag.CAPTURE,
              rankOf(asSquare(target)) === promoRank,
            );
          } else if (pos.epSquare !== null && target === pos.epSquare) {
            moves.push({
              from,
              to: asSquare(target),
              flags: MoveFlag.CAPTURE | MoveFlag.EN_PASSANT,
            });
          }
        }
        break;
      }
      case 'n':
      case 'k': {
        const offsets = piece.type === 'n' ? KNIGHT_OFFSETS : KING_OFFSETS;
        for (const off of offsets) {
          const target = sq + off;
          if (isOffboard(target)) continue;
          const targetPiece = pos.board[target];
          if (!targetPiece) {
            moves.push({ from, to: asSquare(target), flags: 0 });
          } else if (targetPiece.color === them) {
            moves.push({ from, to: asSquare(target), flags: MoveFlag.CAPTURE });
          }
        }
        if (piece.type === 'k') {
          generateCastleMoves(pos, from, moves);
        }
        break;
      }
      case 'b':
      case 'r':
      case 'q': {
        const offsets =
          piece.type === 'b' ? BISHOP_OFFSETS : piece.type === 'r' ? ROOK_OFFSETS : KING_OFFSETS;
        for (const off of offsets) {
          let target = sq + off;
          while (!isOffboard(target)) {
            const targetPiece = pos.board[target];
            if (!targetPiece) {
              moves.push({ from, to: asSquare(target), flags: 0 });
            } else {
              if (targetPiece.color === them) {
                moves.push({ from, to: asSquare(target), flags: MoveFlag.CAPTURE });
              }
              break;
            }
            target += off;
          }
        }
        break;
      }
    }
  }
  return moves;
}

function generateCastleMoves(pos: Position, kingSq: Square, moves: Move[]): void {
  const us = pos.turn;
  const them = otherColor(us);
  const rank = us === 'w' ? 0 : 7;
  const e = squareOf(4, rank);
  if (kingSq !== e) return;
  if (isSquareAttacked(pos, e, them)) return;

  const kSideRight = us === 'w' ? pos.castling.wk : pos.castling.bk;
  if (kSideRight) {
    const f = squareOf(5, rank);
    const g = squareOf(6, rank);
    const h = squareOf(7, rank);
    const rook = pos.board[h];
    if (
      pos.board[f] === null &&
      pos.board[g] === null &&
      rook?.type === 'r' &&
      rook.color === us &&
      !isSquareAttacked(pos, f, them) &&
      !isSquareAttacked(pos, g, them)
    ) {
      moves.push({ from: kingSq, to: g, flags: MoveFlag.CASTLE_K });
    }
  }

  const qSideRight = us === 'w' ? pos.castling.wq : pos.castling.bq;
  if (qSideRight) {
    const d = squareOf(3, rank);
    const c = squareOf(2, rank);
    const b = squareOf(1, rank);
    const a = squareOf(0, rank);
    const rook = pos.board[a];
    if (
      pos.board[d] === null &&
      pos.board[c] === null &&
      pos.board[b] === null &&
      rook?.type === 'r' &&
      rook.color === us &&
      !isSquareAttacked(pos, d, them) &&
      !isSquareAttacked(pos, c, them)
    ) {
      moves.push({ from: kingSq, to: c, flags: MoveFlag.CASTLE_Q });
    }
  }
}

export function isSquareAttacked(pos: Position, sq: Square, byColor: Color): boolean {
  // Pawn attacks
  if (byColor === 'w') {
    for (const off of [15, 17]) {
      const p = sq - off;
      if (!isOffboard(p) && Math.abs(fileOf(asSquare(p)) - fileOf(sq)) === 1) {
        const piece = pos.board[p];
        if (piece?.type === 'p' && piece.color === 'w') return true;
      }
    }
  } else {
    for (const off of [15, 17]) {
      const p = sq + off;
      if (!isOffboard(p) && Math.abs(fileOf(asSquare(p)) - fileOf(sq)) === 1) {
        const piece = pos.board[p];
        if (piece?.type === 'p' && piece.color === 'b') return true;
      }
    }
  }

  for (const off of KNIGHT_OFFSETS) {
    const p = sq + off;
    if (isOffboard(p)) continue;
    const piece = pos.board[p];
    if (piece?.type === 'n' && piece.color === byColor) return true;
  }

  for (const off of KING_OFFSETS) {
    const p = sq + off;
    if (isOffboard(p)) continue;
    const piece = pos.board[p];
    if (piece?.type === 'k' && piece.color === byColor) return true;
  }

  for (const off of BISHOP_OFFSETS) {
    let p = sq + off;
    while (!isOffboard(p)) {
      const piece = pos.board[p];
      if (piece) {
        if ((piece.type === 'b' || piece.type === 'q') && piece.color === byColor) return true;
        break;
      }
      p += off;
    }
  }

  for (const off of ROOK_OFFSETS) {
    let p = sq + off;
    while (!isOffboard(p)) {
      const piece = pos.board[p];
      if (piece) {
        if ((piece.type === 'r' || piece.type === 'q') && piece.color === byColor) return true;
        break;
      }
      p += off;
    }
  }

  return false;
}

function findKing(pos: Position, color: Color): Square {
  for (let sq = 0; sq < 128; sq++) {
    if (isOffboard(sq)) continue;
    const piece = pos.board[sq];
    if (piece?.type === 'k' && piece.color === color) return asSquare(sq);
  }
  throw new Error(`King not found for ${color}`);
}

export function isInCheck(pos: Position, color: Color): boolean {
  const kingSq = findKing(pos, color);
  return isSquareAttacked(pos, kingSq, otherColor(color));
}

export function generateLegalMoves(pos: Position): Move[] {
  const pseudo = generatePseudoLegalMoves(pos);
  const legal: Move[] = [];
  const mover = pos.turn;
  for (const move of pseudo) {
    const next = makeMove(pos, move);
    if (!isInCheck(next, mover)) {
      legal.push(move);
    }
  }
  return legal;
}
