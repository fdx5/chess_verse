import type { CombatSceneDef } from '../../AnimationRegistry';

/** D5-3 §전투 연출 매트릭스 — 공격자: Bishop(Cleric), 6조합(Pawn/Knight/Bishop/Rook/Queen/King). */

export const bishopVsPawn: CombatSceneDef = {
  id: 'b.p',
  attacker: 'b',
  defender: 'p',
  version: '1.0.0',
  totalDuration: 2.0,
  camera: {
    shotType: 'medium',
    lensMm: 40,
    curve: [
      { t: 0, position: [0, 2.0, 2.6] },
      { t: 1, position: [0, 1.2, 1.8] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.6, endSec: 1.3, attackerClipId: null, defenderClipId: null, hitStopFrames: 6, timeScale: 1.0 },
    { kind: 'death', startSec: 1.3, endSec: 2.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.6, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.3, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 40, lifetimeSec: 0.6 },
  ],
  sfx: [
    { at: 0.6, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.3, cueId: 'sfx.shimmer', spatial: true, gainDb: 0 },
  ],
  skipPointSec: 1.3,
};

export const bishopVsKnight: CombatSceneDef = {
  id: 'b.n',
  attacker: 'b',
  defender: 'n',
  version: '1.0.0',
  totalDuration: 2.4,
  camera: {
    shotType: 'wide',
    lensMm: 45,
    curve: [
      { t: 0, position: [0, 0.4, 2.8] },
      { t: 1, position: [0, 1.8, 2.0] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.7, endSec: 1.5, attackerClipId: null, defenderClipId: null, hitStopFrames: 9, timeScale: 1.0 },
    { kind: 'death', startSec: 1.5, endSec: 2.4, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.7, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.5, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 85, lifetimeSec: 0.85 },
  ],
  sfx: [
    { at: 0.7, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.5, cueId: 'sfx.shimmer', spatial: true, gainDb: 0 },
  ],
  skipPointSec: 1.5,
};

export const bishopVsBishop: CombatSceneDef = {
  id: 'b.b',
  attacker: 'b',
  defender: 'b',
  version: '1.0.0',
  totalDuration: 2.2,
  camera: {
    shotType: 'medium',
    lensMm: 50,
    curve: [
      { t: 0, position: [0, 1.6, 3.5] },
      { t: 1, position: [0, 1.6, 2.0] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.6, endSec: 1.4, attackerClipId: null, defenderClipId: null, hitStopFrames: 8, timeScale: 1.0 },
    { kind: 'death', startSec: 1.4, endSec: 2.2, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.6, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.4, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 55, lifetimeSec: 0.7 },
  ],
  sfx: [
    { at: 0.6, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.4, cueId: 'sfx.shimmer', spatial: true, gainDb: 0 },
  ],
  skipPointSec: 1.4,
};

export const bishopVsRook: CombatSceneDef = {
  id: 'b.r',
  attacker: 'b',
  defender: 'r',
  version: '1.0.0',
  totalDuration: 2.7,
  camera: {
    shotType: 'wide',
    lensMm: 40,
    curve: [
      { t: 0, position: [0, 3.0, 3.2] },
      { t: 1, position: [0, 0.3, 2.0] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.8, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.8, endSec: 1.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 10, timeScale: 1.0 },
    { kind: 'death', startSec: 1.7, endSec: 2.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.8, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.7, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 90, lifetimeSec: 0.9 },
  ],
  sfx: [
    { at: 0.8, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.7, cueId: 'sfx.shimmer', spatial: true, gainDb: 0 },
  ],
  skipPointSec: 1.7,
};

export const bishopVsQueen: CombatSceneDef = {
  id: 'b.q',
  attacker: 'b',
  defender: 'q',
  version: '1.0.0',
  totalDuration: 2.6,
  camera: {
    shotType: 'closeup',
    lensMm: 50,
    curve: [
      { t: 0, position: [0, 1.6, 1.2] },
      { t: 1, position: [0, 1.8, 3.2] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.7, endSec: 1.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 9, timeScale: 1.0 },
    { kind: 'death', startSec: 1.6, endSec: 2.6, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.7, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.6, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 70, lifetimeSec: 0.8 },
  ],
  sfx: [
    { at: 0.7, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.6, cueId: 'sfx.shimmer', spatial: true, gainDb: 0 },
  ],
  skipPointSec: 1.6,
};

export const bishopVsKing: CombatSceneDef = {
  id: 'b.k',
  attacker: 'b',
  defender: 'k',
  version: '1.0.0',
  totalDuration: 2.3,
  camera: {
    shotType: 'overhead',
    lensMm: 40,
    curve: [
      { t: 0, position: [0, 3.5, 1.5] },
      { t: 1, position: [0, 1.5, 2.2] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.7, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.7, endSec: 1.5, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'result', startSec: 1.5, endSec: 2.3, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.7, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.5, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 25, lifetimeSec: 0.5 },
  ],
  sfx: [
    { at: 0.7, cueId: 'sfx.impact.dull', spatial: true, gainDb: -6 },
    { at: 1.5, cueId: 'sfx.ui.checkmate_stinger', spatial: false, gainDb: 0 },
  ],
  skipPointSec: 1.5,
};

export const BISHOP_COMBAT_SCENES: readonly CombatSceneDef[] = [
  bishopVsPawn,
  bishopVsKnight,
  bishopVsBishop,
  bishopVsRook,
  bishopVsQueen,
  bishopVsKing,
];
