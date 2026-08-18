import * as THREE from 'three';
import type { PieceType } from '@battle-chess/chess-core';

/**
 * D5-2 §이동 애니메이션 — 유닛별 경로 보간/소요시간/이징. 로컬 파츠 애니메이션(D5-1 DSL, Idle 등)과
 * 별개로, 보드 위 root 위치를 매 프레임 계산하는 런타임 트윈이다(칸수에 따라 소요시간이 달라져
 * 고정 길이 `AnimationClip` 키프레임으로는 표현할 수 없음).
 */

export type EasingFn = (t: number) => number;
export type PathFn = (start: readonly [number, number], end: readonly [number, number], t: number) => THREE.Vector3;

export interface MovementProfile {
  duration(squares: number): number;
  path: PathFn;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export const easeInOutQuad: EasingFn = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOutQuad: EasingFn = (t) => 1 - (1 - t) * (1 - t);
export const easeInQuad: EasingFn = (t) => t * t;
export const easeInOutSine: EasingFn = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeInOutCubic: EasingFn = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function squareDistance(start: readonly [number, number], end: readonly [number, number]): number {
  return Math.max(Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1])) || 1;
}

function linearPath(easing: EasingFn): PathFn {
  return (start, end, t) => {
    const e = easing(t);
    return new THREE.Vector3(lerp(start[0], end[0], e), 0, lerp(start[1], end[1], e));
  };
}

/** Rook — 칸 경계마다 멈췄다 스톰프(D5-2). 세그먼트별로 easeInQuad를 다시 적용해 "정지 후 가속" 느낌을 낸다. */
function rookSteppedPath(start: readonly [number, number], end: readonly [number, number], t: number): THREE.Vector3 {
  const squares = squareDistance(start, end);
  const progress = t * squares;
  const segIndex = Math.min(Math.floor(progress), squares - 1);
  const segT = progress - segIndex;
  const eased = easeInQuad(segT);
  const segStartT = segIndex / squares;
  const segEndT = (segIndex + 1) / squares;
  const x = lerp(lerp(start[0], end[0], segStartT), lerp(start[0], end[0], segEndT), eased);
  const z = lerp(lerp(start[1], end[1], segStartT), lerp(start[1], end[1], segEndT), eased);
  return new THREE.Vector3(x, 0, z);
}

/** Bishop — 2차 베지에, 제어점 y+0.15로 들어올린 완만한 호. 지면 0.15 부양 유지. */
function bishopGlidePath(start: readonly [number, number], end: readonly [number, number], t: number): THREE.Vector3 {
  const e = easeInOutSine(t);
  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[1] + end[1]) / 2;
  const x = (1 - e) * (1 - e) * start[0] + 2 * (1 - e) * e * midX + e * e * end[0];
  const z = (1 - e) * (1 - e) * start[1] + 2 * (1 - e) * e * midZ + e * e * end[1];
  const arc = Math.sin(e * Math.PI) * 0.15;
  return new THREE.Vector3(x, 0.15 + arc, z);
}

/** Queen — 직선 + 좌우 진폭 0.05의 완만한 S자(3차 베지에). */
function queenSCurvePath(start: readonly [number, number], end: readonly [number, number], t: number): THREE.Vector3 {
  const e = easeInOutCubic(t);
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const len = Math.hypot(dx, dz) || 1;
  const perpX = -dz / len;
  const perpZ = dx / len;
  const lateral = Math.sin(e * Math.PI) * 0.05;
  const x = lerp(start[0], end[0], e) + perpX * lateral;
  const z = lerp(start[1], end[1], e) + perpZ * lateral;
  return new THREE.Vector3(x, 0, z);
}

/** Knight — L자를 두 구간의 포물선으로: 2칸 방향 상승(0.35s) → 직교 1칸 방향 하강(0.30s), 총 0.65s 고정. */
function knightTwoArcPath(start: readonly [number, number], end: readonly [number, number], t: number): THREE.Vector3 {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const longIsX = Math.abs(dx) > Math.abs(dz);
  const mid: readonly [number, number] = longIsX ? [start[0] + dx, start[1]] : [start[0], start[1] + dz];

  const seg1Share = 0.35 / 0.65;
  if (t <= seg1Share) {
    const segT = t / seg1Share;
    const e = easeOutQuad(segT);
    const x = lerp(start[0], mid[0], e);
    const z = lerp(start[1], mid[1], e);
    const y = Math.sin(e * Math.PI) * 0.28;
    return new THREE.Vector3(x, y, z);
  }
  const segT = (t - seg1Share) / (1 - seg1Share);
  const e = easeInQuad(segT);
  const x = lerp(mid[0], end[0], e);
  const z = lerp(mid[1], end[1], e);
  const y = Math.sin((1 - e) * (Math.PI / 2)) * 0.16;
  return new THREE.Vector3(x, y, z);
}

export const MOVEMENT_PROFILES: Record<PieceType, MovementProfile> = {
  p: { duration: (sq) => 0.35 + 0.3 * sq, path: linearPath(easeInOutQuad) },
  n: { duration: () => 0.65, path: knightTwoArcPath },
  b: { duration: (sq) => 0.4 + 0.22 * sq, path: bishopGlidePath },
  r: { duration: (sq) => 0.45 * sq, path: rookSteppedPath },
  q: { duration: (sq) => 0.3 + 0.24 * sq, path: queenSCurvePath },
  k: { duration: (sq) => 0.45 + 0.32 * sq, path: linearPath(easeInOutQuad) },
};
