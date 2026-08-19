/** Sprint 9c §온라인 매칭 대기 화면 — 검색 중 표시 + 타임아웃 시 안내와 메인 메뉴 복귀 버튼. */
export class MatchmakingScreen {
  readonly el: HTMLDivElement;
  private readonly messageEl: HTMLDivElement;
  private readonly cancelBtn: HTMLButtonElement;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'background:rgba(0,0,0,0.6)',
      'pointer-events:auto',
      'z-index:28',
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:#2A2118',
      'border:1px solid #6B4A2F',
      'border-radius:10px',
      'padding:28px 36px',
      'text-align:center',
      'color:#F2E8D5',
      'font:14px system-ui,sans-serif',
      'display:flex',
      'flex-direction:column',
      'gap:14px',
      'width:min(300px, 92vw)',
      'box-sizing:border-box',
    ].join(';');

    this.messageEl = document.createElement('div');
    this.messageEl.style.cssText = 'font:600 16px system-ui,sans-serif;';
    panel.appendChild(this.messageEl);

    this.cancelBtn = document.createElement('button');
    this.cancelBtn.textContent = '메인 메뉴로';
    this.cancelBtn.style.cssText =
      'min-height:44px;padding:8px 18px;border-radius:6px;border:1px solid #D4AF37;background:#3A2E1F;color:#F2E8D5;cursor:pointer;display:none;';
    panel.appendChild(this.cancelBtn);

    this.el.appendChild(panel);
    container.appendChild(this.el);
  }

  /** 매칭 검색/서버 연결 중 — 취소 버튼은 숨긴다(타임아웃 전까지는 대기만 가능). */
  showSearching(message = '상대를 찾는 중...'): void {
    this.messageEl.textContent = message;
    this.cancelBtn.style.display = 'none';
    this.cancelBtn.onclick = null;
    this.el.style.display = 'flex';
  }

  /** 타임아웃 — 대기 중인 상대가 없음을 안내하고 메인 메뉴 복귀 버튼을 노출한다. */
  showTimeout(onBackToMenu: () => void): void {
    this.messageEl.textContent = '대기 중인 온라인 사용자가 없습니다';
    this.cancelBtn.style.display = 'inline-block';
    this.cancelBtn.onclick = () => {
      this.hide();
      onBackToMenu();
    };
    this.el.style.display = 'flex';
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}
