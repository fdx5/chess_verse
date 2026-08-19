import { clip, track, type AnimClipDef } from '../../dsl';

/** D5-1 §예시 클립 패턴을 6종 전부에 적용한 Idle(호흡) 클립. Sprint 3 DoD: 12유닛 아이들 루프 재생. */

export const pawnIdle: AnimClipDef = clip('pawn.idle', 2.4, true, [
  track('chest.rotation', [0, 1.2, 2.4], [0, 0, 0, 0.035, 0, 0, 0, 0, 0]),
  track('head.rotation', [0, 1.2, 2.4], [0, 0, 0, 0, -0.02, 0, 0, 0, 0]),
]);

export const bishopIdle: AnimClipDef = clip('bishop.idle', 2.8, true, [
  track('chest.rotation', [0, 1.4, 2.8], [0, 0, 0, 0.03, 0, 0, 0, 0, 0]),
  track('head.rotation', [0, 1.4, 2.8], [0, 0, 0, 0, 0.04, 0, 0, 0, 0]),
]);

// 사용자 요청으로 도보 기사(투구+검)로 리디자인되며 이중 리그(말+기수)가 사라져 표준 chest/head 본만 남았다.
export const knightIdle: AnimClipDef = clip('knight.idle', 2.6, true, [
  track('chest.rotation', [0, 1.3, 2.6], [0, 0, 0, 0.025, 0, 0, 0, 0, 0]),
  track('head.rotation', [0, 1.3, 2.6], [0, 0, 0, 0, -0.03, 0, 0, 0, 0]),
]);

// 사용자 요청으로 첨성대풍 석탑으로 리디자인되며 팔/부유 파편 본이 사라져 chest(목 부분) 회전만 남았다.
export const rookIdle: AnimClipDef = clip('rook.idle', 3.2, true, [
  track('chest.rotation', [0, 1.6, 3.2], [0, 0, 0, 0.012, 0, 0, 0, 0, 0]),
]);

export const queenIdle: AnimClipDef = clip('queen.idle', 2.5, true, [
  track('chest.rotation', [0, 1.25, 2.5], [0, 0, 0, 0.03, 0, 0, 0, 0, 0]),
  track('head.rotation', [0, 1.25, 2.5], [0, 0, 0, 0, -0.025, 0, 0, 0, 0]),
  track('cape.root.rotation', [0, 1.25, 2.5], [0, 0, 0, 0.06, 0, 0, 0, 0, 0]),
]);

export const kingIdle: AnimClipDef = clip('king.idle', 3.0, true, [
  track('chest.rotation', [0, 1.5, 3.0], [0, 0, 0, 0.02, 0, 0, 0, 0, 0]),
  track('head.rotation', [0, 1.5, 3.0], [0, 0, 0, 0, -0.015, 0, 0, 0, 0]),
]);

export const ALL_IDLE_CLIPS: readonly AnimClipDef[] = [pawnIdle, bishopIdle, knightIdle, rookIdle, queenIdle, kingIdle];
