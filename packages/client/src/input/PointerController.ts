import type * as THREE from 'three';
import type { Square } from '@battle-chess/chess-core';
import { pickSquare } from './Raycaster';

const CLICK_MOVE_THRESHOLD_PX = 6;
const CLICK_MAX_DURATION_MS = 500;

export interface PointerControllerCallbacks {
  /** 탭(클릭)으로 판정된 경우 — 기존 데스크톱 클릭 흐름과 동일하게 호출된다. */
  onTap: (square: Square | null) => void;
  /** pointerdown 칸에서 드래그를 시작해도 되는지(예: 내 턴 기물 위인지) — false면 카메라 궤도회전에 맡긴다. */
  canStartDrag: (square: Square) => boolean;
  onDragStart: (square: Square) => void;
  onDragMove: (clientX: number, clientY: number) => void;
  /** 드롭 칸(보드 밖이면 null) — 두 번째 탭과 동일하게 처리하면 된다. */
  onDragEnd: (square: Square | null) => void;
  onDragCancel: () => void;
}

/**
 * D7/UX_UI_SPEC §3-4 §데스크톱·모바일 조작 통일 — OrbitControls의 드래그(카메라 회전)와
 * 기물 탭/드래그를 이동 거리·시간 임계값으로 구분한다. pointerdown 칸에 내 턴 기물이 있고
 * 임계값을 넘어 움직이면 드래그로 전환하고, 그렇지 않으면(빈 칸/상대 기물 드래그, 혹은 짧은 탭)
 * 카메라 궤도회전이나 일반 탭 처리로 자연히 넘어간다.
 */
export class PointerController {
  private downX = 0;
  private downY = 0;
  private downTime = 0;
  private downSquare: Square | null = null;
  private dragging = false;

  private readonly onPointerDown = (ev: PointerEvent): void => {
    this.downX = ev.clientX;
    this.downY = ev.clientY;
    this.downTime = performance.now();
    this.dragging = false;
    this.downSquare = pickSquare(ev.clientX, ev.clientY, this.canvas, this.camera);
  };

  private readonly onPointerMove = (ev: PointerEvent): void => {
    if (this.dragging) {
      this.callbacks.onDragMove(ev.clientX, ev.clientY);
      return;
    }
    if (this.downSquare === null) return;
    const dist = Math.hypot(ev.clientX - this.downX, ev.clientY - this.downY);
    if (dist <= CLICK_MOVE_THRESHOLD_PX) return;
    if (!this.callbacks.canStartDrag(this.downSquare)) return; // 카메라 궤도회전으로 넘김
    this.dragging = true;
    this.callbacks.onDragStart(this.downSquare);
    this.callbacks.onDragMove(ev.clientX, ev.clientY);
  };

  private readonly onPointerUp = (ev: PointerEvent): void => {
    if (this.dragging) {
      this.dragging = false;
      this.downSquare = null;
      const dropSquare = pickSquare(ev.clientX, ev.clientY, this.canvas, this.camera);
      this.callbacks.onDragEnd(dropSquare);
      return;
    }
    this.downSquare = null;
    const dist = Math.hypot(ev.clientX - this.downX, ev.clientY - this.downY);
    const duration = performance.now() - this.downTime;
    if (dist > CLICK_MOVE_THRESHOLD_PX || duration > CLICK_MAX_DURATION_MS) return;

    const square = pickSquare(ev.clientX, ev.clientY, this.canvas, this.camera);
    this.callbacks.onTap(square);
  };

  private readonly onPointerCancel = (): void => {
    this.downSquare = null;
    if (this.dragging) {
      this.dragging = false;
      this.callbacks.onDragCancel();
    }
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.Camera,
    private readonly callbacks: PointerControllerCallbacks
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
  }
}
