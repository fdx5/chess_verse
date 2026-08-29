/** D7 §인게임 HUD — 턴 인디케이터/체크·종료 상태 표시. */
export class TurnIndicator {
  readonly el: HTMLDivElement;
  private readonly turnText: HTMLSpanElement;
  private readonly elapsedTime: HTMLSpanElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'top:12px',
      'left:50%',
      'transform:translateX(-50%)',
      'max-width:calc(100vw - 24px)',
      'box-sizing:border-box',
      'padding:7px clamp(10px,2vw,20px)',
      'border-radius:8px',
      'background:rgba(26,20,13,0.72)',
      'color:#F2E8D5',
      'font:600 15px/1.4 system-ui,sans-serif',
      'display:flex',
      'align-items:center',
      'gap:clamp(6px,1.5vw,12px)',
      'white-space:nowrap',
      'letter-spacing:0.02em',
      'pointer-events:none',
      'user-select:none',
    ].join(';');
    this.turnText = document.createElement('span');
    this.turnText.textContent = '백 차례';
    this.elapsedTime = document.createElement('span');
    this.elapsedTime.style.cssText = 'padding-left:12px;border-left:1px solid rgba(242,232,213,.3);font-size:12px;font-weight:500;color:#C8CDD3;white-space:nowrap;';
    this.elapsedTime.textContent = '경과시간 00분00초';
    this.el.append(this.turnText, this.elapsedTime);
  }

  setMobile(mobile: boolean): void {
    if (mobile) {
      this.el.style.cssText = [
        'position:relative',
        'top:auto',
        'left:auto',
        'transform:none',
        'width:100%',
        'max-width:620px',
        'min-height:48px',
        'padding:7px 10px',
        'box-sizing:border-box',
        'border-radius:8px',
        'background:rgba(26,20,13,0.86)',
        'color:#F2E8D5',
        'font:600 clamp(13px,1.4vw,15px)/1.25 system-ui,sans-serif',
        'display:grid',
        'grid-template-columns:minmax(0,1fr) minmax(0,1.25fr)',
        'align-items:center',
        'gap:0',
        'text-align:center',
        'letter-spacing:0',
        'pointer-events:none',
        'user-select:none',
      ].join(';');
      this.turnText.style.cssText = 'min-width:0;white-space:normal;overflow-wrap:anywhere;';
      this.elapsedTime.style.cssText = 'min-width:0;padding-left:5px;border-left:1px solid rgba(242,232,213,.3);font-size:clamp(11px,1.15vw,13px);font-weight:500;color:#C8CDD3;white-space:normal;';
      return;
    }

    this.el.style.cssText = [
      'position:absolute', 'top:12px', 'left:50%', 'transform:translateX(-50%)',
      'padding:8px 20px', 'border-radius:8px', 'background:rgba(26,20,13,0.72)',
      'color:#F2E8D5', 'font:600 15px/1.4 system-ui,sans-serif', 'display:flex',
      'align-items:center', 'gap:12px', 'letter-spacing:0.02em', 'pointer-events:none', 'user-select:none',
    ].join(';');
    this.turnText.style.cssText = '';
    this.elapsedTime.style.cssText = 'padding-left:12px;border-left:1px solid rgba(242,232,213,.3);font-size:12px;font-weight:500;color:#C8CDD3;white-space:nowrap;';
  }

  setText(text: string): void {
    this.turnText.textContent = text;
  }

  setElapsedSeconds(totalSeconds: number): void {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    this.elapsedTime.textContent = `경과시간 ${String(minutes).padStart(2, '0')}분${String(seconds).padStart(2, '0')}초`;
  }
}
