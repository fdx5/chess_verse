/** D9 Sprint 10 / UX_UI_SPEC §7 — 768px 미만은 세로 모드(모바일) 레이아웃으로 전환한다. */
const MOBILE_BREAKPOINT_PX = 768;

export function isMobileLayout(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT_PX;
}

/** 뷰포트가 모바일/데스크톱 경계를 넘나들 때(리사이즈·회전) 콜백. 구독 해제 함수를 반환한다. */
export function onLayoutChange(callback: (mobile: boolean) => void): () => void {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
  const handler = (ev: MediaQueryListEvent): void => callback(ev.matches);
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
