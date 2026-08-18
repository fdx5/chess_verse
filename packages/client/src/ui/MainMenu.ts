import type { Difficulty } from '../ai/AiWorkerHandle';
import type { MatchConfig } from '../game/MatchState';

const DIFFICULTIES: readonly { value: Difficulty; label: string }[] = [
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' },
  { value: 'master', label: '마스터' },
];

/** D7 §화면 흐름 — 스플래시/메인 메뉴. 로컬 2인 / CPU 대전 / 온라인 대전 선택 + Bo1/Bo3 + 설정 진입점. */
export class MainMenu {
  readonly el: HTMLDivElement;
  private mode: 'local2p' | 'cpu' | 'online' = 'local2p';
  private format: 'bo1' | 'bo3' = 'bo3';
  private difficulty: Difficulty = 'intermediate';
  private difficultyRow: HTMLDivElement;

  constructor(container: HTMLElement, onStart: (config: MatchConfig) => void, onOpenSettings: () => void) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'gap:18px',
      'background:radial-gradient(circle at 50% 30%, #3A2E1F 0%, #1A140D 75%)',
      'pointer-events:auto',
      'z-index:30',
      'color:#F2E8D5',
      'font:14px system-ui,sans-serif',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'Battle Chess Reforged';
    title.style.cssText = 'font:700 32px system-ui,sans-serif;color:#D4AF37;letter-spacing:0.04em;margin-bottom:8px;';
    this.el.appendChild(title);

    this.el.appendChild(
      this.buildToggleRow(
        '대전 방식',
        [
          { value: 'local2p', label: '로컬 2인' },
          { value: 'cpu', label: 'CPU 대전' },
          { value: 'online', label: '온라인 대전' },
        ],
        this.mode,
        (v) => {
          this.mode = v as 'local2p' | 'cpu' | 'online';
          this.difficultyRow.style.display = this.mode === 'cpu' ? 'flex' : 'none';
        }
      )
    );

    this.difficultyRow = this.buildToggleRow('난이도', DIFFICULTIES.map((d) => ({ value: d.value, label: d.label })), this.difficulty, (v) => {
      this.difficulty = v as Difficulty;
    });
    this.difficultyRow.style.display = 'none';
    this.el.appendChild(this.difficultyRow);

    this.el.appendChild(this.buildToggleRow('매치 형식', [{ value: 'bo1', label: '단판(Bo1)' }, { value: 'bo3', label: '3판 2선승(Bo3)' }], this.format, (v) => {
      this.format = v as 'bo1' | 'bo3';
    }));

    const startBtn = document.createElement('button');
    startBtn.textContent = '시작';
    startBtn.style.cssText = [
      'min-width:160px',
      'min-height:48px',
      'margin-top:12px',
      'border-radius:8px',
      'border:1px solid #D4AF37',
      'background:#D4AF37',
      'color:#1A140D',
      'font:700 16px system-ui,sans-serif',
      'cursor:pointer',
    ].join(';');
    startBtn.addEventListener('click', () => {
      onStart({
        source: this.mode,
        format: this.format,
        ...(this.mode === 'cpu' ? { cpuDifficulty: this.difficulty } : {}),
        myColorGame1: 'w',
      });
    });
    this.el.appendChild(startBtn);

    const settingsBtn = document.createElement('button');
    settingsBtn.textContent = '설정';
    settingsBtn.style.cssText = 'min-height:44px;padding:6px 16px;border-radius:6px;border:1px solid #6B4A2F;background:transparent;color:#F2E8D5;cursor:pointer;';
    settingsBtn.addEventListener('click', onOpenSettings);
    this.el.appendChild(settingsBtn);

    container.appendChild(this.el);
  }

  private buildToggleRow(label: string, options: readonly { value: string; label: string }[], selected: string, onSelect: (v: string) => void): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;';
    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = 'opacity:0.75;font-size:12px;';
    wrap.appendChild(labelEl);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;';
    const buttons: HTMLButtonElement[] = [];
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.textContent = opt.label;
      btn.dataset['value'] = opt.value;
      const isSelected = opt.value === selected;
      btn.style.cssText = [
        'min-height:44px',
        'padding:6px 14px',
        'border-radius:6px',
        `border:1px solid ${isSelected ? '#D4AF37' : '#6B4A2F'}`,
        `background:${isSelected ? '#3A2E1F' : 'transparent'}`,
        'color:#F2E8D5',
        'cursor:pointer',
      ].join(';');
      btn.addEventListener('click', () => {
        onSelect(opt.value);
        for (const b of buttons) {
          const active = b.dataset['value'] === opt.value;
          b.style.borderColor = active ? '#D4AF37' : '#6B4A2F';
          b.style.background = active ? '#3A2E1F' : 'transparent';
        }
      });
      buttons.push(btn);
      row.appendChild(btn);
    }
    wrap.appendChild(row);
    return wrap;
  }

  show(): void {
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}
