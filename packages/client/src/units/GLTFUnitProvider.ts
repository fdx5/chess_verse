import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Color, PieceType } from '@battle-chess/chess-core';
import type { UnitInstance, UnitProvider, QualityTier } from './UnitProvider';
import { collectBones } from './BoneRig';
import { getFactionMaterials } from './builders/PartKit';
import { MaterialCache } from '../engine/MaterialCache';

function templateKey(type: PieceType, color: Color): string {
  return `${type}.${color}`;
}

/**
 * glTF 노드 이름에 '.'가 있으면 GLTFLoader가 로드 시 `PropertyBinding.sanitizeNodeName()`으로
 * 제거해버린다(예: 'thigh.L' → 'thighL') — 애니메이션 트랙 경로 파싱(`node.property`)과 충돌하지
 * 않게 하려는 three.js 자체 규칙이라 우리가 우회할 방법이 없다. 그래서 조각 애셋의 본은 dot 없이
 * 구워두고(예: `thighL`), 로드 직후 여기서 게임 전역 컨벤션(dot 포함, `PartKit`/`UnitBoard`/
 * `CombatDirector`가 참조하는 이름)으로 되돌린다. 새 조각 기물을 추가할 때 본을 더 리깅하면 이 표에도
 * 매칭 항목을 추가한다.
 */
const SANITIZED_BONE_NAME_MAP: Record<string, string> = {
  thighL: 'thigh.L',
  thighR: 'thigh.R',
  kneeL: 'knee.L',
  kneeR: 'knee.R',
  shoulderL: 'shoulder.L',
  shoulderR: 'shoulder.R',
  elbowL: 'elbow.L',
  elbowR: 'elbow.R',
  handL: 'hand.L',
  handR: 'hand.R',
};

function restoreBoneNamingConvention(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Bone)) return;
    const restored = SANITIZED_BONE_NAME_MAP[obj.name];
    if (restored !== undefined) obj.name = restored;
  });
}

/**
 * 조각된(sculpted) 단일 메시 glTF 애셋(리깅 없음, 무채색 cavity 텍스처 1장)에 진영 색을 입힌다.
 * 절차적 기물(PartKit.getFactionMaterials)과 같은 팔레트/광택을 재사용해 두 파이프라인이 시각적으로
 * 어울리게 하고, 원본 텍스처의 맵만 유지한 채 공유 MaterialCache 인스턴스는 절대 직접 변경하지 않는다
 * (진영별로 새 MeshPhysicalMaterial을 만들어 텍스처만 얹는다).
 *
 * 사용자 요청 §포인트 컬러 — 기물 실루엣이 서로 비슷해 보인다는 피드백으로, 빌드 스크립트가 특정
 * 영역(가슴판/왕관/로브 등)을 별도 프리미티브로 잘라 glTF node extras에 `accentColor`(및 선택적
 * `accentMetal`)를 구워둔 경우, 그 부분은 진영색 대신 고정 포인트 컬러를 쓴다(진영 무관하게 항상
 * 같은 색 — "골드 왕관"처럼 정체성을 나타내는 디테일이라 진영 틴트로 덮이면 안 된다).
 */
function applyFactionTint(root: THREE.Object3D, color: Color, materialCache: MaterialCache): void {
  const { fabric, metal } = getFactionMaterials(color, materialCache);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const source = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const map = source instanceof THREE.MeshStandardMaterial ? source.map : null;
    const accentColorHex = obj.userData['accentColor'] as string | undefined;
    const accentMetal = obj.userData['accentMetal'] === true;
    const base = accentMetal ? metal : fabric;
    obj.material = new THREE.MeshPhysicalMaterial({
      map,
      color: accentColorHex !== undefined ? new THREE.Color(accentColorHex) : fabric.color.clone(),
      roughness: base.roughness,
      metalness: accentColorHex !== undefined ? (accentMetal ? base.metalness : 0.05) : base.metalness,
      clearcoat: base.clearcoat,
      clearcoatRoughness: base.clearcoatRoughness,
      emissive: base.emissive.clone(),
      emissiveIntensity: base.emissiveIntensity,
    });
  });
}

/**
 * D4 §7 — 절차적 생성기와 동일한 `UnitProvider` 인터페이스를 구현하는 GLTF 어댑터.
 * `UnitProvider.create()`는 동기이므로, GLTF 로딩(비동기)은 `preload()`로 미리 끝내둔다.
 * 프리로드되지 않은 (type,color) 조합에 대한 `create()` 호출은 명시적으로 throw한다(무음 폴백 없음).
 *
 * 원본 glTF는 색 구분 없는 중립(무채색) 조각 애셋 1개이므로, 같은 url을 두 진영 모두에 preload해도
 * 실제 로드는 url 기준으로 1회만 일어난다 — 진영별 인스턴스는 `create()`에서 클론 + 틴트로 만든다.
 */
export class GLTFUnitProvider implements UnitProvider {
  private readonly loader = new GLTFLoader();
  private readonly materialCache = new MaterialCache();
  private readonly rawScenesByUrl = new Map<string, THREE.Object3D>();
  private readonly loadingByUrl = new Map<string, Promise<THREE.Object3D>>();
  private readonly urlByKey = new Map<string, string>();

  async preload(type: PieceType, color: Color, url: string): Promise<void> {
    let pending = this.loadingByUrl.get(url);
    if (pending === undefined) {
      pending = this.loader.loadAsync(url).then((gltf) => {
        this.rawScenesByUrl.set(url, gltf.scene);
        return gltf.scene;
      });
      this.loadingByUrl.set(url, pending);
    }
    await pending;
    this.urlByKey.set(templateKey(type, color), url);
  }

  isPreloaded(type: PieceType, color: Color): boolean {
    return this.urlByKey.has(templateKey(type, color));
  }

  create(type: PieceType, color: Color, _quality: QualityTier): UnitInstance {
    const url = this.urlByKey.get(templateKey(type, color));
    if (url === undefined) {
      throw new Error(`GLTFUnitProvider: ${templateKey(type, color)} not preloaded — call preload() first`);
    }
    const template = this.rawScenesByUrl.get(url);
    if (template === undefined) {
      throw new Error(`GLTFUnitProvider: ${url} not loaded yet — preload() must resolve before create()`);
    }
    const root = cloneSkeleton(template) as THREE.Object3D;
    root.name = 'root';
    restoreBoneNamingConvention(root);
    applyFactionTint(root, color, this.materialCache);

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

  dispose(): void {
    this.materialCache.dispose();
  }
}
