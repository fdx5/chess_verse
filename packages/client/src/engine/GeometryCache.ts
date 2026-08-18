import * as THREE from 'three';

/** D9 §최적화 전략 — 절차적 지오메트리는 `${pieceType}.${partName}.${lodLevel}` 키로 1회 생성 후 재사용. */
export class GeometryCache {
  private readonly cache = new Map<string, THREE.BufferGeometry>();

  getOrCreate(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
    const existing = this.cache.get(key);
    if (existing !== undefined) return existing;
    const created = factory();
    this.cache.set(key, created);
    return created;
  }

  dispose(): void {
    for (const geom of this.cache.values()) geom.dispose();
    this.cache.clear();
  }
}
