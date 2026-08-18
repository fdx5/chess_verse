import type { CombatSceneDef } from '../../AnimationRegistry';

/** D5-3 §전투 연출 매트릭스 — 공격자: Pawn (6조합: p.p, p.n, p.b, p.r, p.q, p.k). */

export const pawnVsPawn: CombatSceneDef = {
  id: 'p.p',
  attacker: 'p',
  defender: 'p',
  version: '1.0.0',
  totalDuration: 1.9,
  camera: {
    shotType: 'medium',
    lensMm: 35,
    curve: [
      { t: 0, position: [0, 0.6, 1.8] },
      { t: 1, position: [0, 0.55, 1.4] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.6, endSec: 1.2, attackerClipId: null, defenderClipId: null, hitStopFrames: 6, timeScale: 1.0 },
    { kind: 'death', startSec: 1.2, endSec: 1.9, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.6, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.2, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 40, lifetimeSec: 0.7 },
  ],
  sfx: [
    { at: 0.6, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.2, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.2,
};

export const pawnVsKnight: CombatSceneDef = {
  id: 'p.n',
  attacker: 'p',
  defender: 'n',
  version: '1.0.0',
  totalDuration: 2.1,
  camera: {
    shotType: 'medium',
    lensMm: 50,
    curve: [
      { t: 0, position: [1.6, 0.7, 1.6] },
      { t: 1, position: [-1.6, 0.7, 1.6] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.5, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.5, endSec: 1.3, attackerClipId: null, defenderClipId: null, hitStopFrames: 8, timeScale: 1.0 },
    { kind: 'death', startSec: 1.3, endSec: 2.1, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.5, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.3, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 60, lifetimeSec: 0.8 },
  ],
  sfx: [
    { at: 0.5, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.3, cueId: 'sfx.shimmer', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.3,
};

export const pawnVsBishop: CombatSceneDef = {
  id: 'p.b',
  attacker: 'p',
  defender: 'b',
  version: '1.0.0',
  totalDuration: 1.8,
  camera: {
    shotType: 'medium',
    lensMm: 40,
    curve: [
      { t: 0, position: [0, 1.4, 1.9] },
      { t: 1, position: [0, 1.4, 1.9] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.5, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.5, endSec: 1.1, attackerClipId: null, defenderClipId: null, hitStopFrames: 5, timeScale: 1.0 },
    { kind: 'death', startSec: 1.1, endSec: 1.8, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.5, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.1, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 45, lifetimeSec: 0.7 },
  ],
  sfx: [
    { at: 0.5, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.1, cueId: 'sfx.shimmer', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.1,
};

export const pawnVsRook: CombatSceneDef = {
  id: 'p.r',
  attacker: 'p',
  defender: 'r',
  version: '1.0.0',
  totalDuration: 2.6,
  camera: {
    shotType: 'wide',
    lensMm: 24,
    curve: [
      { t: 0, position: [0.5, 0.35, 3.2] },
      { t: 1, position: [0.3, 0.4, 2.6] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.7, endSec: 1.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 12, timeScale: 1.0 },
    { kind: 'death', startSec: 1.6, endSec: 2.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.7, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.6, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 90, lifetimeSec: 0.9 },
  ],
  sfx: [
    { at: 0.7, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.6, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.6,
};

export const pawnVsQueen: CombatSceneDef = {
  id: 'p.q',
  attacker: 'p',
  defender: 'q',
  version: '1.0.0',
  totalDuration: 2.4,
  camera: {
    shotType: 'medium',
    lensMm: 35,
    curve: [
      { t: 0, position: [1.2, 0.9, 1.8] },
      { t: 1, position: [1.8, 1.0, 2.6] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.6, endSec: 1.5, attackerClipId: null, defenderClipId: null, hitStopFrames: 9, timeScale: 1.0 },
    { kind: 'death', startSec: 1.5, endSec: 2.4, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.6, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.5, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 75, lifetimeSec: 0.9 },
  ],
  sfx: [
    { at: 0.6, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.5, cueId: 'sfx.shimmer', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.5,
};

export const pawnVsKing: CombatSceneDef = {
  id: 'p.k',
  attacker: 'p',
  defender: 'k',
  version: '1.0.0',
  totalDuration: 2.2,
  camera: {
    shotType: 'closeup',
    lensMm: 40,
    curve: [
      { t: 0, position: [0, 0.3, 1.6] },
      { t: 1, position: [0, 0.9, 1.9] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.7, endSec: 1.4, attackerClipId: null, defenderClipId: null, hitStopFrames: 7, timeScale: 1.0 },
    { kind: 'result', startSec: 1.4, endSec: 2.2, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.7, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.4, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 25, lifetimeSec: 0.6 },
  ],
  sfx: [
    { at: 0.7, cueId: 'sfx.impact.dull', spatial: true, gainDb: -6 },
    { at: 1.4, cueId: 'sfx.ui.checkmate_stinger', spatial: false, gainDb: 0 },
  ],
  skipPointSec: 1.4,
};

export const PAWN_COMBAT_SCENES: readonly CombatSceneDef[] = [
  pawnVsPawn,
  pawnVsKnight,
  pawnVsBishop,
  pawnVsRook,
  pawnVsQueen,
  pawnVsKing,
];
