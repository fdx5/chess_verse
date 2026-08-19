import type { QualityTier } from '../engine/QualityTier';
import type { CinematicPacing } from '../anim/CombatDirector';

export interface SettingsCallbacks {
  onQualityChange: (tier: QualityTier) => void;
  onPacingChange: (pacing: CinematicPacing) => void;
  onVolumeChange: (bus: 'music' | 'sfx' | 'ui', value: number) => void;
  /** D10-1 §플레이어 아이덴티티 — 이름 변경/백업 코드/복원/전적 삭제. */
  getNickname: () => string;
  onNicknameChange: (nickname: string) => void;
  getBackupCode: () => string;
  onRestoreFromCode: (code: string) => Promise<boolean>;
  onDeleteLocalHistory: () => Promise<void>;
  onDeleteServerHistory: () => Promise<void>;
}

const QUALITY_OPTIONS: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];
const PACING_OPTIONS: readonly CinematicPacing[] = ['full', 'short', 'off'];

/** D7 §설정 화면 — 그래픽 품질/연출 길이/볼륨. 변경 즉시 콜백으로 반영(D9 Sprint 8 DoD). */
export class SettingsScreen {
  readonly el: HTMLDivElement;
  private visible = false;

  constructor(container: HTMLElement, callbacks: SettingsCallbacks) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:rgba(0,0,0,0.55)',
      'pointer-events:auto',
      'z-index:20',
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:#2A2118',
      'border:1px solid #6B4A2F',
      'border-radius:10px',
      'padding:22px 26px',
      'width:min(340px, 92vw)',
      'max-height:88vh',
      'overflow-y:auto',
      'display:flex',
      'flex-direction:column',
      'gap:14px',
      'color:#F2E8D5',
      'font:14px system-ui,sans-serif',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = '설정';
    title.style.cssText = 'font:600 16px system-ui,sans-serif;margin-bottom:4px;';
    panel.appendChild(title);

    panel.appendChild(this.buildSelectRow('그래픽 품질', QUALITY_OPTIONS, 'medium', (v) => callbacks.onQualityChange(v as QualityTier)));
    panel.appendChild(this.buildSelectRow('연출 길이', PACING_OPTIONS, 'full', (v) => callbacks.onPacingChange(v as CinematicPacing)));
    panel.appendChild(this.buildSliderRow('마스터/BGM', 0.7, (v) => callbacks.onVolumeChange('music', v)));
    panel.appendChild(this.buildSliderRow('SFX', 0.9, (v) => callbacks.onVolumeChange('sfx', v)));
    panel.appendChild(this.buildSliderRow('UI', 0.8, (v) => callbacks.onVolumeChange('ui', v)));

    const accountTitle = document.createElement('div');
    accountTitle.textContent = '계정 · 전적';
    accountTitle.style.cssText = 'font:600 15px system-ui,sans-serif;margin-top:6px;border-top:1px solid #6B4A2F;padding-top:12px;';
    panel.appendChild(accountTitle);

    panel.appendChild(this.buildNicknameRow(callbacks));
    panel.appendChild(this.buildBackupCodeRow(callbacks));
    panel.appendChild(this.buildRestoreRow(callbacks));
    panel.appendChild(this.buildDeleteRow('로컬 전적 삭제', () => callbacks.onDeleteLocalHistory()));
    panel.appendChild(this.buildDeleteRow('서버 전적까지 완전 삭제', () => callbacks.onDeleteServerHistory()));

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '닫기';
    closeBtn.style.cssText = 'min-height:44px;border-radius:6px;border:1px solid #D4AF37;background:#3A2E1F;color:#F2E8D5;cursor:pointer;';
    closeBtn.addEventListener('click', () => this.hide());
    panel.appendChild(closeBtn);

    this.el.appendChild(panel);
    container.appendChild(this.el);
  }

  private buildSelectRow(label: string, options: readonly string[], defaultValue: string, onChange: (v: string) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const select = document.createElement('select');
    select.style.cssText = 'min-height:44px;background:#1A140D;color:#F2E8D5;border:1px solid #6B4A2F;border-radius:4px;';
    for (const opt of options) {
      const optionEl = document.createElement('option');
      optionEl.value = opt;
      optionEl.textContent = opt;
      if (opt === defaultValue) optionEl.selected = true;
      select.appendChild(optionEl);
    }
    select.addEventListener('change', () => onChange(select.value));
    row.appendChild(labelEl);
    row.appendChild(select);
    return row;
  }

  private buildSliderRow(label: string, defaultValue: number, onChange: (v: number) => void): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.05';
    slider.value = String(defaultValue);
    slider.addEventListener('input', () => onChange(Number(slider.value)));
    row.appendChild(labelEl);
    row.appendChild(slider);
    return row;
  }

  private buildNicknameRow(callbacks: SettingsCallbacks): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = callbacks.getNickname();
    input.maxLength = 16;
    input.style.cssText = 'flex:1;min-height:44px;background:#1A140D;color:#F2E8D5;border:1px solid #6B4A2F;border-radius:4px;padding:0 8px;';
    const btn = document.createElement('button');
    btn.textContent = '이름 변경';
    btn.style.cssText = 'min-height:44px;padding:0 10px;border-radius:6px;border:1px solid #6B4A2F;background:transparent;color:#F2E8D5;cursor:pointer;';
    btn.addEventListener('click', () => callbacks.onNicknameChange(input.value));
    row.appendChild(input);
    row.appendChild(btn);
    return row;
  }

  private buildBackupCodeRow(callbacks: SettingsCallbacks): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    const btn = document.createElement('button');
    btn.textContent = '전적 백업 코드 보기';
    btn.style.cssText = 'min-height:44px;border-radius:6px;border:1px solid #6B4A2F;background:transparent;color:#F2E8D5;cursor:pointer;';
    const codeBox = document.createElement('input');
    codeBox.type = 'text';
    codeBox.readOnly = true;
    codeBox.style.cssText = 'display:none;min-height:44px;background:#1A140D;color:#D4AF37;border:1px solid #6B4A2F;border-radius:4px;padding:0 8px;font-size:12px;';
    btn.addEventListener('click', () => {
      codeBox.value = callbacks.getBackupCode();
      codeBox.style.display = 'block';
      codeBox.select();
      void navigator.clipboard?.writeText(codeBox.value).catch(() => undefined);
    });
    row.appendChild(btn);
    row.appendChild(codeBox);
    return row;
  }

  private buildRestoreRow(callbacks: SettingsCallbacks): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '다른 기기의 백업 코드 붙여넣기';
    input.style.cssText = 'flex:1;min-height:44px;background:#1A140D;color:#F2E8D5;border:1px solid #6B4A2F;border-radius:4px;padding:0 8px;font-size:12px;';
    const btn = document.createElement('button');
    btn.textContent = '복원';
    btn.style.cssText = 'min-height:44px;padding:0 10px;border-radius:6px;border:1px solid #6B4A2F;background:transparent;color:#F2E8D5;cursor:pointer;';
    btn.addEventListener('click', () => {
      void callbacks.onRestoreFromCode(input.value).then((ok) => {
        btn.textContent = ok ? '복원됨' : '실패';
        setTimeout(() => {
          btn.textContent = '복원';
        }, 1500);
      });
    });
    row.appendChild(input);
    row.appendChild(btn);
    return row;
  }

  /** 실수로 바로 삭제되지 않도록 첫 클릭은 확인 문구로 바뀌고, 3초 내 재클릭해야 실제로 실행된다. */
  private buildDeleteRow(label: string, onConfirmed: () => void | Promise<void>): HTMLDivElement {
    const row = document.createElement('div');
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = 'width:100%;min-height:44px;border-radius:6px;border:1px solid #8A3B3B;background:transparent;color:#E0A0A0;cursor:pointer;';
    let armed = false;
    let armTimer: ReturnType<typeof setTimeout> | null = null;
    btn.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        btn.textContent = '정말 삭제할까요? (다시 클릭)';
        armTimer = setTimeout(() => {
          armed = false;
          btn.textContent = label;
        }, 3000);
        return;
      }
      armed = false;
      if (armTimer !== null) clearTimeout(armTimer);
      void onConfirmed();
      btn.textContent = label;
    });
    row.appendChild(btn);
    return row;
  }

  show(): void {
    this.visible = true;
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.visible = false;
    this.el.style.display = 'none';
  }

  isVisible(): boolean {
    return this.visible;
  }
}
