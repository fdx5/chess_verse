import type { GameResult } from '@battle-chess/chess-core';

function resultText(result: GameResult): string {
  switch (result.kind) {
    case 'checkmate':
      return `체크메이트 — ${result.winner === 'w' ? '백' : '흑'} 승`;
    case 'stalemate':
      return '스테일메이트 — 무승부';
    case 'draw':
      return `무승부 (${result.reason})`;
    case 'resignation':
      return `기권 — ${result.winner === 'w' ? '백' : '흑'} 승`;
    case 'timeout':
      return `시간패 — ${result.winner === 'w' ? '백' : '흑'} 승`;
    case 'in_progress':
      return '';
  }
}

/** D6-4/D7 §Bo3 판간 인터미션 화면 — 이번 판 결과 + 누적 스코어 + 다음 판 시작. */
export class IntermissionScreen {
  readonly el: HTMLDivElement;
  private onContinueCb: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:rgba(0,0,0,0.6)',
      'pointer-events:auto',
      'z-index:15',
    ].join(';');
    container.appendChild(this.el);
  }

  show(gameIndex: number, result: GameResult, scoreMine: number, scoreOpponent: number, continueLabel: string, onContinue: () => void): void {
    this.onContinueCb = onContinue;
    this.el.innerHTML = '';

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:#2A2118',
      'border:1px solid #6B4A2F',
      'border-radius:10px',
      'padding:24px 32px',
      'text-align:center',
      'color:#F2E8D5',
      'font:14px system-ui,sans-serif',
      'display:flex',
      'flex-direction:column',
      'gap:12px',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = `${gameIndex + 1}판 종료`;
    title.style.cssText = 'font:600 18px system-ui,sans-serif;';
    panel.appendChild(title);

    const desc = document.createElement('div');
    desc.textContent = resultText(result);
    panel.appendChild(desc);

    const score = document.createElement('div');
    score.textContent = `스코어 ${scoreMine} : ${scoreOpponent}`;
    score.style.cssText = 'font:600 15px system-ui,sans-serif;color:#D4AF37;';
    panel.appendChild(score);

    const btn = document.createElement('button');
    btn.textContent = continueLabel;
    btn.style.cssText = 'min-height:44px;padding:8px 20px;border-radius:6px;border:1px solid #D4AF37;background:#3A2E1F;color:#F2E8D5;cursor:pointer;';
    btn.addEventListener('click', () => {
      this.hide();
      this.onContinueCb?.();
    });
    panel.appendChild(btn);

    this.el.appendChild(panel);
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}
