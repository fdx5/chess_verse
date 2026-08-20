import type { Color, PieceType } from '@battle-chess/chess-core';
import type { UnitInstance, UnitProvider, QualityTier } from './UnitProvider';
import { ProceduralUnitFactory } from './ProceduralUnitFactory';
import { GLTFUnitProvider } from './GLTFUnitProvider';

/**
 * 사용자 요청 §비숍 스컬프트 애셋 — 조각된 glTF 애셋이 preload된 기물 타입은 그쪽을 쓰고,
 * 아직 절차적 생성만 있는 타입은 기존 `ProceduralUnitFactory`로 폴백한다. 다른 기물도 같은 방식
 * (조각 애셋 preload)으로 옮겨갈 예정이라 폴백 순서(GLTF 우선 → 절차적)를 타입별로 개별 관리한다.
 */
export class HybridUnitProvider implements UnitProvider {
  constructor(
    private readonly gltfProvider: GLTFUnitProvider,
    private readonly proceduralFactory: ProceduralUnitFactory
  ) {}

  create(type: PieceType, color: Color, quality: QualityTier): UnitInstance {
    if (this.gltfProvider.isPreloaded(type, color)) return this.gltfProvider.create(type, color, quality);
    return this.proceduralFactory.create(type, color, quality);
  }

  dispose(): void {
    this.gltfProvider.dispose();
    this.proceduralFactory.dispose();
  }
}
