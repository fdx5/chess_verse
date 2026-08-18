/** D7 §인게임 HUD — 턴 인디케이터/체크·종료 상태 표시. */
export class TurnIndicator {
  readonly el: HTMLDivElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'top:12px',
      'left:50%',
      'transform:translateX(-50%)',
      'padding:8px 20px',
      'border-radius:8px',
      'background:rgba(26,20,13,0.72)',
      'color:#F2E8D5',
      'font:600 15px/1.4 system-ui,sans-serif',
      'letter-spacing:0.02em',
      'pointer-events:none',
      'user-select:none',
    ].join(';');
    this.el.textContent = '백 차례';
  }

  setText(text: string): void {
    this.el.textContent = text;
  }
}
