import type { GuestbookEntryDto } from '@battle-chess/protocol';
import type { HistoryClient } from '../persistence/HistoryClient';
import type { PlayerIdentity } from '../persistence/identity';

const GOLD = '#D4AF37';
const GOLD_BRIGHT = '#F0CE6A';
const PARCHMENT = '#F2E8D5';
const STYLE_ID = 'guestbook-styles';

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(timestamp);
}

/*
  모바일 줄바꿈 문제 수정 — 방문록 한 줄이 [닉네임 | 본문 | 날짜 | 수정] 4열 그리드였던 탓에
  좁은 화면에서는 본문 칸이 70px 남짓으로 눌려 글자 몇 개마다 줄이 바뀌었다. 인라인 스타일로는
  미디어 쿼리를 쓸 수 없으므로 레이아웃만 클래스로 옮겨, 600px 이하에서는 닉네임/날짜/수정 버튼을
  윗줄에 두고 본문이 카드 전체 폭을 쓰게 한다. 한글이 단어 중간에서 끊기지 않도록
  word-break:keep-all 도 함께 준다.
*/
function ensureStyles(): void {
  if (document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    '.gb-panel{padding:22px;gap:14px;}',
    '.gb-composer{display:flex;gap:8px;}',
    '.gb-entry{display:grid;grid-template-columns:minmax(90px,140px) 1fr auto auto;grid-template-areas:"nick msg date act";align-items:center;gap:6px 10px;padding:11px 13px;border:1px solid rgba(107,74,47,.45);border-radius:9px;background:rgba(26,20,13,.6);}',
    '.gb-entry-nick{grid-area:nick;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + GOLD_BRIGHT + ';}',
    '.gb-entry-msg{grid-area:msg;min-width:0;line-height:1.45;word-break:keep-all;overflow-wrap:break-word;}',
    '.gb-entry-date{grid-area:date;font-size:11px;opacity:.55;white-space:nowrap;}',
    '.gb-entry-act{grid-area:act;display:flex;justify-content:flex-end;}',
    '.gb-edit-btn{padding:5px 9px;border-radius:6px;border:1px solid ' + GOLD + ';background:rgba(212,175,55,.12);color:' + GOLD_BRIGHT + ';font-size:11px;font-weight:700;cursor:pointer;}',
    '@media (max-width:600px){',
    '  .gb-panel{padding:16px 14px;gap:12px;}',
    '  .gb-entry{grid-template-columns:minmax(0,1fr) auto auto;grid-template-areas:"nick date act" "msg msg msg";}',
    '  .gb-entry-msg{padding-top:2px;}',
    '}',
  ].join('\n');
  document.head.appendChild(style);
}

export class GuestbookScreen {
  readonly el: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly submitButton: HTMLButtonElement;
  private readonly statusEl: HTMLDivElement;
  private editingEntryId: string | null = null;

  constructor(
    container: HTMLElement,
    private readonly client: HistoryClient,
    private readonly getIdentity: () => PlayerIdentity | null,
    onClose: () => void
  ) {
    ensureStyles();
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.82);backdrop-filter:blur(8px);pointer-events:auto;z-index:40;padding:16px;box-sizing:border-box;';

    const panel = document.createElement('section');
    panel.className = 'gb-panel';
    panel.style.cssText = 'width:min(640px,95vw);max-height:88vh;display:flex;flex-direction:column;border:1px solid rgba(212,175,55,.6);border-radius:16px;background:linear-gradient(165deg,rgba(42,33,24,.98),rgba(20,15,10,.99));box-shadow:0 24px 60px rgba(0,0,0,.7);color:' + PARCHMENT + ';font:14px system-ui,sans-serif;box-sizing:border-box;';

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
    composer.className = 'gb-composer';
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
    this.statusEl.textContent = identity === null ? '방문록을 남기려면 먼저 플레이어 ID를 만들어주세요.' : '사용자 ID당 하루 최대 5건까지 작성할 수 있습니다.';
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
      if (this.editingEntryId === null) {
        await this.client.saveGuestbookEntry(identity, message);
      } else {
        await this.client.updateGuestbookEntry(identity, this.editingEntryId, message);
      }
      this.input.value = '';
      this.statusEl.textContent = this.editingEntryId === null ? '방문록이 저장되었습니다.' : '방문록이 수정되었습니다.';
      this.editingEntryId = null;
      this.submitButton.textContent = '남기기';
      await this.refresh();
    } catch (error) {
      this.statusEl.textContent = error instanceof Error && error.message === 'DAILY_LIMIT_REACHED'
        ? '오늘 작성 가능한 5건을 모두 사용했습니다.'
        : '저장하지 못했습니다. 잠시 후 다시 시도해주세요.';
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
    row.className = 'gb-entry';
    const nickname = document.createElement('strong');
    nickname.className = 'gb-entry-nick';
    nickname.textContent = entry.nickname;
    nickname.title = entry.playerId;
    const message = document.createElement('span');
    message.className = 'gb-entry-msg';
    message.textContent = entry.message;
    const date = document.createElement('time');
    date.className = 'gb-entry-date';
    date.dateTime = new Date(entry.updatedAt).toISOString();
    date.textContent = formatDate(entry.updatedAt);
    const actions = document.createElement('div');
    actions.className = 'gb-entry-act';
    row.append(nickname, message, date, actions);
    if (entry.playerId === this.getIdentity()?.playerId) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'gb-edit-btn';
      edit.textContent = '수정';
      edit.addEventListener('click', () => {
        this.editingEntryId = entry.id;
        this.input.value = entry.message;
        this.submitButton.textContent = '수정 완료';
        this.statusEl.textContent = '내 방문록을 수정 중입니다.';
        this.input.focus();
      });
      actions.appendChild(edit);
    }
    return row;
  }
}
