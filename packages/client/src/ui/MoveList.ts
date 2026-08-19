import { isMobileLayout, onLayoutChange } from './responsive/Breakpoints';

const DESKTOP_STYLE = [
  'position:absolute',
  'top:12px',
  'right:12px',
  'width:180px',
  'max-height:60vh',
  'overflow-y:auto',
  'padding:10px 12px',
  'border-radius:8px',
  'background:rgba(26,20,13,0.72)',
  'color:#F2E8D5',
  'font:13px/1.6 ui-monospace,monospace',
  'pointer-events:auto',
].join(';');

function mobileStyle(open: boolean): string {
  return [
    'position:absolute',
    'left:0',
    'right:0',
    'bottom:0',
    `height:${open ? '40vh' : '0'}`,
    'overflow-y:auto',
    open ? 'padding:10px 16px 16px' : 'padding:0 16px',
    'border-radius:12px 12px 0 0',
    'background:rgba(26,20,13,0.92)',
    'color:#F2E8D5',
    'font:13px/1.6 ui-monospace,monospace',
    'pointer-events:auto',
    'transition:height 0.25s ease-out',
    'box-shadow:0 -4px 12px rgba(0,0,0,0.35)',
  ].join(';');
}

/** D7/UX_UI_SPEC §7 §인게임 HUD 기보 패널 — 데스크톱은 우측 상단 고정, 모바일(<768px)은 바텀시트. */
export class MoveList {
  readonly el: HTMLDivElement;
  readonly tabEl: HTMLButtonElement;
  private readonly listEl: HTMLOListElement;
  private pendingWhiteSan: string | null = null;
  private mobile = false;
  private mobileOpen = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = DESKTOP_STYLE;

    this.listEl = document.createElement('ol');
    this.listEl.style.cssText = 'margin:0;padding-left:1.4em;';
    this.el.appendChild(this.listEl);

    this.tabEl = document.createElement('button');
    this.tabEl.textContent = '기보 ▲';
    this.tabEl.style.cssText = [
      'position:absolute',
      'display:none',
      'bottom:8px',
      'right:8px',
      'min-width:44px',
      'min-height:44px',
      'padding:6px 14px',
      'border-radius:8px',
      'border:1px solid #6B4A2F',
      'background:rgba(26,20,13,0.85)',
      'color:#F2E8D5',
      'font:13px system-ui,sans-serif',
      'cursor:pointer',
      'pointer-events:auto',
      'z-index:12',
    ].join(';');
    this.tabEl.addEventListener('click', () => this.setMobileOpen(!this.mobileOpen));

    onLayoutChange((mobile) => this.setMobile(mobile));
    this.setMobile(isMobileLayout());
  }

  private setMobile(mobile: boolean): void {
    this.mobile = mobile;
    this.tabEl.style.display = mobile ? 'block' : 'none';
    this.el.style.cssText = mobile ? mobileStyle(this.mobileOpen) : DESKTOP_STYLE;
  }

  private setMobileOpen(open: boolean): void {
    this.mobileOpen = open;
    this.tabEl.textContent = open ? '기보 ▼' : '기보 ▲';
    if (this.mobile) this.el.style.cssText = mobileStyle(open);
  }

  push(san: string, color: 'w' | 'b'): void {
    if (color === 'w') {
      this.pendingWhiteSan = san;
      const li = document.createElement('li');
      li.dataset['white'] = san;
      li.textContent = san;
      this.listEl.appendChild(li);
      return;
    }
    const lastLi = this.listEl.lastElementChild;
    if (lastLi !== null && this.pendingWhiteSan !== null) {
      lastLi.textContent = `${this.pendingWhiteSan}   ${san}`;
      this.pendingWhiteSan = null;
    } else {
      const li = document.createElement('li');
      li.textContent = `...   ${san}`;
      this.listEl.appendChild(li);
    }
    this.el.scrollTop = this.el.scrollHeight;
  }

  clear(): void {
    this.listEl.innerHTML = '';
    this.pendingWhiteSan = null;
  }
}
