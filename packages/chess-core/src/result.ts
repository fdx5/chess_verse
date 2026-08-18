import type { GameResult, Piece, Position } from './types.js';
import { otherColor } from './types.js';
import { generateLegalMoves, isInCheck } from './movegen.js';
import { isOffboard } from './board.js';

function boardPieces(pos: Position): Piece[] {
  const pieces: Piece[] = [];
  for (let sq = 0; sq < 128; sq++) {
    if (isOffboard(sq)) continue;
    const piece = pos.board[sq];
    if (piece) pieces.push(piece);
  }
  return pieces;
}

/** FIDE's four automatically-detected insufficient-material draws only (§D2). */
export function isInsufficientMaterial(pos: Position): boolean {
  const pieces = boardPieces(pos).filter((p) => p.type !== 'k');
  if (pieces.length === 0) return true; // K vs K
  if (pieces.length === 1 && (pieces[0]?.type === 'n' || pieces[0]?.type === 'b')) return true; // K+N or K+B vs K
  if (pieces.length === 2 && pieces.every((p) => p.type === 'b')) {
    // K+B vs K+B, only draw if bishops are on same-color squares
    const squares: number[] = [];
    for (let sq = 0; sq < 128; sq++) {
      if (isOffboard(sq)) continue;
      const piece = pos.board[sq];
      if (piece?.type === 'b') squares.push(sq);
    }
    if (squares.length === 2) {
      const [a, b] = squares as [number, number];
      const colorOf = (sq: number) => ((sq >> 4) + (sq & 7)) % 2;
      return colorOf(a) === colorOf(b);
    }
  }
  return false;
}

export function countOccurrences(history: readonly Position[], hash: bigint): number {
  let count = 0;
  for (const p of history) {
    if (p.hash === hash) count++;
  }
  return count;
}

export function getGameResult(pos: Position, history: readonly Position[]): GameResult {
  const legalMoves = generateLegalMoves(pos);
  const inCheck = isInCheck(pos, pos.turn);

  if (legalMoves.length === 0) {
    if (inCheck) {
      return { kind: 'checkmate', winner: otherColor(pos.turn) };
    }
    return { kind: 'stalemate' };
  }

  if (pos.halfmoveClock >= 100) {
    return { kind: 'draw', reason: 'fifty_move' };
  }
  if (countOccurrences(history, pos.hash) >= 3) {
    return { kind: 'draw', reason: 'threefold' };
  }
  if (isInsufficientMaterial(pos)) {
    return { kind: 'draw', reason: 'insufficient_material' };
  }

  return { kind: 'in_progress' };
}
