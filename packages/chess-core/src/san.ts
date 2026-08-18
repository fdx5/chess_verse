import type { Move, Position } from './types.js';
import { MoveFlag } from './types.js';
import { fileOf, rankOf, squareToAlgebraic } from './board.js';
import { generateLegalMoves, isInCheck } from './movegen.js';
import { makeMove } from './makemove.js';

const PIECE_LETTER: Record<string, string> = { n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

export function toSAN(pos: Position, move: Move): string {
  const piece = pos.board[move.from];
  if (!piece) {
    throw new Error(`No piece at ${move.from} to generate SAN for`);
  }

  let base: string;
  if (move.flags & MoveFlag.CASTLE_K) {
    base = 'O-O';
  } else if (move.flags & MoveFlag.CASTLE_Q) {
    base = 'O-O-O';
  } else if (piece.type === 'p') {
    const isCapture = (move.flags & MoveFlag.CAPTURE) !== 0;
    const fromFile = 'abcdefgh'[fileOf(move.from)];
    const dest = squareToAlgebraic(move.to);
    base = isCapture ? `${fromFile}x${dest}` : dest;
    if (move.flags & MoveFlag.PROMOTION && move.promo) {
      base += `=${PIECE_LETTER[move.promo]}`;
    }
  } else {
    const letter = PIECE_LETTER[piece.type] ?? '';
    const isCapture = (move.flags & MoveFlag.CAPTURE) !== 0;
    const dest = squareToAlgebraic(move.to);
    const disambiguation = computeDisambiguation(pos, move);
    base = `${letter}${disambiguation}${isCapture ? 'x' : ''}${dest}`;
  }

  const next = makeMove(pos, move);
  const inCheck = isInCheck(next, next.turn);
  if (inCheck) {
    const hasReply = generateLegalMoves(next).length > 0;
    base += hasReply ? '+' : '#';
  }

  return base;
}

function computeDisambiguation(pos: Position, move: Move): string {
  const piece = pos.board[move.from];
  if (!piece) return '';
  const others = generateLegalMoves(pos).filter((m) => {
    if (m.to !== move.to || m.from === move.from) return false;
    const p = pos.board[m.from];
    return p?.type === piece.type && p.color === piece.color;
  });
  if (others.length === 0) return '';

  const sameFile = others.some((m) => fileOf(m.from) === fileOf(move.from));
  const sameRank = others.some((m) => rankOf(m.from) === rankOf(move.from));

  if (!sameFile) return 'abcdefgh'[fileOf(move.from)] ?? '';
  if (!sameRank) return String(rankOf(move.from) + 1);
  return squareToAlgebraic(move.from);
}
