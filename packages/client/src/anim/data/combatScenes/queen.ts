import type { CombatSceneDef } from '../../AnimationRegistry';

/** D5-3 §전투 연출 매트릭스 — 공격자: Queen (Battle Queen), 6조합 (Queen×Pawn/Knight/Bishop/Rook/Queen/King). */

export const queenVsPawn: CombatSceneDef = {
  id: 'q.p',
  attacker: 'q',
  defender: 'p',
  version: '1.0.0',
  totalDuration: 1.6,
  camera: {
    shotType: 'closeup',
    lensMm: 85,
    curve: [
      { t: 0, position: [1.6, 1.5, 1.8] },
      { t: 1, position: [-1.2, 1.6, 1.6] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.5, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.5, endSec: 0.9, attackerClipId: null, defenderClipId: null, hitStopFrames: 4, timeScale: 1.0 },
    { kind: 'death', startSec: 0.9, endSec: 1.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.5, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 0.9, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 35, lifetimeSec: 0.6 },
  ],
  sfx: [
    { at: 0.5, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 0.9, cueId: 'sfx.shimmer', spatial: true, gainDb: 0 },
  ],
  skipPointSec: 0.9,
};

export const queenVsKnight: CombatSceneDef = {
  id: 'q.n',
  attacker: 'q',
  defender: 'n',
  version: '1.0.0',
  totalDuration: 2.3,
  camera: {
    shotType: 'medium',
    lensMm: 50,
    curve: [
      { t: 0, position: [2.4, 1.6, 0.5] },
      { t: 1, position: [-2.0, 1.4, -0.8] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.9, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.9, endSec: 1.5, attackerClipId: null, defenderClipId: null, hitStopFrames: 7, timeScale: 0.2 },
    { kind: 'death', startSec: 1.5, endSec: 2.3, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.9, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.5, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 70, lifetimeSec: 0.8 },
  ],
  sfx: [
    { at: 0.9, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.5, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.5,
};

export const queenVsBishop: CombatSceneDef = {
  id: 'q.b',
  attacker: 'q',
  defender: 'b',
  version: '1.0.0',
  totalDuration: 2.1,
  camera: {
    shotType: 'medium',
    lensMm: 40,
    curve: [
      { t: 0, position: [1.8, 1.7, 1.2] },
      { t: 1, position: [-1.8, 1.7, 1.2] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.7, endSec: 1.3, attackerClipId: null, defenderClipId: null, hitStopFrames: 6, timeScale: 1.0 },
    { kind: 'death', startSec: 1.3, endSec: 2.1, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.7, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.3, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 60, lifetimeSec: 0.7 },
  ],
  sfx: [
    { at: 0.7, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.3, cueId: 'sfx.shimmer', spatial: true, gainDb: 0 },
  ],
  skipPointSec: 1.3,
};

export const queenVsRook: CombatSceneDef = {
  id: 'q.r',
  attacker: 'q',
  defender: 'r',
  version: '1.0.0',
  totalDuration: 2.9,
  camera: {
    shotType: 'wide',
    lensMm: 35,
    curve: [
      { t: 0, position: [0.5, 0.8, 3.2] },
      { t: 1, position: [0.3, 3.2, 2.0] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 1.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 1.0, endSec: 1.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 8, timeScale: 1.0 },
    { kind: 'death', startSec: 1.7, endSec: 2.9, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 1.0, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.7, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 90, lifetimeSec: 0.9 },
  ],
  sfx: [
    { at: 1.0, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.7, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -1 },
  ],
  skipPointSec: 1.7,
};

export const queenVsQueen: CombatSceneDef = {
  id: 'q.q',
  attacker: 'q',
  defender: 'q',
  version: '1.0.0',
  totalDuration: 3.0,
  camera: {
    shotType: 'medium',
    lensMm: 50,
    curve: [
      { t: 0, position: [2.6, 1.7, 0.0] },
      { t: 1, position: [-2.6, 1.7, 0.0] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 1.2, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 1.2, endSec: 2.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 9, timeScale: 1.0 },
    { kind: 'death', startSec: 2.0, endSec: 3.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 1.2, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 2.0, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 90, lifetimeSec: 0.9 },
  ],
  sfx: [
    { at: 1.2, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 2.0, cueId: 'sfx.shimmer', spatial: true, gainDb: 1 },
  ],
  skipPointSec: 2.0,
};

export const queenVsKing: CombatSceneDef = {
  id: 'q.k',
  attacker: 'q',
  defender: 'k',
  version: '1.0.0',
  totalDuration: 2.0,
  camera: {
    shotType: 'closeup',
    lensMm: 85,
    curve: [
      { t: 0, position: [0.3, 1.1, 1.4] },
      { t: 1, position: [0.1, 1.5, 1.0] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.7, endSec: 1.2, attackerClipId: null, defenderClipId: null, hitStopFrames: 5, timeScale: 1.0 },
    { kind: 'result', startSec: 1.2, endSec: 2.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.7, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.2, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 25, lifetimeSec: 0.5 },
  ],
  sfx: [
    { at: 0.7, cueId: 'sfx.impact.dull', spatial: true, gainDb: -6 },
    { at: 1.2, cueId: 'sfx.ui.checkmate_stinger', spatial: false, gainDb: 0 },
  ],
  skipPointSec: 1.2,
};

export const QUEEN_COMBAT_SCENES: readonly CombatSceneDef[] = [
  queenVsPawn,
  queenVsKnight,
  queenVsBishop,
  queenVsRook,
  queenVsQueen,
  queenVsKing,
];
