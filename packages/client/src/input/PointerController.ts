import type * as THREE from 'three';
import type { Square } from '@battle-chess/chess-core';
import { pickSquare } from './Raycaster';

const CLICK_MOVE_THRESHOLD_PX = 6;
const CLICK_MAX_DURATION_MS = 500;

/** 포인터 이벤트 통일(D7/모바일 규칙) — OrbitControls의 드래그(카메라 회전)와 클릭(기물 선택)을
 * 이동 거리/시간 임계값으로 구분한다. 클릭으로 판정되면 보드 평면 레이캐스트로 칸을 계산해 콜백한다. */
export class PointerController {
  private downX = 0;
  private downY = 0;
  private downTime = 0;
  private readonly onPointerDown = (ev: PointerEvent): void => {
    this.downX = ev.clientX;
    this.downY = ev.clientY;
    this.downTime = performance.now();
  };
  private readonly onPointerUp = (ev: PointerEvent): void => {
    const dx = ev.clientX - this.downX;
    const dy = ev.clientY - this.downY;
    const dist = Math.hypot(dx, dy);
    const duration = performance.now() - this.downTime;
    if (dist > CLICK_MOVE_THRESHOLD_PX || duration > CLICK_MAX_DURATION_MS) return;

    const square = pickSquare(ev.clientX, ev.clientY, this.canvas, this.camera);
    this.onSquareClicked(square);
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    private readonly onSquareClicked: (square: Square | null) => void
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
  }
}
