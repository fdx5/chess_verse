import { generateLegalMoves, type Move, type Position } from '@battle-chess/chess-core';
import { iterativeDeepen, evaluateRootMovesShallow, type SearchLimits } from './search';
import { pickBookMove } from './openingBook';

/**
 * D3 §Web Worker 실행 설계 — `postMessage`로만 메인 스레드와 통신한다(DOM/Three 직접 접근 없음).
 * 이 파일은 module worker로 로드되며(`new Worker(url, {type:'module'})`), `self`가 DOM lib의 `Window`와
 * `WebWorker` lib의 `WorkerGlobalScope`를 동시에 만족할 수 없는 TS 제약을 피하기 위해
 * `postMessage`/`addEventListener('message', ...)`를 파일 로컬 선언으로 좁혀서 사용한다.
 */
declare function postMessage(message: AiResponse): void;

export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'master';

export type AiRequest =
  | { type: 'AI_SEARCH_REQUEST'; position: Position; difficulty: Difficulty; movetimeMs: number; requestId: string }
  | { type: 'AI_SEARCH_ABORT'; requestId: string };

export type AiResponse =
  | { type: 'AI_SEARCH_PROGRESS'; requestId: string; depth: number; scoreCp: number; pv: Move[]; nodes: number }
  | { type: 'AI_SEARCH_RESULT'; requestId: string; move: Move; evalScoreCp: number }
  | { type: 'AI_SEARCH_ABORTED'; requestId: string };

interface DifficultyConfig {
  limits: SearchLimits;
  shallowDepth: number; // Beginner/Intermediate 전용(D3 블런더 문단): Beginner=1, Intermediate=2
  blunderProb: number;
  topN: number;
  useBook: boolean;
  useDeepSearch: boolean; // Advanced/Master만 true — iterativeDeepen 사용
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  beginner: {
    limits: { maxDepth: 1, useNullMove: false, useLMR: false, useAspiration: false, useTT: false, useKillersHistory: false, useQuiescence: false },
    shallowDepth: 1,
    blunderProb: 0.25,
    topN: 5,
    useBook: false,
    useDeepSearch: false,
  },
  intermediate: {
    limits: { maxDepth: 2, useNullMove: false, useLMR: false, useAspiration: false, useTT: true, useKillersHistory: false, useQuiescence: true },
    shallowDepth: 2,
    blunderProb: 0.08,
    topN: 3,
    useBook: false,
    useDeepSearch: false,
  },
  advanced: {
    limits: { maxDepth: 7, useNullMove: false, useLMR: false, useAspiration: false, useTT: true, useKillersHistory: true, useQuiescence: true },
    shallowDepth: 0,
    blunderProb: 0,
    topN: 1,
    useBook: false,
    useDeepSearch: true,
  },
  master: {
    limits: { maxDepth: 12, useNullMove: true, useLMR: true, useAspiration: true, useTT: true, useKillersHistory: true, useQuiescence: true },
    shallowDepth: 0,
    blunderProb: 0,
    topN: 1,
    useBook: true,
    useDeepSearch: true,
  },
};

let currentRequestId: string | null = null;
let aborted = false;

/** D3: top-N 밖의 수를 확률적으로 골라 "그럴듯하지만 최적은 아닌" 블런더를 만든다(완전 랜덤 아님). */
function selectMoveWithPersonality(ranked: { move: Move; score: number }[], config: DifficultyConfig, rng: () => number): { move: Move; score: number } {
  const best = ranked[0];
  if (best === undefined) throw new Error('selectMoveWithPersonality: no candidate moves');
  if (config.blunderProb > 0 && rng() < config.blunderProb && ranked.length > config.topN) {
    const eligible = ranked.slice(config.topN).filter((r) => best.score - r.score <= 150);
    if (eligible.length > 0) {
      const pick = eligible[Math.floor(rng() * eligible.length)];
      if (pick !== undefined) return pick;
    }
  }
  const topPool = ranked.slice(0, Math.min(config.topN, ranked.length));
  const pick = topPool[Math.floor(rng() * topPool.length)];
  return pick ?? best;
}

function runSearch(position: Position, difficulty: Difficulty, movetimeMs: number, requestId: string): void {
  const config = DIFFICULTY_CONFIG[difficulty];
  const deadline = performance.now() + movetimeMs;

  if (config.useBook) {
    const bookMove = pickBookMove(position);
    if (bookMove !== null) {
      postMessage({ type: 'AI_SEARCH_RESULT', requestId, move: bookMove, evalScoreCp: 0 });
      return;
    }
  }

  if (config.useDeepSearch) {
    const result = iterativeDeepen(position, config.limits, deadline, (progress) => {
      if (aborted || currentRequestId !== requestId) return;
      postMessage({ type: 'AI_SEARCH_PROGRESS', requestId, depth: progress.depth, scoreCp: progress.scoreCp, pv: progress.pv, nodes: progress.nodes });
    });
    if (aborted || currentRequestId !== requestId) {
      postMessage({ type: 'AI_SEARCH_ABORTED', requestId });
      return;
    }
    postMessage({ type: 'AI_SEARCH_RESULT', requestId, move: result.move, evalScoreCp: result.scoreCp });
    return;
  }

  const legalMoves = generateLegalMoves(position);
  if (legalMoves.length === 0) throw new Error('runSearch: no legal moves at root');
  const { maxDepth: _unused, ...shallowLimits } = config.limits;
  void _unused;
  const ranked = evaluateRootMovesShallow(position, config.shallowDepth, shallowLimits);
  const chosen = selectMoveWithPersonality(ranked, config, Math.random);
  postMessage({ type: 'AI_SEARCH_RESULT', requestId, move: chosen.move, evalScoreCp: chosen.score });
}

addEventListener('message', (event: MessageEvent<AiRequest>) => {
  const request = event.data;
  if (request.type === 'AI_SEARCH_ABORT') {
    if (request.requestId === currentRequestId) aborted = true;
    return;
  }

  currentRequestId = request.requestId;
  aborted = false;
  try {
    runSearch(request.position, request.difficulty, request.movetimeMs, request.requestId);
  } catch (err) {
    console.error('[ai.worker] search failed:', err);
    postMessage({ type: 'AI_SEARCH_ABORTED', requestId: request.requestId });
  }
});
