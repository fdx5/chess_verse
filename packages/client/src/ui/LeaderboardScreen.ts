import type { Difficulty, LeaderboardEntryDto } from '@battle-chess/protocol';
import type { IndexedDbStore } from '../persistence/IndexedDbStore';
import type { HistoryClient } from '../persistence/HistoryClient';
import type { LocalMatchRecord } from '../persistence/schema';
import type { PlayerIdentity } from '../persistence/identity';

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

/** 사용자 요청 §순위표 및 전적 화면 — 플레이어 ID 강력 강조 및 실시간 로컬/서버 통합 순위 반영 */
export class LeaderboardScreen {
  readonly el: HTMLDivElement;
  private readonly tabRow: HTMLDivElement;
  private readonly contentEl: HTMLDivElement;
  private currentTab: TabKey = 'history';

  constructor(
    container: HTMLElement,
    private readonly store: IndexedDbStore,
    private readonly client: HistoryClient,
    private readonly getIdentity: () => PlayerIdentity | null,
    private readonly onSync?: () => Promise<unknown>,
    onClose?: () => void
  ) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:rgba(0,0,0,0.8)',
      'backdrop-filter:blur(8px)',
      'pointer-events:auto',
      'z-index:40',
      'padding:16px',
      'box-sizing:border-box',
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:linear-gradient(165deg,rgba(42,33,24,0.98),rgba(20,15,10,0.99))',
      'border:1px solid rgba(212,175,55,0.6)',
      'border-radius:16px',
      'padding:24px',
      'width:min(680px, 95vw)',
      'max-height:88vh',
      'display:flex',
      'flex-direction:column',
      'gap:16px',
      'color:' + PARCHMENT,
      'font:14px system-ui,sans-serif',
      'box-shadow:0 24px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
      'box-sizing:border-box',
    ].join(';');

    // Header with Title & Close
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid rgba(212,175,55,0.25);';

    const titleBox = document.createElement('div');
    titleBox.style.cssText = 'display:flex;align-items:center;gap:10px;';
    const icon = document.createElement('span');
    icon.textContent = '🏆';
    icon.style.cssText = 'font-size:24px;';
    const title = document.createElement('h2');
    title.textContent = '명예의 전당 & 대전 전적';
    title.style.cssText = 'margin:0;font:700 21px Cinzel,system-ui,serif;color:' + GOLD_BRIGHT + ';letter-spacing:0.5px;';
    titleBox.appendChild(icon);
    titleBox.appendChild(title);
    header.appendChild(titleBox);

    const closeIconBtn = document.createElement('button');
    closeIconBtn.textContent = '✕';
    closeIconBtn.style.cssText = 'background:none;border:none;color:' + PARCHMENT + ';font-size:22px;cursor:pointer;padding:4px 8px;opacity:0.75;transition:opacity 0.15s;';
    closeIconBtn.addEventListener('mouseenter', () => (closeIconBtn.style.opacity = '1'));
    closeIconBtn.addEventListener('mouseleave', () => (closeIconBtn.style.opacity = '0.75'));
    closeIconBtn.addEventListener('click', () => {
      this.hide();
      onClose?.();
    });
    header.appendChild(closeIconBtn);
    panel.appendChild(header);

    // Tab Navigation Row
    this.tabRow = document.createElement('div');
    this.tabRow.style.cssText = 'display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;user-select:none;';
    panel.appendChild(this.tabRow);

    // Scrollable Content Area
    this.contentEl = document.createElement('div');
    this.contentEl.style.cssText = 'display:flex;flex-direction:column;gap:10px;overflow-y:auto;flex:1;min-height:280px;padding-right:4px;';
    panel.appendChild(this.contentEl);

    // Footer with Current Player ID reminder & Close button
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid rgba(212,175,55,0.25);';

    const playerStatus = document.createElement('div');
    playerStatus.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;opacity:0.9;';
    const currentMyId = this.getIdentity()?.nickname ?? '플레이어';
    playerStatus.innerHTML = `내 ID: <span style="font-weight:700;color:${GOLD_BRIGHT};background:rgba(212,175,55,0.15);padding:2px 8px;border-radius:12px;border:1px solid rgba(212,175,55,0.3);">${currentMyId}</span>`;
    footer.appendChild(playerStatus);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '닫기';
    closeBtn.style.cssText = [
      'min-height:38px',
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
      onClose?.();
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
    // 열릴 때 최신 동기화 백그라운드 시도
    void this.onSync?.();
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
    const currentMyId = this.getIdentity()?.nickname ?? '플레이어';

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
        'padding:12px 16px',
        'border:1px solid rgba(107,74,47,0.4)',
        'border-radius:10px',
        'background:rgba(26,20,13,0.6)',
        'transition:background 0.15s',
      ].join(';');

      const left = document.createElement('div');
      left.style.cssText = 'display:flex;align-items:center;gap:14px;';

      const outcomeBadge = document.createElement('span');
      outcomeBadge.textContent = OUTCOME_LABEL[m.outcome];
      outcomeBadge.style.cssText = `padding:5px 10px;border-radius:6px;font-weight:700;font-size:13px;background:rgba(0,0,0,0.4);color:${OUTCOME_COLOR[m.outcome]};border:1px solid ${OUTCOME_COLOR[m.outcome]}40;`;
      left.appendChild(outcomeBadge);

      const info = document.createElement('div');
      info.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

      // 사용자 요청 §플레이어: ID명 강조 노출
      const playerLine = document.createElement('div');
      playerLine.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:14px;';
      playerLine.innerHTML = `
        <span style="font-weight:700;color:${GOLD_BRIGHT};background:rgba(212,175,55,0.18);padding:2px 8px;border-radius:6px;border:1px solid rgba(212,175,55,0.35);">플레이어: ${currentMyId}</span>
        <span style="font-size:13px;opacity:0.85;color:${PARCHMENT};">vs ${m.opponentLabel}</span>
      `;

      const metaText = document.createElement('div');
      const dur = m.durationSeconds ? ` • 소요시간 ${formatDuration(m.durationSeconds)}` : '';
      const score = m.score ? ` • <span style="color:${GOLD_BRIGHT};font-weight:600;">${m.score.toLocaleString()}점</span>` : '';
      metaText.innerHTML = `${formatDate(m.endedAt)}${dur}${score}`;
      metaText.style.cssText = 'font-size:12px;opacity:0.7;';

      info.appendChild(playerLine);
      info.appendChild(metaText);
      left.appendChild(info);

      const right = document.createElement('div');
      right.style.cssText = 'font:700 18px ui-monospace,monospace;color:' + GOLD_BRIGHT + ';';
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

    const currentIdentity = this.getIdentity();
    const myNickname = currentIdentity?.nickname ?? '플레이어';
    const myPlayerId = currentIdentity?.playerId;

    // 1. 로컬 저장소에서 해당 난이도의 내 CPU 승리 기록들 조회
    const localMatches = await this.store.listMatches({ limit: 100 });
    const localEntries: LeaderboardEntryDto[] = [];

    for (const m of localMatches) {
      const matchDiff = m.cpuDifficulty ?? (m.opponentLabel.includes('초급') ? 'beginner' : m.opponentLabel.includes('고급') ? 'advanced' : m.opponentLabel.includes('마스터') ? 'master' : 'intermediate');
      if (m.source === 'cpu' && matchDiff === difficulty && m.outcome === 'win' && (m.score !== undefined && m.score > 0)) {
        localEntries.push({
          rank: 1,
          matchId: m.serverMatchId ?? m.localMatchId,
          playerId: m.myPlayerId ?? myPlayerId ?? 'local',
          nickname: myNickname,
          cpuDifficulty: difficulty,
          durationSeconds: m.durationSeconds ?? 60,
          piecesLost: m.piecesLostMine ?? 0,
          score: m.score,
          endedAt: m.endedAt,
        });
      }
    }

    // 2. 서버 온라인 순위표 조회
    let serverEntries: LeaderboardEntryDto[] = [];
    try {
      const page = await this.client.fetchLeaderboard(difficulty);
      serverEntries = page.entries;
    } catch {
      // 서버 연결 실패 시 로컬 기록으로만 표시
    }

    // 3. 로컬과 서버 랭킹을 중복 제거하며 병합
    const combinedMap = new Map<string, LeaderboardEntryDto>();
    for (const se of serverEntries) {
      combinedMap.set(se.matchId, se);
    }
    for (const le of localEntries) {
      if (!combinedMap.has(le.matchId)) {
        combinedMap.set(le.matchId, le);
      }
    }

    const allEntries = Array.from(combinedMap.values());
    // 점수 내림차순, 소요시간 오름차순, 최신순 정렬
    allEntries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.durationSeconds !== b.durationSeconds) return a.durationSeconds - b.durationSeconds;
      return b.endedAt - a.endedAt;
    });

    // 1위부터 순위 재부여
    allEntries.forEach((entry, idx) => {
      entry.rank = idx + 1;
    });

    this.contentEl.innerHTML = '';

    if (allEntries.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = `아직 ${DIFFICULTIES.find((d) => d.key === difficulty)?.label ?? ''} 난이도의 순위 기록이 없습니다. 먼저 도전해보세요!`;
      empty.style.cssText = 'opacity:0.7;text-align:center;padding:48px 0;font-size:14px;';
      this.contentEl.appendChild(empty);
      return;
    }

    // Table Header
    const thead = document.createElement('div');
    thead.style.cssText = 'display:grid;grid-template-columns:60px 1.8fr 90px 90px 110px;align-items:center;padding:8px 14px;font-size:12px;font-weight:700;color:' + GOLD + ';border-bottom:1px solid rgba(212,175,55,0.25);opacity:0.9;';
    thead.innerHTML = '<span>순위</span><span>플레이어 ID</span><span style="text-align:center">승리 시간</span><span style="text-align:center">피해 기물</span><span style="text-align:right">최종 점수</span>';
    this.contentEl.appendChild(thead);

    for (const entry of allEntries) {
      const isMe = (myPlayerId && entry.playerId === myPlayerId) || entry.nickname === myNickname;
      this.contentEl.appendChild(this.buildLeaderboardRow(entry, isMe));
    }
  }

  private buildLeaderboardRow(entry: LeaderboardEntryDto, isMe: boolean): HTMLDivElement {
    const row = document.createElement('div');
    const isTop1 = entry.rank === 1;
    const isTop2 = entry.rank === 2;
    const isTop3 = entry.rank === 3;

    const rankBg = isMe
      ? 'background:linear-gradient(90deg,rgba(212,175,55,0.28),rgba(42,33,24,0.85));border:1px solid ' + GOLD + ';box-shadow:0 0 12px rgba(212,175,55,0.25);'
      : isTop1
      ? 'background:linear-gradient(90deg,rgba(212,175,55,0.2),rgba(26,20,13,0.7));border:1px solid rgba(212,175,55,0.5);'
      : isTop2
      ? 'background:linear-gradient(90deg,rgba(192,192,192,0.15),rgba(26,20,13,0.7));border:1px solid rgba(192,192,192,0.4);'
      : isTop3
      ? 'background:linear-gradient(90deg,rgba(205,127,50,0.15),rgba(26,20,13,0.7));border:1px solid rgba(205,127,50,0.4);'
      : 'background:rgba(26,20,13,0.5);border:1px solid rgba(107,74,47,0.3);';

    row.style.cssText = [
      'display:grid',
      'grid-template-columns:60px 1.8fr 90px 90px 110px',
      'align-items:center',
      'padding:11px 14px',
      'border-radius:8px',
      rankBg,
      'font-size:13px',
      'transition:transform 0.1s ease',
    ].join(';');

    // Rank Medal / Number
    const rankEl = document.createElement('div');
    rankEl.style.cssText = 'font-weight:700;font-size:14px;display:flex;align-items:center;gap:4px;';
    if (isTop1) rankEl.innerHTML = '<span style="font-size:17px;">🥇</span> 1';
    else if (isTop2) rankEl.innerHTML = '<span style="font-size:17px;">🥈</span> 2';
    else if (isTop3) rankEl.innerHTML = '<span style="font-size:17px;">🥉</span> 3';
    else rankEl.textContent = `${entry.rank}위`;
    row.appendChild(rankEl);

    // 사용자 요청 §플레이어: ID명 강력 강조 노출
    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'display:flex;align-items:center;gap:6px;overflow:hidden;';
    const badge = document.createElement('span');
    badge.textContent = `플레이어: ${entry.nickname}`;
    badge.style.cssText = `font-weight:700;font-size:13px;color:${isMe ? GOLD_BRIGHT : (isTop1 ? '#FDE047' : PARCHMENT)};background:rgba(0,0,0,0.35);padding:3px 8px;border-radius:6px;border:1px solid ${isMe ? GOLD : 'rgba(212,175,55,0.25)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
    nameEl.appendChild(badge);

    if (isMe) {
      const meTag = document.createElement('span');
      meTag.textContent = '나';
      meTag.style.cssText = 'font-size:10px;font-weight:700;background:#D4AF37;color:#1A140D;padding:1px 5px;border-radius:4px;';
      nameEl.appendChild(meTag);
    }
    row.appendChild(nameEl);

    // Duration
    const durEl = document.createElement('div');
    durEl.textContent = formatDuration(entry.durationSeconds);
    durEl.style.cssText = 'text-align:center;color:#93C5FD;font-family:ui-monospace,monospace;font-size:13px;font-weight:600;';
    row.appendChild(durEl);

    // Pieces Lost
    const lossEl = document.createElement('div');
    lossEl.textContent = `${entry.piecesLost}개`;
    lossEl.style.cssText = 'text-align:center;color:#FCA5A5;font-size:13px;font-weight:600;';
    row.appendChild(lossEl);

    // Score
    const scoreEl = document.createElement('div');
    scoreEl.textContent = `${entry.score.toLocaleString()}점`;
    scoreEl.style.cssText = 'text-align:right;font-weight:700;color:' + (isTop1 ? '#FDE047' : GOLD_BRIGHT) + ';font-family:ui-monospace,monospace;font-size:14px;';
    row.appendChild(scoreEl);

    return row;
  }
}
