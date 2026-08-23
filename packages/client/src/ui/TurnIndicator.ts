/** D7 §인게임 HUD — 턴 인디케이터/체크·종료 상태 표시. */
export class TurnIndicator {
  readonly el: HTMLDivElement;
  private readonly turnText: HTMLSpanElement;
  private readonly drawCounter: HTMLSpanElement;
  private readonly elapsedTime: HTMLSpanElement;

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
      'display:flex',
      'align-items:center',
      'gap:12px',
      'letter-spacing:0.02em',
      'pointer-events:none',
      'user-select:none',
    ].join(';');
    this.turnText = document.createElement('span');
    this.turnText.textContent = '백 차례';
    this.drawCounter = document.createElement('span');
    this.drawCounter.style.cssText = 'padding-left:12px;border-left:1px solid rgba(242,232,213,.3);font-size:12px;font-weight:500;color:#F0CE6A;white-space:nowrap;';
    this.drawCounter.title = '백과 흑이 50턴을 완료하면 무승부입니다.';
    this.elapsedTime = document.createElement('span');
    this.elapsedTime.style.cssText = 'padding-left:12px;border-left:1px solid rgba(242,232,213,.3);font-size:12px;font-weight:500;color:#C8CDD3;white-space:nowrap;';
    this.elapsedTime.textContent = '경과시간 00분00초';
    this.el.append(this.turnText, this.drawCounter, this.elapsedTime);
  }

  setText(text: string): void {
    this.turnText.textContent = text;
  }

  setDrawTurnsRemaining(turns: number): void {
    this.drawCounter.textContent = `남은 턴수 ${Math.max(0, turns)}턴`;
  }

  setElapsedSeconds(totalSeconds: number): void {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    this.elapsedTime.textContent = `경과시간 ${String(minutes).padStart(2, '0')}분${String(seconds).padStart(2, '0')}초`;
  }
}
