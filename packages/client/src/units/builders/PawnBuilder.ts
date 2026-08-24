import * as THREE from 'three';
import type { Color } from '@battle-chess/chess-core';
import type { GeometryCache } from '../../engine/GeometryCache';
import type { MaterialCache } from '../../engine/MaterialCache';
import type { UnitInstance, QualityTier } from '../UnitProvider';
import { makeBone, attachPart, buildArm, buildLeg, collectBones, cylinderGeom, getUnitPalette, latheGeom, sphereGeom } from './PartKit';

/**
 * D4 §2.1 Pawn — Footsoldier. H=0.70, W=0.34, R=0.17.
 * 사용자 요청 §기물별 다채로운 리디자인 — 피부톤, 파스텔(백)/딥(흑) 의상, 골드 악센트, 강철 창 적용.
 */
export function buildPawn(color: Color, _quality: QualityTier, geometryCache: GeometryCache, materialCache: MaterialCache): UnitInstance {
  const palette = getUnitPalette('p', color, materialCache);
  const legLen = 0.16 + 0.16;

  const root = new THREE.Group();
  root.name = 'root';

  const hips = makeBone('hips', [0, legLen, 0]);
  root.add(hips);

  // Keep both legs, ankles and feet on the same jade body material. Using the
  // pale secondary material here made the lower legs look detached on white pawns.
  const thighL = buildLeg('L', [-0.06, legLen, 0], 0.16, 0.045, 0.16, 0.045, palette.primary, geometryCache, 'pawn');
  const thighR = buildLeg('R', [0.06, legLen, 0], 0.16, 0.045, 0.16, 0.045, palette.primary, geometryCache, 'pawn');
  root.add(thighL.upper, thighR.upper);

  // 하체 의상 (파스텔 민트 / 딥 차콜)
  attachPart(
    hips,
    latheGeom(geometryCache, 'pawn.lowerTorso', [
      [0.14, -0.02],
      [0.13, 0.0],
      [0.1, 0.1],
      [0.09, 0.2],
      [0.1, 0.29],
    ]),
    palette.primary
  );

  const spine = makeBone('spine', [0, 0.2, 0]);
  hips.add(spine);

  const chest = makeBone('chest', [0, 0.12, 0]);
  spine.add(chest);
  // 상체 갑옷/조끼 (골드/실버 악센트)
  attachPart(
    chest,
    latheGeom(geometryCache, 'pawn.upperTorso', [
      [0.11, -0.09],
      [0.1, -0.04],
      [0.1, 0.0],
      [0.075, 0.07],
    ]),
    palette.accent
  );

  const head = makeBone('head', [0, 0.13, 0]);
  chest.add(head);
  // 이목구비가 살아나는 피부톤 얼굴
  attachPart(head, sphereGeom(geometryCache, 'pawn.head', 0.09), palette.skin);

  const shoulderL = buildArm('L', [-0.11, 0.05, 0], 0.14, 0.035, 0.14, 0.035, palette.primary, geometryCache, 'pawn');
  const shoulderR = buildArm('R', [0.11, 0.05, 0], 0.14, 0.035, 0.14, 0.035, palette.primary, geometryCache, 'pawn');
  chest.add(shoulderL.upper, shoulderR.upper);

  // 기다란 창 — 오른손으로 손잡이 부근을 쥔 채 자루와 날카로운 창끝
  attachPart(shoulderR.end, cylinderGeom(geometryCache, 'pawn.spear.shaft', 0.012, 0.62), palette.subtle, [0, 0.12, 0]);
  attachPart(shoulderR.end, geometryCache.getOrCreate('pawn.spear.tip', () => new THREE.ConeGeometry(0.028, 0.1, 12)), palette.metal, [0, 0.48, 0]);

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
