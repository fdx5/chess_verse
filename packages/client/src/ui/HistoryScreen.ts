import type { IndexedDbStore } from '../persistence/IndexedDbStore';
import type { LocalMatchRecord } from '../persistence/schema';

const OUTCOME_LABEL: Record<LocalMatchRecord['outcome'], string> = { win: '승', loss: '패', draw: '무', aborted: '중단' };
const SOURCE_LABEL: Record<LocalMatchRecord['source'], string> = { local2p: '로컬 2인', cpu: 'CPU 대전', online: '온라인' };
const OUTCOME_COLOR: Record<LocalMatchRecord['outcome'], string> = { win: '#7FBF7F', loss: '#D4535A', draw: '#D4AF37', aborted: '#8A8A8A' };

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** D10-6/D10-9 §전적 화면 — 로컬(IndexedDB)이 항상 표시의 1차 소스다(오프라인 우선). */
export class HistoryScreen {
  readonly el: HTMLDivElement;
  private readonly listEl: HTMLDivElement;

  constructor(
    container: HTMLElement,
    private readonly store: IndexedDbStore,
    onClose: () => void
  ) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:rgba(0,0,0,0.6)',
      'pointer-events:auto',
      'z-index:22',
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:#2A2118',
      'border:1px solid #6B4A2F',
      'border-radius:10px',
      'padding:20px 24px',
      'width:min(480px, 90vw)',
      'max-height:80vh',
      'display:flex',
      'flex-direction:column',
      'gap:12px',
      'color:#F2E8D5',
      'font:14px system-ui,sans-serif',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = '내 전적';
    title.style.cssText = 'font:600 18px system-ui,sans-serif;';
    panel.appendChild(title);

    this.listEl = document.createElement('div');
    this.listEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;overflow-y:auto;flex:1;min-height:120px;';
    panel.appendChild(this.listEl);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '닫기';
    closeBtn.style.cssText = 'min-height:44px;border-radius:6px;border:1px solid #D4AF37;background:#3A2E1F;color:#F2E8D5;cursor:pointer;';
    closeBtn.addEventListener('click', () => {
      this.hide();
      onClose();
    });
    panel.appendChild(closeBtn);

    this.el.appendChild(panel);
    container.appendChild(this.el);
  }

  async show(): Promise<void> {
    this.el.style.display = 'flex';
    await this.refresh();
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  private async refresh(): Promise<void> {
    const matches = await this.store.listMatches({ limit: 50 });
    this.listEl.innerHTML = '';
    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '아직 기록된 대국이 없습니다.';
      empty.style.cssText = 'opacity:0.7;text-align:center;padding:24px 0;';
      this.listEl.appendChild(empty);
      return;
    }
    for (const m of matches) this.listEl.appendChild(this.buildRow(m));
  }

  private buildRow(m: LocalMatchRecord): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid #6B4A2F;border-radius:6px;';

    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
    const opponentLine = document.createElement('div');
    opponentLine.textContent = `vs ${m.opponentLabel} · ${SOURCE_LABEL[m.source]}`;
    opponentLine.style.cssText = 'font-size:13px;';
    const dateLine = document.createElement('div');
    dateLine.textContent = `${formatDate(m.endedAt)}${m.source !== 'online' ? ' · 로컬 기록' : ''}`;
    dateLine.style.cssText = 'font-size:11px;opacity:0.65;';
    left.appendChild(opponentLine);
    left.appendChild(dateLine);

    const right = document.createElement('div');
    right.style.cssText = `text-align:right;color:${OUTCOME_COLOR[m.outcome]};font-weight:600;`;
    right.textContent = `${OUTCOME_LABEL[m.outcome]} ${m.scoreMine}:${m.scoreOpponent}`;

    row.appendChild(left);
    row.appendChild(right);
    return row;
  }
}
