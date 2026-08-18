import { describe, it, expect } from 'vitest';
import { AnimationRegistry, type CombatSceneDef } from '../AnimationRegistry';

const CAMERA_STUB: CombatSceneDef['camera'] = {
  shotType: 'medium',
  lensMm: 50,
  curve: [
    { t: 0, position: [0, 2, 3] },
    { t: 1, position: [0, 1.5, 2] },
  ],
  lookAt: { mode: 'fixed', target: [0, 0, 0] },
};

function makeScene(id: string, attacker: CombatSceneDef['attacker'], defender: CombatSceneDef['defender'], version = '1.0.0'): CombatSceneDef {
  return {
    id,
    attacker,
    defender,
    version,
    totalDuration: 1.5,
    camera: CAMERA_STUB,
    beats: [{ kind: 'approach', startSec: 0, endSec: 1.5, attackerClipId: null, defenderClipId: null, hitStopFrames: 0, timeScale: 1 }],
    vfx: [],
    sfx: [],
    skipPointSec: 0.5,
  };
}

/**
 * D9 Sprint 5 DoD: "`AnimationRegistry.register()`만으로 새 연출을 추가할 수 있음을 단위테스트로
 * 증명(엔진 코드 미수정)". 이 테스트는 `registerCombatScene()` 호출 외에 어떤 엔진 클래스도 import하지
 * 않는다 — `CombatDirector`/`AnimationController`를 건드리지 않고 새 연출이 조회 가능해야 통과한다.
 */
describe('AnimationRegistry — 데이터 주도 확장성 (R12)', () => {
  it('미등록 조합은 generic.strike 폴백으로 조회된다', () => {
    const registry = new AnimationRegistry();
    registry.registerCombatScene(makeScene('generic.strike', 'p', 'p'));

    const result = registry.getCombatScene('r', 'q');
    expect(result.id).toBe('generic.strike');
  });

  it('registerCombatScene() 호출만으로 새 조합(pawn.knight)이 조회 가능해진다', () => {
    const registry = new AnimationRegistry();
    registry.registerCombatScene(makeScene('generic.strike', 'p', 'p'));
    registry.registerCombatScene(makeScene('pawn.knight', 'p', 'n'));

    const result = registry.getCombatScene('p', 'n');
    expect(result.id).toBe('pawn.knight');
    expect(result.id).not.toBe('generic.strike');
  });

  it('동일 id 재등록 시 더 높은 semver만 반영된다(핫스왑 규칙)', () => {
    const registry = new AnimationRegistry();
    registry.registerCombatScene(makeScene('pawn.knight', 'p', 'n', '1.0.0'));
    registry.registerCombatScene(makeScene('pawn.knight', 'p', 'n', '0.9.0'));
    expect(registry.getCombatScene('p', 'n').version).toBe('1.0.0');

    registry.registerCombatScene(makeScene('pawn.knight', 'p', 'n', '1.1.0'));
    expect(registry.getCombatScene('p', 'n').version).toBe('1.1.0');
  });

  it('이동 클립이 없는 종류를 조회하면 명시적으로 throw한다(무음 실패 금지)', () => {
    const registry = new AnimationRegistry();
    expect(() => registry.getIdleClip('q')).toThrow();
  });
});
