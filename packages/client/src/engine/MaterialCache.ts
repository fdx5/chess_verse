import * as THREE from 'three';

/** D9 §최적화 전략 — 머티리얼은 `${color}.${theme}.${lodLevel}` 등 조합 키로 1회 생성 후 재사용. */
export class MaterialCache {
  private readonly cache = new Map<string, THREE.Material>();

  getOrCreate(key: string, factory: () => THREE.Material): THREE.Material {
    const existing = this.cache.get(key);
    if (existing !== undefined) return existing;
    const created = factory();
    this.cache.set(key, created);
    return created;
  }

  dispose(): void {
    for (const mat of this.cache.values()) mat.dispose();
    this.cache.clear();
  }
}
