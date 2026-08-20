import type { HistoryClient } from '../persistence/HistoryClient';

/** D10-1 §사용자 ID 입력/변경 모달 — 중복 검사 및 다중 계정 접속 지원 */
export class NicknameModal {
  readonly el: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly statusMsg: HTMLDivElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly cancelBtn: HTMLButtonElement;
  private onSubmit: ((nickname: string) => void) | null = null;
  private onCancel: (() => void) | null = null;

  constructor(container: HTMLElement, private readonly historyClient?: HistoryClient) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:radial-gradient(circle at 50% 30%, rgba(58,46,31,0.95) 0%, rgba(26,20,13,0.98) 75%)',
      'backdrop-filter:blur(6px)',
      'pointer-events:auto',
      'z-index:45',
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:linear-gradient(165deg,#2A2118,#19130D)',
      'border:1px solid #D4AF37',
      'border-radius:14px',
      'padding:28px 32px',
      'display:flex',
      'flex-direction:column',
      'gap:14px',
      'align-items:stretch',
      'width:min(340px, 92vw)',
      'box-sizing:border-box',
      'color:#F2E8D5',
      'font:14px system-ui,sans-serif',
      'box-shadow:0 20px 50px rgba(0,0,0,0.6)',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = '플레이어 ID 입력';
    title.style.cssText = 'font:700 20px Cinzel,system-ui,sans-serif;color:#D4AF37;text-align:center;letter-spacing:0.5px;';
    panel.appendChild(title);

    const desc = document.createElement('div');
    desc.textContent = '게임 순위와 전적이 이 ID로 기록됩니다. 중복되지 않는 고유 ID를 입력하세요.';
    desc.style.cssText = 'font-size:12px;opacity:0.8;text-align:center;line-height:1.4;';
    panel.appendChild(desc);

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = 16;
    this.input.placeholder = 'ID 입력 (2~16자)';
    this.input.style.cssText = 'min-height:44px;padding:0 12px;border-radius:8px;border:1px solid #6B4A2F;background:#140F09;color:#F2E8D5;text-align:center;font-size:15px;';
    panel.appendChild(this.input);

    this.statusMsg = document.createElement('div');
    this.statusMsg.style.cssText = 'font-size:12px;text-align:center;min-height:16px;color:#93C5FD;';
    panel.appendChild(this.statusMsg);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.textContent = '취소';
    this.cancelBtn.style.cssText = 'flex:1;min-height:44px;border-radius:8px;border:1px solid #6B4A2F;background:#241B10;color:#F2E8D5;font:600 14px system-ui,sans-serif;cursor:pointer;display:none;';
    this.cancelBtn.addEventListener('click', () => {
      this.hide();
      this.onCancel?.();
    });
    btnRow.appendChild(this.cancelBtn);

    this.startBtn = document.createElement('button');
    this.startBtn.textContent = '접속 / 시작';
    this.startBtn.style.cssText = [
      'flex:2',
      'min-height:44px',
      'border-radius:8px',
      'border:1px solid #D4AF37',
      'background:linear-gradient(180deg,#E8C568,#D4AF37)',
      'color:#1A140D',
      'font:700 15px system-ui,sans-serif',
      'cursor:pointer',
    ].join(';');
    this.startBtn.addEventListener('click', () => void this.submit());
    btnRow.appendChild(this.startBtn);
    panel.appendChild(btnRow);

    this.el.appendChild(panel);
    container.appendChild(this.el);

    this.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') void this.submit();
    });
  }

  private async submit(): Promise<void> {
    const value = this.input.value.trim();
    if (value.length < 2 || value.length > 16) {
      this.statusMsg.textContent = 'ID는 2~16자로 입력해주세요.';
      this.statusMsg.style.color = '#F87171';
      return;
    }

    this.statusMsg.textContent = 'ID 확인 중...';
    this.statusMsg.style.color = '#93C5FD';
    this.startBtn.disabled = true;

    try {
      if (this.historyClient) {
        const check = await this.historyClient.checkNickname(value);
        if (!check.available) {
          // 이미 존재하는 ID인 경우: 안내 후 접속 진행 (기존 ID 접속)
          this.statusMsg.textContent = '기존에 등록된 ID로 접속합니다.';
          this.statusMsg.style.color = '#FBBF24';
        } else {
          this.statusMsg.textContent = '새로운 ID로 생성되었습니다!';
          this.statusMsg.style.color = '#4ADE80';
        }
      }
    } catch {
      // 오프라인이거나 검사 실패 시에도 로컬 플레이는 계속 진행
    } finally {
      this.startBtn.disabled = false;
    }

    this.onSubmit?.(value);
  }

  show(onSubmit: (nickname: string) => void, allowCancel = false, onCancel?: () => void, currentNickname?: string): void {
    this.onSubmit = onSubmit;
    this.onCancel = onCancel ?? null;
    this.input.value = currentNickname ?? '';
    this.statusMsg.textContent = '';
    this.cancelBtn.style.display = allowCancel ? 'block' : 'none';
    this.el.style.display = 'flex';
    this.input.focus();
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}
