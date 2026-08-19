import * as THREE from 'three';
import type { Color } from '@battle-chess/chess-core';
import type { GeometryCache } from '../../engine/GeometryCache';
import type { MaterialCache } from '../../engine/MaterialCache';
import type { UnitInstance, QualityTier } from '../UnitProvider';
import { makeBone, attachPart, buildArm, collectBones, getFactionMaterials, latheGeom, roundedBoxGeom, sphereGeom } from './PartKit';

/**
 * D4 §2.2 Bishop — Cleric. H=1.00. 다리 본 없음(§3 예외) — hips가 지면 위 0.15 부양.
 * 사용자 요청으로 "너무 단순하다, 성직자 느낌이 나게, 지팡이를 들고 있게"로 전면 보강
 * (`docs/DEVIATIONS.md` [기물 리디자인] 참조): 뾰족한 두건(미트라풍)+이마 십자 장식,
 * 어깨 케이프, 스톨(진영색 띠), 허리 신치(금속 링)를 추가하고, 기존 오브 지팡이를
 * 목자의 지팡이(크로지어) 형태 — 갈고리 손잡이 + 그 안에 안긴 성물 오브 — 로 교체했다.
 */
export function buildBishop(color: Color, _quality: QualityTier, geometryCache: GeometryCache, materialCache: MaterialCache): UnitInstance {
  const { fabric, metal } = getFactionMaterials(color, materialCache);
  const staffOrbColor = color === 'w' ? '#7FD8FF' : '#B47FFF';
  const stoleMat = materialCache.getOrCreate(
    `bishop.stole.${color}`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: color === 'w' ? '#B3352E' : '#D9C43A',
        roughness: 0.35,
        metalness: 0.1,
        clearcoat: 0.4,
        clearcoatRoughness: 0.2,
      })
  );

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

  // 신치(허리 금속 링) — 로브 위에 두른 벨트, D4 §4.1 진영 금속색 재사용.
  attachPart(
    spine,
    geometryCache.getOrCreate('bishop.cincture', () => new THREE.TorusGeometry(0.155, 0.014, 8, 20).rotateX(Math.PI / 2)),
    metal,
    [0, 0.24, 0]
  );

  // 스톨(성직자 띠) — 목에서 늘어뜨린 좌우 두 가닥, 나이트 십자와 같은 진영 강조색 사용.
  attachPart(spine, roundedBoxGeom(geometryCache, 'bishop.stole', 0.035, 0.32, 0.012, 0.25), stoleMat, [-0.045, 0.32, 0.135]);
  attachPart(spine, roundedBoxGeom(geometryCache, 'bishop.stole', 0.035, 0.32, 0.012, 0.25), stoleMat, [0.045, 0.32, 0.135]);

  const chest = makeBone('chest', [0, 0.42, 0]);
  spine.add(chest);

  // 어깨 케이프 — 로브 위로 넓게 펼쳐졌다 목 쪽으로 좁아지는 실루엣.
  attachPart(
    chest,
    latheGeom(geometryCache, 'bishop.cape', [
      [0.13, -0.06],
      [0.18, -0.01],
      [0.16, 0.04],
      [0.11, 0.08],
    ]),
    fabric
  );

  const head = makeBone('head', [0, 0.12, 0]);
  chest.add(head);
  attachPart(head, sphereGeom(geometryCache, 'bishop.head', 0.08), fabric);
  // 미트라풍 뾰족 두건 — 기존 단순 콘 대신 연속 실루엣으로 성직자 느낌을 강화.
  attachPart(
    head,
    latheGeom(geometryCache, 'bishop.hood', [
      [0.095, 0.0],
      [0.088, 0.05],
      [0.06, 0.11],
      [0.025, 0.17],
      [0.0, 0.21],
    ]),
    fabric,
    [0, 0.03, 0]
  );
  // 두건 이마에 작은 금속 십자 장식.
  attachPart(head, roundedBoxGeom(geometryCache, 'bishop.hoodCross.v', 0.014, 0.05, 0.008, 0.3), metal, [0, 0.1, 0.08]);
  attachPart(head, roundedBoxGeom(geometryCache, 'bishop.hoodCross.h', 0.032, 0.014, 0.008, 0.3), metal, [0, 0.115, 0.08]);

  const shoulderL = buildArm('L', [-0.1, 0.03, 0], 0.12, 0.03, 0.12, 0.03, fabric, geometryCache, 'bishop');
  const shoulderR = buildArm('R', [0.1, 0.03, 0], 0.12, 0.03, 0.12, 0.03, fabric, geometryCache, 'bishop');
  chest.add(shoulderL.upper, shoulderR.upper);

  // 왼손 — 목자의 지팡이(크로지어): 자루 + 갈고리 손잡이 + 손잡이 안에 안긴 성물 오브.
  const staff = attachPart(shoulderL.end, geometryCache.getOrCreate('bishop.staff', () => new THREE.CylinderGeometry(0.015, 0.015, 0.55, 12)), metal, [0, -0.2, 0]);
  const hookRadius = 0.06;
  const hook = new THREE.Mesh(
    geometryCache.getOrCreate('bishop.crook', () => new THREE.TorusGeometry(hookRadius, 0.013, 8, 16, Math.PI * 1.4)),
    metal
  );
  hook.position.set(-hookRadius, 0.275, 0);
  staff.add(hook);
  const orbMat = materialCache.getOrCreate(
    `bishop.orb.${color}`,
    () => new THREE.MeshPhysicalMaterial({ color: staffOrbColor, emissive: staffOrbColor, emissiveIntensity: 0.9, roughness: 0.15, transmission: 0.4, thickness: 0.05 })
  );
  const orb = new THREE.Mesh(geometryCache.getOrCreate('bishop.orb', () => new THREE.IcosahedronGeometry(0.045, 1)), orbMat);
  orb.position.set(-0.075, 0.335, 0.01);
  orb.name = 'bishop.orbMesh'; // CombatDirector가 전투 연출 중 이 오브를 찾아 밝기를 채널링 연출로 잠시 올릴 때 사용.
  staff.add(orb);

  // 오른손 — 성서(작은 장정본), 스톨과 같은 강조색 표지.
  attachPart(shoulderR.end, roundedBoxGeom(geometryCache, 'bishop.book', 0.055, 0.07, 0.02, 0.25), stoleMat, [0, -0.02, 0.02]);

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
