import type { QualityTier } from '../engine/QualityTier';
import type { CinematicPacing } from '../anim/CombatDirector';

export interface SettingsCallbacks {
  onQualityChange: (tier: QualityTier) => void;
  onPacingChange: (pacing: CinematicPacing) => void;
  onVolumeChange: (bus: 'music' | 'sfx' | 'ui', value: number) => void;
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
      'min-width:280px',
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
    select.style.cssText = 'min-height:32px;background:#1A140D;color:#F2E8D5;border:1px solid #6B4A2F;border-radius:4px;';
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
