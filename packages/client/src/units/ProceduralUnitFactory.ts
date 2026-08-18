import type { Color, PieceType } from '@battle-chess/chess-core';
import type { UnitInstance, UnitProvider, QualityTier } from './UnitProvider';
import { GeometryCache } from '../engine/GeometryCache';
import { MaterialCache } from '../engine/MaterialCache';
import { buildPawn } from './builders/PawnBuilder';
import { buildKnight } from './builders/KnightBuilder';
import { buildBishop } from './builders/BishopBuilder';
import { buildRook } from './builders/RookBuilder';
import { buildQueen } from './builders/QueenBuilder';
import { buildKing } from './builders/KingBuilder';

type BuilderFn = (color: Color, quality: QualityTier, geometryCache: GeometryCache, materialCache: MaterialCache) => UnitInstance;

const BUILDERS: Record<PieceType, BuilderFn> = {
  p: buildPawn,
  n: buildKnight,
  b: buildBishop,
  r: buildRook,
  q: buildQueen,
  k: buildKing,
};

/** D4 §7 — 절차적 유닛 팩토리. 지오메트리/머티리얼은 팩토리 인스턴스 수명 동안 캐시 공유(D9). */
export class ProceduralUnitFactory implements UnitProvider {
  private readonly geometryCache = new GeometryCache();
  private readonly materialCache = new MaterialCache();

  create(type: PieceType, color: Color, quality: QualityTier): UnitInstance {
    const builder = BUILDERS[type];
    return builder(color, quality, this.geometryCache, this.materialCache);
  }

  dispose(): void {
    this.geometryCache.dispose();
    this.materialCache.dispose();
  }
}
