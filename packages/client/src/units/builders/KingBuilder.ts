import * as THREE from 'three';
import type { Color } from '@battle-chess/chess-core';
import type { GeometryCache } from '../../engine/GeometryCache';
import type { MaterialCache } from '../../engine/MaterialCache';
import type { UnitInstance, QualityTier } from '../UnitProvider';
import { makeBone, attachPart, buildArm, buildLeg, collectBones, getUnitPalette, latheGeom, roundedBoxGeom, sphereGeom } from './PartKit';

/**
 * D4 §2.6 King. H=1.40, 6종 중 최고 높이.
 * 사용자 요청 §기물별 다채로운 리디자인 — 파스텔 임페리얼 퍼플(백)/섀도우 로열 퍼플(흑) 로브, 피부톤, 24K 황금관/십자 첨탑.
 */
export function buildKing(color: Color, _quality: QualityTier, geometryCache: GeometryCache, materialCache: MaterialCache): UnitInstance {
  const palette = getUnitPalette('k', color, materialCache);
  const crossMat = palette.accent;
  const legLen = 0.18 + 0.18;

  const root = new THREE.Group();
  root.name = 'root';

  const hips = makeBone('hips', [0, legLen, 0]);
  root.add(hips);

  const thighL = buildLeg('L', [-0.07, legLen, 0], 0.18, 0.05, 0.18, 0.05, palette.subtle, geometryCache, 'king');
  const thighR = buildLeg('R', [0.07, legLen, 0], 0.18, 0.05, 0.18, 0.05, palette.subtle, geometryCache, 'king');
  root.add(thighL.upper, thighR.upper);

  // 국왕의 로브 (임페리얼 퍼플 / 섀도우 퍼플)
  attachPart(
    hips,
    latheGeom(geometryCache, 'king.robe', [
      [0.19, -0.03],
      [0.17, 0.05],
      [0.15, 0.18],
      [0.13, 0.32],
      [0.14, 0.42],
    ]),
    palette.primary
  );

  const spine = makeBone('spine', [0, 0.36, 0]);
  hips.add(spine);
  const chest = makeBone('chest', [0, 0.14, 0]);
  spine.add(chest);
  // 황금 흉갑
  attachPart(chest, roundedBoxGeom(geometryCache, 'king.chest', 0.22, 0.22, 0.16, 0.18), palette.accent);

  const head = makeBone('head', [0, 0.16, 0]);
  chest.add(head);
  // 피부톤 얼굴
  attachPart(head, sphereGeom(geometryCache, 'king.head', 0.09), palette.skin);

  const crownBone = makeBone('crown', [0, 0.09, 0]);
  head.add(crownBone);
  // 황실 왕관
  attachPart(crownBone, geometryCache.getOrCreate('king.crown', () => new THREE.CylinderGeometry(0.11, 0.115, 0.07, 16)), palette.accent);
  const finialV = new THREE.Mesh(roundedBoxGeom(geometryCache, 'king.finial.v', 0.02, 0.1, 0.02, 0.3), crossMat);
  const finialH = new THREE.Mesh(roundedBoxGeom(geometryCache, 'king.finial.h', 0.1, 0.02, 0.02, 0.3), crossMat);
  finialV.position.set(0, 0.08, 0);
  finialH.position.set(0, 0.08, 0);
  crownBone.add(finialV, finialH);

  const shoulderL = buildArm('L', [-0.13, 0.07, 0], 0.14, 0.038, 0.14, 0.038, palette.primary, geometryCache, 'king');
  const shoulderR = buildArm('R', [0.13, 0.07, 0], 0.14, 0.038, 0.14, 0.038, palette.primary, geometryCache, 'king');
  chest.add(shoulderL.upper, shoulderR.upper);

  // 국왕의 검
  attachPart(shoulderR.end, roundedBoxGeom(geometryCache, 'king.sword', 0.025, 0.26, 0.02, 0.2), palette.metal, [0, -0.13, 0]);

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
