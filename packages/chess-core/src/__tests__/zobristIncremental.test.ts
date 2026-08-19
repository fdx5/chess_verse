import { describe, it, expect } from 'vitest';
import { fromFEN } from '../fen.js';
import { generateLegalMoves } from '../movegen.js';
import { makeMove } from '../makemove.js';
import { zobristHash } from '../zobrist.js';
import type { Position } from '../types.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// D2 perft 표의 kiwipete — 캐슬링(양쪽/양진영)·앙파상·프로모션 경로를 전부 강제로 지나간다.
const KIWIPETE_FEN = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';

/** 모든 자손 노드에서 makeMove()의 증분 해시가 zobristHash()의 전체 재계산과 정확히 일치하는지 재귀 검증한다. */
function walkAndVerify(pos: Position, depth: number): void {
  expect(pos.hash).toBe(zobristHash(pos));
  if (depth === 0) return;
  for (const move of generateLegalMoves(pos)) {
    const next = makeMove(pos, move);
    expect(next.hash).toBe(zobristHash(next));
    walkAndVerify(next, depth - 1);
  }
}

describe('D9 Sprint 11 §Zobrist 증분 해시 — makeMove의 XOR 갱신이 전체 재계산과 항상 일치한다', () => {
  it('시작 포지션에서 3수 깊이까지 모든 노드의 해시가 일치한다', () => {
    walkAndVerify(fromFEN(START_FEN), 3);
  });

  it('kiwipete 포지션(캐슬링·앙파상 밀집)에서도 3수 깊이까지 일치한다', () => {
    walkAndVerify(fromFEN(KIWIPETE_FEN), 3);
  });
});
