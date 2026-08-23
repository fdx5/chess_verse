import { otherColor, type Color, type PieceType } from '@battle-chess/chess-core';

/** 사용자 요청 — 각 진영이 처치한 기물의 종류·개수를 화면 왼쪽 패널로 실시간 관리한다. */

const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
// 표시 순서(가치 내림차순) — k는 절대 캡처되지 않으므로 제외.
const DISPLAY_ORDER: readonly PieceType[] = ['q', 'r', 'b', 'n', 'p'];
// 백 기물은 윤곽(outline) 글리프, 흑 기물은 채움(filled) 글리프 — 캡처된 기물 본래 색을 그대로 표시.
const GLYPH: Record<Color, Record<PieceType, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

export class CapturedPiecesPanel {
  readonly el: HTMLDivElement;
  private readonly rowByColor: Record<Color, HTMLDivElement>;
  private readonly diffEl: HTMLSpanElement;
  private counts: Record<Color, Record<PieceType, number>> = this.emptyCounts();

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'top:64px',
      'left:12px',
      'width:min(220px,45vw)',
      'display:flex',
      'flex-direction:column',
      'gap:8px',
      'padding:10px 12px',
      'border-radius:10px',
      'border:1px solid #6B4A2F',
      'background:linear-gradient(180deg,rgba(42,33,24,0.88),rgba(26,20,13,0.88))',
      'box-shadow:0 4px 14px rgba(0,0,0,0.4)',
      'color:#F2E8D5',
      'font:12px system-ui,sans-serif',
      'pointer-events:none',
      'z-index:12',
      'box-sizing:border-box',
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #6B4A2F;padding-bottom:6px;';
    const headerLabel = document.createElement('span');
    headerLabel.textContent = '전리품';
    headerLabel.style.cssText = 'color:#D4AF37;font-weight:700;letter-spacing:0.04em;';
    this.diffEl = document.createElement('span');
    this.diffEl.style.cssText = 'font-weight:700;';
    header.appendChild(headerLabel);
    header.appendChild(this.diffEl);
    this.el.appendChild(header);

    const rowW = this.buildRow('백이 처치');
    const rowB = this.buildRow('흑이 처치');
    this.rowByColor = { w: rowW.iconsEl, b: rowB.iconsEl };
    this.el.appendChild(rowW.container);
    this.el.appendChild(rowB.container);

    this.render();
  }

  setMobile(mobile: boolean): void {
    this.el.style.top = mobile ? 'calc(env(safe-area-inset-top, 0px) + 116px)' : '64px';
    this.el.style.left = mobile ? '8px' : '12px';
    this.el.style.width = mobile ? 'min(190px, calc(100vw - 16px))' : 'min(220px,45vw)';
  }

  private buildRow(label: string): { container: HTMLDivElement; iconsEl: HTMLDivElement } {
    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size:10px;opacity:0.65;';
    const iconsEl = document.createElement('div');
    iconsEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;min-height:20px;font-size:17px;line-height:1;';
    container.appendChild(labelEl);
    container.appendChild(iconsEl);
    return { container, iconsEl };
  }

  private emptyCounts(): Record<Color, Record<PieceType, number>> {
    const zero = (): Record<PieceType, number> => ({ p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 });
    return { w: zero(), b: zero() };
  }

  /** `capturerColor`가 상대 기물(`capturedType`)을 잡았을 때 호출한다. */
  recordCapture(capturerColor: Color, capturedType: PieceType): void {
    this.counts[capturerColor][capturedType] += 1;
    this.render();
  }

  reset(): void {
    this.counts = this.emptyCounts();
    this.render();
  }

  private render(): void {
    for (const side of ['w', 'b'] as const) {
      const capturedColor: Color = otherColor(side);
      const iconsEl = this.rowByColor[side];
      iconsEl.innerHTML = '';
      let any = false;
      for (const type of DISPLAY_ORDER) {
        const count = this.counts[side][type];
        if (count === 0) continue;
        any = true;
        const chip = document.createElement('span');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:2px;';
        const glyph = document.createElement('span');
        glyph.textContent = GLYPH[capturedColor][type];
        const n = document.createElement('span');
        n.textContent = `×${count}`;
        n.style.cssText = 'font-size:10px;opacity:0.8;vertical-align:top;';
        chip.appendChild(glyph);
        chip.appendChild(n);
        iconsEl.appendChild(chip);
      }
      if (!any) {
        const dash = document.createElement('span');
        dash.textContent = '—';
        dash.style.cssText = 'opacity:0.4;';
        iconsEl.appendChild(dash);
      }
    }

    const materialFor = (side: Color): number =>
      DISPLAY_ORDER.reduce((sum, type) => sum + this.counts[side][type] * PIECE_VALUE[type], 0);
    const diff = materialFor('w') - materialFor('b');
    if (diff === 0) {
      this.diffEl.textContent = '';
    } else {
      this.diffEl.textContent = diff > 0 ? `백 +${diff}` : `흑 +${-diff}`;
      this.diffEl.style.color = diff > 0 ? '#F2E8D5' : '#D9C43A';
    }
  }
}
