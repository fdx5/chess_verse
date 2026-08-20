import * as THREE from 'three';
import type { Color } from '@battle-chess/chess-core';
import type { GeometryCache } from '../../engine/GeometryCache';
import type { MaterialCache } from '../../engine/MaterialCache';
import type { UnitInstance, QualityTier } from '../UnitProvider';
import { makeBone, attachPart, buildArm, buildLeg, collectBones, getUnitPalette, latheGeom, roundedBoxGeom, sphereGeom } from './PartKit';

/**
 * D4 §2.5 Queen — Battle Queen. H=1.30.
 * 사용자 요청 §기물별 다채로운 리디자인 — 파스텔 로즈 핑크(백)/딥 버건디 크림슨(흑) 드레스, 피부톤, 로열 골드 왕관.
 */
export function buildQueen(color: Color, _quality: QualityTier, geometryCache: GeometryCache, materialCache: MaterialCache): UnitInstance {
  const palette = getUnitPalette('q', color, materialCache);
  const legLen = 0.16 + 0.16;

  const root = new THREE.Group();
  root.name = 'root';

  const hips = makeBone('hips', [0, legLen, 0]);
  root.add(hips);

  const thighL = buildLeg('L', [-0.06, legLen, 0], 0.16, 0.045, 0.16, 0.045, palette.subtle, geometryCache, 'queen');
  const thighR = buildLeg('R', [0.06, legLen, 0], 0.16, 0.045, 0.16, 0.045, palette.subtle, geometryCache, 'queen');
  root.add(thighL.upper, thighR.upper);

  // 여왕의 드레스 (로즈 핑크 / 딥 버건디)
  attachPart(
    hips,
    latheGeom(geometryCache, 'queen.dress', [
      [0.25, 0.0],
      [0.22, 0.1],
      [0.16, 0.24],
      [0.12, 0.36],
      [0.11, 0.44],
      [0.13, 0.49],
    ]),
    palette.primary
  );

  const spine = makeBone('spine', [0, 0.41, 0]);
  hips.add(spine);
  const chest = makeBone('chest', [0, 0.09, 0]);
  spine.add(chest);
  // 코르셋/흉갑 (골드 트림)
  attachPart(chest, roundedBoxGeom(geometryCache, 'queen.chest', 0.18, 0.2, 0.12, 0.22), palette.accent);

  const head = makeBone('head', [0, 0.14, 0]);
  chest.add(head);
  // 피부톤 얼굴
  attachPart(head, sphereGeom(geometryCache, 'queen.head', 0.085), palette.skin);
  // 5포인트 황금 왕관
  attachPart(head, geometryCache.getOrCreate('queen.crown', () => new THREE.ConeGeometry(0.08, 0.08, 5)), palette.accent, [0, 0.09, 0]);

  const shoulderL = buildArm('L', [-0.11, 0.05, 0], 0.13, 0.032, 0.13, 0.032, palette.primary, geometryCache, 'queen');
  const shoulderR = buildArm('R', [0.11, 0.05, 0], 0.13, 0.032, 0.13, 0.032, palette.primary, geometryCache, 'queen');
  chest.add(shoulderL.upper, shoulderR.upper);

  const swordMat = materialCache.getOrCreate(
    `queen.sword.${color}`,
    () => new THREE.MeshPhysicalMaterial({ color: '#B8E8FF', emissive: '#B8E8FF', emissiveIntensity: 0.6, roughness: 0.1, clearcoat: 0.5 })
  );
  attachPart(shoulderR.end, roundedBoxGeom(geometryCache, 'queen.sword', 0.02, 0.24, 0.02, 0.3), swordMat, [0, -0.12, 0]);

  const capeRoot = makeBone('cape.root', [0, -0.02, -0.11]);
  const capeMid = makeBone('cape.mid', [0, -0.19, -0.02]);
  const capeEnd = makeBone('cape.end', [0, -0.19, -0.01]);
  chest.add(capeRoot);
  capeRoot.add(capeMid);
  capeMid.add(capeEnd);
  attachPart(capeRoot, roundedBoxGeom(geometryCache, 'queen.cape.seg', 0.24, 0.21, 0.03, 0.15), palette.primary, [0, -0.1, 0]);
  attachPart(capeMid, roundedBoxGeom(geometryCache, 'queen.cape.seg', 0.24, 0.21, 0.03, 0.15), palette.primary, [0, -0.1, 0]);

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
