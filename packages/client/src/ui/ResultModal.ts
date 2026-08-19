import type { MatchOutcome } from '../game/MatchState';

const OUTCOME_TEXT: Record<MatchOutcome, string> = {
  win: '매치 승리!',
  loss: '매치 패배',
  draw: '매치 무승부',
  aborted: '매치 중단',
};

/** D9 Sprint 8 §최종 승자 화면 — 매치(Bo1/Bo3) 종료 시 표시. */
export class ResultModal {
  readonly el: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:rgba(0,0,0,0.65)',
      'pointer-events:auto',
      'z-index:25',
    ].join(';');
    container.appendChild(this.el);
  }

  show(outcome: MatchOutcome, scoreMine: number, scoreOpponent: number, onRematch: () => void, onMainMenu: () => void): void {
    this.el.innerHTML = '';

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:#2A2118',
      'border:2px solid #D4AF37',
      'border-radius:12px',
      'padding:32px 40px',
      'text-align:center',
      'color:#F2E8D5',
      'font:14px system-ui,sans-serif',
      'display:flex',
      'flex-direction:column',
      'gap:16px',
      'width:min(320px, 92vw)',
      'box-sizing:border-box',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = OUTCOME_TEXT[outcome];
    title.style.cssText = 'font:700 24px system-ui,sans-serif;color:#D4AF37;';
    panel.appendChild(title);

    const score = document.createElement('div');
    score.textContent = `최종 스코어 ${scoreMine} : ${scoreOpponent}`;
    score.style.cssText = 'font:600 16px system-ui,sans-serif;';
    panel.appendChild(score);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:center;';

    const rematchBtn = document.createElement('button');
    rematchBtn.textContent = '다시 하기';
    rematchBtn.style.cssText = 'min-height:44px;padding:8px 18px;border-radius:6px;border:1px solid #D4AF37;background:#3A2E1F;color:#F2E8D5;cursor:pointer;';
    rematchBtn.addEventListener('click', () => {
      this.hide();
      onRematch();
    });

    const menuBtn = document.createElement('button');
    menuBtn.textContent = '메인 메뉴';
    menuBtn.style.cssText = 'min-height:44px;padding:8px 18px;border-radius:6px;border:1px solid #6B4A2F;background:#1A140D;color:#F2E8D5;cursor:pointer;';
    menuBtn.addEventListener('click', () => {
      this.hide();
      onMainMenu();
    });

    row.appendChild(rematchBtn);
    row.appendChild(menuBtn);
    panel.appendChild(row);

    this.el.appendChild(panel);
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}
