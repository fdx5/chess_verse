import * as THREE from 'three';
import type { Color } from '@battle-chess/chess-core';
import type { GeometryCache } from '../../engine/GeometryCache';
import type { MaterialCache } from '../../engine/MaterialCache';
import type { UnitInstance, QualityTier } from '../UnitProvider';
import { makeBone, attachPart, buildTwoSegmentLimb, collectBones, getFactionMaterials, roundedBoxGeom, sphereGeom } from './PartKit';

/** D4 §2.3 Knight — Mounted Knight. 이중 리그(말 + `rider.` 접두 기수). H=1.10. */
export function buildKnight(color: Color, _quality: QualityTier, geometryCache: GeometryCache, materialCache: MaterialCache): UnitInstance {
  const { fabric, metal } = getFactionMaterials(color, materialCache);
  const horseColor = color === 'w' ? '#8B6544' : '#3A3A3A';
  const horseMat = materialCache.getOrCreate(
    `knight.horse.${color}`,
    () => new THREE.MeshPhysicalMaterial({ color: horseColor, roughness: 0.55, metalness: 0.0, clearcoat: 0.25, clearcoatRoughness: 0.4 })
  );

  const legLen = 0.2 * 2;
  const root = new THREE.Group();
  root.name = 'root';

  const horseHips = makeBone('hips', [0, legLen, 0]);
  root.add(horseHips);
  attachPart(horseHips, roundedBoxGeom(geometryCache, 'knight.horseHips', 0.42, 0.26, 0.22, 0.18), horseMat);

  const legOffsets: [string, number, number][] = [
    ['FL', -0.16, 0.09],
    ['FR', 0.16, 0.09],
    ['BL', -0.16, -0.09],
    ['BR', 0.16, -0.09],
  ];
  for (const [tag, x, z] of legOffsets) {
    const limb = buildTwoSegmentLimb(
      `horseLeg.${tag}`,
      { upper: `horseThigh.${tag}`, lower: `horseKnee.${tag}`, end: `horseHoof.${tag}` },
      [x, 0, z],
      0.1,
      0.035,
      0.1,
      0.035,
      horseMat,
      geometryCache,
      `knight.leg.${tag}`
    );
    horseHips.add(limb.upper);
  }

  const horseSpine = makeBone('spine', [0, 0.05, 0.11]);
  horseHips.add(horseSpine);
  const horseChest = makeBone('chest', [0, 0.0, 0.11]);
  horseSpine.add(horseChest);
  attachPart(horseChest, roundedBoxGeom(geometryCache, 'knight.horseChest', 0.24, 0.22, 0.2, 0.2), horseMat);

  const horseNeck = makeBone('horseNeck', [0, 0.09, 0.11]);
  horseChest.add(horseNeck);
  attachPart(horseNeck, geometryCache.getOrCreate('knight.horseNeck', () => new THREE.CylinderGeometry(0.055, 0.06, 0.24, 14)), horseMat, [0, 0.1, 0]);
  const horseHead = makeBone('head', [0, 0.22, 0.05]);
  horseNeck.add(horseHead);
  attachPart(horseHead, roundedBoxGeom(geometryCache, 'knight.horseHead', 0.1, 0.11, 0.18, 0.28), horseMat);

  // 기수 (rider.* 접두)
  const riderHips = makeBone('rider.hips', [0, 0.11, -0.03]);
  horseChest.add(riderHips);
  attachPart(riderHips, roundedBoxGeom(geometryCache, 'knight.riderHips', 0.16, 0.12, 0.13, 0.2), fabric);

  const riderSpine = makeBone('rider.spine', [0, 0.09, 0]);
  riderHips.add(riderSpine);
  const riderChest = makeBone('rider.chest', [0, 0.09, 0]);
  riderSpine.add(riderChest);
  attachPart(riderChest, roundedBoxGeom(geometryCache, 'knight.riderChest', 0.14, 0.18, 0.11, 0.2), metal);

  const riderHead = makeBone('rider.head', [0, 0.13, 0]);
  riderChest.add(riderHead);
  attachPart(riderHead, sphereGeom(geometryCache, 'knight.riderHead', 0.075), fabric);
  attachPart(riderHead, geometryCache.getOrCreate('knight.helmet', () => new THREE.ConeGeometry(0.08, 0.06, 14)), metal, [0, 0.06, 0]);

  const riderShoulderL = buildTwoSegmentLimb(
    'rider.shoulder.L',
    { upper: 'rider.shoulder.L', lower: 'rider.elbow.L', end: 'rider.hand.L' },
    [-0.09, 0.06, 0],
    0.11,
    0.03,
    0.11,
    0.03,
    fabric,
    geometryCache,
    'knight.riderArm.L'
  );
  const riderShoulderR = buildTwoSegmentLimb(
    'rider.shoulder.R',
    { upper: 'rider.shoulder.R', lower: 'rider.elbow.R', end: 'rider.hand.R' },
    [0.09, 0.06, 0],
    0.11,
    0.03,
    0.11,
    0.03,
    fabric,
    geometryCache,
    'knight.riderArm.R'
  );
  riderChest.add(riderShoulderL.upper, riderShoulderR.upper);

  attachPart(riderShoulderL.end, geometryCache.getOrCreate('knight.shield', () => new THREE.CylinderGeometry(0.1, 0.1, 0.02, 16)), metal, [0, -0.02, 0.04]);
  attachPart(riderShoulderR.end, geometryCache.getOrCreate('knight.lance', () => new THREE.CylinderGeometry(0.02, 0.02, 0.65, 12)), metal, [0, -0.3, 0]);

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
