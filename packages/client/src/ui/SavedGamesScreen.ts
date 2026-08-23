import type { SavedGameRecord } from '../persistence/schema';

const SOURCE_LABEL = { local2p: '로컬 2인', cpu: 'CPU 대전', online: '온라인' } as const;

function formatSavedAt(ms: number): string {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));
}

export class SavedGamesScreen {
  readonly el: HTMLDivElement;
  private readonly listEl: HTMLDivElement;

  constructor(container: HTMLElement, onClose: () => void) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.72);z-index:35;pointer-events:auto;';
    const panel = document.createElement('div');
    panel.style.cssText = 'width:min(520px,92vw);max-height:82vh;overflow:hidden;display:flex;flex-direction:column;gap:14px;padding:24px;background:#2A2118;border:1px solid #D4AF37;border-radius:12px;color:#F2E8D5;font:14px system-ui,sans-serif;box-sizing:border-box;';
    const title = document.createElement('div');
    title.textContent = '저장한 게임 이어서 하기';
    title.style.cssText = 'font-size:20px;font-weight:700;color:#F0CE6A;';
    panel.appendChild(title);
    this.listEl = document.createElement('div');
    this.listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;overflow-y:auto;';
    panel.appendChild(this.listEl);
    const close = document.createElement('button');
    close.textContent = '닫기';
    close.style.cssText = 'min-height:44px;border:1px solid #6B4A2F;border-radius:8px;background:#1A140D;color:#F2E8D5;cursor:pointer;';
    close.addEventListener('click', () => { this.hide(); onClose(); });
    panel.appendChild(close);
    this.el.appendChild(panel);
    container.appendChild(this.el);
  }

  show(games: readonly SavedGameRecord[], onResume: (game: SavedGameRecord) => void): void {
    this.listEl.innerHTML = '';
    for (const game of games) {
      const button = document.createElement('button');
      button.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:14px;min-height:58px;padding:10px 14px;text-align:left;border:1px solid #6B4A2F;border-radius:8px;background:#3A2E1F;color:#F2E8D5;cursor:pointer;';
      const difficulty = game.config.source === 'cpu' ? ` · ${game.config.cpuDifficulty ?? 'intermediate'}` : '';
      button.innerHTML = `<span><strong>${SOURCE_LABEL[game.config.source]}${difficulty}</strong><br><small>${game.currentMovesSan.length}수 진행 · ${game.scoreMine}:${game.scoreOpponent}</small></span><span style="font-size:12px;opacity:.75">${formatSavedAt(game.savedAt)}</span>`;
      button.addEventListener('click', () => { this.hide(); onResume(game); });
      this.listEl.appendChild(button);
    }
    this.el.style.display = 'flex';
  }

  hide(): void { this.el.style.display = 'none'; }
}
