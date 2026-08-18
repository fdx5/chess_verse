import * as THREE from 'three';
import type { Color } from '@battle-chess/chess-core';
import type { GeometryCache } from '../../engine/GeometryCache';
import type { MaterialCache } from '../../engine/MaterialCache';
import type { UnitInstance, QualityTier } from '../UnitProvider';
import { makeBone, attachPart, buildArm, collectBones, getFactionMaterials, latheGeom, sphereGeom } from './PartKit';

/** D4 §2.2 Bishop — Cleric. H=1.00. 다리 본 없음(§3 예외) — hips가 지면 위 0.15 부양. */
export function buildBishop(color: Color, _quality: QualityTier, geometryCache: GeometryCache, materialCache: MaterialCache): UnitInstance {
  const { fabric, metal } = getFactionMaterials(color, materialCache);
  const staffOrbColor = color === 'w' ? '#7FD8FF' : '#B47FFF';

  const root = new THREE.Group();
  root.name = 'root';

  const hips = makeBone('hips', [0, 0.15, 0]);
  root.add(hips);

  const spine = makeBone('spine', [0, 0, 0]);
  hips.add(spine);
  attachPart(
    spine,
    latheGeom(geometryCache, 'bishop.robe', [
      [0.21, 0.0],
      [0.19, 0.1],
      [0.15, 0.24],
      [0.11, 0.4],
      [0.1, 0.5],
      [0.12, 0.55],
    ]),
    fabric
  );

  const chest = makeBone('chest', [0, 0.42, 0]);
  spine.add(chest);

  const head = makeBone('head', [0, 0.12, 0]);
  chest.add(head);
  attachPart(head, sphereGeom(geometryCache, 'bishop.head', 0.08), fabric);
  attachPart(head, geometryCache.getOrCreate('bishop.hood', () => new THREE.ConeGeometry(0.1, 0.14, 16)), fabric, [0, 0.07, 0]);

  const shoulderL = buildArm('L', [-0.1, 0.03, 0], 0.12, 0.03, 0.12, 0.03, fabric, geometryCache, 'bishop');
  const shoulderR = buildArm('R', [0.1, 0.03, 0], 0.12, 0.03, 0.12, 0.03, fabric, geometryCache, 'bishop');
  chest.add(shoulderL.upper, shoulderR.upper);

  const staff = attachPart(shoulderL.end, geometryCache.getOrCreate('bishop.staff', () => new THREE.CylinderGeometry(0.015, 0.015, 0.55, 12)), metal, [0, -0.2, 0]);
  const orbMat = materialCache.getOrCreate(
    `bishop.orb.${color}`,
    () => new THREE.MeshPhysicalMaterial({ color: staffOrbColor, emissive: staffOrbColor, emissiveIntensity: 0.9, roughness: 0.15, transmission: 0.4, thickness: 0.05 })
  );
  const orb = new THREE.Mesh(geometryCache.getOrCreate('bishop.orb', () => new THREE.IcosahedronGeometry(0.05, 1)), orbMat);
  orb.position.set(0, 0.275, 0);
  staff.add(orb);

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
