import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Color, PieceType } from '@battle-chess/chess-core';
import type { UnitInstance, UnitProvider, QualityTier } from './UnitProvider';
import { collectBones } from './BoneRig';

function templateKey(type: PieceType, color: Color): string {
  return `${type}.${color}`;
}

/**
 * D4 §7 — 절차적 생성기와 동일한 `UnitProvider` 인터페이스를 구현하는 GLTF 어댑터.
 * `UnitProvider.create()`는 동기이므로, GLTF 로딩(비동기)은 `preload()`로 미리 끝내둔다.
 * 프리로드되지 않은 (type,color) 조합에 대한 `create()` 호출은 명시적으로 throw한다(무음 폴백 없음).
 */
export class GLTFUnitProvider implements UnitProvider {
  private readonly loader = new GLTFLoader();
  private readonly templates = new Map<string, THREE.Object3D>();

  async preload(type: PieceType, color: Color, url: string): Promise<void> {
    const gltf = await this.loader.loadAsync(url);
    this.templates.set(templateKey(type, color), gltf.scene);
  }

  isPreloaded(type: PieceType, color: Color): boolean {
    return this.templates.has(templateKey(type, color));
  }

  create(type: PieceType, color: Color, _quality: QualityTier): UnitInstance {
    const template = this.templates.get(templateKey(type, color));
    if (template === undefined) {
      throw new Error(`GLTFUnitProvider: ${templateKey(type, color)} not preloaded — call preload() first`);
    }
    const root = cloneSkeleton(template) as THREE.Object3D;
    root.name = 'root';

    const bones = collectBones(root);
    const mixer = new THREE.AnimationMixer(root);

    return {
      root,
      bones,
      mixer,
      dispose(): void {
        mixer.stopAllAction();
        root.removeFromParent();
      },
    };
  }
}
