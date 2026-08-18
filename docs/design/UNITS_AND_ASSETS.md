# D4. UNITS_AND_ASSETS.md — 절차적 3D 유닛 설계

## 0. 아트 디렉션 — 중세(Medieval) 판타지 톤 고정 (R14, 최상위 제약)

**전체 아트 톤은 중세 판타지로 고정한다.** 01 프롬프트 §1.3의 "고급스러운 보드게임 디오라마" 룩은 스타일(로우폴리+PBR, 사실주의 아님)에 대한 규정이며, **시대·모티프는 이 R14 제약이 상위**다. 두 규정이 충돌하는 것처럼 보이면 항상 R14가 우선한다.

| 축 | 허용 (반드시 이 범위 안에서) | 금지 (예외 없음) |
|---|---|---|
| 유닛 모티프 | 판금/사슬 갑옷, 라운드·카이트 실드, 검·랜스·메이스, 수도복·후드·성직 지팡이, 왕관·홀(笏), 석조 골렘 | 총기·화약·기계 부품, 네온·홀로그램·발광 회로 패턴, SF 바이저·제트·에너지 실드 HUD, 현대 의복 |
| 재질 | 무두질 가죽, 단조 철·황동·은, 마름돌·회벽, 리넨·모직, 촛농·밀랍 | 플라스틱, 크롬 도금 광택, 카본, 형광 도료 |
| 발광 | 촛불/횃불/용광로/신성한 빛 계열의 **따뜻한 저채도 발광**(§4.1 emissiveIntensity ≤ 0.8) | 청록·마젠타 고채도 네온, 스캔라인/글리치, 픽셀 그리드 |
| 환경 | 성채 홀, 얼어붙은 성곽, 화산 폐허(§8.3 3테마) — 전부 중세 건축 어휘 | 우주·미래도시·실험실·현대 실내 |
| UI 장식 | 양피지·인장·금박 테두리 모티프(D7) | 글래스모피즘, 사이버펑크 HUD 프레임 |

**근거:** 12유닛의 실루엣·머티리얼·3테마·D8 BGM이 모두 같은 시대 어휘를 공유해야 "하나의 세계"로 읽힌다. 톤을 유닛별로 자유화하면 절차적 생성 파라미터(팔레트·러프니스·발광)가 유닛마다 제각각이 되어 §4.1의 진영 팔레트 2벌로 12유닛을 커버하는 전략 자체가 무너진다. **기각한 대안:** ① 테마별로 시대감을 바꾸기(Volcanic Ruin을 SF 용광로로) — 3테마가 별개 게임처럼 보이고 유닛 머티리얼을 테마마다 재작성해야 하므로 기각. ② "판타지면 무엇이든" 허용 — 절차 생성 코드에 스타일 가드가 없어져 Sprint 3 이후 유닛 추가 시 톤이 표류하므로 기각.

**연동 지점:** 오디오 측 동일 제약은 D8 §BGM(중세 악기 팔레트 5종 고정), 요약 선언은 D1 Executive Summary에 있다. 세 문서의 R14 기술이 서로 어긋나면 `_CONTRACTS.md` §R14를 정본으로 삼는다.

---

## 개요

유닛 6종 × 진영 2 = 12개. 지오메트리·본 리그·LOD는 진영 무관(공유), **머티리얼만 진영별로 교체**한다. 아래는 종별로 1회씩 명세하고, 진영 델타는 §4에서 별도로 정리한다.

최우선 제약: **톱다운(top-down) 뷰에서 실루엣만으로 즉시 구분 가능**해야 한다. 이를 위해 높이(H)와 풋프린트 반경(R, 보드 칸=1.0 기준)을 종별로 분산시키고, 실루엣의 "윤곽 특징"(뾰족함/둥긂/폭)을 의도적으로 차별화한다.

---

## 1. 실루엣 명세 (Silhouette Spec)

| 유닛 | 높이 H | 최대 폭 W | 풋프린트 반경 R | 톱다운 실루엣 특징 |
|---|---|---|---|---|
| Pawn | 0.70 | 0.34 | 0.17 | 원형 단순 원기둥 + 작은 원형 헤드. 가장 작고 가장 좁음 — 다른 5종과 즉시 구분 |
| Bishop | 1.00 | 0.42 | 0.21 | 로브 밑단이 완만한 원뿔(테이퍼) — 폰보다 크지만 룩보다 좁은 "뾰족한 원뿔" 실루엣, 지팡이가 실루엣 상단에 돌출 |
| Knight | 1.10 | 0.62 | 0.31(장축) / 0.20(단축) | **비대칭 타원형** 풋프린트(말 몸통이 앞뒤로 김) — 6종 중 유일하게 원형이 아닌 실루엣, 즉시 식별 가능 |
| Rook | 1.15 | 0.56 | 0.28 | 완전한 정사각형 각진 블록 실루엣 — 6종 중 유일한 직각 윤곽 |
| Queen | 1.30 | 0.50 | 0.25 | 별 모양 왕관 첨탑 + 망토 플레어(밑단 폭 0.50)가 원뿔형보다 넓게 퍼짐. Bishop과는 높이(1.30 vs 1.00)와 왕관 첨탑 실루엣으로 구분 |
| King | 1.40 | 0.46 | 0.23 | 6종 중 최고 높이, 십자가 첨탑(cross finial)이 정수리에 있어 톱다운에서 십자 형태가 추가로 보임 — Queen과는 폭(0.46<0.50)과 첨탑 형태(십자 vs 별)로 구분 |

근거: 높이 순서(Pawn<Bishop<Knight<Rook<Queen<King)는 전통 체스 세트의 직관을 그대로 따르되, Knight만 유일하게 비대칭 타원 풋프린트를 부여해 "형태"로도 구분되게 했다. 기각한 대안: 전 유닛 원형 풋프린트 통일 — 톱다운에서 크기 차이만으로 구분해야 하므로 오인식 위험이 커서 기각.

---

## 2. 파츠 분해 (Part Decomposition)

공통 단위계: 보드 1칸 = 1.0 three.js unit.

### 2.1 Pawn — Footsoldier
```
root
 └ hips (CylinderGeometry r=0.15 h=0.05, 8 seg)
    └ spine (CapsuleGeometry r=0.11 h=0.22, 6 seg)
       └ chest (BoxGeometry 0.20×0.16×0.12, 겹갑 느낌으로 살짝 각짐)
          ├ head (SphereGeometry r=0.09, 12×8 seg)
          ├ shoulder.L → elbow.L → hand.L (CylinderGeometry 팔, r=0.035 h=0.14 ×2 세그먼트)
          │    └ hand.L에 부착: shortsword (BoxGeometry 0.02×0.18×0.015) — 절차적 자식 메시, 본 아님
          ├ shoulder.R → elbow.R → hand.R (동일)
          │    └ hand.R에 부착: roundShield (CylinderGeometry r=0.11 h=0.02, 12 seg)
       (하반신은 spine 하단에서 분기)
 └ thigh.L → knee.L → foot.L (CylinderGeometry r=0.045 h=0.16 ×2)
 └ thigh.R → knee.R → foot.R (동일)
```
전체 삼각형 예산(LOD0): 약 480 tri.

### 2.2 Bishop — Cleric
```
root
 └ hips (지면 위 0.15 부양 — 다리 없음)
    └ spine (LatheGeometry: 로브 프로필 회전체, 밑단 반경 0.21 → 허리 반경 0.10, 높이 0.55, 24 세그먼트)
       └ chest (BoxGeometry 0.16×0.14×0.10, 로브 안에 은닉되어 시각적으로는 spine에 흡수)
          ├ head (SphereGeometry r=0.08) + hood (ConeGeometry r=0.10 h=0.14, 8 seg, head 위에 겹침)
          ├ shoulder.L → elbow.L → hand.L
          │    └ hand.L에 부착: staff (CylinderGeometry r=0.015 h=0.55, 상단에 IcosahedronGeometry r=0.05 오브)
          ├ shoulder.R → elbow.R → hand.R (로브 소매에 반쯤 가려짐, 제스처용)
 (하반신 본 없음 — §3 예외 참조. 로브 밑단은 LatheGeometry 단일 메시로 다리 애니메이션 대체)
```
전체 삼각형 예산(LOD0): 약 520 tri.

### 2.3 Knight — Mounted Knight (이중 리그: 말 + 기수)
```
root (말 전체 루트)
 └ horseHips (BoxGeometry 0.42×0.24×0.20, 몸통)
    ├ horseSpine → horseChest (BoxGeometry 0.22×0.20×0.18, 앞가슴)
    │    └ horseNeck → horseHead (CylinderGeometry r=0.05 h=0.20 목 + BoxGeometry 0.10×0.10×0.16 머리)
    ├ horseThigh.FL/FR/BL/BR → horseKnee.* → horseHoof.* (4다리, CylinderGeometry r=0.035 h=0.20 ×2세그먼트 ×4)
    └ riderHips (BoxGeometry 0.16×0.10×0.12, horseChest 위에 배치)
       └ riderSpine → riderChest (BoxGeometry 0.14×0.16×0.10, 판금 갑옷)
          ├ riderHead (SphereGeometry r=0.075) + helmet(ConeGeometry r=0.08 h=0.06)
          ├ riderShoulder.L → riderElbow.L → riderHand.L (방패 CylinderGeometry r=0.10 h=0.02)
          ├ riderShoulder.R → riderElbow.R → riderHand.R
               └ 부착: lance (CylinderGeometry r=0.02 h=0.65)
```
본 이름 규칙: 기수 파츠는 `rider.` 접두, 말 파츠는 접두 없음(말이 "본체"이므로 _CONTRACTS.md 명명을 말에 그대로 적용하고 기수는 `rider.hips, rider.spine, rider.chest, rider.head, rider.shoulder.L/R, rider.elbow.L/R, rider.hand.L/R`로 확장).
전체 삼각형 예산(LOD0): 약 900 tri (12종 중 최고 — 이중 리그이므로).

### 2.4 Rook — Brick Golem
```
root
 └ hips (지면 위 0.05 — 부유 블록 리그, §3 예외)
    └ spine (BoxGeometry 0.40×0.30×0.36, 대형 몸통 블록 — 6면 각각 다른 UV 오프셋으로 벽돌 텍스처)
       └ chest (BoxGeometry 0.30×0.20×0.28, spine 위에 살짝 오프셋 배치되어 "쌓인 돌덩이" 느낌)
          ├ head (BoxGeometry 0.18×0.16×0.16, 작은 정육면체 — 이목구비 없음, 균열 텍스처의 두 점만 눈으로 암시)
          ├ shoulder.L → elbow.L → hand.L (BoxGeometry 팔, 0.10×0.10×0.20 ×2세그먼트, 각진 벽돌 팔)
          ├ shoulder.R → elbow.R → hand.R (동일)
    부유 블록: chest와 spine 사이 및 hand 주변에 3~4개의 소형 BoxGeometry(0.06~0.10 큐브)가 물리적으로 붙지 않고 약간 띄워져 애디티브 부유 애니메이션으로 흔들림 (§3 예외)
 (다리 없음 — spine 자체가 접지, thigh/knee/foot 본 미사용)
```
전체 삼각형 예산(LOD0): 약 380 tri (박스 위주라 저폴리).

### 2.5 Queen — Battle Queen
```
root
 └ hips (CylinderGeometry r=0.16 h=0.06)
    └ spine (LatheGeometry: 드레스+망토 실루엣, 밑단 반경 0.25 → 허리 0.11, 높이 0.62, 24세그먼트)
       └ chest (BoxGeometry 0.18×0.18×0.12)
          ├ head (SphereGeometry r=0.085) + crown (별모양 ExtrudeGeometry, 5첨탑, 높이 0.08)
          ├ shoulder.L → elbow.L → hand.L
          ├ shoulder.R → elbow.R → hand.R
          │    └ hand.R 부착: magicSword (BoxGeometry 0.02×0.24×0.02, emissive)
          ├ cape.root → cape.mid → cape.end (전용 본 체인 3단, 망토 시뮬레이션용 — §D5 애디티브 레이어와 연동)
 └ thigh.L/R → knee.L/R → foot.L/R (드레스 안에 은닉되지만 보행 애니메이션 구동용으로 실재)
```
전체 삼각형 예산(LOD0): 약 640 tri.

### 2.6 King
```
root
 └ hips (CylinderGeometry r=0.17 h=0.07)
    └ spine (CapsuleGeometry r=0.15 h=0.40, 두꺼운 로브)
       └ chest (BoxGeometry 0.22×0.20×0.16, 흉갑)
          ├ head (SphereGeometry r=0.09) + crown (CylinderGeometry r=0.11 h=0.06 + crossFinial: 십자형 2×BoxGeometry 0.02×0.10×0.02 교차)
          ├ shoulder.L → elbow.L → hand.L
          ├ shoulder.R → elbow.R → hand.R
          │    └ hand.R 부착: royalSword (BoxGeometry 0.025×0.26×0.02) — 평시엔 칼집(sheath, hip 부착)
 └ thigh.L/R → knee.L/R → foot.L/R (보폭 좁게 설계, §D5-2 이동 애니메이션과 연동)
```
전체 삼각형 예산(LOD0): 약 560 tri.

---

## 3. 본 계층 예외 정리

| 유닛 | 하반신 처리 | 비고 |
|---|---|---|
| Pawn, King | 표준 `thigh.L/R → knee.L/R → foot.L/R` | 예외 없음 |
| Queen | 표준 다리 본 유지하되 LatheGeometry 드레스에 가려짐 | 드레스는 spine에 스킨 바인딩되어 골반 회전에 약하게 추종 |
| Bishop | **다리 본 없음.** `hips`가 최하단, 이동은 부양(§D5-2)이므로 로브 밑단(LatheGeometry)의 버텍스 셰이더 흔들림으로 보행감 대체 | `thigh/knee/foot` 키를 갖지 않음 — AnimationRegistry가 이를 인지하고 Bishop 클립에는 하반신 트랙을 아예 생성하지 않음 |
| Rook | **다리 본 없음.** `hips`가 부유 블록 루트. 대신 `spine` 자체가 상하 스톰프(0.0~0.08 유닛)로 접지 임팩트 표현 | 부유 소형 블록 3~4개는 별도 익명 본(`float.0..3`)으로 관리, AnimationRegistry 노이즈 레이어 대상 |
| Knight | **이중 리그.** 말 본체는 표준 명명, 기수는 `rider.` 접두로 동일 계층 반복. `horseThigh.FL/FR/BL/BR` 4족 확장 | 이동 애니메이션은 말 본(4족 보행)과 기수 본(승마 자세 고정)을 동시 구동 |

---

## 4. 머티리얼

### 4.1 진영 팔레트 (공통, 유닛 무관 기본값)
| 진영 | Albedo | Roughness | Metalness | Emissive | Emissive Intensity |
|---|---|---|---|---|---|
| 백 (Ivory/Gold) | `#F2E8D5` (직물), `#D4AF37` (금속 트림) | 직물 0.85 / 금속 0.35 | 직물 0.0 / 금속 0.85 | `#D4AF37` | 0.05 (은은한 광) |
| 흑 (Obsidian/Silver) | `#14141A` (직물), `#C8CDD3` (금속 트림) | 직물 0.75 / 금속 0.25 | 직물 0.0 / 금속 0.9 | `#4A6FA5` | 0.06 |

### 4.2 종별 머티리얼 델타 (진영 팔레트를 기본으로, 아래만 예외)
| 유닛 | 델타 |
|---|---|
| Pawn | 델타 없음 — 가죽 갑옷 부위는 `roughness 0.9, metalness 0.0`, albedo는 진영 직물색의 20% 어두운 변형 |
| Bishop | 로브는 진영 직물색 그대로, staff 오브(`IcosahedronGeometry`)는 진영 무관 고정 `#7FD8FF`(백) / `#B47FFF`(흑), emissiveIntensity 0.8 (신성한 광원 역할) |
| Knight | 말 몸통은 **진영 무관 고정** — 백진영 말 `#8B6544`(갈색 밤색), 흑진영 말 `#3A3A3A`(흑마). 기수 갑옷만 진영 팔레트 적용 |
| Rook | **진영 틴트 최소화.** 베이스 스톤 albedo `#8A8478`(공통) 위에 진영 컬러를 20% 블렌드만 적용(백=금 라인 디테일, 흑=은 라인 디테일). roughness 0.95, metalness 0.05 — 골렘은 항상 "돌"이어야 하므로 |
| Queen | crown/magicSword만 emissiveIntensity 0.5로 강조(6종 중 가장 화려한 연출 요구사항 반영) |
| King | crossFinial은 항상 금속(metalness 0.9) 고정, 진영 컬러는 albedo에만 적용 |

---

## 5. LOD 3단계

| 유닛 | LOD0 거리 | LOD0 tri | LOD1 거리 | LOD1 tri | LOD2 거리 | LOD2 tri |
|---|---|---|---|---|---|---|
| Pawn | 0–8 | 480 | 8–16 | 160 (파츠 병합: 팔·다리 각각 단일 실린더로) | 16+ | 24 (빌보드 임포스터) |
| Bishop | 0–8 | 520 | 8–16 | 180 | 16+ | 26 |
| Knight | 0–8 | 900 | 8–16 | 300 (말+기수 각각 단일 메시 병합) | 16+ | 40 |
| Rook | 0–8 | 380 | 8–16 | 140 | 16+ | 20 |
| Queen | 0–8 | 640 | 8–16 | 220 | 16+ | 30 |
| King | 0–8 | 560 | 8–16 | 200 | 16+ | 28 |

거리 단위: 카메라-유닛 거리(보드 칸 단위, 기본 카메라 화각에서 보드 전체가 통상 6~10칸 거리에서 보이므로 이 범위 내에선 대부분 LOD0가 유지되고, LOD1/2는 줌아웃·다수 유닛 동시 렌더 상황(예: 프로모션 후보 미리보기, 로비 배경 장식)에서 발동).
LOD2는 SpriteMaterial 기반 빌보드 임포스터(사전 렌더링한 8방향 스프라이트 아틀라스)로 구현 — 근거: 원거리에서 유닛 형태 구분보다 "말이 있다"는 인지만 필요하므로 지오메트리 대비 GPU 비용을 삼각형의 1/15 이하로 절감. 기각한 대안: LOD2도 단순 지오메트리 유지 — draw call 절감 효과가 스프라이트 배칭 대비 낮아 기각.

---

## 6. 인스턴싱 전략

**결정: 정적 포즈(Idle) 상태의 동일 유닛에는 `THREE.InstancedMesh`를 적용하지 않는다.** 대신 폰 8개 등 동일 지오메트리/머티리얼을 가진 유닛은 **지오메트리·머티리얼 리소스만 공유(캐시)**하고, 각각은 개별 `SkinnedMesh` + 독립 `AnimationMixer`로 유지한다.

근거: InstancedMesh는 GPU 인스턴스 attribute로 트랜스폼만 개별화하며 스켈레탈 애니메이션(본 행렬)을 인스턴스별로 다르게 주는 것은 표준 Three.js API로 지원되지 않는다(본 텍스처 베이킹으로 우회 가능하나 구현 복잡도가 커서 R12 "데이터 주도 확장성" 요구사항과 상충). 체스는 보드 위 유닛이 최대 32개(초기 배치)로 draw call 절대량이 적어(§D9 성능 예산 참조) InstancedMesh 없이도 예산 내 수렴 가능.

⚠️ DECISION NEEDED: 향후 유닛 수가 늘어나는 변형 룰(예: 4인 체스)까지 지원할 계획이면 본 텍스처 베이킹 기반 InstancedMesh 재검토가 필요. 현재 스코프(표준 체스, 최대 32유닛)에서는 불필요하다고 판단.
- Option A(권장): 개별 SkinnedMesh 유지, 지오메트리/머티리얼만 캐시 공유. 구현 단순, 예산 내 충족.
- Option B: 본 텍스처 베이킹 InstancedMesh. 구현 복잡도 높음, 현재 유닛 수 규모에서 이득 미미.
- 추천: A.

LOD2 임포스터 단계에서는 예외적으로 `InstancedMesh`(스프라이트 쿼드)를 사용한다 — 이 단계는 애니메이션이 없는 정지 프레임이므로 인스턴싱 제약이 없다.

---

## 7. UnitProvider / UnitFactory

```ts
// packages/client/src/units/UnitProvider.ts
type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

interface UnitInstance {
  root: THREE.Object3D;
  bones: Record<string, THREE.Bone>;
  mixer: THREE.AnimationMixer;
  dispose(): void;
}

interface UnitProvider {
  create(type: PieceType, color: Color, quality: QualityTier): UnitInstance;
}

// packages/client/src/units/ProceduralUnitFactory.ts
class ProceduralUnitFactory implements UnitProvider {
  private geometryCache: Map<string, THREE.BufferGeometry>;
  private materialCache: Map<string, THREE.Material>;

  create(type: PieceType, color: Color, quality: QualityTier): UnitInstance {
    const builder = this.builders[type]; // PieceType → PawnBuilder | KnightBuilder | ...
    return builder.build(color, quality, this.geometryCache, this.materialCache);
  }
}

// packages/client/src/units/GLTFUnitProvider.ts (미래 구현, 지금은 인터페이스만)
class GLTFUnitProvider implements UnitProvider {
  create(type: PieceType, color: Color, quality: QualityTier): UnitInstance {
    // GLTFLoader로 로드한 씬 그래프에서 동일한 bones 이름 규칙을 가진 SkinnedMesh를 추출해
    // UnitInstance 형태로 어댑팅. 호출부(UnitFactory 사용처)는 한 줄도 변경 불필요 —
    // engine/SceneBuilder.ts 등에서 `const provider: UnitProvider = ...`만 교체.
    throw new Error('not implemented — future GLTF asset pipeline');
  }
}
```
교체 지점: `packages/client/src/game/GameSession.ts`(또는 부트스트랩 코드)에서 `UnitProvider` 구현체를 단 한 곳에서 주입한다. `ProceduralUnitFactory` → `GLTFUnitProvider`로 교체 시 이 한 줄 외 클라이언트 코드 변경 없음.

---

## 8. 보드/환경

### 8.1 체커 타일
- 8×8, 칸 크기 1.0×1.0×0.08(두께) BoxGeometry, 인접 칸끼리 색 교대.
- 머티리얼: `MeshStandardMaterial`, roughness 0.55, metalness 0.05. 밝은 칸/어두운 칸 색은 테마별로 §8.3 스키마에서 정의.
- 좌표 라벨(a-h, 1-8)은 별도 `CanvasTexture` 디칼로 타일 가장자리에 배치(설정에서 토글 가능, §D7).

### 8.2 테두리 프레임
- 보드 외곽 0.4 유닛 폭의 프레임 링(ExtrudeGeometry, 단면 모따기 포함), 테마별 트림 머티리얼 적용.

### 8.3 테마 데이터 스키마
```ts
interface BoardTheme {
  id: string;
  name: string;
  tile: { light: string; dark: string; roughness: number; metalness: number };
  frame: { albedo: string; roughness: number; metalness: number };
  ambientLight: { color: string; intensity: number };
  directionalLight: { color: string; intensity: number; position: [number, number, number] };
  fog?: { color: string; near: number; far: number };
  skybox: { type: 'gradient' | 'cubemap'; topColor?: string; bottomColor?: string; cubemapPath?: string };
  ambienceSfxId: string; // D8 참조
}
```

**Castle Hall**
```ts
{ id: 'castle-hall', name: 'Castle Hall',
  tile: { light: '#E8DCC0', dark: '#8B5A3C', roughness: 0.5, metalness: 0.05 },
  frame: { albedo: '#6B4A2F', roughness: 0.6, metalness: 0.1 },
  ambientLight: { color: '#FFF4E0', intensity: 0.45 },
  directionalLight: { color: '#FFEBC7', intensity: 1.2, position: [5, 8, 3] },
  skybox: { type: 'gradient', topColor: '#3A2E1F', bottomColor: '#1A140D' },
  ambienceSfxId: 'amb.castle_hall' }
```

**Frozen Keep**
```ts
{ id: 'frozen-keep', name: 'Frozen Keep',
  tile: { light: '#DCEBF2', dark: '#3E5C73', roughness: 0.35, metalness: 0.15 },
  frame: { albedo: '#A8C4D4', roughness: 0.3, metalness: 0.2 },
  ambientLight: { color: '#CFE8FF', intensity: 0.55 },
  directionalLight: { color: '#E8F4FF', intensity: 1.0, position: [-4, 9, 4] },
  fog: { color: '#B8D4E8', near: 8, far: 20 },
  skybox: { type: 'gradient', topColor: '#7FA8C9', bottomColor: '#D8E8F2' },
  ambienceSfxId: 'amb.frozen_keep' }
```

**Volcanic Ruin**
```ts
{ id: 'volcanic-ruin', name: 'Volcanic Ruin',
  tile: { light: '#4A4038', dark: '#1C1613', roughness: 0.65, metalness: 0.05 },
  frame: { albedo: '#2A1F1A', roughness: 0.7, metalness: 0.15 },
  ambientLight: { color: '#FF6B35', intensity: 0.35 },
  directionalLight: { color: '#FF8C42', intensity: 0.9, position: [2, 7, -5] },
  fog: { color: '#3A1F14', near: 6, far: 18 },
  skybox: { type: 'gradient', topColor: '#1A0D08', bottomColor: '#5C1F0E' },
  ambienceSfxId: 'amb.volcanic_ruin' }
```

---

## ⚠️ Open Decisions (D4)

1. **InstancedMesh vs SkinnedMesh 캐시 공유** (§6) — Option A(SkinnedMesh+캐시 공유, 권장) vs Option B(본 텍스처 베이킹 InstancedMesh). 현재 최대 32유닛 규모에서는 A로 충분.
2. **LOD2 임포스터 스프라이트 사전 생성 시점** — Option A(빌드 타임에 오프스크린 렌더로 8방향 스프라이트 아틀라스 생성, 권장: 런타임 비용 0) vs Option B(런타임 첫 진입 시 1회 생성 후 캐시, 초기 로드 지연 소폭 증가). 추천: A — 빌드 타임 생성으로 TTI 예산(§D9) 보호.
3. **Golem(Rook) 부유 블록 개수(3 vs 4)** — 시각적 밀도와 draw call 트레이드오프. 추천: 3(각 사이드 최소 임팩트로 예산 여유 확보), 아트 검수 후 4로 상향 가능하도록 데이터 파라미터화.
