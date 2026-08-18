/** D7 §인게임 HUD — 수순 기보(SAN) 스크롤 목록. */
export class MoveList {
  readonly el: HTMLDivElement;
  private readonly listEl: HTMLOListElement;
  private pendingWhiteSan: string | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = [
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

    this.listEl = document.createElement('ol');
    this.listEl.style.cssText = 'margin:0;padding-left:1.4em;';
    this.el.appendChild(this.listEl);
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
