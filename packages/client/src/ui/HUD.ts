import type { Color, PieceType } from '@battle-chess/chess-core';
import { TurnIndicator } from './TurnIndicator';
import { MoveList } from './MoveList';
import { CapturedPiecesPanel } from './CapturedPiecesPanel';
import type { YoutubeBgmPlayer } from '../audio/YoutubeBgmPlayer';

const PROMOTION_CHOICES: readonly { type: PieceType; label: string }[] = [
  { type: 'q', label: '퀸' }, { type: 'r', label: '룩' },
  { type: 'b', label: '비숍' }, { type: 'n', label: '나이트' },
];

const TOOL_BUTTON_STYLE = [
  'min-width:44px', 'min-height:44px', 'padding:0 13px', 'border-radius:12px',
  'border:1px solid rgba(212,175,55,.48)', 'background:rgba(26,20,13,.88)',
  'box-shadow:0 4px 16px rgba(0,0,0,.3)', 'backdrop-filter:blur(8px)',
  'color:#F2E8D5', 'font:600 13px system-ui,sans-serif', 'cursor:pointer', 'pointer-events:auto',
].join(';');

/** 게임 보드를 가리지 않는 최소 HUD. 보조 기능은 하단 더보기 패널에 모은다. */
export class HUD {
  readonly root: HTMLDivElement;
  readonly turnIndicator = new TurnIndicator();
  readonly moveList = new MoveList();
  private readonly capturedPanel = new CapturedPiecesPanel();
  private readonly promotionModal: HTMLDivElement;
  private readonly utilityPanel: HTMLDivElement;
  private readonly moreBtn: HTMLButtonElement;

  constructor(
    container: HTMLElement,
    bgmPlayer: YoutubeBgmPlayer,
    onExitToMenu: () => void,
    onSaveGame: () => void,
    onResetCamera?: () => void,
    onChangeBackground?: () => void
  ) {
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10;';
    this.root.append(this.turnIndicator.el, this.moveList.el, this.moveList.tabEl, this.capturedPanel.el);

    const dock = document.createElement('div');
    dock.style.cssText = 'position:absolute;right:max(10px,env(safe-area-inset-right,0px));bottom:max(10px,env(safe-area-inset-bottom,0px));display:flex;gap:8px;z-index:24;pointer-events:none;';
    const resetCamBtn = document.createElement('button');
    resetCamBtn.textContent = '시점 초기화';
    resetCamBtn.title = '카메라를 기본 시점으로 되돌리기';
    resetCamBtn.setAttribute('aria-label', '카메라 시점 초기화');
    resetCamBtn.style.cssText = TOOL_BUTTON_STYLE;
    resetCamBtn.addEventListener('click', () => onResetCamera?.());

    this.moreBtn = document.createElement('button');
    this.moreBtn.textContent = '더보기 ···';
    this.moreBtn.setAttribute('aria-expanded', 'false');
    this.moreBtn.style.cssText = TOOL_BUTTON_STYLE;
    dock.append(resetCamBtn, this.moreBtn);
    this.root.appendChild(dock);

    this.utilityPanel = document.createElement('div');
    this.utilityPanel.setAttribute('role', 'menu');
    this.utilityPanel.style.cssText = 'position:absolute;right:max(10px,env(safe-area-inset-right,0px));bottom:calc(max(10px,env(safe-area-inset-bottom,0px)) + 52px);display:none;width:min(250px,calc(100vw - 20px));padding:8px;box-sizing:border-box;border:1px solid rgba(212,175,55,.42);border-radius:14px;background:rgba(26,20,13,.94);box-shadow:0 12px 32px rgba(0,0,0,.45);backdrop-filter:blur(12px);pointer-events:auto;z-index:23;';
    this.root.appendChild(this.utilityPanel);

    const menuButton = (label: string, action: () => void): HTMLButtonElement => {
      const button = document.createElement('button');
      button.textContent = label;
      button.style.cssText = 'width:100%;min-height:44px;padding:8px 12px;border:0;border-radius:9px;background:transparent;color:#F2E8D5;text-align:left;font:500 14px system-ui,sans-serif;cursor:pointer;';
      button.addEventListener('click', action);
      this.utilityPanel.appendChild(button);
      return button;
    };
    const bgmBtn = menuButton(bgmPlayer.isPlaying() ? 'BGM 끄기' : 'BGM 켜기', () => void bgmPlayer.toggle());
    bgmPlayer.onStateChange((playing) => { bgmBtn.textContent = playing ? 'BGM 끄기' : 'BGM 켜기'; });
    menuButton('다음 곡 재생', () => void bgmPlayer.playNext());
    menuButton('배경 변경', () => { onChangeBackground?.(); this.setUtilityOpen(false); });
    menuButton('게임 저장', () => { onSaveGame(); this.setUtilityOpen(false); });
    const divider = document.createElement('div');
    divider.style.cssText = 'height:1px;margin:6px 4px;background:rgba(242,232,213,.14);';
    this.utilityPanel.appendChild(divider);
    const exitBtn = menuButton('메인 메뉴로 나가기', () => {
      if (window.confirm('메인 메뉴로 나가시겠습니까? 진행 중인 대국은 패배로 처리될 수 있습니다.')) {
        this.setUtilityOpen(false); onExitToMenu();
      }
    });
    exitBtn.style.color = '#F0B6A8';
    this.moreBtn.addEventListener('click', () => this.setUtilityOpen(this.utilityPanel.style.display === 'none'));
    this.root.addEventListener('pointerdown', (event) => {
      if (this.utilityPanel.style.display !== 'none' && !this.utilityPanel.contains(event.target as Node) && event.target !== this.moreBtn) this.setUtilityOpen(false);
    });

    this.promotionModal = document.createElement('div');
    this.promotionModal.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45);pointer-events:auto;z-index:40;';
    this.root.appendChild(this.promotionModal);
    container.appendChild(this.root);
  }

  private setUtilityOpen(open: boolean): void {
    this.utilityPanel.style.display = open ? 'block' : 'none';
    this.moreBtn.setAttribute('aria-expanded', String(open));
    this.moreBtn.textContent = open ? '닫기 ×' : '더보기 ···';
  }

  setTurnText(text: string): void { this.turnIndicator.setText(text); }
  setDrawTurnsRemaining(turns: number): void { this.turnIndicator.setDrawTurnsRemaining(turns); }
  setElapsedSeconds(seconds: number): void { this.turnIndicator.setElapsedSeconds(seconds); }
  pushMove(san: string, color: Color): void { this.moveList.push(san, color); }
  resetMoveList(): void { this.moveList.clear(); }
  recordCapture(capturerColor: Color, capturedType: PieceType): void { this.capturedPanel.recordCapture(capturerColor, capturedType); }
  resetCaptured(): void { this.capturedPanel.reset(); }

  askPromotion(color: Color): Promise<PieceType> {
    return new Promise((resolve) => {
      this.promotionModal.innerHTML = '';
      const panel = document.createElement('div');
      panel.style.cssText = 'background:#2A2118;border:1px solid #6B4A2F;border-radius:12px;padding:18px 20px;display:flex;gap:12px;flex-direction:column;align-items:stretch;box-shadow:0 16px 40px rgba(0,0,0,.5);';
      const title = document.createElement('div');
      title.textContent = `프로모션 · ${color === 'w' ? '백' : '흑'}`;
      title.style.cssText = 'color:#F2E8D5;font:600 14px system-ui,sans-serif;';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;';
      for (const choice of PROMOTION_CHOICES) {
        const btn = document.createElement('button');
        btn.textContent = choice.label;
        btn.style.cssText = 'min-width:52px;min-height:44px;padding:8px;border-radius:8px;border:1px solid #D4AF37;background:#3A2E1F;color:#F2E8D5;cursor:pointer;font:13px system-ui,sans-serif;';
        btn.addEventListener('click', () => { this.promotionModal.style.display = 'none'; resolve(choice.type); });
        row.appendChild(btn);
      }
      panel.append(title, row);
      this.promotionModal.appendChild(panel);
      this.promotionModal.style.display = 'flex';
    });
  }
}
