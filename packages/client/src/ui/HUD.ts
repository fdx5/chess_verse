import type { Color, PieceType } from '@battle-chess/chess-core';
import { TurnIndicator } from './TurnIndicator';
import { MoveList } from './MoveList';
import { CapturedPiecesPanel } from './CapturedPiecesPanel';
import type { YoutubeBgmPlayer } from '../audio/YoutubeBgmPlayer';
import { isMobileLayout, onLayoutChange } from './responsive/Breakpoints';

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
  private readonly capturedPanel = new CapturedPiecesPanel();
  private readonly promotionModal: HTMLDivElement;
  private readonly mobileHeader: HTMLDivElement;
  private readonly topLeftRow: HTMLDivElement;

  constructor(container: HTMLElement, bgmPlayer: YoutubeBgmPlayer, onExitToMenu: () => void, onSaveGame: () => void, onResetCamera?: () => void) {
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.root.appendChild(this.turnIndicator.el);
    this.root.appendChild(this.moveList.el);
    this.root.appendChild(this.moveList.tabEl);
    this.root.appendChild(this.capturedPanel.el);

    this.mobileHeader = document.createElement('div');
    this.mobileHeader.style.cssText = 'display:contents;';
    this.root.appendChild(this.mobileHeader);

    this.topLeftRow = document.createElement('div');
    this.topLeftRow.style.cssText = 'position:absolute;top:12px;left:12px;display:flex;gap:8px;pointer-events:none;';
    this.root.appendChild(this.topLeftRow);

    const cornerBtnStyle = [
      'min-height:44px',
      'padding:6px 14px',
      'border-radius:8px',
      'border:1px solid #6B4A2F',
      'background:rgba(26,20,13,0.72)',
      'color:#F2E8D5',
      'font:13px system-ui,sans-serif',
      'cursor:pointer',
      'pointer-events:auto',
    ].join(';');

    const bgmBtn = document.createElement('button');
    bgmBtn.textContent = bgmPlayer.isPlaying() ? 'BGM 끄기' : 'BGM 켜기';
    bgmBtn.style.cssText = cornerBtnStyle;
    bgmBtn.addEventListener('click', () => void bgmPlayer.toggle());
    bgmPlayer.onStateChange((playing) => {
      bgmBtn.textContent = playing ? 'BGM 끄기' : 'BGM 켜기';
    });
    this.topLeftRow.appendChild(bgmBtn);

    const nextBgmBtn = document.createElement('button');
    nextBgmBtn.textContent = '다음 곡 ▶';
    nextBgmBtn.title = 'BGM 다음 곡 재생';
    nextBgmBtn.style.cssText = cornerBtnStyle;
    nextBgmBtn.addEventListener('click', () => void bgmPlayer.playNext());
    this.topLeftRow.appendChild(nextBgmBtn);

    // 사용자 요청 §시점 초기화 버튼 — 상단 BGM 버튼 오른쪽에 배치
    const resetCamBtn = document.createElement('button');
    resetCamBtn.textContent = '시점 초기화';
    resetCamBtn.title = '카메라를 기본 대전 시점으로 초기화합니다';
    resetCamBtn.style.cssText = cornerBtnStyle;
    resetCamBtn.addEventListener('click', () => {
      onResetCamera?.();
    });
    this.topLeftRow.appendChild(resetCamBtn);

    const exitBtn = document.createElement('button');
    exitBtn.textContent = '메뉴로 나가기';
    exitBtn.style.cssText = cornerBtnStyle;
    exitBtn.addEventListener('click', () => {
      if (window.confirm('메인 메뉴로 나가시겠습니까? 진행 중인 대전은 패배로 처리될 수 있습니다.')) onExitToMenu();
    });
    this.topLeftRow.appendChild(exitBtn);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '게임 저장';
    saveBtn.style.cssText = cornerBtnStyle;
    saveBtn.addEventListener('click', onSaveGame);
    this.topLeftRow.appendChild(saveBtn);

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

    this.setMobile(isMobileLayout());
    onLayoutChange((mobile) => this.setMobile(mobile));
  }

  private setMobile(mobile: boolean): void {
    if (mobile) {
      this.mobileHeader.style.cssText = [
        'position:absolute',
        'top:calc(env(safe-area-inset-top, 0px) + 8px)',
        'left:8px',
        'right:8px',
        'display:flex',
        'flex-direction:column',
        'gap:6px',
        'z-index:20',
        'pointer-events:none',
      ].join(';');
      this.topLeftRow.style.cssText = 'position:relative;top:auto;left:auto;width:100%;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;pointer-events:none;';
      this.topLeftRow.querySelectorAll('button').forEach((button) => {
        button.style.minWidth = '0';
        button.style.minHeight = '46px';
        button.style.padding = '4px 2px';
        button.style.fontSize = '11px';
        button.style.lineHeight = '1.15';
        button.style.whiteSpace = 'normal';
      });
      this.mobileHeader.append(this.topLeftRow, this.turnIndicator.el);
    } else {
      this.mobileHeader.style.cssText = 'display:contents;';
      this.topLeftRow.style.cssText = 'position:absolute;top:12px;left:12px;display:flex;gap:8px;pointer-events:none;';
      this.topLeftRow.querySelectorAll('button').forEach((button) => {
        button.style.minWidth = '';
        button.style.minHeight = '44px';
        button.style.padding = '6px 14px';
        button.style.fontSize = '13px';
        button.style.lineHeight = '';
        button.style.whiteSpace = '';
      });
      this.root.append(this.turnIndicator.el, this.topLeftRow);
    }
    this.turnIndicator.setMobile(mobile);
    this.capturedPanel.setMobile(mobile);
  }

  setTurnText(text: string): void {
    this.turnIndicator.setText(text);
  }

  setDrawTurnsRemaining(turns: number): void {
    this.turnIndicator.setDrawTurnsRemaining(turns);
  }

  setElapsedSeconds(seconds: number): void {
    this.turnIndicator.setElapsedSeconds(seconds);
  }

  pushMove(san: string, color: Color): void {
    this.moveList.push(san, color);
  }

  resetMoveList(): void {
    this.moveList.clear();
  }

  /** 사용자 요청 — 진영별 처치 기록 패널. 새 게임 시작 시 초기화, 캡처 발생 시마다 갱신. */
  recordCapture(capturerColor: Color, capturedType: PieceType): void {
    this.capturedPanel.recordCapture(capturerColor, capturedType);
  }

  resetCaptured(): void {
    this.capturedPanel.reset();
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
