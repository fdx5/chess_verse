import {
  generateLegalMoves,
  makeMove,
  isInCheck,
  zobristHash,
  fromFEN,
  toFEN,
  MoveFlag,
  type Position,
  type Move,
  type PieceType,
} from '@battle-chess/chess-core';
import { evaluate } from './evaluate';
import { MATERIAL_VALUE } from './pst';

/** D3 §탐색 알고리즘 — negamax + alpha-beta + TT + quiescence + null-move + LMR + aspiration window. */

export interface SearchLimits {
  maxDepth: number;
  useNullMove: boolean;
  useLMR: boolean;
  useAspiration: boolean;
  useTT: boolean;
  useKillersHistory: boolean;
  useQuiescence: boolean;
}

export interface SearchProgress {
  depth: number;
  scoreCp: number;
  pv: Move[];
  nodes: number;
}

export interface SearchResult {
  move: Move;
  scoreCp: number;
  depth: number;
  nodes: number;
}

type TTFlag = 'EXACT' | 'LOWER' | 'UPPER';
interface TTEntry {
  depth: number;
  score: number;
  flag: TTFlag;
  bestMove: Move | null;
}

const MATE_SCORE = 1_000_000;
const INF = 10_000_000;
const NODE_CHECK_INTERVAL = 1000;

function moveKey(m: Move): number {
  return m.from * 128 + m.to;
}

function sameMove(a: Move, b: Move | null): boolean {
  return b !== null && a.from === b.from && a.to === b.to && a.promo === b.promo;
}

function isCapture(m: Move): boolean {
  return (m.flags & MoveFlag.CAPTURE) !== 0;
}

/** D3: 방어자 기물 값을 모르면(엔패상 등 엣지케이스) 폰 값으로 근사 — MVV-LVA 정렬 목적상 충분. */
function mvvLva(pos: Position, m: Move): number {
  if (!isCapture(m)) return 0;
  const attacker = pos.board[m.from];
  const victim = pos.board[m.to];
  const victimVal = victim !== null && victim !== undefined ? MATERIAL_VALUE[victim.type] : MATERIAL_VALUE.p;
  const attackerVal = attacker !== null && attacker !== undefined ? MATERIAL_VALUE[attacker.type] : 0;
  return victimVal * 10 - attackerVal;
}

export class SearchState {
  readonly tt = new Map<bigint, TTEntry>();
  readonly killers: (Move | null)[][] = [];
  readonly history = new Int32Array(128 * 128);
  nodes = 0;
  aborted = false;
  rootBestMove: Move | null = null;
  rootBestScore = -INF;

  shouldAbort(deadline: number): boolean {
    if (this.aborted) return true;
    if (this.nodes % NODE_CHECK_INTERVAL === 0 && performance.now() > deadline) this.aborted = true;
    return this.aborted;
  }
}

function orderMoves(pos: Position, moves: readonly Move[], ttMove: Move | null, killers: (Move | null)[], history: Int32Array): Move[] {
  return [...moves].sort((a, b) => scoreOf(b) - scoreOf(a));

  function scoreOf(m: Move): number {
    if (sameMove(m, ttMove)) return 1_000_000;
    if (isCapture(m)) return 100_000 + mvvLva(pos, m);
    if (sameMove(m, killers[0] ?? null)) return 90_000;
    if (sameMove(m, killers[1] ?? null)) return 89_000;
    return history[moveKey(m)] ?? 0;
  }
}

function hasNonPawnMaterial(pos: Position, color: Position['turn']): boolean {
  const NON_PAWN: readonly PieceType[] = ['n', 'b', 'r', 'q'];
  for (const piece of pos.board) {
    if (piece !== null && piece !== undefined && piece.color === color && NON_PAWN.includes(piece.type)) return true;
  }
  return false;
}

/** D2에 전용 null-move 헬퍼가 없어 여기서 FEN 왕복으로 턴만 바꾼 포지션을 만든다(탐색 핫패스가 아니라 depth>=3 null-move 시도 시에만 호출되므로 비용 허용 가능). */
function makeNullMove(pos: Position): Position {
  const fen = toFEN(pos);
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  const next = fromFEN(parts.join(' '));
  return { ...next, hash: zobristHash(next) };
}

function quiescence(pos: Position, alpha: number, beta: number, state: SearchState, deadline: number): number {
  state.nodes += 1;
  if (state.shouldAbort(deadline)) return 0;

  const standPat = evaluate(pos);
  if (standPat >= beta) return beta;
  let a = Math.max(alpha, standPat);

  const captures = generateLegalMoves(pos)
    .filter(isCapture)
    .sort((x, y) => mvvLva(pos, y) - mvvLva(pos, x));

  for (const move of captures) {
    const child = makeMove(pos, move);
    const score = -quiescence(child, -beta, -a, state, deadline);
    if (state.aborted) return 0;
    if (score >= beta) return beta;
    if (score > a) a = score;
  }
  return a;
}

function negamax(pos: Position, depth: number, alpha: number, beta: number, ply: number, state: SearchState, limits: SearchLimits, deadline: number): number {
  state.nodes += 1;
  if (state.shouldAbort(deadline)) return 0;

  let a = alpha;
  let b = beta;

  if (limits.useTT) {
    const entry = state.tt.get(pos.hash);
    if (entry !== undefined && entry.depth >= depth) {
      if (entry.flag === 'EXACT') return entry.score;
      if (entry.flag === 'LOWER') a = Math.max(a, entry.score);
      if (entry.flag === 'UPPER') b = Math.min(b, entry.score);
      if (a >= b) return entry.score;
    }
  }

  if (depth <= 0) return limits.useQuiescence ? quiescence(pos, a, b, state, deadline) : evaluate(pos);

  if (limits.useNullMove && depth >= 3 && ply > 0 && !isInCheck(pos, pos.turn) && hasNonPawnMaterial(pos, pos.turn)) {
    const nullPos = makeNullMove(pos);
    const score = -negamax(nullPos, depth - 1 - 2, -b, -b + 1, ply + 1, state, limits, deadline);
    if (state.aborted) return 0;
    if (score >= b) return b;
  }

  const legalMoves = generateLegalMoves(pos);
  if (legalMoves.length === 0) {
    return isInCheck(pos, pos.turn) ? -MATE_SCORE + ply : 0;
  }

  const ttEntry = limits.useTT ? state.tt.get(pos.hash) : undefined;
  if (limits.useKillersHistory && state.killers[ply] === undefined) state.killers[ply] = [null, null];
  const killersAtPly = limits.useKillersHistory ? (state.killers[ply] as (Move | null)[]) : [null, null];
  const moves = orderMoves(pos, legalMoves, ttEntry?.bestMove ?? null, killersAtPly, state.history);

  let bestScore = -INF;
  let bestMove: Move | null = null;
  let flag: TTFlag = 'UPPER';

  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i];
    if (move === undefined) continue;
    const reduction = limits.useLMR && i >= 4 && !isCapture(move) && depth >= 3 ? 1 : 0;
    const child = makeMove(pos, move);

    let score = -negamax(child, depth - 1 - reduction, -b, -a, ply + 1, state, limits, deadline);
    if (state.aborted) return 0;
    if (reduction > 0 && score > a) {
      score = -negamax(child, depth - 1, -b, -a, ply + 1, state, limits, deadline);
      if (state.aborted) return 0;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
      if (ply === 0) {
        state.rootBestMove = move;
        state.rootBestScore = score;
      }
    }
    if (score > a) {
      a = score;
      flag = 'EXACT';
    }
    if (a >= b) {
      flag = 'LOWER';
      if (limits.useKillersHistory && !isCapture(move)) {
        if (!sameMove(move, killersAtPly[0] ?? null)) {
          killersAtPly[1] = killersAtPly[0] ?? null;
          killersAtPly[0] = move;
        }
        state.history[moveKey(move)] = (state.history[moveKey(move)] ?? 0) + depth * depth;
      }
      break;
    }
  }

  if (limits.useTT && bestMove !== null) {
    state.tt.set(pos.hash, { depth, score: bestScore, flag, bestMove });
  }
  return bestScore;
}

function extractPV(pos: Position, state: SearchState, maxLen: number): Move[] {
  const pv: Move[] = [];
  let current = pos;
  for (let i = 0; i < maxLen; i += 1) {
    const entry = state.tt.get(current.hash);
    if (entry === undefined || entry.bestMove === null) break;
    pv.push(entry.bestMove);
    current = makeMove(current, entry.bestMove);
  }
  return pv;
}

/** Advanced/Master용 반복심화 탐색. `movetimeMs` 소진 시 진행 중이던 depth는 버리고 이전 depth 결과를 반환한다. */
export function iterativeDeepen(pos: Position, limits: SearchLimits, deadline: number, onProgress?: (p: SearchProgress) => void): SearchResult {
  const state = new SearchState();
  let lastCompleted: SearchResult | null = null;

  for (let depth = 1; depth <= limits.maxDepth; depth += 1) {
    if (performance.now() > deadline) break;

    let score: number;
    if (limits.useAspiration && lastCompleted !== null) {
      let window = 50;
      for (;;) {
        const alpha = lastCompleted.scoreCp - window;
        const beta = lastCompleted.scoreCp + window;
        score = negamax(pos, depth, alpha, beta, 0, state, limits, deadline);
        if (state.aborted) break;
        if (score <= alpha || score >= beta) {
          window *= 2;
          if (window > INF) {
            score = negamax(pos, depth, -INF, INF, 0, state, limits, deadline);
            break;
          }
          continue;
        }
        break;
      }
    } else {
      score = negamax(pos, depth, -INF, INF, 0, state, limits, deadline);
    }

    if (state.aborted) break;
    if (state.rootBestMove === null) break;

    lastCompleted = { move: state.rootBestMove, scoreCp: score, depth, nodes: state.nodes };
    onProgress?.({ depth, scoreCp: score, pv: extractPV(pos, state, depth), nodes: state.nodes });
  }

  if (lastCompleted === null) {
    const fallback = generateLegalMoves(pos)[0];
    if (fallback === undefined) throw new Error('iterativeDeepen: no legal moves at root');
    return { move: fallback, scoreCp: 0, depth: 0, nodes: state.nodes };
  }
  return lastCompleted;
}

/** Beginner/Intermediate용 — 얕은 고정 depth로 루트 수 전부를 독립적으로(풀윈도우) 평가해 정렬한다. */
export function evaluateRootMovesShallow(pos: Position, depth: number, limits: Omit<SearchLimits, 'maxDepth'>): { move: Move; score: number }[] {
  const legalMoves = generateLegalMoves(pos);
  const state = new SearchState();
  const deadline = performance.now() + 30_000;
  const results = legalMoves.map((move) => {
    const child = makeMove(pos, move);
    const score = -negamax(child, Math.max(0, depth - 1), -INF, INF, 1, state, { ...limits, maxDepth: depth }, deadline);
    return { move, score };
  });
  results.sort((x, y) => y.score - x.score);
  return results;
}
