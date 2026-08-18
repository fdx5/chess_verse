import { describe, expect, it } from 'vitest';
import { perft } from '../perft.js';
import { fromFEN } from '../fen.js';

interface PerftCase {
  name: string;
  fen: string;
  depths: number[];
}

const CASES: PerftCase[] = [
  {
    name: 'startpos',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    depths: [20, 400, 8902, 197281, 4865609],
  },
  {
    name: 'kiwipete',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    depths: [48, 2039, 97862, 4085603],
  },
  {
    name: 'endgame',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    depths: [14, 191, 2812, 43238, 674624],
  },
  {
    name: 'castling-promo-edge',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    depths: [6, 264, 9467, 422333],
  },
  {
    name: 'talkchess-pos5',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    depths: [44, 1486, 62379, 2103487],
  },
  {
    name: 'steven-edwards-pos6',
    fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    depths: [46, 2079, 89890, 3894594],
  },
];

describe('perft', () => {
  for (const testCase of CASES) {
    testCase.depths.forEach((expected, i) => {
      const depth = i + 1;
      const timeout = depth >= 5 ? 60_000 : 10_000;
      it(`${testCase.name} depth ${depth} = ${expected}`, () => {
        const pos = fromFEN(testCase.fen);
        expect(perft(pos, depth)).toBe(expected);
      }, timeout);
    });
  }
});
