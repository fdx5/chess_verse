import type { CombatSceneDef } from '../../AnimationRegistry';

/**
 * D5-1 §폴백 규칙 — 미등록 attacker×defender 조합의 안전망. 접근(0~0.5s)/임팩트(0.5~1.0s, 히트스톱
 * 0.05s)/소멸(1.0~1.8s, emissive 상승 후 opacity 1→0 + 파티클 80개) 총 1.8s.
 */
export const genericStrike: CombatSceneDef = {
  id: 'generic.strike',
  attacker: 'p',
  defender: 'p',
  version: '1.0.0',
  totalDuration: 1.8,
  camera: {
    shotType: 'medium',
    lensMm: 50,
    curve: [
      { t: 0, position: [0, 2.2, 3.2] },
      { t: 1, position: [0, 1.6, 2.2] },
    ],
    lookAt: { mode: 'follow', boneRef: { unit: 'defender', bone: 'chest' } },
  },
  beats: [
    { kind: 'approach', startSec: 0.0, endSec: 0.5, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
    { kind: 'impact', startSec: 0.5, endSec: 1.0, attackerClipId: null, defenderClipId: null, hitStopFrames: 3, timeScale: 1.0 },
    { kind: 'death', startSec: 1.0, endSec: 1.8, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1.0 },
  ],
  vfx: [
    { at: 0.5, effectId: 'vfx.flash.white', anchor: { unit: 'defender', bone: 'chest' }, particleCount: 0, lifetimeSec: 0.15 },
    { at: 1.0, effectId: 'vfx.dissolve.particles', anchor: { unit: 'defender' }, particleCount: 80, lifetimeSec: 0.8 },
  ],
  sfx: [
    { at: 0.5, cueId: 'sfx.impact.dull', spatial: true, gainDb: 0 },
    { at: 1.0, cueId: 'sfx.generic.dissolve', spatial: true, gainDb: -2 },
  ],
  skipPointSec: 0.5,
};
