import type { Difficulty } from '../ai/AiWorkerHandle';
import type { MatchConfig } from '../game/MatchState';
import type { YoutubeBgmPlayer } from '../audio/YoutubeBgmPlayer';

const DIFFICULTIES: readonly { value: Difficulty; label: string; icon: string }[] = [
  { value: 'beginner', label: '초급', icon: '🌱' },
  { value: 'intermediate', label: '중급', icon: '⚔️' },
  { value: 'advanced', label: '고급', icon: '🔥' },
  { value: 'master', label: '마스터', icon: '👑' },
];

const GOLD = '#D4AF37';
const GOLD_BRIGHT = '#F0CE6A';
const PARCHMENT = '#F2E8D5';
const WOOD_BORDER = '#6B4A2F';

/**
 * D7 §화면 흐름 — 스플래시/메인 메뉴. 사용자 요청으로 전면 리디자인
 * (`docs/DEVIATIONS.md` [메인 메뉴 리디자인] 참조): 장식 세리프 타이틀(Cinzel),
 * 금장 카드 패널, 아이콘 포함 세그먼트 선택 UI, 호버/프레스 피드백.
 * 기존 공개 API(생성자 시그니처/`show`/`hide`)는 그대로 유지해 `main.ts` 연동에는 영향 없다.
 */
export class MainMenu {
  readonly el: HTMLDivElement;
  private mode: 'local2p' | 'cpu' | 'online' = 'cpu';
  private format: 'bo1' | 'bo3' = 'bo3';
  private difficulty: Difficulty = 'intermediate';
  private difficultySection: HTMLDivElement;

  constructor(
    container: HTMLElement,
    onStart: (config: MatchConfig) => void,
    onOpenSettings: () => void,
    onOpenHistory: () => void,
    bgmPlayer: YoutubeBgmPlayer
  ) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:radial-gradient(ellipse at 50% 20%, #4A3820 0%, #241B10 55%, #120D08 100%)',
      'pointer-events:auto',
      'z-index:30',
      'padding:24px 16px',
      'box-sizing:border-box',
      'overflow-y:auto',
    ].join(';');

    const card = document.createElement('div');
    card.style.cssText = [
      'position:relative',
      'width:min(460px,100%)',
      'display:flex',
      'flex-direction:column',
      'align-items:stretch',
      'gap:20px',
      'padding:28px 26px 26px',
      'border-radius:16px',
      'background:linear-gradient(165deg,rgba(58,46,31,0.94),rgba(24,18,11,0.96))',
      'border:1px solid rgba(212,175,55,0.55)',
      'box-shadow:0 0 0 1px rgba(0,0,0,0.5),0 24px 60px rgba(0,0,0,0.55),inset 0 1px 0 rgba(255,255,255,0.05)',
      'color:' + PARCHMENT,
      'font:14px system-ui,sans-serif',
      'box-sizing:border-box',
    ].join(';');
    this.el.appendChild(card);

    card.appendChild(this.buildToolbar(onOpenHistory, onOpenSettings, bgmPlayer));
    card.appendChild(this.buildTitleBlock());

    const modeSection = this.buildSection(
      '대전 방식',
      [
        { value: 'local2p', label: '로컬 2인', icon: '👥' },
        { value: 'cpu', label: 'CPU 대전', icon: '🤖' },
        { value: 'online', label: '온라인 대전', icon: '🌐' },
      ],
      this.mode,
      (v) => {
        this.mode = v as 'local2p' | 'cpu' | 'online';
        this.difficultySection.style.display = this.mode === 'cpu' ? 'flex' : 'none';
      }
    );
    card.appendChild(modeSection);

    this.difficultySection = this.buildSection('난이도', DIFFICULTIES, this.difficulty, (v) => {
      this.difficulty = v as Difficulty;
    });
    this.difficultySection.style.display = this.mode === 'cpu' ? 'flex' : 'none';
    card.appendChild(this.difficultySection);

    card.appendChild(
      this.buildSection(
        '매치 형식',
        [
          { value: 'bo1', label: '단판', icon: '⚡' },
          { value: 'bo3', label: '3판 2선승', icon: '🏆' },
        ],
        this.format,
        (v) => {
          this.format = v as 'bo1' | 'bo3';
        }
      )
    );

    card.appendChild(this.buildStartButton(() => {
      onStart({
        source: this.mode,
        format: this.format,
        ...(this.mode === 'cpu' ? { cpuDifficulty: this.difficulty } : {}),
        myColorGame1: 'w',
      });
    }));

    container.appendChild(this.el);
  }

  private buildToolbar(onOpenHistory: () => void, onOpenSettings: () => void, bgmPlayer: YoutubeBgmPlayer): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'position:absolute;top:14px;right:14px;display:flex;gap:8px;';

    const historyBtn = this.buildIconButton('📜', '내 전적');
    historyBtn.addEventListener('click', onOpenHistory);
    row.appendChild(historyBtn);

    const settingsBtn = this.buildIconButton('⚙️', '설정');
    settingsBtn.addEventListener('click', onOpenSettings);
    row.appendChild(settingsBtn);

    const bgmBtn = this.buildIconButton(bgmPlayer.isPlaying() ? '🔊' : '🔇', 'BGM 켜기/끄기');
    bgmBtn.addEventListener('click', () => void bgmPlayer.toggle());
    bgmPlayer.onStateChange((playing) => {
      bgmBtn.textContent = playing ? '🔊' : '🔇';
    });
    row.appendChild(bgmBtn);

    return row;
  }

  private buildIconButton(glyph: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = glyph;
    btn.title = title;
    btn.style.cssText = [
      'width:36px',
      'height:36px',
      'border-radius:50%',
      'border:1px solid ' + WOOD_BORDER,
      'background:rgba(0,0,0,0.25)',
      'color:' + PARCHMENT,
      'font-size:16px',
      'line-height:1',
      'cursor:pointer',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'transition:background 0.15s,border-color 0.15s,transform 0.1s',
    ].join(';');
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(212,175,55,0.18)';
      btn.style.borderColor = GOLD;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(0,0,0,0.25)';
      btn.style.borderColor = WOOD_BORDER;
    });
    btn.addEventListener('mousedown', () => (btn.style.transform = 'scale(0.92)'));
    btn.addEventListener('mouseup', () => (btn.style.transform = 'scale(1)'));
    return btn;
  }

  private buildTitleBlock(): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding-top:8px;';

    const kicker = document.createElement('div');
    kicker.textContent = '♔ ROYAL CHESS SIMULATOR ♛';
    kicker.style.cssText = "font:600 10px 'Cinzel',serif;letter-spacing:0.28em;color:rgba(242,232,213,0.55);";
    wrap.appendChild(kicker);

    const title = document.createElement('div');
    title.textContent = 'BATTLE CHESS';
    title.style.cssText = [
      "font:900 clamp(30px,7vw,42px) 'Cinzel',serif",
      'letter-spacing:0.05em',
      'background:linear-gradient(180deg,' + GOLD_BRIGHT + ' 0%,' + GOLD + ' 55%,#8A6A2A 100%)',
      '-webkit-background-clip:text',
      'background-clip:text',
      'color:transparent',
      'text-shadow:0 2px 12px rgba(212,175,55,0.35)',
      'line-height:1.05',
    ].join(';');
    wrap.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.textContent = 'R E F O R G E D';
    subtitle.style.cssText = "font:600 clamp(12px,2.6vw,15px) 'Cinzel',serif;letter-spacing:0.5em;color:" + PARCHMENT + ';opacity:0.8;margin-left:0.5em;';
    wrap.appendChild(subtitle);

    const divider = document.createElement('div');
    divider.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:8px',
      'width:70%',
      'margin-top:10px',
    ].join(';');
    const makeLine = (): HTMLDivElement => {
      const line = document.createElement('div');
      line.style.cssText = 'flex:1;height:1px;background:linear-gradient(90deg,transparent,' + GOLD + ');';
      return line;
    };
    const lineL = makeLine();
    const lineR = makeLine();
    lineR.style.background = 'linear-gradient(90deg,' + GOLD + ',transparent)';
    const diamond = document.createElement('div');
    diamond.style.cssText = 'width:6px;height:6px;background:' + GOLD + ';transform:rotate(45deg);flex:none;';
    divider.appendChild(lineL);
    divider.appendChild(diamond);
    divider.appendChild(lineR);
    wrap.appendChild(divider);

    return wrap;
  }

  private buildSection(
    label: string,
    options: readonly { value: string; label: string; icon: string }[],
    selected: string,
    onSelect: (v: string) => void
  ): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size:11px;letter-spacing:0.12em;color:' + GOLD + ';opacity:0.85;font-weight:600;text-transform:uppercase;';
    wrap.appendChild(labelEl);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;';
    const buttons: HTMLButtonElement[] = [];

    const applyState = (btn: HTMLButtonElement, isSelected: boolean): void => {
      btn.style.border = '1px solid ' + (isSelected ? GOLD : 'rgba(107,74,47,0.8)');
      btn.style.background = isSelected ? 'linear-gradient(180deg,' + GOLD_BRIGHT + ',' + GOLD + ')' : 'rgba(0,0,0,0.22)';
      btn.style.color = isSelected ? '#1A140D' : PARCHMENT;
      btn.style.boxShadow = isSelected ? '0 2px 10px rgba(212,175,55,0.35),inset 0 1px 0 rgba(255,255,255,0.4)' : 'none';
    };

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.dataset['value'] = opt.value;
      btn.style.cssText = [
        'flex:1 1 auto',
        'min-width:88px',
        'min-height:48px',
        'padding:8px 12px',
        'border-radius:9px',
        'cursor:pointer',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'gap:6px',
        'font:600 13px system-ui,sans-serif',
        'transition:background 0.15s,border-color 0.15s,color 0.15s,transform 0.1s,box-shadow 0.15s',
      ].join(';');

      const iconEl = document.createElement('span');
      iconEl.textContent = opt.icon;
      iconEl.style.cssText = 'font-size:16px;line-height:1;';
      const labelSpan = document.createElement('span');
      labelSpan.textContent = opt.label;
      btn.appendChild(iconEl);
      btn.appendChild(labelSpan);

      applyState(btn, opt.value === selected);

      btn.addEventListener('mouseenter', () => {
        if (btn.dataset['value'] !== selected) btn.style.background = 'rgba(212,175,55,0.12)';
      });
      btn.addEventListener('mouseleave', () => applyState(btn, btn.dataset['value'] === selected));
      btn.addEventListener('mousedown', () => (btn.style.transform = 'scale(0.96)'));
      btn.addEventListener('mouseup', () => (btn.style.transform = 'scale(1)'));

      btn.addEventListener('click', () => {
        selected = opt.value;
        onSelect(opt.value);
        for (const b of buttons) applyState(b, b.dataset['value'] === selected);
      });
      buttons.push(btn);
      row.appendChild(btn);
    }

    wrap.appendChild(row);
    return wrap;
  }

  private buildStartButton(onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.style.cssText = [
      'margin-top:6px',
      'min-height:56px',
      'border-radius:12px',
      'border:1px solid ' + GOLD,
      'background:linear-gradient(180deg,' + GOLD_BRIGHT + ' 0%,' + GOLD + ' 60%,#B8892E 100%)',
      'color:#1A140D',
      'font:800 17px system-ui,sans-serif',
      'letter-spacing:0.06em',
      'cursor:pointer',
      'box-shadow:0 6px 18px rgba(212,175,55,0.3),inset 0 1px 0 rgba(255,255,255,0.5)',
      'transition:transform 0.12s,box-shadow 0.12s,filter 0.12s',
    ].join(';');
    btn.textContent = '⚔  전투 개시';
    btn.addEventListener('mouseenter', () => {
      btn.style.filter = 'brightness(1.08)';
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 10px 24px rgba(212,175,55,0.45),inset 0 1px 0 rgba(255,255,255,0.5)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.filter = 'none';
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 6px 18px rgba(212,175,55,0.3),inset 0 1px 0 rgba(255,255,255,0.5)';
    });
    btn.addEventListener('mousedown', () => (btn.style.transform = 'translateY(0) scale(0.98)'));
    btn.addEventListener('mouseup', () => (btn.style.transform = 'translateY(-2px) scale(1)'));
    btn.addEventListener('click', (ev) => {
      // 사용자 요청 §게임 시작 사운드 — 이 버튼은 전용 효과음(game_start.mp3, main.ts에서 재생)을 쓰므로,
      // 앱 전역 버튼 클릭 델리게이트(sfx.ui.button)와 겹쳐 들리지 않게 버블링을 막는다.
      ev.stopPropagation();
      onClick();
    });
    return btn;
  }

  show(): void {
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}
