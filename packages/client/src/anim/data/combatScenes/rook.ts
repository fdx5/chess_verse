import type { CombatSceneDef } from '../../AnimationRegistry';

/** D5-3 §전투 연출 매트릭스 — 공격자: Rook(Brick Golem). 6조합(Rook×Pawn/Knight/Bishop/Rook/Queen/King). */

export const rookVsPawn: CombatSceneDef = {
  id: 'r.p',
  attacker: 'r',
  defender: 'p',
  version: '1.0.0',
  totalDuration: 2.0,
  camera: {
    shotType: 'medium',
    lensMm: 35,
    curve: [
      { t: 0, position: [0, 1.8, 3.0] },
      { t: 1, position: [0, 1.6, 2.4] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.7, endSec: 1.2, attackerClipId: null, defenderClipId: null, hitStopFrames: 6, timeScale: 1.0 },
    { kind: 'death', startSec: 1.2, endSec: 2.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.7, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.2, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 70, lifetimeSec: 0.7 },
  ],
  sfx: [
    { at: 0.7, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.2, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.2,
};

export const rookVsKnight: CombatSceneDef = {
  id: 'r.n',
  attacker: 'r',
  defender: 'n',
  version: '1.0.0',
  totalDuration: 2.6,
  camera: {
    shotType: 'medium',
    lensMm: 50,
    curve: [
      { t: 0, position: [1.8, 1.6, 1.0] },
      { t: 1, position: [0.6, 1.6, 2.0] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 1.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 1.0, endSec: 1.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 8, timeScale: 1.0 },
    { kind: 'death', startSec: 1.7, endSec: 2.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 1.0, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.7, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 90, lifetimeSec: 0.9 },
  ],
  sfx: [
    { at: 1.0, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.7, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.7,
};

export const rookVsBishop: CombatSceneDef = {
  id: 'r.b',
  attacker: 'r',
  defender: 'b',
  version: '1.0.0',
  totalDuration: 1.9,
  camera: {
    shotType: 'medium',
    lensMm: 40,
    curve: [
      { t: 0, position: [0, 3.2, 1.6] },
      { t: 1, position: [0, 3.0, 1.4] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.6, endSec: 1.1, attackerClipId: null, defenderClipId: null, hitStopFrames: 5, timeScale: 1.0 },
    { kind: 'death', startSec: 1.1, endSec: 1.9, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.6, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.1, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 50, lifetimeSec: 0.6 },
  ],
  sfx: [
    { at: 0.6, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.1, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.1,
};

export const rookVsRook: CombatSceneDef = {
  id: 'r.r',
  attacker: 'r',
  defender: 'r',
  version: '1.0.0',
  totalDuration: 2.4,
  camera: {
    shotType: 'wide',
    lensMm: 28,
    curve: [
      { t: 0, position: [0, 1.8, 4.0] },
      { t: 1, position: [0.15, 1.7, 3.8] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.9, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.9, endSec: 1.5, attackerClipId: null, defenderClipId: null, hitStopFrames: 10, timeScale: 1.0 },
    { kind: 'death', startSec: 1.5, endSec: 2.4, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.9, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.5, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 85, lifetimeSec: 0.8 },
  ],
  sfx: [
    { at: 0.9, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.5, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.5,
};

export const rookVsQueen: CombatSceneDef = {
  id: 'r.q',
  attacker: 'r',
  defender: 'q',
  version: '1.0.0',
  totalDuration: 2.8,
  camera: {
    shotType: 'wide',
    lensMm: 30,
    curve: [
      { t: 0, position: [0, 1.4, 3.0] },
      { t: 1, position: [0, 4.5, 0.6] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.8, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.8, endSec: 1.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 9, timeScale: 1.0 },
    { kind: 'death', startSec: 1.6, endSec: 2.8, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.8, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.6, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 75, lifetimeSec: 0.7 },
  ],
  sfx: [
    { at: 0.8, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.6, cueId: 'sfx.shimmer', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.6,
};

export const rookVsKing: CombatSceneDef = {
  id: 'r.k',
  attacker: 'r',
  defender: 'k',
  version: '1.0.0',
  totalDuration: 2.2,
  camera: {
    shotType: 'medium',
    lensMm: 50,
    curve: [
      { t: 0, position: [1.6, 1.7, 1.8] },
      { t: 1, position: [0.8, 1.65, 1.0] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.8, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.8, endSec: 1.4, attackerClipId: null, defenderClipId: null, hitStopFrames: 6, timeScale: 1.0 },
    { kind: 'result', startSec: 1.4, endSec: 2.2, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.8, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.4, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 25, lifetimeSec: 0.5 },
  ],
  sfx: [
    { at: 0.8, cueId: 'sfx.impact.dull', spatial: true, gainDb: -6 },
    { at: 1.4, cueId: 'sfx.ui.checkmate_stinger', spatial: false, gainDb: 0 },
  ],
  skipPointSec: 1.4,
};

export const ROOK_COMBAT_SCENES: readonly CombatSceneDef[] = [
  rookVsPawn,
  rookVsKnight,
  rookVsBishop,
  rookVsRook,
  rookVsQueen,
  rookVsKing,
];
