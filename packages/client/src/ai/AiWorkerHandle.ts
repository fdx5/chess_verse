import type { Move, Position } from '@battle-chess/chess-core';
import type { AiRequest, AiResponse, Difficulty } from './worker/ai.worker';

export type { Difficulty } from './worker/ai.worker';

export interface AiMoveResult {
  move: Move;
  evalScoreCp: number;
}

export interface AiProgress {
  depth: number;
  scoreCp: number;
  pv: Move[];
  nodes: number;
}

/** D3 §Web Worker 실행 설계 — 메인 스레드 핸들. 요청은 직렬화(응답 전 새 요청 금지)해 abort 경합을 피한다. */
export class AiWorkerHandle {
  private readonly worker: Worker;
  private requestCounter = 0;
  private pending: { requestId: string; resolve: (r: AiMoveResult) => void; onProgress?: (p: AiProgress) => void } | null = null;

  constructor(onProgress?: (p: AiProgress) => void) {
    this.worker = new Worker(new URL('./worker/ai.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<AiResponse>) => {
      const response = event.data;
      if (this.pending === null || response.requestId !== this.pending.requestId) return;

      if (response.type === 'AI_SEARCH_PROGRESS') {
        onProgress?.({ depth: response.depth, scoreCp: response.scoreCp, pv: response.pv, nodes: response.nodes });
        return;
      }
      if (response.type === 'AI_SEARCH_RESULT') {
        const resolve = this.pending.resolve;
        this.pending = null;
        resolve({ move: response.move, evalScoreCp: response.evalScoreCp });
        return;
      }
      // AI_SEARCH_ABORTED: pending은 requestMove()의 abort() 경로가 이미 정리했으므로 여기선 무시.
    };
  }

  /** 직전 요청이 아직 진행 중이면 먼저 abort하고 완료를 기다린 뒤 새 요청을 보낸다(직렬화). */
  async requestMove(position: Position, difficulty: Difficulty, movetimeMs: number): Promise<AiMoveResult> {
    if (this.pending !== null) await this.abort();

    this.requestCounter += 1;
    const requestId = `ai-${this.requestCounter}`;

    return new Promise<AiMoveResult>((resolve) => {
      this.pending = { requestId, resolve };
      const request: AiRequest = { type: 'AI_SEARCH_REQUEST', position, difficulty, movetimeMs, requestId };
      this.worker.postMessage(request);
    });
  }

  private abort(): Promise<void> {
    const current = this.pending;
    if (current === null) return Promise.resolve();
    return new Promise((resolveAbort) => {
      const requestId = current.requestId;
      const onMessage = (event: MessageEvent<AiResponse>): void => {
        if (event.data.requestId !== requestId) return;
        this.worker.removeEventListener('message', onMessage);
        this.pending = null;
        resolveAbort();
      };
      this.worker.addEventListener('message', onMessage);
      this.worker.postMessage({ type: 'AI_SEARCH_ABORT', requestId } satisfies AiRequest);
    });
  }

  dispose(): void {
    this.worker.terminate();
    this.pending = null;
  }
}
