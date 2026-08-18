import type { Color, PieceType } from '@battle-chess/chess-core';
import { TurnIndicator } from './TurnIndicator';
import { MoveList } from './MoveList';

const PROMOTION_CHOICES: readonly { type: PieceType; label: string }[] = [
  { type: 'q', label: '퀸' },
  { type: 'r', label: '룩' },
  { type: 'b', label: '비숍' },
  { type: 'n', label: '나이트' },
];

/** D7 §인게임 HUD — Sprint 4 기본 구성(턴 인디케이터 + 기보 + 프로모션 선택 모달). */
export class HUD {
  readonly root: HTMLDivElement;
  readonly turnIndicator = new TurnIndicator();
  readonly moveList = new MoveList();
  private readonly promotionModal: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.root.appendChild(this.turnIndicator.el);
    this.root.appendChild(this.moveList.el);

    this.promotionModal = document.createElement('div');
    this.promotionModal.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:rgba(0,0,0,0.45)',
      'pointer-events:auto',
    ].join(';');
    this.root.appendChild(this.promotionModal);

    container.appendChild(this.root);
  }

  setTurnText(text: string): void {
    this.turnIndicator.setText(text);
  }

  pushMove(san: string, color: Color): void {
    this.moveList.push(san, color);
  }

  resetMoveList(): void {
    this.moveList.clear();
  }

  /** D7 §프로모션 UI — 4종 중 선택하게 하고 선택 결과를 반환한다. */
  askPromotion(color: Color): Promise<PieceType> {
    return new Promise((resolve) => {
      this.promotionModal.innerHTML = '';
      const panel = document.createElement('div');
      panel.style.cssText = [
        'background:#2A2118',
        'border:1px solid #6B4A2F',
        'border-radius:10px',
        'padding:18px 20px',
        'display:flex',
        'gap:10px',
        'flex-direction:column',
        'align-items:stretch',
      ].join(';');

      const title = document.createElement('div');
      title.textContent = `프로모션 — ${color === 'w' ? '백' : '흑'}`;
      title.style.cssText = 'color:#F2E8D5;font:600 14px system-ui,sans-serif;margin-bottom:4px;';
      panel.appendChild(title);

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;';
      for (const choice of PROMOTION_CHOICES) {
        const btn = document.createElement('button');
        btn.textContent = choice.label;
        btn.style.cssText = [
          'min-width:44px',
          'min-height:44px',
          'padding:8px 12px',
          'border-radius:6px',
          'border:1px solid #D4AF37',
          'background:#3A2E1F',
          'color:#F2E8D5',
          'cursor:pointer',
          'font:13px system-ui,sans-serif',
        ].join(';');
        btn.addEventListener('click', () => {
          this.promotionModal.style.display = 'none';
          resolve(choice.type);
        });
        row.appendChild(btn);
      }
      panel.appendChild(row);
      this.promotionModal.appendChild(panel);
      this.promotionModal.style.display = 'flex';
    });
  }
}
