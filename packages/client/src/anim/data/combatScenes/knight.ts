import type { CombatSceneDef } from '../../AnimationRegistry';

/** D5-3 §전투 연출 매트릭스 — 공격자: Knight (6조합: Knight×Pawn/Knight/Bishop/Rook/Queen/King). */

export const knightVsPawn: CombatSceneDef = {
  id: 'n.p',
  attacker: 'n',
  defender: 'p',
  version: '1.0.0',
  totalDuration: 2.0,
  camera: {
    shotType: 'medium',
    lensMm: 50,
    curve: [
      { t: 0, position: [1.8, 1.1, 2.8] },
      { t: 1, position: [-1.8, 1.1, 2.4] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.5, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.5, endSec: 1.1, attackerClipId: null, defenderClipId: null, hitStopFrames: 7, timeScale: 1.0 },
    { kind: 'death', startSec: 1.1, endSec: 2.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.5, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.1, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 55, lifetimeSec: 0.75 },
  ],
  sfx: [
    { at: 0.5, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.1, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.1,
};

export const knightVsKnight: CombatSceneDef = {
  id: 'n.n',
  attacker: 'n',
  defender: 'n',
  version: '1.0.0',
  totalDuration: 2.8,
  camera: {
    shotType: 'wide',
    lensMm: 28,
    curve: [
      { t: 0, position: [0, 2.5, 3.5] },
      { t: 1, position: [0, 1.5, 1.8] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.9, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.9, endSec: 1.8, attackerClipId: null, defenderClipId: null, hitStopFrames: 10, timeScale: 1.0 },
    { kind: 'death', startSec: 1.8, endSec: 2.8, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.9, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.8, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 70, lifetimeSec: 0.85 },
  ],
  sfx: [
    { at: 0.9, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.8, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.8,
};

export const knightVsBishop: CombatSceneDef = {
  id: 'n.b',
  attacker: 'n',
  defender: 'b',
  version: '1.0.0',
  totalDuration: 2.3,
  camera: {
    shotType: 'medium',
    lensMm: 40,
    curve: [
      { t: 0, position: [2.5, 1.4, 0] },
      { t: 1, position: [0, 1.4, 2.5] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.6, endSec: 1.5, attackerClipId: null, defenderClipId: null, hitStopFrames: 8, timeScale: 1.0 },
    { kind: 'death', startSec: 1.5, endSec: 2.3, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.6, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.5, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 60, lifetimeSec: 0.8 },
  ],
  sfx: [
    { at: 0.6, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.5, cueId: 'sfx.shimmer', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.5,
};

export const knightVsRook: CombatSceneDef = {
  id: 'n.r',
  attacker: 'n',
  defender: 'r',
  version: '1.0.0',
  totalDuration: 2.9,
  camera: {
    shotType: 'wide',
    lensMm: 24,
    curve: [
      { t: 0, position: [0, 0.5, 3.5] },
      { t: 1, position: [0, 0.8, 1.5] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.8, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.8, endSec: 1.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 14, timeScale: 1.0 },
    { kind: 'death', startSec: 1.7, endSec: 2.9, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.8, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.7, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 90, lifetimeSec: 0.85 },
  ],
  sfx: [
    { at: 0.8, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.7, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 1.7,
};

export const knightVsQueen: CombatSceneDef = {
  id: 'n.q',
  attacker: 'n',
  defender: 'q',
  version: '1.0.0',
  totalDuration: 3.0,
  camera: {
    shotType: 'closeup',
    lensMm: 35,
    curve: [
      { t: 0, position: [0, 2.0, 3.5] },
      { t: 1, position: [0, 1.2, 1.0] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 1.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 1.0, endSec: 2.2, attackerClipId: null, defenderClipId: null, hitStopFrames: 11, timeScale: 1.0 },
    { kind: 'death', startSec: 2.2, endSec: 3.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 1.0, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 2.2, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 150, lifetimeSec: 0.8 },
  ],
  sfx: [
    { at: 1.0, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 2.2, cueId: 'sfx.shimmer', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 2.2,
};

export const knightVsKing: CombatSceneDef = {
  id: 'n.k',
  attacker: 'n',
  defender: 'k',
  version: '1.0.0',
  totalDuration: 2.5,
  camera: {
    shotType: 'medium',
    lensMm: 35,
    curve: [
      { t: 0, position: [2.5, 1.2, 0] },
      { t: 1, position: [-2.5, 1.2, 0.5] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.8, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.8, endSec: 1.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'result', startSec: 1.6, endSec: 2.5, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.8, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.6, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 25, lifetimeSec: 0.7 },
  ],
  sfx: [
    { at: 0.8, cueId: 'sfx.impact.dull', spatial: true, gainDb: -6 },
    { at: 1.6, cueId: 'sfx.ui.checkmate_stinger', spatial: false, gainDb: 0 },
  ],
  skipPointSec: 1.6,
};

export const KNIGHT_COMBAT_SCENES: readonly CombatSceneDef[] = [
  knightVsPawn,
  knightVsKnight,
  knightVsBishop,
  knightVsRook,
  knightVsQueen,
  knightVsKing,
];
