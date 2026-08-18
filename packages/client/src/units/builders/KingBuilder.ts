import * as THREE from 'three';
import type { Color } from '@battle-chess/chess-core';
import type { GeometryCache } from '../../engine/GeometryCache';
import type { MaterialCache } from '../../engine/MaterialCache';
import type { UnitInstance, QualityTier } from '../UnitProvider';
import { makeBone, attachPart, buildArm, buildLeg, collectBones, getFactionMaterials, latheGeom, roundedBoxGeom, sphereGeom } from './PartKit';

/**
 * D4 §2.6 King. H=1.40, 6종 중 최고 높이. crossFinial(십자 첨탑) 포함.
 * 품질 개선: 로브를 연속 Lathe 실루엣으로, 흉갑은 겹쳐지는 roundedBox로 재구성.
 */
export function buildKing(color: Color, _quality: QualityTier, geometryCache: GeometryCache, materialCache: MaterialCache): UnitInstance {
  const { fabric, metal } = getFactionMaterials(color, materialCache);
  const crossMat = materialCache.getOrCreate(
    'king.crossFinial',
    () => new THREE.MeshPhysicalMaterial({ color: '#D4AF37', roughness: 0.2, metalness: 0.9, clearcoat: 0.6, clearcoatRoughness: 0.1 })
  );
  const legLen = 0.18 + 0.18;

  const root = new THREE.Group();
  root.name = 'root';

  const hips = makeBone('hips', [0, legLen, 0]);
  root.add(hips);

  const thighL = buildLeg('L', [-0.07, legLen, 0], 0.18, 0.05, 0.18, 0.05, fabric, geometryCache, 'king');
  const thighR = buildLeg('R', [0.07, legLen, 0], 0.18, 0.05, 0.18, 0.05, fabric, geometryCache, 'king');
  root.add(thighL.upper, thighR.upper);

  attachPart(
    hips,
    latheGeom(geometryCache, 'king.robe', [
      [0.19, -0.03],
      [0.17, 0.05],
      [0.15, 0.18],
      [0.13, 0.32],
      [0.14, 0.42],
    ]),
    fabric
  );

  const spine = makeBone('spine', [0, 0.36, 0]);
  hips.add(spine);
  const chest = makeBone('chest', [0, 0.14, 0]);
  spine.add(chest);
  attachPart(chest, roundedBoxGeom(geometryCache, 'king.chest', 0.22, 0.22, 0.16, 0.18), metal);

  const head = makeBone('head', [0, 0.16, 0]);
  chest.add(head);
  attachPart(head, sphereGeom(geometryCache, 'king.head', 0.09), fabric);

  const crownBone = makeBone('crown', [0, 0.09, 0]);
  head.add(crownBone);
  attachPart(crownBone, geometryCache.getOrCreate('king.crown', () => new THREE.CylinderGeometry(0.11, 0.115, 0.07, 16)), metal);
  const finialV = new THREE.Mesh(roundedBoxGeom(geometryCache, 'king.finial.v', 0.02, 0.1, 0.02, 0.3), crossMat);
  const finialH = new THREE.Mesh(roundedBoxGeom(geometryCache, 'king.finial.h', 0.1, 0.02, 0.02, 0.3), crossMat);
  finialV.position.set(0, 0.08, 0);
  finialH.position.set(0, 0.08, 0);
  crownBone.add(finialV, finialH);

  const shoulderL = buildArm('L', [-0.13, 0.07, 0], 0.14, 0.038, 0.14, 0.038, fabric, geometryCache, 'king');
  const shoulderR = buildArm('R', [0.13, 0.07, 0], 0.14, 0.038, 0.14, 0.038, fabric, geometryCache, 'king');
  chest.add(shoulderL.upper, shoulderR.upper);

  attachPart(shoulderR.end, roundedBoxGeom(geometryCache, 'king.sword', 0.025, 0.26, 0.02, 0.2), metal, [0, -0.13, 0]);

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
