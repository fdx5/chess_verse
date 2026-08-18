import type { Color } from '@battle-chess/chess-core';
import type { TimeControlPreset } from '@battle-chess/protocol';

const MAX_LATENCY_COMPENSATION_MS = 150;

/** D6-5 §시계 설계 — 서버가 유일한 시계 권위자. 레이턴시 보상 포함. */
export class ServerClock {
  private whiteMs: number;
  private blackMs: number;
  private turnStartTs: number;

  constructor(private readonly preset: TimeControlPreset, now: number) {
    const baseMs = preset.kind === 'unlimited' ? Number.POSITIVE_INFINITY : preset.baseMs;
    this.whiteMs = baseMs;
    this.blackMs = baseMs;
    this.turnStartTs = now;
  }

  getState(): { whiteClockMs: number; blackClockMs: number } {
    return { whiteClockMs: this.whiteMs, blackClockMs: this.blackMs };
  }

  /** 수를 둔 직후 호출 — 소비 시간을 차감(레이턴시 보상 적용)하고 증가시간을 더한 뒤 상대 시계로 턴을 넘긴다. */
  applyMove(mover: Color, clientTs: number, serverRecvTs: number): void {
    if (this.preset.kind === 'unlimited') return;
    const latencyEstimate = Math.max(0, serverRecvTs - clientTs);
    const compensation = Math.min(latencyEstimate, MAX_LATENCY_COMPENSATION_MS);
    const effectiveElapsed = Math.max(0, serverRecvTs - this.turnStartTs - compensation);

    if (mover === 'w') {
      this.whiteMs = Math.max(0, this.whiteMs - effectiveElapsed) + this.preset.incrementMs;
    } else {
      this.blackMs = Math.max(0, this.blackMs - effectiveElapsed) + this.preset.incrementMs;
    }
    this.turnStartTs = serverRecvTs;
  }

  /** 타임아웃 체크용 — 폴링 시각 기준 남은 시간을 소모시키지 않고 조회만 한다. */
  isExpired(turn: Color, now: number): boolean {
    if (this.preset.kind === 'unlimited') return false;
    const elapsedSinceTurnStart = now - this.turnStartTs;
    const remaining = (turn === 'w' ? this.whiteMs : this.blackMs) - elapsedSinceTurnStart;
    return remaining <= 0;
  }
}
