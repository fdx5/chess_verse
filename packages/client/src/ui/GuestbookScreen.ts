import type { GuestbookEntryDto } from '@battle-chess/protocol';
import type { HistoryClient } from '../persistence/HistoryClient';
import type { PlayerIdentity } from '../persistence/identity';

const GOLD = '#D4AF37';
const GOLD_BRIGHT = '#F0CE6A';
const PARCHMENT = '#F2E8D5';

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(timestamp);
}

export class GuestbookScreen {
  readonly el: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly submitButton: HTMLButtonElement;
  private readonly statusEl: HTMLDivElement;

  constructor(
    container: HTMLElement,
    private readonly client: HistoryClient,
    private readonly getIdentity: () => PlayerIdentity | null,
    onClose: () => void
  ) {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.82);backdrop-filter:blur(8px);pointer-events:auto;z-index:40;padding:16px;box-sizing:border-box;';

    const panel = document.createElement('section');
    panel.style.cssText = 'width:min(640px,95vw);max-height:88vh;display:flex;flex-direction:column;gap:14px;padding:22px;border:1px solid rgba(212,175,55,.6);border-radius:16px;background:linear-gradient(165deg,rgba(42,33,24,.98),rgba(20,15,10,.99));box-shadow:0 24px 60px rgba(0,0,0,.7);color:' + PARCHMENT + ';font:14px system-ui,sans-serif;box-sizing:border-box;';

    const header = document.createElement('header');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid rgba(212,175,55,.25);';
    const title = document.createElement('h2');
    title.textContent = '📜 방문록';
    title.style.cssText = 'margin:0;color:' + GOLD_BRIGHT + ';font:700 21px Cinzel,system-ui,serif;';
    const close = document.createElement('button');
    close.textContent = '✕';
    close.title = '닫기';
    close.style.cssText = 'background:none;border:0;color:' + PARCHMENT + ';font-size:21px;cursor:pointer;padding:5px 8px;';
    close.addEventListener('click', () => { this.hide(); onClose(); });
    header.append(title, close);

    const composer = document.createElement('form');
    composer.style.cssText = 'display:flex;gap:8px;';
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = 80;
    this.input.placeholder = '한줄 방문록을 남겨주세요 (최대 80자)';
    this.input.setAttribute('aria-label', '방문록 내용');
    this.input.style.cssText = 'flex:1;min-width:0;height:42px;padding:0 12px;border-radius:8px;border:1px solid rgba(212,175,55,.4);background:rgba(0,0,0,.35);color:' + PARCHMENT + ';font:14px system-ui,sans-serif;outline:none;box-sizing:border-box;';
    this.submitButton = document.createElement('button');
    this.submitButton.type = 'submit';
    this.submitButton.textContent = '남기기';
    this.submitButton.style.cssText = 'height:42px;padding:0 18px;border-radius:8px;border:1px solid ' + GOLD + ';background:linear-gradient(180deg,#6B4A2F,#3A2E1F);color:#fff;font-weight:700;cursor:pointer;white-space:nowrap;';
    composer.append(this.input, this.submitButton);
    composer.addEventListener('submit', (event) => { event.preventDefault(); void this.submit(); });

    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText = 'min-height:18px;font-size:12px;opacity:.8;';
    this.listEl = document.createElement('div');
    this.listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-height:220px;overflow-y:auto;padding-right:3px;';

    panel.append(header, composer, this.statusEl, this.listEl);
    this.el.appendChild(panel);
    container.appendChild(this.el);
  }

  async show(): Promise<void> {
    this.el.style.display = 'flex';
    const identity = this.getIdentity();
    this.input.disabled = identity === null;
    this.submitButton.disabled = identity === null;
    this.statusEl.textContent = identity === null ? '방문록을 남기려면 먼저 플레이어 ID를 만들어주세요.' : '사용자 ID당 한 줄만 저장되며, 다시 남기면 기존 글이 수정됩니다.';
    await this.refresh();
  }

  hide(): void { this.el.style.display = 'none'; }

  private async submit(): Promise<void> {
    const identity = this.getIdentity();
    const message = this.input.value.replace(/[\r\n]+/g, ' ').trim();
    if (identity === null || message.length === 0) return;
    this.submitButton.disabled = true;
    this.statusEl.textContent = '저장 중...';
    try {
      await this.client.saveGuestbookEntry(identity, message);
      this.input.value = '';
      this.statusEl.textContent = '방문록이 저장되었습니다.';
      await this.refresh();
    } catch {
      this.statusEl.textContent = '저장하지 못했습니다. 잠시 후 다시 시도해주세요.';
    } finally {
      this.submitButton.disabled = false;
    }
  }

  private async refresh(): Promise<void> {
    this.listEl.replaceChildren();
    try {
      const { entries } = await this.client.fetchGuestbook();
      if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = '아직 남겨진 방문록이 없습니다. 첫 글을 남겨보세요!';
        empty.style.cssText = 'padding:50px 10px;text-align:center;opacity:.7;';
        this.listEl.appendChild(empty);
        return;
      }
      for (const entry of entries) this.listEl.appendChild(this.buildEntry(entry));
    } catch {
      const error = document.createElement('div');
      error.textContent = '방문록을 불러오지 못했습니다.';
      error.style.cssText = 'padding:50px 10px;text-align:center;color:#F87171;';
      this.listEl.appendChild(error);
    }
  }

  private buildEntry(entry: GuestbookEntryDto): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:minmax(90px,140px) 1fr auto;align-items:center;gap:10px;padding:11px 13px;border:1px solid rgba(107,74,47,.45);border-radius:9px;background:rgba(26,20,13,.6);';
    const nickname = document.createElement('strong');
    nickname.textContent = entry.nickname;
    nickname.title = entry.playerId;
    nickname.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + GOLD_BRIGHT + ';';
    const message = document.createElement('span');
    message.textContent = entry.message;
    message.style.cssText = 'overflow-wrap:anywhere;';
    const date = document.createElement('time');
    date.dateTime = new Date(entry.updatedAt).toISOString();
    date.textContent = formatDate(entry.updatedAt);
    date.style.cssText = 'font-size:11px;opacity:.55;white-space:nowrap;';
    row.append(nickname, message, date);
    return row;
  }
}
