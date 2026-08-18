import type { PieceType } from '@battle-chess/chess-core';
import type { UnitInstance } from '../units/UnitProvider';
import { AnimationRegistry } from './AnimationRegistry';
import { compileClip } from './AnimClipCompiler';

export type UnitAnimState = 'idle' | 'selected' | 'walk' | 'attack' | 'victory' | 'death';

/** D5-1 §크로스페이드 표 — 상태 전이별 페이드 시간(초). */
const FADE_SECONDS: Record<UnitAnimState, number> = {
  idle: 0.15,
  selected: 0.15,
  walk: 0.1,
  attack: 0.08,
  victory: 0.25,
  death: 0.05,
};

/**
 * D5-1 §애니메이션 상태 그래프 — 유닛 1개의 현재 클립 액션을 관리한다. `${type}.${state}` 클립이
 * 레지스트리에 등록돼 있으면 크로스페이드로 전환하고, 없으면(예: attack/victory/death는 Sprint 6에서
 * 데이터로 추가됨) 조용히 현재 포즈를 유지한다 — 엔진 코드 수정 없이 신규 클립이 자동으로 붙는다(R12).
 */
export class AnimationController {
  private state: UnitAnimState = 'idle';
  private currentAction: import('three').AnimationAction | null = null;

  constructor(
    private readonly unit: UnitInstance,
    private readonly type: PieceType,
    private readonly registry: AnimationRegistry
  ) {}

  getState(): UnitAnimState {
    return this.state;
  }

  transitionTo(state: UnitAnimState): void {
    const clipId = `${this.type}.${state}`;
    let def;
    try {
      def = this.registry.getClip(clipId);
    } catch {
      this.state = state;
      return;
    }
    const nextAction = this.unit.mixer.clipAction(compileClip(def));
    const fade = FADE_SECONDS[state];
    nextAction.reset().fadeIn(fade).play();
    if (this.currentAction !== null && this.currentAction !== nextAction) this.currentAction.fadeOut(fade);
    this.currentAction = nextAction;
    this.state = state;
  }
}
