/**
 * 렌더 온디맨드 루프 (D9 §최적화 전략). `dirty` 플래그가 꺼져 있으면 rAF 콜백은 계속
 * 등록된 채로 유지하되 `render()` 호출만 스킵한다 — 입력이 오면 지연 없이 즉시 재개.
 * 정적 구간에도 아이들 브리딩을 위해 `idleUpdateHz`(기본 10)로 저빈도 업데이트를 돌린다.
 */
export class RenderScheduler {
  private dirty = true;
  private running = false;
  private rafHandle: number | null = null;
  private lastFrameMs = 0;
  private lastIdleUpdateMs = 0;
  private wasIdle = false;
  private readonly idleIntervalMs: number;

  constructor(
    private readonly renderFn: (dtSeconds: number) => void,
    private readonly idleUpdateFn: (dtSeconds: number) => void,
    idleUpdateHz = 10
  ) {
    this.idleIntervalMs = 1000 / idleUpdateHz;
  }

  markDirty(): void {
    this.dirty = true;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameMs = performance.now();
    this.lastIdleUpdateMs = this.lastFrameMs;
    this.rafHandle = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private readonly loop = (nowMs: number): void => {
    if (!this.running) return;
    const dtSeconds = (nowMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = nowMs;

    // renderFn/idleUpdateFn 내부(게임 로직, 전투 연출 등)에서 예외가 하나라도 던져지면 이 콜백이
    // 중간에 끊겨 아래의 rAF 재등록이 실행되지 않고 루프 전체가 영구 정지한다 — 화면이 멈추고
    // 입력도 다시는 안 풀리는 심각한 증상으로 이어지므로, 프레임 하나의 예외가 전체 루프를
    // 죽이지 않도록 방어한다(사용자 실측으로 "게임 진행중 멈춤 + 클릭 무반응" 발견).
    try {
      if (this.dirty) {
        if (this.wasIdle) {
          console.debug('[RenderScheduler] resuming full-rate render (dirty)');
          this.wasIdle = false;
        }
        this.dirty = false;
        this.renderFn(dtSeconds);
      } else {
        if (!this.wasIdle) {
          console.debug('[RenderScheduler] idle — skipping render(), holding rAF for instant resume');
          this.wasIdle = true;
        }
        if (nowMs - this.lastIdleUpdateMs >= this.idleIntervalMs) {
          const idleDt = (nowMs - this.lastIdleUpdateMs) / 1000;
          this.lastIdleUpdateMs = nowMs;
          this.idleUpdateFn(idleDt);
          this.renderFn(idleDt);
        }
      }
    } catch (err) {
      console.error('[RenderScheduler] frame error (loop continues):', err);
    }

    this.rafHandle = requestAnimationFrame(this.loop);
  };
}
