import type { CombatSceneDef } from '../../AnimationRegistry';

/**
 * D5-3 §전투 연출 매트릭스 — King 공격자 6조합(King×Pawn/Knight/Bishop/Rook/Queen/King).
 * King×King은 실제 포획이 불가능한 이론적 조합이라 상징적 대치/양위 플로리시(kind: 'result')로 대체한다.
 */

export const kingVsPawn: CombatSceneDef = {
  id: 'k.p',
  attacker: 'k',
  defender: 'p',
  version: '1.0.0',
  totalDuration: 1.8,
  camera: {
    shotType: 'medium',
    lensMm: 40,
    curve: [
      { t: 0, position: [0, 1.8, 2.6] },
      { t: 1, position: [0, 1.6, 2.3] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.7, endSec: 1.2, attackerClipId: null, defenderClipId: null, hitStopFrames: 6, timeScale: 1.0 },
    { kind: 'death', startSec: 1.2, endSec: 1.8, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.7, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.2, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 60, lifetimeSec: 0.7 },
  ],
  sfx: [
    { at: 0.7, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.2, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.2,
};

export const kingVsKnight: CombatSceneDef = {
  id: 'k.n',
  attacker: 'k',
  defender: 'n',
  version: '1.0.0',
  totalDuration: 2.4,
  camera: {
    shotType: 'wide',
    lensMm: 35,
    curve: [
      { t: 0, position: [0, 2.0, 4.0] },
      { t: 1, position: [0, 1.7, 2.0] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.9, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.9, endSec: 1.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 7, timeScale: 1.0 },
    { kind: 'death', startSec: 1.6, endSec: 2.4, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.9, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.6, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 70, lifetimeSec: 0.8 },
  ],
  sfx: [
    { at: 0.9, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.6, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.6,
};

export const kingVsBishop: CombatSceneDef = {
  id: 'k.b',
  attacker: 'k',
  defender: 'b',
  version: '1.0.0',
  totalDuration: 2.0,
  camera: {
    shotType: 'overhead',
    lensMm: 30,
    curve: [
      { t: 0, position: [0, 4.5, 0.3] },
      { t: 1, position: [0, 2.8, 0.2] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.6, endSec: 1.1, attackerClipId: null, defenderClipId: null, hitStopFrames: 5, timeScale: 1.0 },
    { kind: 'death', startSec: 1.1, endSec: 2.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.6, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.1, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 70, lifetimeSec: 0.8 },
  ],
  sfx: [
    { at: 0.6, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.1, cueId: 'sfx.shimmer', spatial: true, gainDb: -1 },
  ],
  skipPointSec: 1.1,
};

export const kingVsRook: CombatSceneDef = {
  id: 'k.r',
  attacker: 'k',
  defender: 'r',
  version: '1.0.0',
  totalDuration: 2.6,
  camera: {
    shotType: 'closeup',
    lensMm: 24,
    curve: [
      { t: 0, position: [0, 1.2, 1.6] },
      { t: 1, position: [0, 3.0, 5.5] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 1.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 1.0, endSec: 1.8, attackerClipId: null, defenderClipId: null, hitStopFrames: 9, timeScale: 1.0 },
    { kind: 'death', startSec: 1.8, endSec: 2.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 1.0, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.8, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 90, lifetimeSec: 0.9 },
  ],
  sfx: [
    { at: 1.0, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.8, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -1 },
  ],
  skipPointSec: 1.8,
};

export const kingVsQueen: CombatSceneDef = {
  id: 'k.q',
  attacker: 'k',
  defender: 'q',
  version: '1.0.0',
  totalDuration: 2.7,
  camera: {
    shotType: 'closeup',
    lensMm: 50,
    curve: [
      { t: 0, position: [0, 1.5, 2.0] },
      { t: 1, position: [0, 1.3, 1.6] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 1.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 1.0, endSec: 1.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 8, timeScale: 1.0 },
    { kind: 'death', startSec: 1.7, endSec: 2.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 1.0, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.7, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 65, lifetimeSec: 0.85 },
  ],
  sfx: [
    { at: 1.0, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.7, cueId: 'sfx.shimmer', spatial: true, gainDb: -1 },
  ],
  skipPointSec: 1.7,
};

/** King×King — 정규 대국에서 발생하지 않는 이론적 조합. 실제 포획 대신 상징적 대치/양위로 처리. */
export const kingVsKing: CombatSceneDef = {
  id: 'k.k',
  attacker: 'k',
  defender: 'k',
  version: '1.0.0',
  totalDuration: 1.6,
  camera: {
    shotType: 'wide',
    lensMm: 40,
    curve: [
      { t: 0, position: [0, 2.4, 4.5] },
      { t: 1, position: [0, 2.4, 4.45] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.7, endSec: 1.1, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'result', startSec: 1.1, endSec: 1.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.7, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.1, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 15, lifetimeSec: 0.6 },
  ],
  sfx: [
    { at: 0.7, cueId: 'sfx.ui.checkmate_stinger', spatial: false, gainDb: -8 },
    { at: 1.1, cueId: 'sfx.ui.checkmate_stinger', spatial: false, gainDb: -4 },
  ],
  skipPointSec: 1.1,
};

export const KING_COMBAT_SCENES: readonly CombatSceneDef[] = [
  kingVsPawn,
  kingVsKnight,
  kingVsBishop,
  kingVsRook,
  kingVsQueen,
  kingVsKing,
];
