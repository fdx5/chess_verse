import type { Position } from './types.js';
import { generateLegalMoves } from './movegen.js';
import { makeMove } from './makemove.js';

export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = generateLegalMoves(pos);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    nodes += perft(makeMove(pos, move), depth - 1);
  }
  return nodes;
}
