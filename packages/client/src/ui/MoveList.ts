import { isMobileLayout, onLayoutChange } from './responsive/Breakpoints';

function desktopStyle(collapsed: boolean): string {
  return [
    'position:absolute',
    'top:12px',
    'right:12px',
    'width:110px',
    'max-height:50vh',
    'display:flex',
    'flex-direction:column',
    'padding:6px 8px',
    'border-radius:8px',
    'border:1px solid rgba(107,74,47,0.4)',
    'background:rgba(26,20,13,0.78)',
    'color:#F2E8D5',
    'font:12px/1.5 ui-monospace,monospace',
    'pointer-events:auto',
    'backdrop-filter:blur(4px)',
    'box-shadow:0 4px 12px rgba(0,0,0,0.3)',
    'transition:all 0.2s ease-out',
    `height:${collapsed ? 'auto' : 'auto'}`,
  ].join(';');
}

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
    'font:12px/1.5 ui-monospace,monospace',
    'pointer-events:auto',
    'transition:height 0.25s ease-out',
    'box-shadow:0 -4px 12px rgba(0,0,0,0.35)',
  ].join(';');
}

/** D7/UX_UI_SPEC §7 §인게임 HUD 기보 패널 — 컴팩트 절반 너비(110px) + 접기/펼치기 토글 지원 */
export class MoveList {
  readonly el: HTMLDivElement;
  readonly tabEl: HTMLButtonElement;
  private readonly headerEl: HTMLDivElement;
  private readonly toggleBtn: HTMLButtonElement;
  private readonly listEl: HTMLOListElement;
  private pendingWhiteSan: string | null = null;
  private mobile = false;
  private mobileOpen = false;
  private desktopCollapsed = true;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = desktopStyle(this.desktopCollapsed);

    // 헤더 (기보 제목 + 접기/펼치기 버튼)
    this.headerEl = document.createElement('div');
    this.headerEl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:4px;margin-bottom:4px;border-bottom:1px solid rgba(242,232,213,0.15);user-select:none;';

    const title = document.createElement('span');
    title.textContent = '기보';
    title.style.cssText = 'font-weight:600;font-size:11px;color:#D4AF37;letter-spacing:0.5px;';
    this.headerEl.appendChild(title);

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.textContent = '접기 ▲';
    this.toggleBtn.style.cssText = 'background:none;border:none;color:#C8CDD3;font-size:11px;cursor:pointer;padding:0 2px;';
    this.toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDesktopFold();
    });
    this.headerEl.appendChild(this.toggleBtn);
    this.el.appendChild(this.headerEl);

    this.listEl = document.createElement('ol');
    this.listEl.style.cssText = 'margin:0;padding-left:1.2em;overflow-y:auto;max-height:40vh;word-break:break-all;';
    this.el.appendChild(this.listEl);

    // 모바일 탭 버튼
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
      'font:12px system-ui,sans-serif',
      'cursor:pointer',
      'pointer-events:auto',
      'z-index:12',
    ].join(';');
    this.tabEl.addEventListener('click', () => this.setMobileOpen(!this.mobileOpen));

    onLayoutChange((mobile) => this.setMobile(mobile));
    this.setMobile(isMobileLayout());
  }

  private toggleDesktopFold(): void {
    this.desktopCollapsed = !this.desktopCollapsed;
    this.listEl.style.display = this.desktopCollapsed ? 'none' : 'block';
    this.toggleBtn.textContent = this.desktopCollapsed ? '펼치기 ▼' : '접기 ▲';
    this.el.style.cssText = desktopStyle(this.desktopCollapsed);
  }

  private setMobile(mobile: boolean): void {
    this.mobile = mobile;
    this.tabEl.style.display = mobile ? 'block' : 'none';
    this.tabEl.style.bottom = mobile ? 'calc(max(10px, env(safe-area-inset-bottom, 0px)) + 52px)' : '8px';
    this.headerEl.style.display = mobile ? 'none' : 'flex';
    this.listEl.style.display = 'block';
    this.el.style.cssText = mobile ? mobileStyle(this.mobileOpen) : desktopStyle(this.desktopCollapsed);
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
      lastLi.textContent = `${this.pendingWhiteSan} ${san}`;
      this.pendingWhiteSan = null;
    } else {
      const li = document.createElement('li');
      li.textContent = `.. ${san}`;
      this.listEl.appendChild(li);
    }
    this.listEl.scrollTop = this.listEl.scrollHeight;
  }

  clear(): void {
    this.listEl.innerHTML = '';
    this.pendingWhiteSan = null;
  }
}
