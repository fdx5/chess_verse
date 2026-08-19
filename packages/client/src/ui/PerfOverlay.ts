import type * as THREE from 'three';

interface PerformanceWithMemory extends Performance {
  memory?: { usedJSHeapSize: number };
}

/**
 * D9 Sprint 11 §계측 — D9-1 예산표(FPS/드로우콜/삼각형/힙)를 브라우저에서 직접 읽을 수 있게 한다.
 * `~` 키로 토글. 이 세션엔 브라우저 자동화 도구가 없어 실측값을 코드로 얻을 수 없으므로,
 * 사용자가 직접 켜서 수치를 확인·보고할 수 있는 형태로 남겨둔다(`docs/PERF_REPORT.md` 참조).
 */
export class PerfOverlay {
  readonly el: HTMLDivElement;
  private visible = false;
  private frameCount = 0;
  private lastSampleAt = performance.now();

  constructor(
    container: HTMLElement,
    private readonly renderer: THREE.WebGLRenderer
  ) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'top:8px',
      'left:8px',
      'display:none',
      'padding:8px 10px',
      'border-radius:6px',
      'background:rgba(0,0,0,0.72)',
      'color:#7FE07F',
      'font:12px/1.5 ui-monospace,monospace',
      'white-space:pre',
      'pointer-events:none',
      'z-index:60',
    ].join(';');
    container.appendChild(this.el);

    window.addEventListener('keydown', (ev) => {
      if (ev.key === '`') this.toggle();
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  /** 매 렌더 프레임 뒤에 호출한다. 오버레이 자체 비용을 줄이려고 DOM 갱신은 0.5초에 한 번만 한다. */
  onFrame(): void {
    if (!this.visible) return;
    this.frameCount += 1;
    const now = performance.now();
    const elapsed = now - this.lastSampleAt;
    if (elapsed < 500) return;

    const fps = Math.round((this.frameCount * 1000) / elapsed);
    this.frameCount = 0;
    this.lastSampleAt = now;

    const info = this.renderer.info;
    const heap = (performance as PerformanceWithMemory).memory;
    const heapMb = heap !== undefined ? `${(heap.usedJSHeapSize / 1024 / 1024).toFixed(1)} MB` : 'N/A(Chrome 전용)';
    this.el.textContent = [
      `FPS: ${fps}`,
      `Draw calls: ${info.render.calls}  (예산 데스크톱≤350 / 모바일≤120)`,
      `Triangles: ${info.render.triangles.toLocaleString()}  (실측목표≤50,000)`,
      `Geometries: ${info.memory.geometries} / Textures: ${info.memory.textures}`,
      `JS Heap: ${heapMb}  (예산 데스크톱≤450MB / 모바일≤250MB)`,
    ].join('\n');
  }
}
