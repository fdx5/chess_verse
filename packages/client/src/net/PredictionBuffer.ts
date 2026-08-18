import type { Move } from '@battle-chess/chess-core';

interface PendingMove {
  clientMoveId: string;
  move: Move;
  sentAt: number;
}

/** D6-1 §낙관적 로컬 적용 — 서버 ACK/REJECT를 기다리는 동안 보낸 수를 추적한다. */
export class PredictionBuffer {
  private readonly pending: PendingMove[] = [];

  push(clientMoveId: string, move: Move): void {
    this.pending.push({ clientMoveId, move, sentAt: performance.now() });
  }

  /** ACK/REJECT 수신 시 매칭되는 항목을 제거하고 반환한다(없으면 undefined — stale 응답). */
  consume(clientMoveId: string): PendingMove | undefined {
    const idx = this.pending.findIndex((p) => p.clientMoveId === clientMoveId);
    if (idx === -1) return undefined;
    const [entry] = this.pending.splice(idx, 1);
    return entry;
  }

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  clear(): void {
    this.pending.length = 0;
  }
}
