import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Color } from '@battle-chess/chess-core';
import type { GeometryCache } from '../../engine/GeometryCache';
import type { MaterialCache } from '../../engine/MaterialCache';
import { makeBone, attachPart, collectBones } from '../BoneRig';

/**
 * 공통 파츠 빌더 헬퍼 (D9 §Sprint 3 리스크 완화: "공통 파츠 빌더 헬퍼를 먼저 만들어 6종에 재사용").
 * D9 산출 파일 목록에는 없는 보조 파일이며 `docs/DEVIATIONS.md`에 사유를 기록했다.
 *
 * 시각 품질 개선(사용자 피드백, Sprint 3 완료 직후): 원기둥 세그먼트를 8→16으로 올려 각짐을 완화하고,
 * 주요 몸통/머리 박스는 `RoundedBoxGeometry`로 모서리를 베벨해 "고급 디오라마" 톤(01 프롬프트 §1.3)에 맞춘다.
 */

export { makeBone, attachPart, collectBones };

const LIMB_SEGMENTS = 16;
const SPHERE_WIDTH_SEGMENTS = 20;
const SPHERE_HEIGHT_SEGMENTS = 16;
const BOX_BEVEL_SEGMENTS = 3;

export function cylinderGeom(cache: GeometryCache, key: string, radius: number, height: number, segments = LIMB_SEGMENTS): THREE.BufferGeometry {
  return cache.getOrCreate(key, () => new THREE.CylinderGeometry(radius, radius, height, segments));
}

/** 모서리가 둥근 박스 — 몸통/머리 등 실루엣에 크게 기여하는 파츠에 사용(작은 소품은 각진 BoxGeometry 유지). */
export function roundedBoxGeom(cache: GeometryCache, key: string, width: number, height: number, depth: number, bevelRatio = 0.16): THREE.BufferGeometry {
  return cache.getOrCreate(key, () => {
    const radius = Math.min(width, height, depth) * bevelRatio;
    return new RoundedBoxGeometry(width, height, depth, BOX_BEVEL_SEGMENTS, radius);
  });
}

export function sphereGeom(cache: GeometryCache, key: string, radius: number): THREE.BufferGeometry {
  return cache.getOrCreate(key, () => new THREE.SphereGeometry(radius, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS));
}

const LATHE_RADIAL_SEGMENTS = 32;

/** 회전체 실루엣(로브/드레스/토르소) — `points`는 [반경, 높이] 쌍의 배열(낮은 y부터 순서대로). */
export function latheGeom(cache: GeometryCache, key: string, points: readonly [number, number][]): THREE.BufferGeometry {
  return cache.getOrCreate(key, () => {
    const vec2Points = points.map(([r, y]) => new THREE.Vector2(r, y));
    return new THREE.LatheGeometry(vec2Points, LATHE_RADIAL_SEGMENTS);
  });
}

/** 관절 사이 실린더를 살짝 길게(overlap) + 위/아래 반경을 다르게(taper) 만들어 이음매를 숨기고 각짐을 줄인다. */
const JOINT_OVERLAP = 0.3;
export function taperedLimbGeom(cache: GeometryCache, key: string, jointRadius: number, farRadius: number, boneLength: number, segments = LIMB_SEGMENTS): THREE.BufferGeometry {
  return cache.getOrCreate(key, () => new THREE.CylinderGeometry(jointRadius, farRadius, boneLength * (1 + JOINT_OVERLAP), segments));
}

export interface TwoSegmentLimb {
  upper: THREE.Bone;
  lower: THREE.Bone;
  end: THREE.Bone;
}

/**
 * shoulder→elbow→hand 또는 thigh→knee→foot 형태의 2세그먼트 사지를 만든다.
 * 각 상위 본 원점이 관절 피벗, 실린더 메시는 본에서 자식 본 방향(-Y)으로 절반 길이만큼 오프셋되어
 * 관절 사이를 채운다. 반환된 본 3개를 부모(chest/hips)에 직접 add() 하는 것은 호출부 책임.
 */
export function buildTwoSegmentLimb(
  namePrefix: string, // 예: 'shoulder.L' → 'elbow.L' / 'hand.L' 자동 파생, 예: 'thigh.R'
  jointNames: { upper: string; lower: string; end: string },
  originPos: [number, number, number],
  upperLen: number,
  upperR: number,
  lowerLen: number,
  lowerR: number,
  material: THREE.Material,
  geometryCache: GeometryCache,
  geomKeyPrefix: string
): TwoSegmentLimb {
  void namePrefix;
  const upper = makeBone(jointNames.upper, originPos);
  const lower = makeBone(jointNames.lower, [0, -upperLen, 0]);
  const end = makeBone(jointNames.end, [0, -lowerLen, 0]);
  upper.add(lower);
  lower.add(end);

  // 관절 쪽은 두껍게(jointRadius), 먼 쪽은 가늘게(farRadius) 테이퍼 + 길이를 살짝 늘려(JOINT_OVERLAP)
  // 상위 파츠(몸통)와 하위 파츠(다음 세그먼트) 속으로 파고들게 해 이음매 틈을 숨긴다.
  const upperGeom = taperedLimbGeom(geometryCache, `${geomKeyPrefix}.upper`, upperR * 1.12, upperR * 0.88, upperLen);
  const lowerGeom = taperedLimbGeom(geometryCache, `${geomKeyPrefix}.lower`, lowerR * 1.12, lowerR * 0.88, lowerLen);
  attachPart(upper, upperGeom, material, [0, -upperLen / 2, 0]);
  attachPart(lower, lowerGeom, material, [0, -lowerLen / 2, 0]);

  return { upper, lower, end };
}

export function buildArm(
  side: 'L' | 'R',
  originPos: [number, number, number],
  upperLen: number,
  upperR: number,
  lowerLen: number,
  lowerR: number,
  material: THREE.Material,
  geometryCache: GeometryCache,
  geomKeyPrefix: string
): TwoSegmentLimb {
  return buildTwoSegmentLimb(
    `shoulder.${side}`,
    { upper: `shoulder.${side}`, lower: `elbow.${side}`, end: `hand.${side}` },
    originPos,
    upperLen,
    upperR,
    lowerLen,
    lowerR,
    material,
    geometryCache,
    `${geomKeyPrefix}.arm`
  );
}

export function buildLeg(
  side: 'L' | 'R',
  originPos: [number, number, number],
  upperLen: number,
  upperR: number,
  lowerLen: number,
  lowerR: number,
  material: THREE.Material,
  geometryCache: GeometryCache,
  geomKeyPrefix: string
): TwoSegmentLimb {
  return buildTwoSegmentLimb(
    `thigh.${side}`,
    { upper: `thigh.${side}`, lower: `knee.${side}`, end: `foot.${side}` },
    originPos,
    upperLen,
    upperR,
    lowerLen,
    lowerR,
    material,
    geometryCache,
    `${geomKeyPrefix}.leg`
  );
}

export interface FactionPalette {
  fabric: THREE.MeshPhysicalMaterial;
  metal: THREE.MeshPhysicalMaterial;
}

/**
 * D4 §4.1 진영 팔레트. 품질 개선(사용자 피드백): `MeshStandardMaterial` → `MeshPhysicalMaterial` +
 * clearcoat로 "왁스 먹인 고급 보드게임 말" 같은 광택을 낸다(D4 "고급스러운 디오라마" 톤 강화).
 */
export function getFactionMaterials(color: Color, materialCache: MaterialCache): FactionPalette {
  const fabric = materialCache.getOrCreate(
    `faction.${color}.fabric`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: color === 'w' ? '#F2E8D5' : '#14141A',
        roughness: color === 'w' ? 0.55 : 0.5,
        metalness: 0.0,
        clearcoat: 0.35,
        clearcoatRoughness: 0.25,
        emissive: new THREE.Color(color === 'w' ? '#D4AF37' : '#4A6FA5'),
        emissiveIntensity: color === 'w' ? 0.04 : 0.05,
      })
  ) as THREE.MeshPhysicalMaterial;
  const metal = materialCache.getOrCreate(
    `faction.${color}.metal`,
    () =>
      new THREE.MeshPhysicalMaterial({
        color: color === 'w' ? '#D4AF37' : '#C8CDD3',
        roughness: color === 'w' ? 0.25 : 0.18,
        metalness: color === 'w' ? 0.9 : 0.95,
        clearcoat: 0.6,
        clearcoatRoughness: 0.12,
        emissive: new THREE.Color(color === 'w' ? '#D4AF37' : '#4A6FA5'),
        emissiveIntensity: color === 'w' ? 0.04 : 0.05,
      })
  ) as THREE.MeshPhysicalMaterial;
  return { fabric, metal };
}
