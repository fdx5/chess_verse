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

export interface UnitVisualTheme {
  primary: string;         // 메인 의상/몸통 기본 색상 (백: 밝은 파스텔톤, 흑: 세련된 딥톤)
  accent: string;          // 포인트 장식/트림/금속/보석 색상
  pedestal: string;        // 발판/베이스 색상 (본체와 대비를 주어 이목구비/실루엣을 돋보이게 함)
  metalness: number;       // 금속성
  roughness: number;       // 표면 거칠기
  clearcoat: number;       // 고급 에나멜/피규어 코팅 광택
  clearcoatRoughness: number;
  emissive: string;        // 앰비언트 글로우 색상
  emissiveIntensity: number;
}

/**
 * 사용자 요청 §기물별 다채로운 리디자인 — 흑백 구분은 확실히 유지하면서,
 * 단조로운 1톤 단색 대신 각 기물(폰, 나이트, 비숍, 룩, 퀸, 킹)의 이목구비와 역할에 맞춘
 * 다채로운 파스텔 톤(백) & 딥 럭셔리 톤(흑) 팔레트를 적용한다.
 */
const UNIT_VISUAL_THEMES: Record<Color, Record<PieceType, UnitVisualTheme>> = {
  w: {
    // 폰 (Pawn): 부드럽고 화사한 파스텔 세이지 민트 (Sage Mint) & 웜 샌드 베이지
    p: {
      primary: '#DDF0E6',
      accent: '#E8D08D',
      pedestal: '#FAF4E8',
      metalness: 0.15,
      roughness: 0.38,
      clearcoat: 0.55,
      clearcoatRoughness: 0.15,
      emissive: '#B8E5D0',
      emissiveIntensity: 0.08,
    },
    // 나이트 (Knight): 기품 있는 파스텔 로열 스카이블루 (Sky Blue) & 샴페인 골드
    n: {
      primary: '#DCE8F6',
      accent: '#E8C568',
      pedestal: '#F5EFE6',
      metalness: 0.45,
      roughness: 0.28,
      clearcoat: 0.7,
      clearcoatRoughness: 0.12,
      emissive: '#AEC8EB',
      emissiveIntensity: 0.09,
    },
    // 비숍 (Bishop): 신비로운 파스텔 라벤더 라일락 (Lavender Lilac) & 아쿠아 마린
    b: {
      primary: '#EADFF5',
      accent: '#98F0DB',
      pedestal: '#FAF6EE',
      metalness: 0.2,
      roughness: 0.35,
      clearcoat: 0.65,
      clearcoatRoughness: 0.14,
      emissive: '#CFAFF5',
      emissiveIntensity: 0.1,
    },
    // 백 룩 (White Rook): 사용자 요청 §흑/백 룩 차별화 — 순백의 화이트 마블 대리석 (White Marble) & 24K 로열 골드
    r: {
      primary: '#FAF6EE',
      accent: '#F5C842',
      pedestal: '#EDE5D8',
      metalness: 0.35,
      roughness: 0.38,
      clearcoat: 0.65,
      clearcoatRoughness: 0.12,
      emissive: '#FFE082',
      emissiveIntensity: 0.15,
    },
    // 퀸 (Queen): 우아하고 화려한 파스텔 로즈 블러시 핑크 (Rose Blush) & 로열 루비 골드
    q: {
      primary: '#F7E0E7',
      accent: '#FFD768',
      pedestal: '#FFF5F8',
      metalness: 0.35,
      roughness: 0.24,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
      emissive: '#F5B0C8',
      emissiveIntensity: 0.12,
    },
    // 킹 (King): 장엄한 파스텔 임페리얼 스카이 퍼플 (Imperial Sky Purple) & 24K 브릴리언트 골드
    k: {
      primary: '#E3E7FA',
      accent: '#FAD25A',
      pedestal: '#F8F9FD',
      metalness: 0.5,
      roughness: 0.22,
      clearcoat: 0.88,
      clearcoatRoughness: 0.08,
      emissive: '#E5C255',
      emissiveIntensity: 0.14,
    },
  },
  b: {
    // 폰 (Pawn): 체스판 타일 위에서도 실루엣이 확연히 도드라지는 메탈릭 쿨 슬레이트 (#4A566A) & 아이스 실버
    p: {
      primary: '#4A566A',
      accent: '#B0C2D8',
      pedestal: '#222A36',
      metalness: 0.45,
      roughness: 0.32,
      clearcoat: 0.7,
      clearcoatRoughness: 0.12,
      emissive: '#5C7498',
      emissiveIntensity: 0.14,
    },
    // 나이트 (Knight): 사용자 요청 §폰과 확실한 차별화 — 딥 블러드 크림슨 아머 (#58141E) & 샤이니 플래티넘 골드
    n: {
      primary: '#58141E',
      accent: '#F59E0B',
      pedestal: '#2A0B10',
      metalness: 0.75,
      roughness: 0.22,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
      emissive: '#831843',
      emissiveIntensity: 0.15,
    },
    // 비숍 (Bishop): 매혹적인 다크 아메시스트 퍼플 (#3C244E) & 네온 바이올렛 글로우
    b: {
      primary: '#3C244E',
      accent: '#D070FF',
      pedestal: '#22142E',
      metalness: 0.3,
      roughness: 0.28,
      clearcoat: 0.75,
      clearcoatRoughness: 0.1,
      emissive: '#A540E8',
      emissiveIntensity: 0.15,
    },
    // 흑 룩 (Black Rook): 사용자 요청 §더 어둡게 톤다운 — 딥 흑요석 다크 건메탈 (#151820) & 딥 사파이어 블루 (#1D6FB8)
    r: {
      primary: '#151820',
      accent: '#1D6FB8',
      pedestal: '#0E1015',
      metalness: 0.6,
      roughness: 0.45,
      clearcoat: 0.5,
      clearcoatRoughness: 0.15,
      emissive: '#1D4ED8',
      emissiveIntensity: 0.08,
    },
    // 퀸 (Queen): 매혹적인 로열 딥 버건디 크림슨 (#52182B) & 러스터 골드
    q: {
      primary: '#52182B',
      accent: '#E8A845',
      pedestal: '#2C0D17',
      metalness: 0.55,
      roughness: 0.2,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
      emissive: '#C02048',
      emissiveIntensity: 0.16,
    },
    // 킹 (King): 사용자 요청 §누런 톤 제거 및 위엄 강화 — 딥 흑요석 나이트 로브 (#161922) & 루미너스 플래티넘 실버/아메시스트 크리스탈 (#E2E8F0)
    k: {
      primary: '#161922',
      accent: '#E2E8F0',
      pedestal: '#0F1218',
      metalness: 0.85,
      roughness: 0.16,
      clearcoat: 0.95,
      clearcoatRoughness: 0.06,
      emissive: '#7C3AED',
      emissiveIntensity: 0.18,
    },
  },
};

/**
 * 조각된(sculpted) glTF 애셋에 유닛별 고유 컬러 팔레트와 다중 쉐이딩을 입힌다.
 * 원본 텍스처(cavity/음영)의 디테일은 유지하면서, 메인 몸통/발판/악센트를 시각적으로 뚜렷이 분리한다.
 */
function applyFactionTint(root: THREE.Object3D, color: Color, _materialCache: MaterialCache, type: PieceType = 'p'): void {
  const theme = UNIT_VISUAL_THEMES[color][type];

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const source = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const map = source instanceof THREE.MeshStandardMaterial ? source.map : null;

    const accentColorHex = obj.userData['accentColor'] as string | undefined;
    const accentMetal = obj.userData['accentMetal'] === true;
    const isPedestal = obj.name === 'pedestal' || obj.name.toLowerCase().includes('pedestal');
    
    // 사용자 요청 §기사 가슴 절반 분할 색상 문제 해결:
    // knight.glb의 chestAccent 노드는 가슴 우측(+x)에 편향되어 있어 단독 악센트로 칠해지면 가슴이 반쪽만 황금색으로 갈라져 보인다.
    // 기사(type === 'n')에서는 chestAccent를 본체 메인 갑옷과 동일하게 일체화시켜 좌우가 매끄럽게 연결된 흉갑으로 렌더링한다.
    const isKnightChestAccent = type === 'n' && (obj.name === 'chestAccent' || obj.name.includes('chestAccent'));
    const isAccent = !isKnightChestAccent && (accentMetal || accentColorHex !== undefined);

    let targetColor = theme.primary;
    let targetMetalness = theme.metalness;
    let targetRoughness = theme.roughness;
    let targetClearcoat = theme.clearcoat;
    let targetEmissive = new THREE.Color(theme.emissive);
    let targetEmissiveIntensity = theme.emissiveIntensity;

    if (isPedestal) {
      // 발판: 기물 본체와 뚜렷하게 구분되는 베이스 톤 (본체의 이목구비/실루엣을 부각)
      targetColor = theme.pedestal;
      targetMetalness = 0.1;
      targetRoughness = 0.65;
      targetClearcoat = 0.25;
      targetEmissiveIntensity = 0.02;
    } else if (isAccent) {
      // 포인트 장식/왕관/엠블럼/보석: 시선이 집중되는 화려한 포인트 골드/보석
      targetColor = accentColorHex ?? theme.accent;
      targetMetalness = 0.92;
      targetRoughness = 0.18;
      targetClearcoat = 0.95;
      targetEmissive = new THREE.Color(theme.accent);
      targetEmissiveIntensity = 0.22;
    }

    obj.material = new THREE.MeshPhysicalMaterial({
      map,
      color: new THREE.Color(targetColor),
      roughness: targetRoughness,
      metalness: targetMetalness,
      clearcoat: targetClearcoat,
      clearcoatRoughness: theme.clearcoatRoughness,
      emissive: targetEmissive,
      emissiveIntensity: targetEmissiveIntensity,
      specularIntensity: color === 'w' ? 1.15 : 1.25,
      specularColor: color === 'w' ? new THREE.Color('#FFF8E8') : new THREE.Color('#D8E5FF'),
      ior: 1.65,
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
    applyFactionTint(root, color, this.materialCache, type);

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
