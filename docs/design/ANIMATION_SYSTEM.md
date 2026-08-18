# D5. ANIMATION_SYSTEM.md

## D5-1. 애니메이션 아키텍처

### 키프레임 DSL

`THREE.AnimationClip`/`THREE.KeyframeTrack`을 직접 구성하는 것은 장황하고 실수하기 쉽다. 대신 얇은 빌더 DSL을 통해 클립을 선언하고, 내부에서 `THREE.VectorKeyframeTrack` / `THREE.QuaternionKeyframeTrack` / `THREE.NumberKeyframeTrack`으로 컴파일한다.

```ts
// packages/client/src/anim/dsl.ts
type TrackTarget = `${string}.position` | `${string}.rotation` | `${string}.quaternion` | `${string}.scale`;
// `${string}` 은 본 이름(_CONTRACTS.md 네이밍) + '.' + 채널, 예: 'thigh.L.rotation'

interface TrackDef {
  target: TrackTarget;          // 예: 'thigh.L.rotation'
  times: number[];               // 초 단위, 오름차순
  values: number[];              // Vector3=3개/키, Quaternion=4개/키, Number=1개/키
  interpolation?: 'linear' | 'step' | 'cubic'; // 기본 'linear'
}

interface AnimClipDef {
  id: string;                    // 예: 'pawn.idle', 'pawn.walk'
  duration: number;              // 초
  loop: boolean;                 // true=LoopRepeat, false=LoopOnce
  tracks: TrackDef[];
}

function clip(id: string, duration: number, loop: boolean, tracks: TrackDef[]): AnimClipDef {
  return { id, duration, loop, tracks };
}
function track(target: TrackTarget, times: number[], values: number[], interpolation: TrackDef['interpolation'] = 'linear'): TrackDef {
  return { target, times, values, interpolation };
}
```

`AnimClipCompiler.compile(def: AnimClipDef): THREE.AnimationClip`가 `TrackDef[]`를 순회하며 채널 접미사(`.position`→Vector, `.rotation`→Euler를 Quaternion으로 변환, `.quaternion`→Quaternion, `.scale`→Vector)에 따라 알맞은 `KeyframeTrack` 서브클래스를 생성한다. 회전은 Euler 각도(라디안)로 저자가 입력하고 컴파일러가 Quaternion 트랙으로 변환한다(짐벌락 회피, 저작 편의 유지).

**예시 클립 4종:**

```ts
const pawnIdle = clip('pawn.idle', 2.4, true, [
  track('chest.rotation', [0, 1.2, 2.4], [0, 0.035, 0]),      // 호흡 상하
  track('head.rotation',  [0, 1.2, 2.4], [0, -0.02, 0]),
]);

const pawnWalk = clip('pawn.walk', 0.55, true, [               // 한 스텝 = 0.55s, 정수 배로 재생해 보폭 수 맞춤
  track('thigh.L.rotation', [0, 0.275, 0.55], [0.5, -0.35, 0.5]),
  track('thigh.R.rotation', [0, 0.275, 0.55], [-0.35, 0.5, -0.35]),
  track('knee.L.rotation',  [0, 0.15, 0.275, 0.55], [0.1, 0.9, 0.1, 0.1]),
  track('knee.R.rotation',  [0, 0.15, 0.425, 0.55], [0.1, 0.1, 0.9, 0.1]),
  track('hips.position',    [0, 0.275, 0.55], [0, 0, 0.04, 0, 0, 0], 'cubic'), // y 상하 바운스, values는 xyz 3개씩
]);

const rookStomp = clip('rook.stomp', 0.9, true, [
  track('root.position',    [0, 0.45, 0.9], [0,0,0, 0,-0.06,0.45, 0,0,0.9], 'cubic'),
  track('chest.rotation',   [0, 0.2, 0.9],  [0,0,0, 0.08,0,0, 0,0,0]),        // 착지 시 상체 앞쏠림
]);

const queenVictory = clip('queen.victory', 1.6, false, [
  track('root.rotation',    [0, 0.8, 1.6], [0,0,0, 0,0.3,0, 0,0,0]),
  track('hand.R.rotation',  [0, 0.5, 1.6], [0,0,0, -1.2,0,0, -0.9,0,0]),      // 검 들어올림
]);
```

### 블렌딩 / 크로스페이드 규칙

`THREE.AnimationMixer` 기반, 전환은 전부 `AnimationAction.crossFadeTo(next, duration, warp)`로 처리한다.

| 전환 유형 | 크로스페이드 시간 | warp |
|---|---|---|
| Idle ↔ Selected | 0.15s | false |
| Selected → Walk/Ride/Glide/Stomp | 0.10s | false |
| Walk/Ride/Glide/Stomp → Idle (도착) | 0.20s | false |
| Any → Attack | 0.08s (공격은 즉각 반응이어야 함) | false |
| Attack → Victory | 0.25s | false |
| Attack → Death (피격측) | 0.05s (거의 즉시 전환, 타격감) | false |
| Death → Removed | 크로스페이드 없음(페이드아웃은 머티리얼 opacity, §D5-3 폴백 참조) | — |
| 난이도: 동일 상태 재진입(예: Walk 중 새 Walk) | 0.10s | true(속도 보간) |

**애디티브 레이어 (호흡/유휴 노이즈):** 별도 `AnimationAction`을 `THREE.AdditiveAnimationBlendMode`로 생성해 베이스 레이어 위에 weight 0.4로 항상 가산 재생한다. 노이즈 함수는 사인 합성(단순 Perlin 대체, 결정론적이며 CPU 저비용):
```
noise(t, seed) = 0.5*sin(t*0.9 + seed) + 0.3*sin(t*2.3 + seed*1.7) + 0.2*sin(t*0.4 + seed*0.3)
```
`chest.rotation.x += noise(t, unitSeed) * 0.012`, `head.rotation.y += noise(t, unitSeed+1) * 0.008` 로 적용. `unitSeed`는 보드 좌표에서 유도(같은 진영 유닛들이 동기화되어 보이지 않도록).

**상하체 마스킹:** `AnimationMixer`는 본별 가중치를 직접 지원하지 않으므로, 클립 저작 시점에 트랙을 마스크에 맞춰 분리한다.
- 하체 마스크: `hips, thigh.L, thigh.R, knee.L, knee.R, foot.L, foot.R, root`
- 상체 마스크: `spine, chest, head, shoulder.L, shoulder.R, elbow.L, elbow.R, hand.L, hand.R`

이동 중 공격 예비동작이 필요한 유닛(예: 나이트 돌격 준비)은 하체=Walk 트랙, 상체=별도 `*.attackWindup` 클립을 별도 `AnimationAction`으로 동시 재생(둘 다 weight 1, 서로 다른 본 세트를 건드리므로 충돌 없음)한다.

### 애니메이션 상태 그래프 (FSM)

상태: `Idle → Selected → (Walk|Ride|Glide|Stomp) → Attack → (Victory|Death) → Removed`

| 현재 상태 | 다음 상태 | 트리거 조건 | 페이드 시간 |
|---|---|---|---|
| Idle | Selected | 유저가 유닛 선택(`input:pieceSelected`) | 0.15s |
| Selected | Idle | 선택 해제(`input:selectionCleared`) | 0.15s |
| Selected | Walk/Ride/Glide/Stomp | 합법 이동 확정(`game:moveApplied`, non-capture) | 0.10s |
| Walk/Ride/Glide/Stomp | Idle | 이동 클립 종료(도착) | 0.20s |
| Selected | Attack | 합법 이동 확정(`game:moveApplied`, capture) — 이동+공격 결합, 이동 클립이 먼저 재생 후 즉시 Attack | 0.10s(이동→공격 전환분) |
| Attack | Victory | 공격자 시점, 전투 연출 종료(`anim:combatSceneEnd`, self=attacker) | 0.25s |
| Attack | Death | 방어자 시점, 전투 연출 종료(`anim:combatSceneEnd`, self=defender) | 0.05s |
| Victory | Idle | Victory 클립 종료(1.6s 고정) | 0.20s |
| Death | Removed | Death 클립 종료 + opacity fade(§D5-3 폴백의 dissolve 규칙, 0.4s) | 크로스페이드 없음 |
| Removed | (종료) | 씬 그래프에서 `dispose()` 및 제거 | — |
| 프로모션(폰만) | Idle(변신 후 새 유닛) | `game:promotion` 이벤트, 변신 연출 재생 후 새 `UnitInstance`로 교체 | 변신 연출 0.8s, 신규 유닛 Idle로 0.3s 페이드인 |

체크 상태 표시(King 전용, R4 요구): King이 체크당하면 `Idle`을 오버라이드하지 않고 별도 애디티브 레이어로 `king.checkPulse`(emissive 강도 0→0.6→0 사인파, 주기 0.8s)를 재생. 체크 해제 시 해당 레이어 weight를 0.2s에 걸쳐 0으로 페이드.

### AnimationRegistry (데이터 주도)

```ts
interface AnimClipDef { id: string; duration: number; loop: boolean; tracks: TrackDef[]; }
interface CombatSceneDef {
  id: string;                              // `${attacker}.${defender}`
  attacker: PieceType; defender: PieceType;
  version: string;                          // semver 문자열, 예: '1.0.0'
  totalDuration: number;
  camera: CameraShotDef;
  beats: BeatDef[];
  vfx: VfxCueDef[];
  sfx: SfxCueDef[];
  skipPointSec: number;                     // 이 시점 이후 스킵 시 즉시 컷 대신 마지막 비트로 점프
}

// CombatSceneDef 하위 데이터 타입 (전부 순수 데이터 — 함수/클로저 금지, JSON 직렬화 가능해야 함)
interface BeatDef {
  kind: 'approach' | 'impact' | 'death' | 'result';   // 'result'는 King 방어 6조합(체크메이트 연출) 전용
  startSec: number; endSec: number;                    // 비트 경계, D5-3 각 항목의 괄호 안 수치와 동일
  attackerClipId: string | null;                        // AnimationRegistry에 등록된 AnimClipDef.id, null=포즈 유지
  defenderClipId: string | null;
  hitStopFrames: number;                                // 0=없음. 1프레임=1/60초 기준(D5-3 표기의 "N프레임")
  timeScale: number;                                    // 1.0=등속, 0.2=20% 슬로모션 (Queen×Knight 등)
}
interface VfxCueDef {
  at: number;                                           // 재생 시작 시각(초, 씬 로컬)
  effectId: string;                                     // 예: 'vfx.dust.ring', 'vfx.shatter.crystal'
  anchor: { unit: 'attacker' | 'defender' | 'world'; bone?: string; offset?: [number, number, number] };
  particleCount: number;                                // D5-3 본문에 명시된 개수(예: 150) 그대로
  lifetimeSec: number;
}
interface SfxCueDef {
  at: number;                                           // 재생 시작 시각(초, 씬 로컬) — 통상 비트 경계와 일치
  cueId: string;                                        // D8 SoundRegistry에 등록된 id (D5-3 / D5-3-B의 값)
  spatial: boolean;                                     // true=PannerNode 경유(D8), false=스테레오 직결
  gainDb: number;                                       // 기본 0, 강조 큐만 -6 ~ +3 범위
}

interface AnimationRegistry {
  registerClip(def: AnimClipDef): void;
  registerCombatScene(def: CombatSceneDef): void;
  getMovementClip(type: PieceType): AnimClipDef;                     // 미등록 시 throw(이동 클립은 필수 12종, 폴백 없음)
  getCombatScene(attacker: PieceType, defender: PieceType): CombatSceneDef;
}
```

등록은 순수 데이터(TS 객체 리터럴 또는 JSON, 런타임에 `import()`로 지연 로드 가능)이며, 엔진 코드(`CombatDirector`, `AnimationController`)는 `registerCombatScene()` 호출 외에는 절대 수정되지 않는다. 이것이 R12(지속적 업그레이드) 요구사항의 구조적 보장이다.

**버전 필드:** `version: string`은 semver(`MAJOR.MINOR.PATCH`). `AnimationRegistry`는 동일 `id`가 재등록되면 `version`을 비교해 더 높은 버전으로 덮어쓴다(핫스왑 지원, 개발 중 라이브 리로드에 사용).

**폴백 규칙:** `getCombatScene(attacker, defender)`가 조회한 `id`(`${attacker}.${defender}`)가 레지스트리에 없으면 예외를 던지지 않고 **`generic.strike`** 씬을 반환한다. `generic.strike`는 공격자가 방어자 쪽으로 한 걸음 다가가 무기/타격 모션(공격자 유형별 기본 어택 클립 재사용, 신규 클립 불필요) 후 방어자가 흰 라이트 플래시와 함께 파티클로 dissolve(0.6초)하며 사라지는 1.8초짜리 범용 연출이다. 총 길이 1.8s, 비트: 접근(0.0–0.5s) / 임팩트(0.5–1.0s, 히트스톱 0.05s) / 소멸(1.0–1.8s, 방어자 emissive 1.0 상승 후 opacity 1→0 + 파티클 80개 방출). D5-3 문서의 모든 36개 전용 연출은 이 폴백과 독립적으로 정의되며, 36개 전부가 등록된 정식 빌드에서는 폴백이 실행되지 않는다(폴백은 개발 중 미등록 조합에 대한 안전망 및 향후 신규 기물 추가 시 임시 커버리지 용도).

---

## D5-2. 이동 애니메이션 (유닛별 고유)

공통 규칙: 소요시간은 `baseTime + perSquare * squareCount` (직선 이동 기준, 나이트는 별도). 도착 전 0.1s는 항상 감속(ease-out)으로 처리해 발 미끄러짐(foot sliding)을 방지한다.

| 유닛 | 경로 보간 | 소요시간(초) | 이징 | 발 접지 처리 |
|---|---|---|---|---|
| Pawn (Footsoldier) | 직선(linear) | `0.35 + 0.30 * squares` (1칸=0.65s, 2칸 더블푸시=0.95s) | easeInOutQuad | 페이크 IK: 발 목표 위치를 지면 레이캐스트로 스냅하지 않고, `foot.L/R.position.y`를 위 walk 클립의 절차적 사인 곡선으로 고정(지면 y=0 가정, 체스 보드는 완전 평면이므로 실제 IK 불필요 — 근거: 비용 대비 시각적 이득 없음, 기각안: full 2-bone IK) |
| Knight (Mounted) | L자를 **두 구간의 포물선(parabolic)**으로 분할: 구간1(직선 2칸 방향 상승), 구간2(직교 1칸 방향 하강) | 구간1 0.35s + 구간2 0.30s = 총 0.65s 고정(칸수 무관, L은 항상 동일 위상) | 구간1 easeOutQuad(도약 상승), 구간2 easeInQuad(착지 가속) | 페이크: 착지 프레임(구간2 종료)에서만 `foot.L/R`을 지면 y=0로 즉시 정렬 + 말굽 먼지 파티클(24개, 0.3s 수명) 방출 |
| Bishop (Cleric) | 베지에(2차, 제어점은 시작/끝의 중점을 y+0.15로 올린 완만한 호) — 지면 0.15 부양 유지 | `0.40 + 0.22 * squares` | easeInOutSine(활공감) | IK 불필요(지면 접촉 없음). 대신 `robe` 메시에 사인 흔들림 `robeBone.rotation.z = sin(t*4.0)*0.05` 적용, 잔광 트레일은 `THREE.TrailRenderer` 패턴(직접 커스텀 리본 지오메트리, 8프레임 히스토리 버퍼) |
| Rook (Brick Golem) | 직선, 단 스텝 단위로 끊어 이동(칸 경계마다 정지 후 스톰프) | 스텝당 0.45s — 위 `rook.stomp` 클립(duration 0.9s)은 **2스텝 1사이클**이므로 스텝당 0.45s이다(클립 길이와 스텝 길이를 혼동하지 말 것). 총 `0.45 * squares` | 스텝 내부는 easeInQuad(가속 착지, 무게감) | 페이크: 착지 프레임에 `foot` y=0 스냅 + 바닥 먼지 파티클(40개) + 카메라 셰이크(진폭 0.03, 감쇠 0.15s, `engine:cameraShake` 이벤트로 렌더러에 위임 — 애니메이션 시스템은 이벤트만 emit) |
| Queen (Battle Queen) | 직선이되 살짝 S자 곡선(3차 베지에, 좌우 진폭 0.05) — 우아함 표현 | `0.30 + 0.24 * squares` | easeInOutCubic | 페이크(Pawn과 동일 절차적 사인). 망토는 본 체인(`cape.root → cape.mid → cape.end`, 3링크 단순 진자 시뮬레이션: 각 링크가 이전 링크의 이전 프레임 회전을 감쇠 계수 0.85로 지연 추종) 채택. 근거: 버텍스 셰이더 클로스 시뮬레이션은 모바일 GPU 부담 대비 시각 이득이 적음(기각) |
| King | 직선 | `0.45 + 0.32 * squares`(가장 느림, 통상 1칸 이동이 잦으므로 짧은 거리 위주) | easeInOutQuad, 단 가속/감속 구간이 더 길게(전체의 40%씩) | 페이크(Pawn과 동일) |

캡처를 수반하는 이동은 위 이동 클립이 목적지 **한 칸 앞**까지만 재생되고(도착 지점을 방어자 칸 앞 0.5칸으로 클램프), 이후 D5-3의 전투 연출이 이어받아 최종 위치 확정과 방어자 제거를 담당한다.

---

## D5-3. ⭐ 전투 연출 매트릭스 (36조합 전부)

공격자 6종 × 방어자 6종 = 36개 조합 전부를 아래에 기술한다. 킹을 방어자로 둔 6개 조합은 실제 포획이 아니라 체크메이트 확정 연출(타격 없이 항복 포즈로 전환, 유닛 비소멸)로 처리한다. King×King은 정규 대국에서 발생하지 않는 이론적 조합이나 매트릭스 완결성을 위해 상징적 대치 연출로 포함한다.

### 공격자: Pawn, Knight, Bishop (18조합)

### [Pawn × Pawn]
- 총 길이: 1.9초
- 카메라: 로우 앵글 미디엄 샷, 35mm 상당, 두 유닛의 눈높이에서 살짝 아래. 임팩트 순간 5도 도리(dolly-in)
- 비트 1 (0.0~0.6s): 접근 — 양측 Footsoldier가 동시에 검을 치켜들고 서로에게 달려듦. 방어자는 라운드 실드를 들어올림
- 비트 2 (0.6~1.2s): 타격 — 공격자의 검이 실드 테두리를 타고 미끄러져 들어가 방어자 어깨를 가격. 6프레임(0.1s) 히트스톱, 임팩트 위치는 우측 쇄골
- 비트 3 (1.2~1.9s): 사망 — 방어자가 무릎을 꿇으며 갑옷이 가죽끈부터 풀려 바닥에 떨어지고, 몸체는 옅은 회백색 먼지가 되어 실드와 함께 바스러짐
- VFX: 임팩트 지점에 회색 스파크 3~4개, 바닥에 얕은 먼지 링 데칼(반경 0.3유닛), 소멸 시 파티클 40개 상향 분산
- SFX: `sfx.pawn.clash.leather`, `sfx.impact.dull`, `sfx.pawn.dissolve.dust`
- 스킵 가능 지점: 1.2s (타격 직후)

### [Pawn × Knight]
- 총 길이: 2.1초
- 카메라: 사이드 트래킹 샷, 50mm, 말의 진행 방향과 수직으로 패닝
- 비트 1 (0.0~0.5s): 접근 — Footsoldier가 낮게 몸을 웅크려 돌진하는 말의 다리 아래로 파고듦
- 비트 2 (0.5~1.3s): 타격 — 검으로 말의 앞다리 힘줄 부위를 베어(비유적 임팩트, 유혈 없음) 균형을 무너뜨림. 8프레임 히트스톱, 임팩트는 말의 앞다리
- 비트 3 (1.3~2.1s): 사망 — 말과 기사가 동시에 옆으로 크게 넘어지며 기사의 갑옷이 은빛 안개로 화하고 말은 별빛 잔상만 남기고 흩어짐
- VFX: 임팩트에 흙먼지 스프레이, 낙마 궤적에 모션 블러 트레일, 소멸 시 은청색 파티클 스월
- SFX: `sfx.knight.horse.stumble`, `sfx.impact.dull`, `sfx.knight.dissolve.mist`
- 스킵 가능 지점: 1.3s

### [Pawn × Bishop]
- 총 길이: 1.8초
- 카메라: 오버더숄더(공격자 뒤에서), 40mm, 고정
- 비트 1 (0.0~0.5s): 접근 — Cleric이 지팡이를 들어 방어 주문을 캐스팅하려는 찰나, Footsoldier가 저돌적으로 로브 자락으로 뛰어듦
- 비트 2 (0.5~1.1s): 타격 — 주문이 완성되기 전 검이 지팡이를 쳐내고 몸통을 가격. 5프레임 히트스톱(가장 짧음 — 코믹한 타이밍), 임팩트는 명치
- 비트 3 (1.1~1.8s): 사망 — Cleric이 놀란 표정으로 뒷걸음질치다 로브가 안쪽부터 빛으로 타들어가며 사라짐, 지팡이만 바닥에 남아 굴러감
- VFX: 지팡이 낙하 시 작은 스파크, 소멸은 금빛 잔불(ember) 파티클이 위로 흩날림
- SFX: `sfx.cleric.staff.dropped`, `sfx.impact.dull`, `sfx.cleric.dissolve.embers`
- 스킵 가능 지점: 1.1s

### [Pawn × Rook]
- 총 길이: 2.6초
- 카메라: 로우 앵글 와이드, 24mm(광각으로 골렘의 육중함 강조), 임팩트 시 급격한 핸드헬드 셰이크
- 비트 1 (0.0~0.7s): 접근 — Footsoldier가 Brick Golem의 발치까지 달려가 무모하게 검을 찔러넣음(관객은 승산 없어 보임을 인지)
- 비트 2 (0.7~1.6s): 타격 — 검끝이 골렘 다리의 균열(hairline crack)을 정확히 찾아 박히고, 골렘이 휘청. 12프레임 히트스톱(가장 긴 축에 속함 — 이변의 무게감), 임팩트는 왼쪽 무릎 관절부
- 비트 3 (1.6~2.6s): 사망 — 균열이 전신으로 번지며 골렘이 안쪽부터 붕괴, 거대한 돌덩이들이 순서대로 무너져 내려 자갈더미와 회백색 먼지구름만 남음
- VFX: 균열이 번지는 발광 라인 셰이더, 붕괴 시 대형 먼지 데칼(반경 1.2유닛) + 파편 40개 물리 낙하
- SFX: `sfx.golem.crack.stone`, `sfx.golem.crumble.large`, `sfx.golem.dust.settle`
- 스킵 가능 지점: 1.6s

### [Pawn × Queen]
- 총 길이: 2.4초
- 카메라: 시네마틱 더치 앵글(15도 기울임), 35mm, 슬로우 도리 아웃
- 비트 1 (0.0~0.6s): 접근 — Battle Queen이 여유롭게 검을 휘두르려 하나, Footsoldier가 예상보다 빠르게 실드로 첫 일격을 흘려냄
- 비트 2 (0.6~1.5s): 타격 — 두 번째 합에서 Footsoldier의 검이 Queen의 망토 고정 버클을 정확히 끊어내며 동시에 옆구리를 스침. 9프레임 히트스톱, 임팩트는 좌측 옆구리
- 비트 3 (1.5~2.4s): 사망 — 망토가 먼저 바람에 날려 사라지고 Queen이 믿기지 않는다는 표정으로 무릎 꿇으며 몸 전체가 보랏빛 별가루로 흩어짐(이변임을 강조하는 특별 연출)
- VFX: 망토가 찢어지며 자수정색 파티클 트레일, 소멸 시 나선형으로 회전하며 상승하는 별가루
- SFX: `sfx.queen.cape.tear`, `sfx.impact.dull`, `sfx.queen.dissolve.stardust`
- 스킵 가능 지점: 1.5s

### [Pawn × King]
- 총 길이: 2.2초 (체크메이트 전용 연출 — 실제 포획 아님)
- 카메라: 로우 앵글에서 King을 올려다보다가 King의 무너지는 위엄을 따라 서서히 카메라가 눈높이로 하강
- 비트 1 (0.0~0.7s): 접근 — Footsoldier가 검을 King의 목 앞에 겨누며 포위망의 마지막 한 수를 완성
- 비트 2 (0.7~1.4s): 타격(체크메이트 확정) — King이 검을 뽑으려 하나 이미 늦었음을 깨닫고 손을 멈춤. 7프레임 히트스톱은 "시간이 멈추는" 연출로 대체(타격 없음, 검이 목 앞 1cm에서 정지)
- 비트 3 (1.4~2.2s): 결과 — King이 왕관을 벗어 발치에 내려놓고 천천히 무릎을 꿇음(디졸브 없음 — King은 계속 보드에 남아있는 기물이므로 자세만 항복 포즈로 전환되고 유닛은 소멸하지 않음)
- VFX: 왕관이 바닥에 떨어지며 금색 스파크 소량, 검 끝에 긴장감을 나타내는 얇은 빛 리본
- SFX: `sfx.king.crown.drop`, `sfx.ui.checkmate_stinger`
- 스킵 가능 지점: 1.4s

### [Knight × Pawn]
- 총 길이: 2.0초
- 카메라: 사이드 트래킹, 50mm, 말의 돌진과 함께 카메라도 같은 속도로 이동(패럴랙스 강조)
- 비트 1 (0.0~0.5s): 접근 — 말을 탄 기사가 랜스를 수평으로 내리며 Footsoldier를 향해 돌진
- 비트 2 (0.5~1.1s): 타격 — 랜스 끝이 실드를 관통하듯 밀어붙여 방어자를 공중으로 살짝 띄움. 7프레임 히트스톱, 임팩트는 가슴 중앙 실드
- 비트 3 (1.1~2.0s): 사망 — Footsoldier가 뒤로 날아가며 갑옷이 종잇장처럼 접혀 사라지고 옅은 갈색 낙엽 같은 파티클로 흩어짐
- VFX: 랜스 관통 지점에 방사형 충격파 링, 소멸 시 낙엽형 파티클이 바람에 날리듯 퍼짐
- SFX: `sfx.knight.lance.thrust`, `sfx.pawn.shield.crack`, `sfx.pawn.dissolve.leaves`
- 스킵 가능 지점: 1.1s

### [Knight × Knight]
- 총 길이: 2.8초
- 카메라: 정면 대칭 와이드 샷(양측이 화면 좌우에서 돌진), 28mm, 임팩트 순간 급속 줌인
- 비트 1 (0.0~0.9s): 접근 — 두 기사가 랜스를 겨눈 채 정면으로 마상 돌격(joust) — 원작 특유의 대결 연출
- 비트 2 (0.9~1.8s): 타격 — 랜스가 교차하며 공격자의 랜스가 방어자의 흉갑을 정확히 강타, 방어자가 낙마. 10프레임 히트스톱(정면 격돌의 무게), 임팩트는 흉갑 중앙
- 비트 3 (1.8~2.8s): 사망 — 낙마한 기사와 말이 함께 은빛 갑옷 파편으로 산화하며, 빈 안장만 굴러 떨어짐
- VFX: 랜스 교차 시 스파크 폭발, 낙마 궤적 모션블러, 소멸 시 메탈릭 파편 스월
- SFX: `sfx.knight.joust.clash`, `sfx.knight.armor.shatter`, `sfx.knight.dissolve.mist`
- 스킵 가능 지점: 1.8s

### [Knight × Bishop]
- 총 길이: 2.3초
- 카메라: 아크(원호) 트래킹 샷, 40mm, Cleric을 중심으로 카메라가 90도 선회
- 비트 1 (0.0~0.6s): 접근 — 기사가 랜스로 돌진하자 Cleric이 지팡이로 방어막(반투명 실드)을 캐스팅
- 비트 2 (0.6~1.5s): 타격 — 랜스가 방어막에 부딪혀 균열을 내다가 결국 관통, 로브 위로 스쳐 지나감. 8프레임 히트스톱, 임팩트는 방어막 중심
- 비트 3 (1.5~2.3s): 사망 — 깨진 방어막 파편과 함께 Cleric이 놀란 채 뒤로 넘어지며 몸이 물처럼 반투명해지다 완전히 투명해져 사라짐(성직자다운 승천 연출)
- VFX: 방어막 균열 셰이더(유리 깨짐 패턴), 소멸 시 상승하는 반투명 리플 이펙트
- SFX: `sfx.cleric.ward.shatter`, `sfx.knight.lance.thrust`, `sfx.cleric.dissolve.ripple`
- 스킵 가능 지점: 1.5s

### [Knight × Rook]
- 총 길이: 2.9초
- 카메라: 로우 앵글 와이드에서 시작해 임팩트 순간 초고속 줌 + 프레임 정지 느낌의 강한 히트스톱
- 비트 1 (0.0~0.8s): 접근 — 기사가 전속력으로 돌진하지만 Brick Golem은 미동도 없이 서 있음(체급 차이를 관객에게 각인)
- 비트 2 (0.8~1.7s): 타격 — 랜스가 골렘의 가슴 블록에 부딪혀 그대로 부러짐. 14프레임 히트스톱(전체 매트릭스 중 최장급 — 랜스가 부러지는 코믹하고 충격적인 순간), 임팩트는 가슴 중앙 블록
- 비트 3 (1.7~2.9s): 사망 — 부러진 랜스에도 불구하고 골렘이 거대한 주먹으로 기사와 말을 내리찍어 함께 쓰러뜨림 — 두 유닛이 동시에 회백색 돌가루와 은빛 안개로 흩어짐(전투에 진 쪽은 기사)
- VFX: 랜스 파편이 튀는 슬로모션 인서트, 주먹 낙하 시 대형 임팩트 크레이터 데칼과 먼지 폭발
- SFX: `sfx.knight.lance.break`, `sfx.golem.fist.slam`, `sfx.knight.dissolve.mist`
- 스킵 가능 지점: 1.7s

### [Knight × Queen]
- 총 길이: 3.0초 (매트릭스 내 최장 — 듀얼 연출)
- 카메라: 트리플 컷 — ①정면 와이드(0.0~1.0) ②클로즈업 검격 교환(1.0~2.0) ③최종 임팩트 슬로우모션(2.0~3.0), 각 35mm
- 비트 1 (0.0~1.0s): 접근 — 기사가 랜스로 돌격하나 Battle Queen이 마법검으로 랜스를 두 동강 내며 반격(설계 지침의 "낙마 반전" 요소 반영: 첫 교환은 Queen이 우세해 보임)
- 비트 2 (1.0~2.2s): 타격 — 그러나 기사가 부러진 랜스 자루로 Queen의 검을 쳐내고, 방패 겸용 팔갑으로 어깨를 강타해 균형을 무너뜨림. 11프레임 히트스톱, 임팩트는 오른쪽 어깨
- 비트 3 (2.2~3.0s): 사망 — Queen이 검을 놓치며 자세를 잃고, 몸이 서서히 자수정빛 결정으로 변했다가 산산이 부서져 흩날림(가장 화려한 연출 — 위계상 가장 격렬한 저항 후 패배)
- VFX: 랜스 절단면 스파크, 검격 교환 시 궤적 라이트 트레일 2줄, 소멸 시 대형 크리스탈 샤터 파티클(150개)
- SFX: `sfx.queen.blade.parry`, `sfx.knight.gauntlet.strike`, `sfx.queen.dissolve.crystal`
- 스킵 가능 지점: 2.2s

### [Knight × King]
- 총 길이: 2.5초 (체크메이트 전용 연출)
- 카메라: 다이나믹 오빗(원형 이동) 샷, 기사가 King 주위를 도는 동선을 따라 카메라도 반원 이동, 35mm
- 비트 1 (0.0~0.8s): 접근 — 기사가 랜스를 겨눈 채 King의 마지막 도주로를 차단하며 원을 그림
- 비트 2 (0.8~1.6s): 타격(체크메이트 확정) — King이 검을 들려 하나 사방이 막혔음을 깨닫고 손을 내림. 랜스 끝이 King의 흉갑 앞 1cm에서 정지(타격 없음)
- 비트 3 (1.6~2.5s): 결과 — King이 옆에 있던 부러진 왕좌 파편(연출용 소품)에 걸터앉듯 주저앉으며 항복 자세로 전환. 소멸하지 않음
- VFX: 랜스 끝 정지 지점에 얇은 경고성 빛 링, King 주변 바닥에 서서히 어두워지는 그림자 확산(패배 암시)
- SFX: `sfx.knight.lance.halt`, `sfx.ui.checkmate_stinger`
- 스킵 가능 지점: 1.6s

### [Bishop × Pawn]
- 총 길이: 2.0초
- 카메라: 하이 앵글(Cleric의 부양 시점), 40mm, 완만한 크레인 다운
- 비트 1 (0.0~0.6s): 접근 — 지면 위로 떠 있는 Cleric이 지팡이 끝에 신성한 빛을 모음
- 비트 2 (0.6~1.3s): 타격 — 빛의 창(bolt)이 발사되어 Footsoldier의 실드를 관통. 6프레임 히트스톱, 임팩트는 실드 중앙
- 비트 3 (1.3~2.0s): 사망 — Footsoldier가 빛에 휩싸여 발끝부터 서서히 투명해지며 사라짐(가장 "깔끔한" 소멸 — 하급 병사에 대한 절제된 처리)
- VFX: 빛의 창 궤적에 황금색 파티클 트레일, 소멸 시 상승하는 얇은 광선 다발
- SFX: `sfx.cleric.bolt.cast`, `sfx.cleric.bolt.impact`, `sfx.pawn.dissolve.light`
- 스킵 가능 지점: 1.3s

### [Bishop × Knight]
- 총 길이: 2.4초
- 카메라: 로우 앵글에서 말의 다리를 따라 위로 틸트업, 45mm
- 비트 1 (0.0~0.7s): 접근 — Cleric이 지팡이로 땅을 두드리자 말 발밑에 신성한 룬 서클이 그려짐
- 비트 2 (0.7~1.5s): 타격 — 룬에서 빛기둥이 솟구쳐 말과 기사를 함께 감싸며 속박. 9프레임 히트스톱, 임팩트는 말의 몸통 전체(광역)
- 비트 3 (1.5~2.4s): 사망 — 빛기둥 속에서 기사와 말이 동시에 새하얀 깃털 같은 빛 파편으로 흩어져 위로 날아오름
- VFX: 룬 서클 지오메트리 데칼(발광), 빛기둥 볼류메트릭 이펙트, 소멸 시 깃털형 파티클 100개
- SFX: `sfx.cleric.rune.charge`, `sfx.cleric.pillar.rise`, `sfx.knight.dissolve.feathers`
- 스킵 가능 지점: 1.5s

### [Bishop × Bishop]
- 총 길이: 2.2초
- 카메라: 정면 심포지컬 샷(대칭 구도), 50mm, 두 캐스팅 이펙트가 충돌하는 중심으로 서서히 줌인
- 비트 1 (0.0~0.6s): 접근 — 양측 Cleric이 동시에 지팡이를 들어 마법을 캐스팅(신성 대 신성의 대결)
- 비트 2 (0.6~1.4s): 타격 — 공격자의 주문이 근소하게 먼저 완성되어 방어자의 캐스팅을 무산시키고 직격. 8프레임 히트스톱, 임팩트는 지팡이를 쥔 손
- 비트 3 (1.4~2.2s): 사망 — 방어자의 로브가 스테인드글라스처럼 색색으로 부서지며 흩어짐(같은 계열이지만 색조로 승자/패자 구분 — 패자는 차가운 청색 파편)
- VFX: 두 캐스팅 이펙트의 간섭 파문, 소멸 시 스테인드글라스 파편 셰이더
- SFX: `sfx.cleric.spell.clash`, `sfx.cleric.spell.overcome`, `sfx.cleric.dissolve.glass`
- 스킵 가능 지점: 1.4s

### [Bishop × Rook]
- 총 길이: 2.7초
- 카메라: 하이 앵글 와이드에서 시작, 골렘이 무너질 때 카메라가 지면 높이로 급강하
- 비트 1 (0.0~0.8s): 접근 — Cleric이 골렘 주위를 활공하며 지팡이로 넓은 원을 그려 결계를 형성(설계 지침 예시: "돌가루로 분해")
- 비트 2 (0.8~1.7s): 타격 — 결계가 수축하며 골렘 표면 전체에 미세 균열의 격자무늬가 번짐. 10프레임 히트스톱, 임팩트는 전신(광역)
- 비트 3 (1.7~2.7s): 사망 — 골렘이 발끝부터 머리끝까지 순차적으로 고운 회색 돌가루가 되어 바람에 흩날리며 사라짐(원작 지침의 대표 연출)
- VFX: 결계 링 지오메트리, 균열 격자 발광 셰이더, 대형 돌가루 파티클(200개, 상승 후 확산)
- SFX: `sfx.cleric.circle.cast`, `sfx.golem.crumble.fine`, `sfx.golem.dust.wind`
- 스킵 가능 지점: 1.7s

### [Bishop × Queen]
- 총 길이: 2.6초
- 카메라: 클로즈업 얼굴 교차 샷(두 캐릭터의 표정 대비) → 와이드 임팩트, 50mm→24mm 크로스컷
- 비트 1 (0.0~0.7s): 접근 — Battle Queen이 검으로 위협하지만 Cleric이 침착하게 보호 결계를 두름
- 비트 2 (0.7~1.6s): 타격 — Queen의 검이 결계에 튕겨나가고, 반사된 신성 에너지가 역으로 Queen을 강타. 9프레임 히트스톱, 임팩트는 검을 쥔 손목
- 비트 3 (1.6~2.6s): 사망 — Queen이 검을 놓치며 몸이 금이 가는 도자기처럼 표면부터 균열이 퍼지다 조각조각 빛으로 부서짐
- VFX: 결계 반사 이펙트(검 궤적이 역방향으로 튕김), 소멸 시 도자기 균열 셰이더 + 빛 파편
- SFX: `sfx.cleric.ward.reflect`, `sfx.queen.blade.knockback`, `sfx.queen.dissolve.porcelain`
- 스킵 가능 지점: 1.6s

### [Bishop × King]
- 총 길이: 2.3초 (체크메이트 전용 연출)
- 카메라: 신성한 위에서 내려오는 하이 앵글, 서서히 King의 눈높이로 크레인 다운, 40mm
- 비트 1 (0.0~0.7s): 접근 — Cleric이 지팡이를 King을 향해 겨누며 결정적인 신성 봉인진을 완성
- 비트 2 (0.7~1.5s): 타격(체크메이트 확정) — 봉인의 빛이 King을 감싸려는 순간 King이 손을 들어 항복의 뜻을 표함(타격 정지, 접촉 없음)
- 비트 3 (1.5~2.3s): 결과 — 봉인의 빛이 부드럽게 가라앉으며 King의 발밑에 항복을 상징하는 빛의 원이 새겨짐. King은 소멸하지 않고 그 자리에 무릎 꿇은 자세로 전환
- VFX: 봉인진 지오메트리(서서히 확장 후 수축), King 발밑 잔광 링
- SFX: `sfx.cleric.seal.cast`, `sfx.ui.checkmate_stinger`
- 스킵 가능 지점: 1.5s

### 공격자: Rook, Queen, King (18조합)

### [Rook × Pawn]
- 총 길이: 2.0초
- 카메라: 로우앵글 미디엄샷, 35mm 상당, 골렘 뒤에서 팔 스윙을 따라가는 짧은 트래킹 후 정지
- 비트 1 (0.0~0.7s): 접근 — 골렘이 육중하게 반보 전진하며 돌주먹을 뒤로 당김. 폰은 방패를 들어 막으려 하지만 체급 차이에 뒷걸음
- 비트 2 (0.7~1.2s): 타격 — 6프레임(0.1s) 히트스톱, 백핸드 스윙이 폰의 흉부-방패 경계에 명중
- 비트 3 (1.2~2.0s): 사망 — 폰이 포물선으로 붕 떠서 보드 밖 방향으로 날아가며 공중에서 자갈 파편으로 분해, 착지 없이 페이드아웃
- VFX: 타격 지점에서 회백색 돌가루 원뿔 분사, 궤적 뒤로 흩날리는 파편 트레일, 사라지는 지점에 옅은 회색 스파클
- SFX: 돌주먹 스윙 "후웅"(저음 스윕), 가죽·나무 방패 파쇄음, 자갈 쏟아지는 소리로 마무리
- 스킵 가능 지점: 1.2s (타격 직후부터 스킵 시 즉시 제거 상태로 전환)

### [Rook × Knight]
- 총 길이: 2.6초
- 카메라: 사이드 트래킹샷, 50mm, 나이트의 돌진 경로를 따라가다 충돌 지점에서 고정
- 비트 1 (0.0~1.0s): 접근 — 나이트가 랜스를 들고 돌진, 골렘은 정면으로 양팔을 벌려 정면 대응 자세
- 비트 2 (1.0~1.7s): 타격 — 8프레임(0.13s) 히트스톱, 골렘이 랜스와 말의 가슴팍을 정면으로 붙잡아 돌진을 완전히 정지시킴
- 비트 3 (1.7~2.6s): 사망 — 골렘이 말과 기수를 통째로 끌어안듯 조여 압축, 말과 기수가 동시에 모래시계처럼 흘러내려 모래 더미로 붕괴
- VFX: 정지 순간 충격파 링(먼지 도넛), 압축 중 균열 라인이 유닛 표면에 번지는 노란빛, 붕괴 시 모래 파티클 하강
- SFX: 돌진 말발굽음이 급정지로 끊김, 저음 "그르득" 압착음, 모래 쏟아지는 화이트노이즈
- 스킵 가능 지점: 1.7s

### [Rook × Bishop]
- 총 길이: 1.9초
- 카메라: 하이앵글, 40mm, 클레릭의 부양 궤적을 내려다보며 고정
- 비트 1 (0.0~0.6s): 접근 — 클레릭이 지팡이를 들어 결계를 시전하려 하나, 골렘이 이미 사정거리 안으로 그림자를 드리움
- 비트 2 (0.6~1.1s): 타격 — 5프레임(0.08s) 히트스톱, 골렘이 손바닥으로 클레릭이 떠 있는 공간을 그대로 후려침(신체 접촉 없이 공기압으로 처리)
- 비트 3 (1.1~1.9s): 사망 — 로브가 순간적으로 짜부라지며 안이 텅 빈 채 바닥으로 떨어지고, 클레릭 본체는 회색 재로 흩어짐
- VFX: 타격 순간 원형 충격 왜곡(heat-haze 셰이더), 로브 낙하 시 재 파티클이 위로 살짝 튀었다가 가라앉음
- SFX: 둔탁한 "퍽" 에어 임팩트음(금속·석재 접촉음 없음), 천 낙하음, 재 흩날리는 저볼륨 화이트노이즈
- 스킵 가능 지점: 1.1s

### [Rook × Rook]
- 총 길이: 2.4초
- 카메라: 정면 와이드샷, 28mm, 두 골렘이 서로를 향해 다가서는 동안 고정, 충돌 시 짧은 카메라 셰이크
- 비트 1 (0.0~0.9s): 접근 — 양측 골렘이 동시에 전진, 서로 어깨를 낮추고 태클 자세
- 비트 2 (0.9~1.5s): 타격 — 10프레임(0.17s) 히트스톱(가장 긴 축에 속함, 육중함 강조), 어깨 대 어깨 정면 충돌
- 비트 3 (1.5~2.4s): 사망 — 방어측 골렘의 블록 이음매에 균열이 번지며 하단부터 붕괴, 상반신이 무너지며 돌무더기 잔해로 흩어짐(공격측은 반보 밀려나 자세를 잡음)
- VFX: 충돌 지점 강한 먼지 폭발, 균열 라인 발광(주황빛 실금), 붕괴 시 낙석 파편과 먼지 구름
- SFX: 초저음 "쿵" 충돌음 + 카메라 셰이크와 동기화된 서브베이스, 돌 갈리는 소리, 낙석 러블
- 스킵 가능 지점: 1.5s

### [Rook × Queen]
- 총 길이: 2.8초
- 카메라: 로우 트래킹 → 오버헤드 크레인업, 35mm→24mm 전환
- 비트 1 (0.0~0.8s): 접근 — 퀸이 마법검을 휘둘러 견제하지만 골렘은 개의치 않고 저돌적으로 거리를 좁힘
- 비트 2 (0.8~1.6s): 타격 — 9프레임(0.15s) 히트스톱, 골렘이 태클로 퀸의 허리를 붙잡아 들어올림(칼날 공격보다 체급으로 제압하는 구도)
- 비트 3 (1.6~2.8s): 사망 — 골렘이 퀸을 그대로 지면에 내리꽂듯 슬램, 임팩트 지점에서 퀸의 망토가 빛의 리본으로 풀어져 흩어지며 소멸
- VFX: 슬램 지점 방사형 지면 균열 데칼 + 먼지 폭발, 망토가 풀리며 남기는 황금빛 리본 트레일
- SFX: 태클 시 천 마찰음, 지면 슬램 저음 임팩트 + 카메라 셰이크, 망토 소멸 시 하이톤 스파클음
- 스킵 가능 지점: 1.6s

### [Rook × King]
- 총 길이: 2.2초 (체크메이트 플로리시 — 실제 기물 제거 없음)
- 카메라: 사이드 미디엄샷, 50mm, 왕관에 포커스가 서서히 이동하는 랙포커스
- 비트 1 (0.0~0.8s): 접근 — 골렘이 거대한 주먹을 왕의 관자놀이 옆까지 들어올림, 왕은 검을 놓치고 한쪽 무릎을 짚음
- 비트 2 (0.8~1.4s): 타격 — 실제 타격 없음. 주먹이 왕의 왕관 바로 앞 수 센티미터에서 완전 정지(6프레임 홀드), 왕관이 충격파만으로 흔들려 기울어짐
- 비트 3 (1.4~2.2s): 사망 — 소멸 없음. 왕이 항복의 의미로 고개를 숙이고, 왕관이 이마에서 굴러떨어져 바닥에 구름(체크메이트 표식 — 유닛은 보드에 남되 "패배" 포즈로 고정)
- VFX: 주먹 정지 순간 얇은 충격파 링, 왕관 낙하 시 금속 광택 하이라이트 반짝임
- SFX: 묵직한 스윙음이 도중에 뚝 끊기는 근접 정지음, 왕관이 바닥에 굴러 땡그랑거리는 금속음(체크메이트 스팅어와 레이어링)
- 스킵 가능 지점: 1.4s (스킵 시 바로 패배 포즈로 컷)

### [Queen × Pawn]
- 총 길이: 1.6초
- 카메라: 클로즈 사이드샷, 85mm(망원 압축), 우아한 팬 무브먼트
- 비트 1 (0.0~0.5s): 접근 — 퀸이 망토를 휘날리며 한 걸음 다가서 검을 사선으로 든다. 폰은 검을 들어 방어 자세
- 비트 2 (0.5~0.9s): 타격 — 4프레임(0.07s)의 짧은 히트스톱, 단 한 번의 우아한 사선 베기가 폰의 갑옷 이음매(가슴-어깨 경계)를 스침
- 비트 3 (0.9~1.6s): 사망 — 폰의 갑옷 버클이 스스로 풀리며 갑옷이 바닥에 툭 떨어지고, 본체는 옅은 빛 입자로 흩어짐(가장 담백하고 빠른 처리 — 하위 기물이라 절제된 연출)
- VFX: 베기 궤적을 따라 얇은 은빛 잔광선, 갑옷 낙하 시 작은 먼지 퍼프, 소멸 시 미세한 반딧불 같은 빛 입자
- SFX: 검이 공기를 가르는 하이톤 스위시, 갑옷 낙하 금속음(가벼운 톤), 소멸 시 종소리 같은 짧은 하이 벨
- 스킵 가능 지점: 0.9s

### [Queen × Knight]
- 총 길이: 2.3초
- 카메라: 다이내믹 사이드 트래킹, 50mm, 슬로모션 구간(0.9~1.3s) 삽입
- 비트 1 (0.0~0.9s): 접근 — 나이트가 랜스를 들고 돌진, 퀸은 정면에서 옆으로 반보 스텝하며 검을 낮게 든다(사이드스텝 회피 준비)
- 비트 2 (0.9~1.5s): 타격 — 7프레임(0.12s) 히트스톱을 20% 슬로모션과 함께 적용, 퀸이 스치듯 회전하며 한 번의 궤적으로 말과 기수를 동시에 베어냄
- 비트 3 (1.5~2.3s): 사망 — 말과 기수가 그대로 전진 관성으로 미끄러지다 정지된 후, 스테인드글라스처럼 다각형 조각으로 쩍 갈라지며 빛과 함께 흩어짐
- VFX: 회전 베기 궤적의 은빛 크레센트 잔상, 균열 시 스테인드글라스 패턴의 발광 라인, 파편이 흩어지며 색유리 빛 반사
- SFX: 검 궤적 스위시(피치 낮은 것 → 높은 것으로 도플러 처리), 말발굽 급정지음, 유리 갈라지는 크리스탈 파쇄음
- 스킵 가능 지점: 1.5s

### [Queen × Bishop]
- 총 길이: 2.1초
- 카메라: 투샷 미디엄, 40mm, 마법 투사체 교환에 맞춘 좌우 스냅팬
- 비트 1 (0.0~0.7s): 접근 — 클레릭이 지팡이 끝에 신성 마법탄을 응집, 퀸은 검을 방패처럼 세워 대기
- 비트 2 (0.7~1.3s): 타격 — 6프레임(0.1s) 히트스톱, 퀸이 검으로 마법탄을 정확히 쳐내 클레릭 본인에게 되튕김(검격이 아닌 반사 판정)
- 비트 3 (1.3~2.1s): 사망 — 되튕긴 마법탄에 클레릭이 휩싸이며 로브가 안쪽부터 하얗게 발광하다가 빛의 먼지가 되어 위로 흩날리며 소멸
- VFX: 마법탄 궤적의 청백색 파티클 트레일, 반사 순간 검신에서 스파크 튐, 소멸 시 상승하는 빛가루 컬럼
- SFX: 마법탄 응집 하이톤 차지음, 검-마법탄 접촉 금속성 챙 소리, 소멸 시 상승하는 코러스풍 신스 스웰
- 스킵 가능 지점: 1.3s

### [Queen × Rook]
- 총 길이: 2.9초
- 카메라: 로우 → 버티컬 틸트업, 35mm, 퀸이 골렘을 타고 오르는 동안 카메라도 함께 상승
- 비트 1 (0.0~1.0s): 접근 — 퀸이 골렘의 팔뚝을 발판 삼아 도약, 어깨 위까지 뛰어오름(경쾌한 아크로바틱 궤적)
- 비트 2 (1.0~1.7s): 타격 — 8프레임(0.13s) 히트스톱, 퀸이 검을 골렘의 정수리 근처 쐐기돌(keystone) 블록에 내리꽂음
- 비트 3 (1.7~2.9s): 사망 — 쐐기돌 균열이 순식간에 전신으로 번지며 골렘이 위에서부터 아래로 연쇄적으로 붕괴(퀸은 붕괴 직전 우아하게 뛰어내림)
- VFX: 도약 궤적 잔상, 쐐기돌 타격 지점 발광 균열 확산 애니메이션, 붕괴 시 대량 낙석·먼지 구름
- SFX: 도약 시 가벼운 바람 스위시, 검 박히는 석재 관통음, 연쇄 붕괴 러블(점점 커지는 낙석음)
- 스킵 가능 지점: 1.7s

### [Queen × Queen]
- 총 길이: 3.0초 (가장 화려한 연출 — 자기 소모 없이 가장 긴 축에 배정)
- 카메라: 시네마틱 서라운드샷, 50mm, 두 퀸 주위를 반원으로 도는 아크 무브먼트
- 비트 1 (0.0~1.2s): 접근 — 거울처럼 대칭적인 두 퀸이 세 차례 검을 맞부딪히는 페인트-패링 교환(챙-챙-챙 3연타)
- 비트 2 (1.2~2.0s): 타격 — 9프레임(0.15s) 히트스톱, 공격측 퀸이 상대의 마지막 패링을 흘려낸 뒤 결정적인 리포스트(찌르기)로 명중
- 비트 3 (2.0~3.0s): 사망 — 방어측 퀸의 망토가 실처럼 풀리며 허공에서 빛의 리본이 되어 나선형으로 흩어지고, 본체는 그 중심에서 사라짐
- VFX: 3연타 교환마다 스파크 이펙트, 리포스트 시 강한 플래시, 망토 소멸의 나선형 황금 리본 트레일
- SFX: 검 3연타 챙-챙-챙(피치 상승), 결정타 시 낮고 무거운 임팩트, 소멸 시 오케스트랄 스팅어풍 신스
- 스킵 가능 지점: 2.0s

### [Queen × King]
- 총 길이: 2.0초 (체크메이트 플로리시 — 실제 기물 제거 없음)
- 카메라: 클로즈업 투샷, 85mm, 검끝과 왕의 표정 사이를 랙포커스
- 비트 1 (0.0~0.7s): 접근 — 퀸이 우아하게 검을 왕의 목 근처까지 겨눔, 왕은 뒤로 반보 물러나며 검을 떨어뜨림
- 비트 2 (0.7~1.2s): 타격 — 실제 타격 없음. 검끝이 왕의 목 앞 수 센티미터에서 정지(5프레임 홀드)
- 비트 3 (1.2~2.0s): 사망 — 소멸 없음. 왕이 스스로 왕관을 벗어 바닥에 내려놓는 항복 모션으로 고정(체크메이트 패배 포즈)
- VFX: 검끝 정지 시 얇은 빛 반사 하이라이트, 왕관을 내려놓는 지점에 옅은 스포트라이트 페이드인
- SFX: 검 겨눔 동작의 미세한 스위시, 왕관을 바닥에 내려놓는 절제된 금속음(체크메이트 스팅어와 레이어링)
- 스킵 가능 지점: 1.2s

### [King × Pawn]
- 총 길이: 1.8초 (왕의 공격 — 최후의 저항이라는 톤으로 절제되게 연출)
- 카메라: 로우 사이드샷, 40mm, 정적인 프레임 위주(왕은 카메라 무빙이 적음)
- 비트 1 (0.0~0.7s): 접근 — 코너에 몰린 왕이 마지못해 검을 양손으로 고쳐 잡음, 폰이 접근하자 무겁게 한 걸음 내딛음
- 비트 2 (0.7~1.2s): 타격 — 6프레임(0.1s) 히트스톱, 단 한 번의 묵직한 오버헤드 내려치기가 폰의 방패를 정확히 절반으로 가름
- 비트 3 (1.2~1.8s): 사망 — 쪼개진 방패 사이로 폰이 모래 알갱이처럼 스르르 흩어져 무너짐
- VFX: 내려치기 궤적의 무거운 잔상(옅은 회색), 방패 절단면에서 미세한 스파크, 소멸 시 낮게 퍼지는 모래 파티클
- SFX: 크고 느린 스윙 음(저음 위주), 방패 쪼개지는 나무-금속 복합음, 모래 흩어지는 낮은 화이트노이즈
- 스킵 가능 지점: 1.2s

### [King × Knight]
- 총 길이: 2.4초
- 카메라: 사이드 팔로우샷, 35mm, 나이트의 돌진 라인을 따라가다 왕 앞에서 정지
- 비트 1 (0.0~0.9s): 접근 — 나이트가 랜스로 돌진, 왕은 물러서지 않고 정면에서 랜스를 양손으로 붙잡아 막아섬
- 비트 2 (0.9~1.6s): 타격 — 7프레임(0.12s) 히트스톱, 왕이 붙잡은 랜스의 방향을 비틀어 나이트의 돌진 관성을 그대로 되돌림(반격 판정)
- 비트 3 (1.6~2.4s): 사망 — 말과 기수가 뒤틀린 관성으로 붕 떠서 보드 가장자리 방향으로 날아가며 옅은 안개로 흩어져 사라짐
- VFX: 랜스를 비트는 순간 손 주변에 왕관 문양의 옅은 발광 링, 날아가는 궤적에 안개 파티클 트레일
- SFX: 랜스 마찰음(나무-가죽), 관성 반전 시 낮은 "우웅" 임팩트, 안개로 흩어지는 부드러운 스웰음
- 스킵 가능 지점: 1.6s

### [King × Bishop]
- 총 길이: 2.0초
- 카메라: 오버헤드 틸트다운, 30mm, 왕의 왕관을 중심으로 방사형 줌
- 비트 1 (0.0~0.6s): 접근 — 클레릭이 결계를 펼치려는 순간, 왕이 검이 아닌 왕관의 위엄(regal aura)으로 대응 — 검을 들지 않고 정면으로 걸어감
- 비트 2 (0.6~1.1s): 타격 — 5프레임(0.08s) 히트스톱, 왕관에서 발산되는 충격파 링이 클레릭의 부양을 강제로 해제
- 비트 3 (1.1~2.0s): 사망 — 클레릭이 지면으로 떨어지며 로브가 새하얀 깃털 다발로 풀어져 흩날리며 소멸
- VFX: 왕관 충격파(금색 링 확산), 클레릭 낙하 시 흰 깃털 파티클 분산
- SFX: 저음 "붐" 오라 방출음(무기 접촉음 없음), 클레릭 낙하 시 천 펄럭임, 깃털 흩어지는 부드러운 화이트노이즈
- 스킵 가능 지점: 1.1s

### [King × Rook]
- 총 길이: 2.6초 (왕이 최대치의 힘을 쏟는 희귀한 장면으로 강조)
- 카메라: 로우앵글 클로즈 → 와이드풀샷 전환, 24mm, 왕의 안간힘을 강조하는 느린 줌인 후 붕괴 시 줌아웃
- 비트 1 (0.0~1.0s): 접근 — 왕이 의전용 검을 양손으로 치켜들고 온 힘을 다해 골렘의 갈라진 기초부(foundation crack)를 겨냥
- 비트 2 (1.0~1.8s): 타격 — 9프레임(0.15s) 히트스톱(왕의 회심의 일격이라는 무게감), 검이 골렘의 균열부에 정확히 박힘
- 비트 3 (1.8~2.6s): 사망 — 기초부 균열이 급속도로 확산되며 골렘 전체가 좌우로 무너지듯 붕괴, 왕은 검을 뽑아 뒤로 물러남
- VFX: 검이 박히는 지점 강한 스파크, 균열 확산 라인이 전신에 번개처럼 번짐, 붕괴 시 대형 먼지 구름과 파편
- SFX: 왕의 기합성 짧은 보이스 큐(비언어적 그런트), 검이 균열에 박히는 날카로운 크랙음, 대형 붕괴 러블(가장 큰 볼륨)
- 스킵 가능 지점: 1.8s

### [King × Queen]
- 총 길이: 2.7초 (희귀한 대형 이변 — 드라마틱하게 처리)
- 카메라: 클로즈업 투샷 → 슬로모션 임팩트, 50mm, 결정타 순간 30% 슬로모션
- 비트 1 (0.0~1.0s): 접근 — 적 퀸이 화려한 연속 공격을 시도하나, 왕은 최소한의 동작으로 침착하게 검을 들어 흐름을 읽음
- 비트 2 (1.0~1.7s): 타격 — 8프레임(0.13s) 히트스톱 + 슬로모션, 왕이 퀸의 마지막 일격을 흘려낸 뒤 단 한 번의 반격으로 명중
- 비트 3 (1.7~2.7s): 사망 — 퀸이 한쪽 무릎을 꿇으며 옅은 연기(wisp of smoke)로 변해 서서히 사라짐, 왕은 검을 다시 검집에 넣는 절제된 동작으로 마무리
- VFX: 반격 순간 강한 화이트 플래시, 연기로 변하는 소용돌이형 파티클(회보라색), 왕이 검을 넣을 때 옅은 잔광
- SFX: 흐름을 읽는 정적(무음에 가까운 서스펜스), 결정타 낮고 강한 임팩트, 연기로 흩어지는 저음 스웰
- 스킵 가능 지점: 1.7s

### [King × King]
- 총 길이: 1.6초 (실제 전투 불가 — 상징적 대치/양위 플로리시로 대체)
- 카메라: 정적인 투샷 와이드, 40mm, 카메라 무빙 없음(가장 절제된 연출)
- 비트 1 (0.0~0.7s): 접근 — 실제 규칙상 킹은 서로를 잡을 수 없으므로, 두 왕이 서로를 정면으로 마주 보고 멈춰 서는 대치 구도로 처리
- 비트 2 (0.7~1.1s): 타격 — 타격 없음. 두 왕이 짧게 고개를 끄덕이는 상호 인정의 제스처(4프레임 홀드로 정지감 강조)
- 비트 3 (1.1~1.6s): 사망 — 소멸 없음. "패배"로 판정된 쪽의 왕만 고개를 숙이고 검을 지면에 내려놓는 상징적 양위 포즈로 고정(이 조합은 정규 대국에서는 사실상 발생하지 않으며, 이론적/디버그 상황이나 연출 갤러리 전용으로만 취급)
- VFX: 대치 순간 두 왕관 사이에 옅은 빛의 선이 이어졌다 사라지는 정도로 최소화
- SFX: 낮은 앰비언트 톤(무기 소리 없음), 검을 내려놓는 절제된 금속음
- 스킵 가능 지점: 1.1s

### D5-3-B. SFX 큐 id 매핑 (Rook/Queen/King 공격자 18조합)

위 [Pawn×*]/[Knight×*]/[Bishop×*] 18조합은 SFX 행에 큐 id를 직접 표기했다. [Rook×*]/[Queen×*]/[King×*] 18조합은 SFX 행을 음향 묘사로 기술했으므로, 구현 시 사용할 **확정 큐 id**를 아래 표로 1:1 고정한다. 이 표의 id는 D8 §큐 시트의 네이밍 규칙(`sfx.<주체>.<동작>.<재질>`)을 따르며, D8에 개별 항목이 없는 id는 D8 §전투 표의 와일드카드(`sfx.*.weapon_swing` 등) 파라미터 변형으로 합성한다. `SfxCueDef.at`(초)은 각 조합의 비트 경계 시각과 동일하다.

| 조합 | 비트1(접근) 큐 | 비트2(타격) 큐 | 비트3(소멸/결과) 큐 |
|---|---|---|---|
| Rook×Pawn | `sfx.golem.fist.windup` | `sfx.pawn.shield.crack` | `sfx.pawn.dissolve.gravel` |
| Rook×Knight | `sfx.knight.hoof.skid` | `sfx.golem.grip.compress` | `sfx.knight.dissolve.sand` |
| Rook×Bishop | `sfx.golem.palm.airswipe` | `sfx.impact.dull` | `sfx.cleric.dissolve.ash` |
| Rook×Rook | `sfx.golem.step.heavy` | `sfx.golem.collide.shoulder` | `sfx.golem.crumble.large` |
| Rook×Queen | `sfx.golem.tackle.cloth` | `sfx.golem.slam.ground` | `sfx.queen.dissolve.ribbon` |
| Rook×King | `sfx.golem.fist.windup` | `sfx.golem.swing.halt` | `sfx.king.crown.drop` + `sfx.ui.checkmate_stinger` |
| Queen×Pawn | `sfx.queen.blade.swish` | `sfx.impact.metal` | `sfx.pawn.dissolve.light` |
| Queen×Knight | `sfx.queen.blade.swish` | `sfx.knight.hoof.skid` | `sfx.knight.dissolve.glass` |
| Queen×Bishop | `sfx.cleric.bolt.charge` | `sfx.queen.blade.deflect` | `sfx.cleric.dissolve.light` |
| Queen×Rook | `sfx.queen.leap.whoosh` | `sfx.golem.keystone.pierce` | `sfx.golem.crumble.large` |
| Queen×Queen | `sfx.queen.blade.parry` (3연타, 60ms 간격) | `sfx.queen.blade.riposte` | `sfx.queen.dissolve.ribbon` |
| Queen×King | `sfx.queen.blade.swish` | `sfx.queen.blade.halt` | `sfx.king.crown.drop` + `sfx.ui.checkmate_stinger` |
| King×Pawn | `sfx.king.blade.regrip` | `sfx.pawn.shield.crack` | `sfx.pawn.dissolve.sand` |
| King×Knight | `sfx.knight.lance.thrust` | `sfx.king.lance.twist` | `sfx.knight.dissolve.mist` |
| King×Bishop | `sfx.king.aura.boom` | `sfx.king.aura.shockring` | `sfx.cleric.dissolve.feathers` |
| King×Rook | `sfx.king.grunt.effort` | `sfx.golem.crack.stone` | `sfx.golem.crumble.large` |
| King×Queen | (무음 서스펜스 — 큐 없음, `musicBus` 덕킹 -12dB 0.6s) | `sfx.king.blade.counter` | `sfx.queen.dissolve.smoke` |
| King×King | `sfx.amb.tone.low` | (타격 없음 — 큐 없음) | `sfx.king.blade.ground` |

**폴백 규칙:** 위 36개 중 어느 하나라도 `AnimationRegistry`에 등록되지 않은 상태로 조회되면(개발 중 데이터 누락 등) `generic.strike`(D5-1 정의, 1.8s 중립 연출)로 자동 대체되며 콘솔에 `console.warn('[anim] missing combat scene for ...')` 경고를 남긴다. 이는 프로덕션에서 36개가 모두 등록된 이후에는 발생하지 않아야 하는 방어적 규칙이다.

## D5-4. 연출 길이 정책 / Pacing policy

### 3단계 설정

| 설정 | 동작 |
|---|---|
| Full | `CombatSceneDef`의 `totalDuration` 전체 재생, 모든 비트/카메라 컷 포함 |
| Short (~50%) | 재생 속도 1.6배속(단순 배속이 아니라 `beats` 중 비트2(타격)의 히트스톱만 원래 프레임 유지, 나머지 구간을 1.6배속) — 임팩트감 손실 없이 길이만 단축. 실제 체감 길이는 원본의 약 55~62%(비트1/비트3만 배속되므로) |
| Off | 연출 스킵, 캡처 즉시 이동 클립 종료 프레임으로 점프 후 방어자 유닛을 0.15s opacity fade로 제거. 카메라 전환 없음 |

### 네트워크 대전에서 게임 시계와의 독립성

전투 연출은 **순수 클라이언트 프레젠테이션**이며 권위 서버의 시계 진행에 어떤 영향도 주지 않는다. 구체적 메커니즘:

1. 서버는 수(move)가 유효로 판정되는 즉시 `MOVE_ACCEPTED`와 함께 갱신된 `CLOCK_SYNC`(양측 잔여시간, 서버 타임스탬프 기준)를 전송한다. 이 시점 이후 서버 시계는 계속 흐른다 — 연출 재생 여부와 무관.
2. 클라이언트의 시계 표시는 `serverRemainingMs - (Date.now() - syncReceivedAt)`로 로컬 렌더링될 뿐, 애니메이션 이벤트(`anim:combatSceneStart/End`)는 시계 갱신 로직을 절대 구독하지 않는다. 즉 `anim` 도메인 이벤트와 `game`(시계) 도메인 이벤트는 완전히 분리된 구독 그래프를 가진다.
3. 따라서 한쪽 클라이언트가 Full(2.2s)로 보고 상대가 Off(즉시)로 보더라도, 양측의 서버 기준 잔여시간은 항상 동일하며 desync가 발생할 수 없다 — 애초에 연출이 시계에 입력을 주는 경로 자체가 존재하지 않는다.

**큐잉/스킵 처리:** 로컬에서 전투 연출이 재생 중일 때 서버로부터 상대의 다음 수(`MOVE_ACCEPTED` for opponent move)가 도착하면, 그 상태 갱신(보드 상태, 다음 턴 유닛 위치)은 즉시 적용하지 **않고** `pendingStateQueue: GameState[]`에 적재한다. 현재 재생 중인 연출이 (a) 자연 종료되거나 (b) 사용자가 스킵(탭/ESC)하면, 큐에서 다음 상태를 pop하여 적용하고 해당 수의 이동 애니메이션을 재생한다. 큐가 2개 이상 쌓이면(상대가 매우 빠르게 연속 수를 둘 수는 없으므로 사실상 Bo3 판 전환 등 예외 상황에서만 발생) 중간 상태를 스킵하고 최신 상태만 적용 후 즉시 최신 보드로 스냅한다. 연출 도중 보드 상태가 mid-cinematic으로 변경되는 일은 설계상 발생하지 않는다.

### 반복 시청 피로 방지

매치(게임 1판) 단위로 `Map<comboId, viewCount>`를 클라이언트 로컬에 유지한다. 동일 `attacker.defender` 조합이 **3회 이상** 재생되면(즉 4번째 시청부터) 사용자의 Pacing 설정이 Full이더라도 해당 조합에 한해 자동으로 Short로 강등한다. 설정이 이미 Short/Off인 경우 변화 없음. 이 카운터는 판이 끝나면(`GAME_END`) 초기화된다(Bo3의 다음 판은 다시 신선하게 카운트).

---

## D5-5. 카메라 연출

### 기본 궤도 카메라

`THREE.OrbitControls` 기반, 값:
- `minPolarAngle = 0.35 rad (≈20°)`, `maxPolarAngle = 1.15 rad (≈66°)` — 완전 탑다운(0°)과 지면 시점(90°)을 모두 배제해 보드 가독성 유지.
- `minDistance = 6.0`, `maxDistance = 14.0` (보드 한 칸=1.0 단위 기준, 보드 전체 폭 8.0).
- `enableDamping = true`, `dampingFactor = 0.08`.
- `azimuth`는 제한 없음(자유 회전) 단, R2의 "보드 자동 회전 옵션" 활성 시 턴 교대마다 `azimuth`를 180° 대상으로 1.2s easeInOutCubic 보간.

### 수 진행 중 카메라

이동 중에는 카메라가 유닛을 트래킹하지 **않는다**(고정 유지). 근거: 매 수마다 카메라가 흔들리면 상대측 보드 판단(다음 수 계획)을 방해하고 멀미 유발 가능성이 있음. 기각안: 이동 유닛 추적 카메라(다이나믹하지만 산만함). 대신 이동 중인 유닛에는 얇은 하이라이트 림(rim light, emissive 0.3)을 적용해 시선 유도만 수행.

### 시네마틱 카메라 리그

```ts
interface CameraShotDef {
  shotType: 'closeup' | 'medium' | 'wide' | 'overhead';
  lensMm: number;                          // FOV 환산에 사용, 예: 35mm→FOV 54.4°, 85mm→FOV 23.9°
  curve: CameraCurvePoint[];               // 카메라 위치 트랙
  lookAt: LookAtTrack;                     // 시선 목표 트랙
}
interface CameraCurvePoint { t: number; position: [number, number, number]; }  // t: 0~1 정규화 시간
interface LookAtTrack { mode: 'fixed' | 'follow'; target?: [number, number, number]; boneRef?: { unit: 'attacker'|'defender'; bone: string }; }
```
카메라 위치는 `CameraCurvePoint[]`를 Catmull-Rom 스플라인으로 보간(제어점 2~4개로 충분, 과다 제어점 금지 — 저작 복잡도 관리). `lookAt`은 고정 좌표 또는 유닛의 특정 본(예: 방어자 `chest`)을 실시간 추적하는 두 모드를 지원.

**전환 IN:** 기본 카메라 → 시네마틱 카메라, 0.25s, easeInQuad(빠르게 몰입).
**전환 OUT:** 시네마틱 카메라 종료 → 기본 카메라 복귀, 0.4s, easeOutCubic. 복귀 목표 위치/각도는 연출 시작 직전의 `OrbitControls` 상태를 스냅샷하여 그대로 복원(사용자가 돌려놓은 각도를 잃지 않음).

---

## ⚠️ Open Decisions (D5)

| # | 항목 | 옵션 A | 옵션 B | 추천 |
|---|---|---|---|---|
| 1 | 망토/로브 시뮬레이션 방식 | 본 체인 진자 근사(현재 채택) | 버텍스 셰이더 클로스 시뮬레이션 | **A** — 모바일 GPU 예산(D9) 대비 이득 적음. 고사양 티어에서만 B를 옵션으로 열어두는 것은 향후 고려 가능 |
| 2 | Short 모드 구현 방식 | 배속 재생(현재 채택, 비트2 히트스톱 유지) | 비트 자체를 짧게 재편집한 별도 클립 저작 | **A** — 36개 조합 전부에 대해 Short 전용 클립을 별도 저작하는 것은 R12(지속 확장) 부담을 2배로 늘림 |
| 3 | 발 IK | 절차적 페이크(현재 채택) | 실시간 2-bone IK + 지면 레이캐스트 | **A** — 체스 보드는 완전 평면이라 IK의 이점(불규칙 지형 적응)이 발생하지 않음. 테마 확장으로 경사 지형이 생기면 재검토 |
