/** D10-1 §최초 실행 시 스플래시 직후 1회 — 닉네임을 정하면 아이덴티티(playerId/secret)를 발급한다. */
export class NicknameModal {
  readonly el: HTMLDivElement;
  private readonly input: HTMLInputElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:radial-gradient(circle at 50% 30%, #3A2E1F 0%, #1A140D 75%)',
      'pointer-events:auto',
      'z-index:35',
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:#2A2118',
      'border:1px solid #6B4A2F',
      'border-radius:12px',
      'padding:28px 32px',
      'display:flex',
      'flex-direction:column',
      'gap:14px',
      'align-items:stretch',
      'width:min(320px, 92vw)',
      'box-sizing:border-box',
      'color:#F2E8D5',
      'font:14px system-ui,sans-serif',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = '이름을 정하세요';
    title.style.cssText = 'font:700 20px system-ui,sans-serif;color:#D4AF37;text-align:center;';
    panel.appendChild(title);

    const desc = document.createElement('div');
    desc.textContent = '전적을 이 이름으로 기록합니다. 가입/로그인 없이 바로 시작할 수 있어요.';
    desc.style.cssText = 'font-size:12px;opacity:0.8;text-align:center;';
    panel.appendChild(desc);

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.maxLength = 16;
    this.input.placeholder = '2~16자';
    this.input.style.cssText = 'min-height:44px;padding:0 12px;border-radius:6px;border:1px solid #6B4A2F;background:#1A140D;color:#F2E8D5;text-align:center;';
    panel.appendChild(this.input);

    const startBtn = document.createElement('button');
    startBtn.textContent = '시작';
    startBtn.style.cssText = [
      'min-height:44px',
      'border-radius:8px',
      'border:1px solid #D4AF37',
      'background:#D4AF37',
      'color:#1A140D',
      'font:700 15px system-ui,sans-serif',
      'cursor:pointer',
    ].join(';');
    panel.appendChild(startBtn);

    this.el.appendChild(panel);
    container.appendChild(this.el);

    startBtn.addEventListener('click', () => this.submit());
    this.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') this.submit();
    });
  }

  private onSubmit: ((nickname: string) => void) | null = null;

  private submit(): void {
    const value = this.input.value.trim();
    if (value.length === 0) return;
    this.onSubmit?.(value);
  }

  show(onSubmit: (nickname: string) => void): void {
    this.onSubmit = onSubmit;
    this.input.value = '';
    this.el.style.display = 'flex';
    this.input.focus();
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}
