import type { PieceType } from '@battle-chess/chess-core';
import type { AnimClipDef } from './dsl';

export interface BeatDef {
  kind: 'approach' | 'impact' | 'death' | 'result';
  startSec: number;
  endSec: number;
  attackerClipId: string | null;
  defenderClipId: string | null;
  hitStopFrames: number;
  timeScale: number;
}

export interface VfxCueDef {
  at: number;
  effectId: string;
  anchor: { unit: 'attacker' | 'defender' | 'world'; bone?: string; offset?: [number, number, number] };
  particleCount: number;
  lifetimeSec: number;
}

export interface SfxCueDef {
  at: number;
  cueId: string;
  spatial: boolean;
  gainDb: number;
}

export interface CameraCurvePoint {
  t: number;
  position: [number, number, number];
}

export interface LookAtTrack {
  mode: 'fixed' | 'follow';
  target?: [number, number, number];
  boneRef?: { unit: 'attacker' | 'defender'; bone: string };
}

export interface CameraShotDef {
  shotType: 'closeup' | 'medium' | 'wide' | 'overhead';
  lensMm: number;
  curve: CameraCurvePoint[];
  lookAt: LookAtTrack;
}

export interface CombatSceneDef {
  id: string;
  attacker: PieceType;
  defender: PieceType;
  version: string;
  totalDuration: number;
  camera: CameraShotDef;
  beats: BeatDef[];
  vfx: VfxCueDef[];
  sfx: SfxCueDef[];
  skipPointSec: number;
}

function combatSceneId(attacker: PieceType, defender: PieceType): string {
  return `${attacker}.${defender}`;
}

function isHigherVersion(candidate: string, current: string): boolean {
  const c = candidate.split('.').map(Number);
  const cur = current.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const a = c[i] ?? 0;
    const b = cur[i] ?? 0;
    if (a !== b) return a > b;
  }
  return false;
}

/**
 * D5-1 §AnimationRegistry — 클립/전투 연출을 데이터로 등록한다(R12).
 * `CombatDirector`/`AnimationController`는 여기 등록 호출 외에는 수정되지 않는다.
 */
export class AnimationRegistry {
  private readonly clips = new Map<string, AnimClipDef>();
  private readonly movementClipsByType = new Map<PieceType, string>();
  private readonly idleClipsByType = new Map<PieceType, string>();
  private readonly combatScenes = new Map<string, CombatSceneDef>();

  registerClip(def: AnimClipDef): void {
    this.clips.set(def.id, def);
  }

  /** D5-2 이동(Walk/Ride/Glide/Stomp) 클립 바인딩 — Sprint 4에서 채워짐. */
  bindMovementClip(type: PieceType, clipId: string): void {
    this.movementClipsByType.set(type, clipId);
  }

  /** D5-1 Idle 상태 클립 바인딩 — Sprint 3 12종 필수. */
  bindIdleClip(type: PieceType, clipId: string): void {
    this.idleClipsByType.set(type, clipId);
  }

  getIdleClip(type: PieceType): AnimClipDef {
    const clipId = this.idleClipsByType.get(type);
    if (clipId === undefined) throw new Error(`AnimationRegistry: no idle clip bound for piece type: ${type}`);
    return this.getClip(clipId);
  }

  /**
   * 조회 키는 항상 `attacker`/`defender` 필드로부터 계산한다(`def.id` 문자열을 신뢰하지 않는다) —
   * 저자가 `id`를 컨벤션과 다르게 적어도(예: 사람이 읽기 쉬운 이름) `getCombatScene()`이 찾을 수 있다.
   * 유일한 예외는 `id === 'generic.strike'`: attacker/defender 필드는 타입상 채워야 하는 더미값일 뿐이고
   * 실제 키는 리터럴 `'generic.strike'`다(그렇지 않으면 나중에 진짜 Pawn×Pawn 연출과 키가 충돌한다).
   */
  registerCombatScene(def: CombatSceneDef): void {
    const key = def.id === 'generic.strike' ? 'generic.strike' : combatSceneId(def.attacker, def.defender);
    const existing = this.combatScenes.get(key);
    if (existing === undefined || isHigherVersion(def.version, existing.version)) {
      this.combatScenes.set(key, def);
    }
  }

  getClip(id: string): AnimClipDef {
    const found = this.clips.get(id);
    if (found === undefined) throw new Error(`AnimationRegistry: clip not registered: ${id}`);
    return found;
  }

  /** 미등록 시 throw — 이동 클립은 12종 필수이며 폴백이 없다(D5-1). */
  getMovementClip(type: PieceType): AnimClipDef {
    const clipId = this.movementClipsByType.get(type);
    if (clipId === undefined) throw new Error(`AnimationRegistry: no movement clip bound for piece type: ${type}`);
    return this.getClip(clipId);
  }

  /** 미등록 조합은 예외 없이 'generic.strike' 폴백을 반환한다(D5-1 폴백 규칙). */
  getCombatScene(attacker: PieceType, defender: PieceType): CombatSceneDef {
    const id = combatSceneId(attacker, defender);
    const found = this.combatScenes.get(id);
    if (found !== undefined) return found;
    const fallback = this.combatScenes.get('generic.strike');
    if (fallback === undefined) {
      throw new Error(
        `AnimationRegistry: combat scene ${id} not registered and no 'generic.strike' fallback exists yet`
      );
    }
    return fallback;
  }
}
