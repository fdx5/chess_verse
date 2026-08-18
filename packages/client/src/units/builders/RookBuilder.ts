import * as THREE from 'three';
import type { Color } from '@battle-chess/chess-core';
import type { GeometryCache } from '../../engine/GeometryCache';
import type { MaterialCache } from '../../engine/MaterialCache';
import type { UnitInstance, QualityTier } from '../UnitProvider';
import { makeBone, attachPart, buildArm, collectBones, roundedBoxGeom } from './PartKit';

/**
 * D4 §2.4 Rook — Brick Golem. H=1.15. 다리 본 없음, spine 자체가 접지(§3 예외).
 * 품질 개선: 각 블록을 `roundedBoxGeom`(모서리 베벨)으로 바꾸고 인접 블록끼리 10~15% 겹치게 배치해
 * "따로 쌓인 상자들"이 아니라 하나의 육중한 골렘 덩어리로 읽히게 한다. 골렘 컨셉 자체는 각짐이 의도이므로
 * 완전한 매끈함 대신 베벨+오버랩 정도로 절제.
 */
export function buildRook(color: Color, _quality: QualityTier, geometryCache: GeometryCache, materialCache: MaterialCache): UnitInstance {
  const tint = color === 'w' ? '#D4AF37' : '#C8CDD3';
  const stone = materialCache.getOrCreate(
    `rook.stone.${color}`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#8A8478',
        roughness: 0.85,
        metalness: 0.08,
        clearcoat: 0.15,
        clearcoatRoughness: 0.6,
        emissive: tint,
        emissiveIntensity: 0.04,
      })
  );

  const root = new THREE.Group();
  root.name = 'root';

  const hips = makeBone('hips', [0, 0.05, 0]);
  root.add(hips);

  const spine = makeBone('spine', [0, 0.15, 0]);
  hips.add(spine);
  attachPart(spine, roundedBoxGeom(geometryCache, 'rook.spine', 0.4, 0.34, 0.36, 0.12), stone);

  const chest = makeBone('chest', [0, 0.22, 0.02]);
  spine.add(chest);
  attachPart(chest, roundedBoxGeom(geometryCache, 'rook.chest', 0.3, 0.24, 0.28, 0.14), stone);

  const head = makeBone('head', [0, 0.16, 0]);
  chest.add(head);
  attachPart(head, roundedBoxGeom(geometryCache, 'rook.head', 0.18, 0.18, 0.16, 0.18), stone);

  const shoulderL = buildArm('L', [-0.17, 0.02, 0], 0.1, 0.05, 0.1, 0.05, stone, geometryCache, 'rook');
  const shoulderR = buildArm('R', [0.17, 0.02, 0], 0.1, 0.05, 0.1, 0.05, stone, geometryCache, 'rook');
  chest.add(shoulderL.upper, shoulderR.upper);

  const floatGeom = roundedBoxGeom(geometryCache, 'rook.floatBlock', 0.08, 0.08, 0.08, 0.2);
  const floatOffsets: [number, number, number][] = [
    [-0.15, 0.35, 0.12],
    [0.15, 0.32, -0.1],
    [0, 0.45, 0.15],
    [0.12, 0.5, 0.05],
  ];
  floatOffsets.forEach((pos, i) => {
    const bone = makeBone(`float.${i}`, pos);
    hips.add(bone);
    attachPart(bone, floatGeom, stone);
  });

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
