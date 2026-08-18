import type * as THREE from 'three';
import type { Color, PieceType } from '@battle-chess/chess-core';
import type { QualityTier } from '../engine/QualityTier';

export type { QualityTier };

/** D4 §7 — 절차적 생성기와 미래의 GLTF 로더가 동일 인터페이스를 구현한다. */
export interface UnitInstance {
  root: THREE.Object3D;
  bones: Record<string, THREE.Bone>;
  mixer: THREE.AnimationMixer;
  dispose(): void;
}

export interface UnitProvider {
  create(type: PieceType, color: Color, quality: QualityTier): UnitInstance;
}
