import * as THREE from 'three';
import type { Color } from '@battle-chess/chess-core';
import type { GeometryCache } from '../../engine/GeometryCache';
import type { MaterialCache } from '../../engine/MaterialCache';
import type { UnitInstance, QualityTier } from '../UnitProvider';
import { makeBone, attachPart, buildArm, buildLeg, collectBones, getFactionMaterials, latheGeom, roundedBoxGeom, sphereGeom } from './PartKit';

/**
 * D4 §2.3 Knight — 사용자 요청으로 "말을 탄 기수" 대신 **투구를 쓴 장신의 도보 기사**로 전면 교체
 * (`docs/DEVIATIONS.md` [기물 리디자인] 참조 — D4 원안의 이중 리그/비대칭 타원 풋프린트를 포기).
 * H=1.10(D4 표 그대로) 유지. 오른손에 검, 왼손에 소형 방패. 가슴·등에 십자 문장 —
 * 백진영은 붉은 십자, 흑진영은 노란 십자(진영 갑옷 색과 독립적으로 고정).
 */
export function buildKnight(color: Color, _quality: QualityTier, geometryCache: GeometryCache, materialCache: MaterialCache): UnitInstance {
  const { fabric, metal } = getFactionMaterials(color, materialCache);
  const crossMat = materialCache.getOrCreate(
    `knight.cross.${color}`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: color === 'w' ? '#B3352E' : '#D9C43A',
        roughness: 0.35,
        metalness: 0.1,
        clearcoat: 0.4,
        clearcoatRoughness: 0.2,
      })
  );

  const legLen = 0.16 * 2;
  const root = new THREE.Group();
  root.name = 'root';

  const hips = makeBone('hips', [0, legLen, 0]);
  root.add(hips);

  const thighL = buildLeg('L', [-0.07, legLen, 0], 0.17, 0.05, 0.17, 0.05, fabric, geometryCache, 'knight');
  const thighR = buildLeg('R', [0.07, legLen, 0], 0.17, 0.05, 0.17, 0.05, fabric, geometryCache, 'knight');
  root.add(thighL.upper, thighR.upper);

  attachPart(
    hips,
    latheGeom(geometryCache, 'knight.tassets', [
      [0.18, -0.02],
      [0.17, 0.03],
      [0.14, 0.1],
      [0.13, 0.17],
    ]),
    fabric
  );

  const spine = makeBone('spine', [0, 0.2, 0]);
  hips.add(spine);
  // 허리 이음새 — tassets 상단(hips 기준 y=0.17)과 chest 하단(hips 기준 y≈0.225) 사이에 파츠가 없어
  // 몸통에 구멍이 뚫린 것처럼 보이던 문제 수정(사용자 육안 확인으로 발견). spine 본에 연결용 웨이스트 랩을
  // 붙여 양쪽으로 겹치게(overlap) 해 이음매를 가린다.
  attachPart(
    spine,
    latheGeom(geometryCache, 'knight.waist', [
      [0.145, -0.06],
      [0.135, -0.02],
      [0.12, 0.04],
      [0.115, 0.1],
    ]),
    fabric
  );
  const chest = makeBone('chest', [0, 0.15, 0]);
  spine.add(chest);
  attachPart(chest, roundedBoxGeom(geometryCache, 'knight.chest', 0.23, 0.25, 0.16, 0.16), metal);

  // 가슴·등 십자 문장(세로/가로 막대 각 2개) — 진영별 고정색.
  const crossZ = 0.081;
  attachPart(chest, roundedBoxGeom(geometryCache, 'knight.cross.v', 0.03, 0.17, 0.012, 0.3), crossMat, [0, 0.01, crossZ]);
  attachPart(chest, roundedBoxGeom(geometryCache, 'knight.cross.h', 0.12, 0.03, 0.012, 0.3), crossMat, [0, 0.03, crossZ]);
  attachPart(chest, roundedBoxGeom(geometryCache, 'knight.cross.v', 0.03, 0.17, 0.012, 0.3), crossMat, [0, 0.01, -crossZ]);
  attachPart(chest, roundedBoxGeom(geometryCache, 'knight.cross.h', 0.12, 0.03, 0.012, 0.3), crossMat, [0, 0.03, -crossZ]);

  const head = makeBone('head', [0, 0.16, 0]);
  chest.add(head);
  attachPart(head, sphereGeom(geometryCache, 'knight.headBase', 0.078), fabric);
  // 얼굴 전체를 감싸는 대형 투구 — 원기둥 몸통 + 반구형 정수리. 몸통(fabric)과 같은 색으로 통일하고
  // 이마 밴드만 금속 트림으로 남겨 흉갑(chest)만 금색이 도드라지게 한다(사용자 요청).
  attachPart(head, geometryCache.getOrCreate('knight.helmet', () => new THREE.CylinderGeometry(0.092, 0.098, 0.15, 16)), fabric, [0, 0.02, 0]);
  attachPart(
    head,
    geometryCache.getOrCreate('knight.helmetTop', () => new THREE.SphereGeometry(0.092, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
    fabric,
    [0, 0.095, 0]
  );
  attachPart(head, geometryCache.getOrCreate('knight.helmetBand', () => new THREE.CylinderGeometry(0.096, 0.101, 0.03, 16)), metal, [0, -0.03, 0]);
  attachPart(head, roundedBoxGeom(geometryCache, 'knight.visorSlit', 0.14, 0.018, 0.02, 0.3), metal, [0, 0.02, 0.09]);

  const shoulderL = buildArm('L', [-0.14, 0.09, 0], 0.15, 0.042, 0.15, 0.042, fabric, geometryCache, 'knight');
  const shoulderR = buildArm('R', [0.14, 0.09, 0], 0.15, 0.042, 0.15, 0.042, fabric, geometryCache, 'knight');
  chest.add(shoulderL.upper, shoulderR.upper);

  // 오른손 — 검(날 + 코등이).
  attachPart(shoulderR.end, roundedBoxGeom(geometryCache, 'knight.sword.blade', 0.032, 0.34, 0.016, 0.15), metal, [0, -0.17, 0]);
  attachPart(shoulderR.end, roundedBoxGeom(geometryCache, 'knight.sword.guard', 0.1, 0.022, 0.022, 0.2), metal, [0, -0.02, 0]);
  // 왼손 — 소형 방패.
  attachPart(shoulderL.end, geometryCache.getOrCreate('knight.shield', () => new THREE.CylinderGeometry(0.095, 0.095, 0.02, 16)), fabric, [0, -0.02, 0.04]);

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
