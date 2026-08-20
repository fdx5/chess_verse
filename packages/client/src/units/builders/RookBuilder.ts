import * as THREE from 'three';
import type { Color } from '@battle-chess/chess-core';
import type { GeometryCache } from '../../engine/GeometryCache';
import type { MaterialCache } from '../../engine/MaterialCache';
import type { UnitInstance, QualityTier } from '../UnitProvider';
import { makeBone, attachPart, collectBones, cylinderGeom, latheGeom, roundedBoxGeom } from './PartKit';

/**
 * D4 §2.4 Rook — 사용자 요청으로 "Brick Golem"(팔+부유 파편 골렘) 대신
 * **첨성대풍 석조 관측탑**으로 전면 교체(`docs/DEVIATIONS.md` [기물 리디자인] 참조):
 * 아래로 갈수록 넓어지는 병 모양 몸통(둘레를 따라 도는 돌테 장식으로 켜켜이 쌓은 돌 표현),
 * 중턱의 사각 창(출입구), 정상부의 평평한 갓돌 위에 "井"자형 정자석 프레임.
 * 팔/부유 파편 본을 제거해 `idle.ts`의 `rookIdle`도 `chest.rotation`만 남기도록 함께 수정했다.
 */
export function buildRook(color: Color, _quality: QualityTier, geometryCache: GeometryCache, materialCache: MaterialCache): UnitInstance {
  const tint = color === 'w' ? '#E5C075' : '#2570B0';
  // 사용자 요청 §기물별 다채로운 리디자인 — 웜 마블 샌드스톤(백) / 화산 현무암 그라나이트(흑)
  const stoneColor = color === 'w' ? '#EBE2D5' : '#2B2826';
  const stoneRingColor = color === 'w' ? '#E5BF65' : '#48A8F0';
  const stone = materialCache.getOrCreate(
    `rook.stone.${color}`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: stoneColor,
        roughness: 0.65,
        metalness: 0.15,
        clearcoat: 0.35,
        clearcoatRoughness: 0.3,
        emissive: new THREE.Color(tint),
        emissiveIntensity: color === 'w' ? 0.08 : 0.1,
      })
  );
  const stoneRing = materialCache.getOrCreate(
    `rook.stoneRing.${color}`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: stoneRingColor,
        roughness: 0.45,
        metalness: 0.5,
        clearcoat: 0.6,
        clearcoatRoughness: 0.15,
        emissive: new THREE.Color(tint),
        emissiveIntensity: color === 'w' ? 0.15 : 0.2,
      })
  );
  const doorway = materialCache.getOrCreate('rook.doorway', () => new THREE.MeshStandardMaterial({ color: '#1B1712', roughness: 0.95, metalness: 0 }));

  const root = new THREE.Group();
  root.name = 'root';

  const hips = makeBone('hips', [0, 0, 0]);
  root.add(hips);
  // 기단부 — 지면에 닿는 살짝 벌어진 받침돌.
  attachPart(
    hips,
    latheGeom(geometryCache, 'rook.base', [
      [0.3, 0.0],
      [0.36, 0.02],
      [0.34, 0.06],
    ]),
    stone
  );

  const spine = makeBone('spine', [0, 0.04, 0]);
  hips.add(spine);
  // 몸통 — 아래가 볼록하고 위로 갈수록 좁아지는 첨성대 특유의 병 모양 실루엣.
  attachPart(
    spine,
    latheGeom(geometryCache, 'rook.barrel', [
      [0.34, 0.0],
      [0.335, 0.06],
      [0.32, 0.12],
      [0.315, 0.18],
      [0.3, 0.26],
      [0.295, 0.32],
      [0.28, 0.4],
      [0.275, 0.46],
      [0.25, 0.54],
      [0.245, 0.6],
      [0.22, 0.68],
      [0.2, 0.74],
      [0.18, 0.8],
    ]),
    stone
  );
  // 켜켜이 쌓은 돌테 — 몸통 표면을 두르는 얇은 링 4개(색을 살짝 달리해 단(段) 구분을 준다).
  const ringOffsets: [number, number][] = [
    [0.328, 0.15],
    [0.298, 0.35],
    [0.253, 0.55],
    [0.208, 0.7],
  ];
  ringOffsets.forEach(([radius, y]) => {
    attachPart(spine, cylinderGeom(geometryCache, `rook.ring.${radius}`, radius, 0.022, 24), stoneRing, [0, y, 0]);
  });
  // 중턱 사각 창(출입구) — 첨성대 실물의 중간 높이 개구부.
  attachPart(spine, roundedBoxGeom(geometryCache, 'rook.doorway', 0.1, 0.14, 0.04, 0.1), doorway, [0, 0.3, 0.28]);

  const chest = makeBone('chest', [0, 0.8, 0]);
  spine.add(chest);
  // 목 부분 — 몸통 상단에서 갓돌까지 이어지는 짧은 테이퍼(D5-1 idle 회전 피벗).
  attachPart(
    chest,
    latheGeom(geometryCache, 'rook.neck', [
      [0.18, 0.0],
      [0.175, 0.05],
      [0.165, 0.1],
    ]),
    stone
  );

  const head = makeBone('head', [0, 0.1, 0]);
  chest.add(head);
  // 갓돌(평평한 상판).
  attachPart(head, cylinderGeom(geometryCache, 'rook.platform', 0.2, 0.035, 20), stone, [0, 0.0175, 0]);
  // 정자석 — 상판 위 사각으로 맞물린 돌보 4개("井"자형 프레임).
  const beamX = roundedBoxGeom(geometryCache, 'rook.beamX', 0.34, 0.045, 0.045, 0.25);
  const beamZ = roundedBoxGeom(geometryCache, 'rook.beamZ', 0.045, 0.045, 0.34, 0.25);
  attachPart(head, beamX, stoneRing, [0, 0.06, 0.09]);
  attachPart(head, beamX, stoneRing, [0, 0.06, -0.09]);
  attachPart(head, beamZ, stoneRing, [0.09, 0.06, 0]);
  attachPart(head, beamZ, stoneRing, [-0.09, 0.06, 0]);

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
