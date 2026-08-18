import * as THREE from 'three';
import type { Color } from '@battle-chess/chess-core';
import type { GeometryCache } from '../../engine/GeometryCache';
import type { MaterialCache } from '../../engine/MaterialCache';
import type { UnitInstance, QualityTier } from '../UnitProvider';
import { makeBone, attachPart, buildArm, buildLeg, collectBones, getFactionMaterials, latheGeom, roundedBoxGeom, sphereGeom } from './PartKit';

/**
 * D4 §2.1 Pawn — Footsoldier. H=0.70, W=0.34, R=0.17.
 * 품질 개선: hips~chest를 박스 3개 스택 대신 연속 Lathe 실루엣 2단(하체 lathe + 상체 lathe, 30% 오버랩)으로
 * 재구성해 "따로 노는 박스 조립물" 인상을 없앤다.
 */
export function buildPawn(color: Color, _quality: QualityTier, geometryCache: GeometryCache, materialCache: MaterialCache): UnitInstance {
  const { fabric, metal } = getFactionMaterials(color, materialCache);
  const legLen = 0.16 + 0.16;

  const root = new THREE.Group();
  root.name = 'root';

  const hips = makeBone('hips', [0, legLen, 0]);
  root.add(hips);

  const thighL = buildLeg('L', [-0.06, legLen, 0], 0.16, 0.045, 0.16, 0.045, fabric, geometryCache, 'pawn');
  const thighR = buildLeg('R', [0.06, legLen, 0], 0.16, 0.045, 0.16, 0.045, fabric, geometryCache, 'pawn');
  root.add(thighL.upper, thighR.upper);

  attachPart(
    hips,
    latheGeom(geometryCache, 'pawn.lowerTorso', [
      [0.14, -0.02],
      [0.13, 0.0],
      [0.1, 0.1],
      [0.09, 0.2],
      [0.1, 0.29],
    ]),
    fabric
  );

  const spine = makeBone('spine', [0, 0.2, 0]);
  hips.add(spine);

  const chest = makeBone('chest', [0, 0.12, 0]);
  spine.add(chest);
  attachPart(
    chest,
    latheGeom(geometryCache, 'pawn.upperTorso', [
      [0.11, -0.09],
      [0.1, -0.04],
      [0.1, 0.0],
      [0.075, 0.07],
    ]),
    metal
  );

  const head = makeBone('head', [0, 0.13, 0]);
  chest.add(head);
  attachPart(head, sphereGeom(geometryCache, 'pawn.head', 0.09), fabric);

  const shoulderL = buildArm('L', [-0.11, 0.05, 0], 0.14, 0.035, 0.14, 0.035, fabric, geometryCache, 'pawn');
  const shoulderR = buildArm('R', [0.11, 0.05, 0], 0.14, 0.035, 0.14, 0.035, fabric, geometryCache, 'pawn');
  chest.add(shoulderL.upper, shoulderR.upper);

  attachPart(shoulderL.end, roundedBoxGeom(geometryCache, 'pawn.shortsword', 0.02, 0.18, 0.015, 0.25), metal, [0, -0.09, 0]);
  attachPart(shoulderR.end, geometryCache.getOrCreate('pawn.roundShield', () => new THREE.CylinderGeometry(0.11, 0.11, 0.02, 16)), metal, [0, -0.02, 0.05]);

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
