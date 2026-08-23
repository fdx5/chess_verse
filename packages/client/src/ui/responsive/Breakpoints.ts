/**
 * 태블릿·폴더블의 가로 모드는 CSS 뷰포트가 768px을 넘지만 데스크톱 HUD를 배치할 공간은 부족하다.
 * 1280px 화면까지 터치 친화적인 컴팩트 레이아웃을 사용해 상단 컨트롤과 턴 표시의 충돌을 막는다.
 */
const MOBILE_BREAKPOINT_PX = 1281;

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
