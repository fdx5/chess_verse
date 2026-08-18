import { describe, it, expect } from 'vitest';
import type { PieceType } from '@battle-chess/chess-core';
import { AnimationRegistry } from '../AnimationRegistry';
import { ALL_COMBAT_SCENES } from '../data/combatScenes/index';

const PIECE_TYPES: readonly PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];

/** D9 Sprint 6 DoD: "36개 조합 전부 `getCombatScene()`으로 조회 가능(단위테스트로 36건 전수 검사)". */
describe('D5-3 전투 연출 매트릭스 — 36조합 전수 조회', () => {
  const registry = new AnimationRegistry();
  for (const scene of ALL_COMBAT_SCENES) registry.registerCombatScene(scene);

  it('generic.strike 폴백을 포함해 정확히 37개 씬이 등록된다', () => {
    expect(ALL_COMBAT_SCENES.length).toBe(37);
  });

  for (const attacker of PIECE_TYPES) {
    for (const defender of PIECE_TYPES) {
      it(`${attacker}×${defender} 조합이 전용 연출로 조회된다(폴백 아님)`, () => {
        const scene = registry.getCombatScene(attacker, defender);
        expect(scene.id).toBe(`${attacker}.${defender}`);
        expect(scene.id).not.toBe('generic.strike');
        expect(scene.attacker).toBe(attacker);
        expect(scene.defender).toBe(defender);
      });
    }
  }

  it('King이 방어자인 6개 조합은 result 비트로 처리되고 King이 소멸하지 않는다(체크메이트 플로리시)', () => {
    for (const attacker of PIECE_TYPES) {
      const scene = registry.getCombatScene(attacker, 'k');
      const lastBeat = scene.beats[scene.beats.length - 1];
      expect(lastBeat?.kind).toBe('result');
    }
  });

  it('King이 공격자인 5개 실제 캡처는 death 비트로 처리된다(King×King만 예외)', () => {
    for (const defender of PIECE_TYPES.filter((t) => t !== 'k')) {
      const scene = registry.getCombatScene('k', defender);
      const lastBeat = scene.beats[scene.beats.length - 1];
      expect(lastBeat?.kind).toBe('death');
    }
  });

  it('모든 씬의 vfx/sfx는 엔진이 실제로 구현한 id만 사용한다(신규 effectId/cueId 발명 금지)', () => {
    const knownEffectIds = new Set(['vfx.flash.white', 'vfx.dissolve.particles']);
    const knownCueIds = new Set([
      'sfx.impact.dull',
      'sfx.generic.dissolve',
      'sfx.shimmer',
      'sfx.footstep.leather',
      'sfx.footstep.stone',
      'sfx.footstep.metal',
      'sfx.ui.checkmate_stinger',
    ]);
    for (const scene of ALL_COMBAT_SCENES) {
      for (const vfx of scene.vfx) expect(knownEffectIds.has(vfx.effectId), `${scene.id}: ${vfx.effectId}`).toBe(true);
      for (const sfx of scene.sfx) expect(knownCueIds.has(sfx.cueId), `${scene.id}: ${sfx.cueId}`).toBe(true);
    }
  });
});
