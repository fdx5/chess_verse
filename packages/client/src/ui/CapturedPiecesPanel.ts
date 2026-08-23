import { otherColor, type Color, type PieceType } from '@battle-chess/chess-core';

const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const DISPLAY_ORDER: readonly PieceType[] = ['q', 'r', 'b', 'n', 'p'];
const GLYPH: Record<Color, Record<PieceType, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

/** 평소에는 작은 탭으로 유지되고 요청할 때만 펼쳐지는 포획 정보 패널. */
export class CapturedPiecesPanel {
  readonly el: HTMLDivElement;
  private readonly contentEl: HTMLDivElement;
  private readonly labelEl: HTMLSpanElement;
  private readonly rowByColor: Record<Color, HTMLDivElement>;
  private readonly diffEl: HTMLSpanElement;
  private counts: Record<Color, Record<PieceType, number>> = this.emptyCounts();

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:absolute;bottom:12px;left:12px;width:min(210px,calc(100vw - 190px));border:1px solid rgba(107,74,47,.75);border-radius:12px;background:rgba(26,20,13,.88);box-shadow:0 4px 16px rgba(0,0,0,.32);backdrop-filter:blur(8px);color:#F2E8D5;font:12px system-ui,sans-serif;pointer-events:auto;z-index:22;box-sizing:border-box;overflow:hidden;';
    const header = document.createElement('div');
    header.style.cssText = 'min-height:44px;padding:0 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;';
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', 'false');
    this.labelEl = document.createElement('span');
    this.labelEl.textContent = '잡은 기물 ﹀';
    this.labelEl.style.cssText = 'color:#D4AF37;font-weight:700;';
    this.diffEl = document.createElement('span');
    this.diffEl.style.fontWeight = '700';
    header.append(this.labelEl, this.diffEl);
    this.el.appendChild(header);

    this.contentEl = document.createElement('div');
    this.contentEl.style.cssText = 'display:none;padding:8px 12px 10px;border-top:1px solid rgba(107,74,47,.75);flex-direction:column;gap:7px;';
    const rowW = this.buildRow('백이 잡음');
    const rowB = this.buildRow('흑이 잡음');
    this.rowByColor = { w: rowW.iconsEl, b: rowB.iconsEl };
    this.contentEl.append(rowW.container, rowB.container);
    this.el.appendChild(this.contentEl);
    header.addEventListener('click', () => {
      const open = this.contentEl.style.display === 'none';
      this.contentEl.style.display = open ? 'flex' : 'none';
      header.setAttribute('aria-expanded', String(open));
      this.labelEl.textContent = open ? '잡은 기물 ︿' : '잡은 기물 ﹀';
    });
    this.render();
  }

  setMobile(mobile: boolean): void {
    this.el.style.left = mobile ? '8px' : '12px';
    this.el.style.bottom = mobile ? 'max(10px,env(safe-area-inset-bottom,0px))' : '12px';
  }

  private buildRow(label: string): { container: HTMLDivElement; iconsEl: HTMLDivElement } {
    const container = document.createElement('div');
    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size:10px;opacity:.65;margin-bottom:3px;';
    const iconsEl = document.createElement('div');
    iconsEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;min-height:18px;font-size:17px;line-height:1;';
    container.append(labelEl, iconsEl);
    return { container, iconsEl };
  }

  private emptyCounts(): Record<Color, Record<PieceType, number>> {
    const zero = (): Record<PieceType, number> => ({ p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 });
    return { w: zero(), b: zero() };
  }

  recordCapture(capturerColor: Color, capturedType: PieceType): void {
    this.counts[capturerColor][capturedType] += 1;
    this.render();
  }
  reset(): void { this.counts = this.emptyCounts(); this.render(); }

  private render(): void {
    for (const side of ['w', 'b'] as const) {
      const iconsEl = this.rowByColor[side];
      iconsEl.innerHTML = '';
      for (const type of DISPLAY_ORDER) {
        const count = this.counts[side][type];
        if (count === 0) continue;
        const chip = document.createElement('span');
        chip.textContent = `${GLYPH[otherColor(side)][type]}×${count}`;
        iconsEl.appendChild(chip);
      }
      if (iconsEl.childElementCount === 0) iconsEl.textContent = '—';
    }
    const score = (side: Color): number => DISPLAY_ORDER.reduce((sum, type) => sum + this.counts[side][type] * PIECE_VALUE[type], 0);
    const diff = score('w') - score('b');
    this.diffEl.textContent = diff === 0 ? '' : diff > 0 ? `백 +${diff}` : `흑 +${-diff}`;
    this.diffEl.style.color = diff > 0 ? '#F2E8D5' : '#D9C43A';
  }
}
