import type { Color, PieceType } from '@battle-chess/chess-core';

const GLYPH: Record<Color, Record<PieceType, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

/** UX_UI_SPEC §4 — 손가락 가림 방지: 포인터 기준 Y축 -64px(엄지 폭+여유) 오프셋. */
const OFFSET_Y_PX = -64;

/**
 * D9 Sprint 10 §모바일 드래그 — 실제 3D 메시를 복제하는 대신 가벼운 2D DOM 오버레이로
 * 대체했다(`docs/DEVIATIONS.md` 참조). 유니코드 기물 글리프라 애셋 로딩이 필요 없다.
 */
export class TouchGhost {
  private readonly el: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed',
      'display:none',
      'left:0',
      'top:0',
      'pointer-events:none',
      'z-index:50',
      'font-size:56px',
      'line-height:1',
      'opacity:0.85',
      'filter:drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
      'transform:translate(-50%,-50%)',
    ].join(';');
    container.appendChild(this.el);
  }

  show(type: PieceType, color: Color): void {
    this.el.textContent = GLYPH[color][type];
    this.el.style.display = 'block';
  }

  moveTo(clientX: number, clientY: number): void {
    this.el.style.transform = `translate(${clientX}px, ${clientY + OFFSET_Y_PX}px) translate(-50%,-50%)`;
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}
