import type { Difficulty, LeaderboardEntryDto } from '@battle-chess/protocol';
import type { IndexedDbStore } from '../persistence/IndexedDbStore';
import type { HistoryClient } from '../persistence/HistoryClient';
import type { LocalMatchRecord } from '../persistence/schema';

const GOLD = '#D4AF37';
const GOLD_BRIGHT = '#F0CE6A';
const PARCHMENT = '#F2E8D5';
const WOOD_BORDER = '#6B4A2F';

const DIFFICULTIES: readonly { key: Difficulty; label: string; icon: string }[] = [
  { key: 'beginner', label: '초급', icon: '🌱' },
  { key: 'intermediate', label: '중급', icon: '⚔️' },
  { key: 'advanced', label: '고급', icon: '🔥' },
  { key: 'master', label: '마스터', icon: '👑' },
];

const OUTCOME_LABEL: Record<LocalMatchRecord['outcome'], string> = { win: '승리', loss: '패배', draw: '무승부', aborted: '중단' };
const OUTCOME_COLOR: Record<LocalMatchRecord['outcome'], string> = { win: '#4ADE80', loss: '#F87171', draw: '#FBBF24', aborted: '#9CA3AF' };

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type TabKey = 'history' | Difficulty;

/** 사용자 요청 §순위표 및 전적 화면 — 최신 전적 로그 및 난이도별 점수 기반 순위표 제공 */
export class LeaderboardScreen {
  readonly el: HTMLDivElement;
  private readonly tabRow: HTMLDivElement;
  private readonly contentEl: HTMLDivElement;
  private currentTab: TabKey = 'history';

  constructor(
    container: HTMLElement,
    private readonly store: IndexedDbStore,
    private readonly client: HistoryClient,
    onClose: () => void
  ) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:rgba(0,0,0,0.75)',
      'backdrop-filter:blur(6px)',
      'pointer-events:auto',
      'z-index:40',
      'padding:16px',
      'box-sizing:border-box',
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:linear-gradient(165deg,rgba(42,33,24,0.96),rgba(20,15,10,0.98))',
      'border:1px solid rgba(212,175,55,0.6)',
      'border-radius:16px',
      'padding:24px',
      'width:min(640px, 95vw)',
      'max-height:85vh',
      'display:flex',
      'flex-direction:column',
      'gap:16px',
      'color:' + PARCHMENT,
      'font:14px system-ui,sans-serif',
      'box-shadow:0 24px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
      'box-sizing:border-box',
    ].join(';');

    // Header with Title & Close
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid rgba(212,175,55,0.25);';

    const titleBox = document.createElement('div');
    titleBox.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const icon = document.createElement('span');
    icon.textContent = '🏆';
    icon.style.cssText = 'font-size:22px;';
    const title = document.createElement('h2');
    title.textContent = '명예의 전당 & 전적';
    title.style.cssText = 'margin:0;font:700 20px Cinzel,system-ui,serif;color:' + GOLD_BRIGHT + ';letter-spacing:0.5px;';
    titleBox.appendChild(icon);
    titleBox.appendChild(title);
    header.appendChild(titleBox);

    const closeIconBtn = document.createElement('button');
    closeIconBtn.textContent = '✕';
    closeIconBtn.style.cssText = 'background:none;border:none;color:' + PARCHMENT + ';font-size:20px;cursor:pointer;padding:4px 8px;opacity:0.75;transition:opacity 0.15s;';
    closeIconBtn.addEventListener('mouseenter', () => (closeIconBtn.style.opacity = '1'));
    closeIconBtn.addEventListener('mouseleave', () => (closeIconBtn.style.opacity = '0.75'));
    closeIconBtn.addEventListener('click', () => {
      this.hide();
      onClose();
    });
    header.appendChild(closeIconBtn);
    panel.appendChild(header);

    // Tab Navigation Row
    this.tabRow = document.createElement('div');
    this.tabRow.style.cssText = 'display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;user-select:none;';
    panel.appendChild(this.tabRow);

    // Scrollable Content Area
    this.contentEl = document.createElement('div');
    this.contentEl.style.cssText = 'display:flex;flex-direction:column;gap:8px;overflow-y:auto;flex:1;min-height:260px;padding-right:4px;';
    panel.appendChild(this.contentEl);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:flex-end;padding-top:12px;border-top:1px solid rgba(212,175,55,0.25);';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '닫기';
    closeBtn.style.cssText = [
      'min-height:40px',
      'padding:0 24px',
      'border-radius:8px',
      'border:1px solid ' + WOOD_BORDER,
      'background:linear-gradient(180deg,#3A2E1F,#241B10)',
      'color:' + PARCHMENT,
      'font:600 14px system-ui,sans-serif',
      'cursor:pointer',
    ].join(';');
    closeBtn.addEventListener('click', () => {
      this.hide();
      onClose();
    });
    footer.appendChild(closeBtn);
    panel.appendChild(footer);

    this.el.appendChild(panel);
    container.appendChild(this.el);

    this.buildTabs();
  }

  private buildTabs(): void {
    this.tabRow.innerHTML = '';
    const tabs: { key: TabKey; label: string; icon: string }[] = [
      { key: 'history', label: '전적 로그', icon: '📜' },
      ...DIFFICULTIES.map((d) => ({ key: d.key as TabKey, label: d.label + ' 순위', icon: d.icon })),
    ];

    for (const tab of tabs) {
      const active = this.currentTab === tab.key;
      const btn = document.createElement('button');
      btn.textContent = `${tab.icon} ${tab.label}`;
      btn.style.cssText = [
        'padding:8px 14px',
        'border-radius:8px',
        'border:1px solid ' + (active ? GOLD : 'rgba(107,74,47,0.5)'),
        'background:' + (active ? 'linear-gradient(180deg,#6B4A2F,#4A3820)' : 'rgba(26,20,13,0.6)'),
        'color:' + (active ? '#FFF' : PARCHMENT),
        'font:600 13px system-ui,sans-serif',
        'cursor:pointer',
        'transition:all 0.15s ease',
        'white-space:nowrap',
      ].join(';');

      btn.addEventListener('click', () => {
        if (this.currentTab === tab.key) return;
        this.currentTab = tab.key;
        this.buildTabs();
        void this.refresh();
      });

      this.tabRow.appendChild(btn);
    }
  }

  async show(initialTab: TabKey = 'history'): Promise<void> {
    this.currentTab = initialTab;
    this.buildTabs();
    this.el.style.display = 'flex';
    await this.refresh();
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  private async refresh(): Promise<void> {
    this.contentEl.innerHTML = '';

    if (this.currentTab === 'history') {
      await this.renderHistoryTab();
    } else {
      await this.renderLeaderboardTab(this.currentTab);
    }
  }

  private async renderHistoryTab(): Promise<void> {
    const matches = await this.store.listMatches({ limit: 50 });
    if (matches.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '아직 기록된 대국 전적이 없습니다.';
      empty.style.cssText = 'opacity:0.7;text-align:center;padding:48px 0;font-size:14px;';
      this.contentEl.appendChild(empty);
      return;
    }

    for (const m of matches) {
      const row = document.createElement('div');
      row.style.cssText = [
        'display:flex',
        'justify-content:space-between',
        'align-items:center',
        'padding:10px 14px',
        'border:1px solid rgba(107,74,47,0.4)',
        'border-radius:10px',
        'background:rgba(26,20,13,0.6)',
        'transition:background 0.15s',
      ].join(';');

      const left = document.createElement('div');
      left.style.cssText = 'display:flex;align-items:center;gap:12px;';

      const outcomeBadge = document.createElement('span');
      outcomeBadge.textContent = OUTCOME_LABEL[m.outcome];
      outcomeBadge.style.cssText = `padding:4px 8px;border-radius:6px;font-weight:700;font-size:12px;background:rgba(0,0,0,0.4);color:${OUTCOME_COLOR[m.outcome]};border:1px solid ${OUTCOME_COLOR[m.outcome]}40;`;
      left.appendChild(outcomeBadge);

      const info = document.createElement('div');
      info.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
      const opponentText = document.createElement('div');
      opponentText.textContent = `vs ${m.opponentLabel}`;
      opponentText.style.cssText = 'font-weight:600;font-size:14px;color:' + PARCHMENT + ';';
      const metaText = document.createElement('div');
      const dur = m.durationSeconds ? ` • ${formatDuration(m.durationSeconds)}` : '';
      const score = m.score ? ` • ${m.score.toLocaleString()}점` : '';
      metaText.textContent = `${formatDate(m.endedAt)}${dur}${score}`;
      metaText.style.cssText = 'font-size:11px;opacity:0.65;';
      info.appendChild(opponentText);
      info.appendChild(metaText);
      left.appendChild(info);

      const right = document.createElement('div');
      right.style.cssText = 'font:700 16px ui-monospace,monospace;color:' + GOLD_BRIGHT + ';';
      right.textContent = `${m.scoreMine} : ${m.scoreOpponent}`;

      row.appendChild(left);
      row.appendChild(right);
      this.contentEl.appendChild(row);
    }
  }

  private async renderLeaderboardTab(difficulty: Difficulty): Promise<void> {
    const loading = document.createElement('div');
    loading.textContent = '순위표 데이터를 불러오는 중...';
    loading.style.cssText = 'opacity:0.7;text-align:center;padding:48px 0;';
    this.contentEl.appendChild(loading);

    try {
      const page = await this.client.fetchLeaderboard(difficulty);
      this.contentEl.innerHTML = '';

      if (page.entries.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = `아직 ${DIFFICULTIES.find((d) => d.key === difficulty)?.label ?? ''} 난이도의 순위 기록이 없습니다. 먼저 도전해보세요!`;
        empty.style.cssText = 'opacity:0.7;text-align:center;padding:48px 0;';
        this.contentEl.appendChild(empty);
        return;
      }

      // Table Header
      const thead = document.createElement('div');
      thead.style.cssText = 'display:grid;grid-template-columns:50px 1fr 80px 80px 100px;align-items:center;padding:6px 12px;font-size:12px;font-weight:600;color:' + GOLD + ';border-bottom:1px solid rgba(212,175,55,0.2);opacity:0.85;';
      thead.innerHTML = '<span>순위</span><span>플레이어 ID</span><span style="text-align:center">승리 시간</span><span style="text-align:center">피해 기물</span><span style="text-align:right">최종 점수</span>';
      this.contentEl.appendChild(thead);

      for (const entry of page.entries) {
        this.contentEl.appendChild(this.buildLeaderboardRow(entry));
      }
    } catch {
      this.contentEl.innerHTML = '';
      const errEl = document.createElement('div');
      errEl.textContent = '서버와 연결할 수 없어 온라인 순위표를 불러오지 못했습니다.';
      errEl.style.cssText = 'opacity:0.7;text-align:center;padding:48px 0;color:#F87171;';
      this.contentEl.appendChild(errEl);
    }
  }

  private buildLeaderboardRow(entry: LeaderboardEntryDto): HTMLDivElement {
    const row = document.createElement('div');
    const isTop1 = entry.rank === 1;
    const isTop2 = entry.rank === 2;
    const isTop3 = entry.rank === 3;

    const rankBg = isTop1
      ? 'background:linear-gradient(90deg,rgba(212,175,55,0.2),rgba(26,20,13,0.7));border:1px solid rgba(212,175,55,0.5);'
      : isTop2
      ? 'background:linear-gradient(90deg,rgba(192,192,192,0.15),rgba(26,20,13,0.7));border:1px solid rgba(192,192,192,0.4);'
      : isTop3
      ? 'background:linear-gradient(90deg,rgba(205,127,50,0.15),rgba(26,20,13,0.7));border:1px solid rgba(205,127,50,0.4);'
      : 'background:rgba(26,20,13,0.5);border:1px solid rgba(107,74,47,0.3);';

    row.style.cssText = [
      'display:grid',
      'grid-template-columns:50px 1fr 80px 80px 100px',
      'align-items:center',
      'padding:10px 12px',
      'border-radius:8px',
      rankBg,
      'font-size:13px',
      'transition:transform 0.1s ease',
    ].join(';');

    // Rank Medal / Number
    const rankEl = document.createElement('div');
    rankEl.style.cssText = 'font-weight:700;font-size:14px;';
    if (isTop1) rankEl.innerHTML = '<span style="font-size:16px;">🥇</span> 1';
    else if (isTop2) rankEl.innerHTML = '<span style="font-size:16px;">🥈</span> 2';
    else if (isTop3) rankEl.innerHTML = '<span style="font-size:16px;">🥉</span> 3';
    else rankEl.textContent = `${entry.rank}위`;
    row.appendChild(rankEl);

    // Nickname
    const nameEl = document.createElement('div');
    nameEl.textContent = entry.nickname;
    nameEl.style.cssText = 'font-weight:600;color:' + (isTop1 ? GOLD_BRIGHT : PARCHMENT) + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    row.appendChild(nameEl);

    // Duration
    const durEl = document.createElement('div');
    durEl.textContent = formatDuration(entry.durationSeconds);
    durEl.style.cssText = 'text-align:center;color:#93C5FD;font-family:ui-monospace,monospace;font-size:12px;';
    row.appendChild(durEl);

    // Pieces Lost
    const lossEl = document.createElement('div');
    lossEl.textContent = `${entry.piecesLost}개`;
    lossEl.style.cssText = 'text-align:center;color:#FCA5A5;font-size:12px;';
    row.appendChild(lossEl);

    // Score
    const scoreEl = document.createElement('div');
    scoreEl.textContent = `${entry.score.toLocaleString()}점`;
    scoreEl.style.cssText = 'text-align:right;font-weight:700;color:' + (isTop1 ? '#FDE047' : GOLD_BRIGHT) + ';font-family:ui-monospace,monospace;font-size:13px;';
    row.appendChild(scoreEl);

    return row;
  }
}
