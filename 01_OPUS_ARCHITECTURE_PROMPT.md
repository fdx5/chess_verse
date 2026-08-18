# PHASE 1 — Opus 분석 · 설계 프롬프트
# PHASE 1 — Opus Analysis & Architecture Prompt

> **사용법 / How to use**
> 아래 `=== PROMPT START ===` 부터 `=== PROMPT END ===` 까지를 **그대로 복사해서 Opus 모델에 입력**하세요.
> Copy everything between `=== PROMPT START ===` and `=== PROMPT END ===` verbatim into an **Opus** session.
> 이 단계에서는 **코드를 작성하지 않습니다.** 설계 문서만 산출합니다.
> This phase produces **design documents only — no implementation code.**

---

=== PROMPT START ===

## 0. 역할 정의 / Role

당신은 **웹 기반 실시간 3D 게임의 리드 아키텍트(Lead Technical Architect)** 입니다.
You are the **Lead Technical Architect** for a browser-based real-time 3D game.

당신의 임무는 아래 게임을 **실제로 구현 가능한 수준까지 완전하게 설계**하는 것입니다.
Your mission is to produce a **complete, implementation-ready design** for the game described below.

**절대 규칙 / Hard rules**

1. 이 단계에서 **프로덕션 코드를 작성하지 마십시오.** 타입 정의(`interface`/`type`), 함수 시그니처, 의사코드(pseudocode), 데이터 스키마는 허용됩니다.
   Do **NOT** write production code. Type definitions, function signatures, pseudocode, and data schemas ARE allowed and expected.
2. 모든 설계 결정에는 **근거(rationale)와 기각한 대안(rejected alternatives)** 을 1~2줄로 병기하십시오.
   Every decision must include a one-to-two-line rationale and the rejected alternatives.
3. 불확실하거나 트레이드오프가 큰 지점은 **`⚠️ DECISION NEEDED`** 태그를 붙여 명시적으로 표시하십시오. 추측으로 덮지 마십시오.
   Tag genuinely ambiguous trade-offs with `⚠️ DECISION NEEDED` instead of guessing.
4. 산출물은 **다음 단계에서 Sonnet 모델이 읽고 그대로 구현**합니다. 따라서 모호한 표현("적절히", "잘", "필요시")을 금지하고, **수치·파일경로·타입명·함수명 수준까지 구체적으로** 기술하십시오.
   The output will be handed to a **Sonnet** model for implementation. Ban vague words; specify numbers, file paths, type names, and function names.

---

## 1. 제품 개요 / Product Overview

**게임명(가칭): `Battle Chess Reforged`**

1990년대 명작 *Battle Chess* 의 정신적 후속작. 정통 체스 룰 위에, 기물이 3D 유닛으로 살아 움직이고 **적을 잡을 때마다 유닛별 고유 전투 연출(kill cinematic)** 이 재생되는 웹 3D 체스 게임.

A spiritual successor to the 1990s classic *Battle Chess*: standard chess rules, but every piece is an animated 3D unit, and every capture plays a **unique per-matchup combat cinematic**.

### 1.1 핵심 요구사항 (전부 필수) / Core Requirements (all mandatory)

| # | 요구사항 / Requirement | 세부 / Detail |
|---|---|---|
| R1 | 정통 체스 룰 100% | 캐슬링, 앙파상, 프로모션, 스테일메이트, 50수 규칙, 3회 동형반복, 불충분 기물 무승부 포함 / Castling, en passant, promotion, stalemate, 50-move rule, threefold repetition, insufficient material |
| R2 | 로컬 2인 플레이 (핫시트) | 동일 기기에서 번갈아 플레이, 보드 자동 회전 옵션 / Hot-seat on one device with optional auto board flip |
| R3 | CPU 대전 4단계 | 초급 / 중급 / 고급 / 마스터 (Beginner / Intermediate / Advanced / Master) |
| R4 | 3D 유닛 & 이동 애니메이션 | 기물이 미끄러지는 것이 아니라 **걷고/뛰고/날아서** 이동 / Units walk, ride, or fly — never slide |
| R5 | 전 매치업 전투 연출 | 공격자×방어자 조합 전부에 고유 kill 씬 / A unique kill scene for every attacker×defender pairing |
| R6 | 네트워크 대전 | 권위 서버(Authoritative Server) 기반 온라인 1:1 / Online 1v1 over an authoritative server |
| R7 | 매치 포맷 | 기본 3판 2선승(Bo3), 옵션으로 단판(Bo1) / Best-of-3 default, single-game option |
| R8 | 해상도 | 기본 1920×1080 (Full HD), 반응형 스케일링 / 1920×1080 baseline with responsive scaling |
| R9 | 웹 완전 동작 | 설치 없이 브라우저에서 실행, 플러그인 불필요 / Runs in-browser, zero install |
| R10 | 모바일 지원 | 터치 조작, 적응형 그래픽 품질, 세로/가로 대응 UI / Touch controls, adaptive quality, portrait+landscape UI |
| R11 | 사운드 | 유닛별 이동음, 공격음, 사망음, 타격 이펙트, BGM, UI SFX / Per-unit movement, attack, death, impact SFX + music + UI SFX |
| R12 | 지속적 업그레이드 구조 | 애니메이션·에셋·연출을 **코드 수정 없이 데이터로 교체/추가** 가능 / Animations and assets are data-driven and hot-swappable without touching engine code |
| R13 | 성능 최적화 | 웹 환경에서 최대 퍼포먼스 / Aggressive web performance budget (see §5) |

### 1.2 유닛 컨셉 / Unit Concepts

| 체스 기물 | 유닛 / Unit | 컨셉 방향 / Concept direction |
|---|---|---|
| Pawn (폰) | **일반 병사 / Footsoldier** | 짧은 검과 라운드 실드, 가죽 갑옷. 가장 작고 민첩. 프로모션 시 변신 연출 필수 |
| Knight (나이트) | **기사 / Mounted Knight** | 말을 탄 중갑 기사, 랜스. L자 이동을 도약 궤적으로 표현 |
| Bishop (비숍) | **성직자 / Cleric** | 로브·후드·지팡이. 지면에서 살짝 떠서 활공(glide) 이동, 신성 마법 연출 |
| Rook (룩) | **거대 벽돌 골렘 / Brick Golem** | 석재 블록으로 구성된 거구. 육중한 걸음, 바닥 임팩트/카메라 셰이크 |
| Queen (퀸) | **여왕 / Battle Queen** | 위엄 있는 실루엣, 망토, 마법검. 가장 화려한 연출 |
| King (킹) | **왕 / King** | 느리고 무겁지만 위압적. 체크 상태 시 시각적 피드백 필수 |

### 1.3 아트 디렉션 / Art Direction

- **스타일:** 스타일라이즈드 로우폴리(Stylized low-poly) + PBR 라이팅. 사실주의가 아닌 **"고급스러운 보드게임 디오라마"** 룩.
  Stylized low-poly with PBR lighting — a "premium tabletop diorama", not photorealism.
- **에셋 전략:** **모든 유닛 메시는 코드로 절차적 생성(procedural)** 합니다. 외부 3D 파일 의존 없음(라이선스·용량 리스크 제거). 단, **동일 인터페이스로 GLTF 에셋을 나중에 드롭인 교체**할 수 있는 어댑터 구조를 반드시 설계하십시오.
  All unit meshes are generated procedurally in code — no external model files. But you MUST design an adapter layer so GLTF assets can replace them later with zero call-site changes.
- **리깅:** 절차적으로 생성한 파츠를 `THREE.Bone` 계층에 바인딩하여 스켈레탈 애니메이션이 가능하도록 설계.
  Procedural parts bind to a `THREE.Bone` hierarchy so skeletal animation works.

---

## 2. 기술 스택 (확정) / Locked Technology Stack

이 스택은 **확정된 제약**입니다. 변경 제안은 하지 마십시오. 다만 스택 내부의 세부 선택(라이브러리, 패턴)은 당신이 결정합니다.
This stack is **fixed**. Do not propose alternatives to it, but you decide the details within it.

| 레이어 | 확정 기술 |
|---|---|
| 언어 / Language | **TypeScript** (strict mode, `noUncheckedIndexedAccess` 포함) |
| 렌더러 / Renderer | **Three.js** (WebGL2, r160+) |
| 빌드 / Build | **Vite** |
| 상태관리 / State | 프레임워크 비의존 — 순수 TS 이벤트 버스 + 유한상태기계(FSM). React 사용 금지(게임 루프 오버헤드 회피). UI는 DOM/CSS 직접 제어 또는 경량 렌더링. |
| 오디오 / Audio | **Web Audio API** (`AudioContext`) 직접 제어. HTMLAudioElement 금지 |
| 서버 / Server | **Node.js + TypeScript + `ws`(WebSocket)** — **권위 서버(authoritative)** |
| 프로토콜 / Protocol | JSON (개발) → 바이너리 인코딩 경로 설계 포함 |
| 테스트 / Test | **Vitest** (룰 엔진·AI 유닛테스트), Playwright(E2E 스모크) |
| 배포 / Deploy | 정적 클라이언트(CDN) + 별도 Node 게임 서버 |

**⚠️ 절대 금지 / Forbidden:** React Three Fiber, Babylon.js, Unity/WebGL 빌드, 유료 에셋 의존, `localStorage` 이외의 서버 없는 영속화 가정.

---

## 3. 당신이 산출해야 할 문서 / Deliverables

아래 **9개 문서**를 순서대로, 각각 별도의 마크다운 섹션으로 작성하십시오.
Produce the following **nine documents**, in order, each as its own markdown section.

---

### D1. `ARCHITECTURE.md` — 시스템 아키텍처

- 전체 레이어 다이어그램 (텍스트/Mermaid). 최소 레이어: `Core Rules` / `Game State (FSM)` / `AI` / `Presentation(3D)` / `Audio` / `Input` / `UI` / `Net`
- **핵심 원칙: 룰 엔진은 렌더러를 전혀 모른다.** 룰 엔진은 순수 함수형이며 Node에서도 동일하게 실행되어 서버·클라이언트가 **같은 코드를 공유**한다. 이 공유 방법(모노레포 `packages/chess-core`)을 명시하라.
  The rules engine must be renderer-agnostic and shared verbatim between client and server.
- 디렉토리 구조 전체 트리 (파일 단위까지). 예:
  ```
  packages/
    chess-core/      # 룰 엔진 (순수 TS, 의존성 0)
    protocol/        # 클라↔서버 공유 메시지 타입
    client/
      src/
        engine/      # 렌더러, 씬그래프, 카메라, 포스트프로세싱
        units/       # 절차적 유닛 팩토리 + 리그
        anim/        # 애니메이션 그래프, 클립, 전투 연출 DSL
        audio/
        ui/
        net/
        ai/
    server/
  ```
- 각 패키지의 **의존 방향 규칙**(누가 누구를 import 할 수 있는가)을 표로 명시.
- 이벤트 버스 설계: 이벤트 이름 목록과 페이로드 타입 전체.

---

### D2. `RULES_ENGINE.md` — 체스 룰 엔진 설계

- **보드 표현 선택 및 근거**: `0x88` vs `Bitboard(BigInt)` vs `Mailbox 8x8`. 클라이언트 UX와 AI 탐색 성능을 모두 고려하여 결정하고 근거 제시.
- 핵심 타입 전체 정의:
  ```ts
  type Color = 'w' | 'b';
  type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
  interface Move { from: Square; to: Square; promo?: PieceType; flags: MoveFlags; }
  interface Position { /* ... */ }
  ```
  `MoveFlags`(캡처/캐슬링/앙파상/프로모션/더블푸시)를 비트플래그로 정의.
- 공개 API 시그니처 전체:
  `generateLegalMoves`, `makeMove`, `unmakeMove`, `isInCheck`, `getGameResult`, `toFEN`, `fromFEN`, `toSAN`, `zobristHash`
- **Zobrist 해싱** 설계(3회 동형반복 및 AI 트랜스포지션 테이블용).
- **정확성 검증 계획: `perft` 테스트.** 표준 포지션 6종에 대한 depth별 기대 노드 수 표를 제공하고, 이를 Vitest 케이스로 만드는 방법을 명시. 이것은 **협상 불가능한 필수 항목**입니다.
  Perft testing is non-negotiable — provide the expected node-count table.
- 무승부/승리 판정 전체 결정 트리.

---

### D3. `AI_DESIGN.md` — CPU 상대 설계

4단계 난이도를 **"약하게 만들기 위해 일부러 실수하는 것"이 아니라, 탐색 파라미터와 지식량의 차이**로 설계하되, 각 단계가 **인간에게 재미있게 느껴지도록** 성격(personality)을 부여하십시오.

| 난이도 | 목표 체감 실력 | 탐색 방식 | 특징 |
|---|---|---|---|
| 초급 / Beginner | ~600–800 Elo | depth 1~2, 재료 평가만, 상위 N수 중 랜덤 선택 + 블런더 확률 | 초보자가 이길 수 있어야 함 |
| 중급 / Intermediate | ~1200–1400 | depth 3~4 + alpha-beta + quiescence | 기본 전술은 봄 |
| 고급 / Advanced | ~1700–1900 | depth 5~7, iterative deepening, TT, killer/history heuristic, PST | 명확한 실수 없음 |
| 마스터 / Master | ~2200+ | depth 8+, null-move pruning, LMR, aspiration window, 오프닝북, 엔드게임 지식 | 강함 |

산출해야 할 것:
- 평가함수(evaluation) 전체 구성 요소와 **가중치 수치**: 재료값, Piece-Square Table(전체 6종 × 미들/엔드게임), 폰 구조(고립·이중·통과), 킹 안전, 기동성, 비숍 페어, 룩 오픈파일.
- 탐색 알고리즘 의사코드 (negamax + alpha-beta + TT + quiescence).
- **Web Worker 실행 설계.** AI 탐색은 메인 스레드를 절대 블록하면 안 됨. Worker 메시지 프로토콜, 시간 제어(`movetime` per difficulty), 취소(abort) 처리, 진행률 보고 설계.
- 난이도별 **"사고 중" 연출 시간** 하한(너무 즉답하면 재미없음)과 상한.
- ⚠️ 오프닝북 데이터 소스/형식 결정 (경량 자체 정의 vs Polyglot 포맷).

---

### D4. `UNITS_AND_ASSETS.md` — 절차적 3D 유닛 설계

각 유닛(6종 × 2진영 = 12) 별로 다음을 **수치까지** 명세하십시오.

1. **실루엣 명세:** 보드 한 칸을 1.0 단위로 할 때 유닛의 높이/폭. (예: Pawn 0.7, Knight 1.1, Rook 1.15, Bishop 1.0, Queen 1.3, King 1.4). 톱다운 뷰에서도 **실루엣만으로 즉시 구분**되어야 함 — 이것이 최우선 제약.
2. **파츠 분해:** 어떤 기본 지오메트리(Box/Cylinder/Sphere/Lathe/Extrude/Capsule)를 어떤 변환으로 조합하는가. 파츠 이름과 계층 트리.
3. **본(Bone) 계층:** `root → hips → spine → chest → head`, `shoulder.L/R → elbow → hand`, `thigh.L/R → knee → foot`. 유닛별 예외(골렘=부유 블록, 클레릭=하반신 없음, 나이트=말+기수 이중 리그) 명시.
4. **머티리얼:** 진영별 컬러 팔레트 (백=따뜻한 아이보리/금, 흑=차가운 흑요석/은). PBR 파라미터(roughness, metalness, emissive) 수치.
5. **LOD 3단계:** LOD0(근접, full), LOD1(중거리, 파츠 병합), LOD2(원거리, 임포스터/단순 실루엣). 전환 거리 수치.
6. **인스턴싱 전략:** 폰 8개 등 동일 유닛의 `InstancedMesh` 적용 가능 여부와, 개별 애니메이션과의 충돌을 어떻게 해결할지.

추가로:
- **`UnitFactory` 인터페이스**를 정의하여, 절차적 생성기와 미래의 GLTF 로더가 **동일 인터페이스**를 구현하도록 하십시오.
  ```ts
  interface UnitProvider {
    create(type: PieceType, color: Color, quality: QualityTier): UnitInstance;
  }
  ```
- 보드/환경 설계: 체커 타일 머티리얼, 테두리 프레임, 배경 환경(스카이박스/그라디언트), 3종 이상의 **테마(Theme)** 정의(예: Castle Hall / Frozen Keep / Volcanic Ruin)와 테마 데이터 스키마.

---

### D5. `ANIMATION_SYSTEM.md` — 애니메이션 시스템 (⭐ 최우선 문서)

이 문서가 프로젝트의 심장입니다. **가장 상세하게** 작성하십시오.

#### D5-1. 애니메이션 아키텍처
- 클립 정의 방식: `AnimationClip`을 **코드로 생성하는 키프레임 DSL**을 설계하십시오. 예:
  ```ts
  const walk = clip('pawn.walk', 1.0, [
    track('thigh.L.rotation.x', [0, 0.5, 1.0], [0.4, -0.4, 0.4]),
    // ...
  ]);
  ```
- `AnimationMixer` 기반 **블렌딩/크로스페이드** 규칙, 애디티브 레이어(호흡·아이들 노이즈), 상체/하체 마스킹.
- **애니메이션 상태 그래프(FSM)**: `Idle → Selected → Walk/Ride/Glide/Stomp → Attack → Victory / Death → Removed`. 전이 조건과 페이드 시간 수치.
- **`AnimationRegistry`(데이터 주도 레지스트리)**: 클립과 전투 연출을 **JSON/TS 데이터로 등록**하여, 새 연출 추가 시 엔진 코드를 수정하지 않아도 되게 하는 구조 (요구사항 R12의 핵심). 버전 필드와 폴백 규칙 포함.

#### D5-2. 이동 애니메이션 (유닛별 고유)
| 유닛 | 이동 방식 |
|---|---|
| Pawn | 씩씩한 도보. 한 칸 = 2~3 스텝 |
| Knight | 말이 L자 경로를 **두 구간으로 도약**. 말굽 먼지 파티클 |
| Bishop | 지면 0.15 위로 부양하여 활공, 로브 흔들림, 잔광 트레일 |
| Rook | 육중한 스톰프. 착지마다 카메라 셰이크 + 바닥 먼지 |
| Queen | 우아한 활보 + 망토 시뮬레이션(간이 버텍스 셰이더 또는 본 체인) |
| King | 느린 위엄. 짧은 거리라 스텝 수 적음 |

각 이동에 대해 **경로 보간 방식**(직선/베지에/포물선), **소요 시간(초)**, **이징 커브**, **발 접지(foot IK 또는 페이크)** 처리를 수치로 명시.

#### D5-3. ⭐ 전투 연출 매트릭스 (핵심 요구사항 R5)
공격자 6종 × 방어자 6종 = **36개 조합**(킹은 실제로 잡히지 않지만 체크메이트 연출용으로 포함) 각각에 대해 **고유 kill 시나리오**를 작성하십시오. 각 항목은 다음 형식:

```
[ATTACKER × DEFENDER]
- 총 길이: X.X초
- 카메라: (샷 타입, 각도, 렌즈, 이동)
- 비트 1 (0.0~0.6s): 접근 — 공격자 동작 / 방어자 반응
- 비트 2 (0.6~1.4s): 타격 — 히트스톱 프레임, 임팩트 위치
- 비트 3 (1.4~2.2s): 사망 — 방어자 소멸 방식
- VFX: (파티클, 데칼, 라이트 플래시)
- SFX: (레이어별 사운드 큐)
- 스킵 가능 지점
```

**연출 지침:**
- 원작 *Battle Chess* 처럼 **유머와 개성**이 있어야 합니다. (예: 골렘이 폰을 그냥 **밟아 뭉갠다**, 클레릭이 골렘을 **신성 마법으로 돌가루로 분해한다**, 나이트가 퀸에게 **랜스 돌격했다가 반격당해 되레 낙마한다**)
- 하지만 **과도한 유혈은 배제** — 유닛은 빛으로 흩어지거나, 돌가루가 되거나, 갑옷만 남고 사라지는 등 **판타지적 소멸(dissolve)** 로 처리합니다.
- 각 연출은 **`AnimationRegistry`에 데이터로 등록**되며, 등록되지 않은 조합은 **범용 폴백 연출(generic strike)** 로 자동 대체되어야 합니다. 이 폴백 규칙을 명시하십시오.

#### D5-4. 연출 길이 정책 / Pacing policy
- 기본(Full) / 짧게(Short, ~50%) / 끄기(Off, 즉시 제거) 3단계 사용자 설정.
- **네트워크 대전 시:** 연출은 순수 클라이언트 연출이며 **게임 시계(clock)를 소비하지 않는다.** 양측 클라이언트의 연출 길이가 달라도 상태가 어긋나지 않도록 하는 동기화 규칙을 명시.
- 연출 중 상대가 이미 다음 수를 둔 경우의 큐잉/스킵 처리.
- 반복 시청 피로 방지: 동일 조합 N회 이상 반복 시 자동으로 짧은 버전 재생.

#### D5-5. 카메라 연출
- 기본 카메라(궤도, 제한 각도), 수 진행 중 카메라, 전투 시네마틱 카메라 전환.
- 시네마틱 카메라 리그: 카메라 이동을 **곡선 트랙 + look-at 타깃**으로 데이터화.
- 전투 종료 후 원래 카메라로 복귀하는 보간 규칙.

---

### D6. `NETWORK_DESIGN.md` — 권위 서버 네트워크 설계

- **권위 모델:** 서버가 `chess-core`로 모든 수를 검증한다. 클라이언트는 낙관적 로컬 예측(optimistic local apply)을 하되, 서버 거부 시 롤백한다. 이 롤백 UX를 정의.
- 메시지 프로토콜 전체 (Discriminated union 타입):
  `HELLO / QUEUE_JOIN / MATCH_FOUND / MOVE / MOVE_ACCEPTED / MOVE_REJECTED / STATE_SYNC / CLOCK_SYNC / DRAW_OFFER / RESIGN / GAME_END / MATCH_END / OPPONENT_DISCONNECTED / RECONNECT / CHAT / EMOTE`
  각 메시지의 필드와 방향(C→S / S→C)을 표로.
- **룸/매치 생명주기 FSM**: `Lobby → Queued → Matched → GameActive → GameEnd → (Bo3 다음 판) → MatchEnd`.
- **Bo3 매치 상태 관리:** 판마다 색 교대, 점수(1/0.5/0), 매치 승리 조건, 무승부 처리, 판간 인터미션 화면.
- **시계(Clock) 설계:** 서버 권위 시간. 프리셋(예: 5+3, 10+0, 무제한). 지연 보상(lag compensation) 규칙. 전투 연출이 시계를 소비하지 않도록 하는 구현 방법.
- **재접속(Reconnect):** 세션 토큰, grace period(초 단위 수치), 전체 상태 재전송 페이로드.
- **연결 끊김/이탈 처리:** 타임아웃 수치, 승패 판정, 어보트 조건.
- **치팅 방지:** 서버 검증 범위, 클라이언트 신뢰 금지 항목 목록, 레이트 리밋 수치.
- **방 생성/친구 초대:** 6자리 룸코드 방식 스펙.
- ⚠️ 매치메이킹 레이팅(Elo/Glicko) 도입 여부 — 트레이드오프 제시.

---

### D7. `UX_UI_SPEC.md` — UI/UX 명세

- **화면 흐름도(Screen flow):** 스플래시 → 메인메뉴 → (로컬 2인 / CPU 대전 / 온라인) → 설정 → 게임 → 결과 → Bo3 인터미션 → 매치 결과.
- **인게임 HUD 구성 요소:** 양측 플레이어 패널(이름/색/시계/잡은 기물/재료 우위), 수순 기보(SAN, 스크롤), 턴 인디케이터, 체크 경고, 마지막 수 하이라이트, 무르기·기권·무승부 제안 버튼, 설정, 카메라 리셋.
- **기물 조작(데스크톱):** 클릭 선택 → 합법 이동 칸 하이라이트(빈 칸 = 점, 캡처 가능 = 링) → 클릭 이동. 드래그 앤 드롭도 병행 지원. 라이트 캐스팅으로 보드 좌표를 구하는 방식(레이캐스트 대상은 보드 평면 하나로 제한하여 비용 최소화).
- **기물 조작(모바일):** 탭-탭 방식 우선, 드래그 시 **손가락 가림 방지를 위한 오프셋 고스트** 표시, 최소 터치 타깃 44×44 CSS px 보장, 롱프레스로 기물 정보.
- **프로모션 UI**, **체크메이트/스테일메이트 결과 모달**, **연출 스킵 UX**(탭 또는 ESC로 즉시 스킵, 힌트 표시).
- **접근성:** 색맹 대응(진영 구분을 색 외 실루엣/아이콘으로 보강), 자막/시각적 사운드 큐, 키보드 전용 조작 경로, `prefers-reduced-motion` 대응(연출 자동 Off).
- **반응형 브레이크포인트:** 1920×1080 기준 디자인 → 1280 / 768 / 390(모바일 세로) 각각의 레이아웃 변화. 세로 모드에서 보드와 HUD 배치 방식.
- **설정 화면 전체 항목:** 그래픽 품질(Auto/Low/Medium/High/Ultra), 연출 길이, 보드 테마, 마스터/BGM/SFX 볼륨, 좌표 표시, 합법수 표시, 보드 자동 회전, 언어(KO/EN).

---

### D8. `AUDIO_DESIGN.md` — 사운드 설계

- **오디오 아키텍처:** `AudioContext` 그래프 (master → bus: music / sfx / ui / ambience → 각 노드). 3D 공간음(`PannerNode`) 적용 대상 결정.
- **사운드 큐 시트(Cue sheet):** 유닛별 × 상황별 전체 목록. 최소 항목:
  - 이동: 폰 발소리(가죽), 나이트 말발굽, 비숍 옷깃+마법 잔향, 룩 석재 스톰프, 퀸 우아한 발걸음+망토, 킹 무거운 발걸음
  - 전투: 접근, 무기 스윙, 임팩트(금속/석재/살), 방어/패링, 사망 소멸음, 승리 포효
  - UI: 기물 선택, 배치, 잘못된 수, 체크 경고, 체크메이트 스팅어, 시계 경고(10초 미만), 매치 승리 팡파레
  - 앰비언스: 테마별 배경음 루프
- **에셋 확보 전략:** 외부 사운드 파일 의존을 최소화하기 위해 **Web Audio 절차적 합성(procedural synthesis)** 우선 설계 — 오실레이터+노이즈+엔벨로프+필터로 발소리/임팩트/스팅어를 생성하는 방식을 제시하고, 나중에 실제 샘플(.ogg/.webm)로 **교체 가능한 어댑터**를 정의하십시오. (에셋 전략과 동일 철학)
- **믹싱 규칙:** 동시 재생 보이스 상한, 동일 사운드 중첩 방지(쿨다운 ms), 피치 랜덤화 범위(±cents), 덕킹(전투 연출 중 BGM 감쇠 dB와 복귀 시간).
- **모바일 제약:** 자동재생 정책 대응(첫 사용자 제스처에서 `AudioContext.resume()`), 백그라운드 전환 시 일시정지, iOS 무음 스위치 이슈 대응.

---

### D9. `PERFORMANCE_AND_ROADMAP.md` — 성능 예산 & 구현 로드맵

#### D9-1. 성능 예산 (수치 필수)
| 항목 | 데스크톱(1080p) | 모바일 |
|---|---|---|
| 목표 FPS | 60 (연출 중에도 유지) | 60, 최저 30 |
| Draw call | ≤ ? | ≤ ? |
| 삼각형 수 | ≤ ? | ≤ ? |
| 초기 로드(JS gzip) | ≤ ? KB | ≤ ? KB |
| Time to interactive | ≤ ? s | ≤ ? s |
| 힙 메모리 | ≤ ? MB | ≤ ? MB |

**당신이 이 표의 `?` 를 실제 근거 있는 수치로 채우십시오.**

최적화 전략을 항목별로 제시:
- 지오메트리/머티리얼 공유 및 캐싱, `InstancedMesh`, LOD, 프러스텀 컬링
- 그림자 전략(캐스케이드 불필요, 단일 방향광 + 베이크된 콘택트 섀도우 vs 실시간)
- 포스트프로세싱 예산(품질 티어별로 SSAO/Bloom/FXAA 토글)
- 렌더 온디맨드(움직임이 없을 때 렌더 루프 스로틀링) — 체스는 정적 구간이 길다는 점을 활용
- 오브젝트 풀링(파티클, 데칼, 오디오 노드)
- **디바이스 자동 감지 → 품질 티어 자동 선택 알고리즘** (GPU 문자열, `devicePixelRatio`, 코어 수, 첫 N프레임 실측)
- `devicePixelRatio` 클램프 정책(모바일 상한)
- GC 압력 최소화 규칙(핫 패스에서 객체 할당 금지, Vector3 재사용 풀)
- 에셋/코드 스플리팅(전투 연출 데이터는 지연 로드)

#### D9-2. 구현 로드맵 — Sonnet에게 넘길 스프린트 분할
전체 구현을 **8~12개의 순차 스프린트**로 나누십시오. 각 스프린트는:
- 목표 1줄
- 산출 파일 목록(경로까지)
- 완료 정의(Definition of Done) — **검증 가능한 형태로**
- 이전 스프린트 의존성
- 예상 난이도/리스크

**필수 원칙: 각 스프린트 종료 시점마다 게임이 항상 "실행 가능한 상태"여야 합니다.** (never-broken-build)

권장 순서 골격 (당신이 다듬으십시오):
1. 프로젝트 스캐폴딩 + `chess-core` 룰 엔진 + perft 통과
2. 3D 씬 부트스트랩(보드, 조명, 카메라, 렌더 루프, 품질 티어)
3. 절차적 유닛 12종 + 리깅 + 아이들 애니메이션
4. 입력/선택/합법수 하이라이트 + 이동 애니메이션 + 기본 HUD
5. 캡처 시 범용 전투 연출 + 오디오 코어
6. 전투 연출 매트릭스 전체(데이터 주도) + 카메라 시네마틱
7. AI Worker + 4단계 난이도
8. Bo3 매치 플로우 + 결과/설정 화면
9. 서버 + 온라인 대전 + 재접속
10. 모바일 최적화 + 반응형 UI + 터치
11. 성능 프로파일링 & 예산 충족
12. 폴리시(파티클, 포스트프로세싱, 테마, 접근성)

#### D9-3. 리스크 레지스터
상위 리스크 8개 이상을 `리스크 / 영향도 / 발생확률 / 완화책 / 조기경보 신호` 표로.

---

## 4. 산출 형식 / Output Format

- 전체를 **하나의 응답**으로, 위 D1~D9 순서의 마크다운 문서로 작성하십시오.
- 각 문서 시작에 `# D{n}. {제목}` 헤더.
- 표·코드블록·Mermaid 다이어그램을 적극 사용하십시오.
- 문서 맨 앞에 **`## 요약 (Executive Summary)`** 을 두고, 핵심 아키텍처 결정 10개를 불릿으로 제시하십시오.
- 문서 맨 뒤에 **`## ⚠️ 사용자 확인 필요 항목 (Open Decisions)`** 섹션을 두고, `⚠️ DECISION NEEDED` 로 표시한 모든 항목을 모아 각각 **옵션 A/B와 당신의 추천**을 제시하십시오.
- 마지막에 **`## Sonnet 인수인계 체크리스트`** — 다음 단계 모델이 구현을 시작하기 전에 확인해야 할 항목 목록.

## 5. 품질 기준 / Quality Bar

이 설계 문서를 읽은 다른 엔지니어가 **당신에게 단 하나의 질문도 하지 않고** 구현을 시작할 수 있어야 합니다.
Another engineer must be able to start implementing **without asking you a single question.**

특히 다음이 빠지면 실패로 간주합니다 / The design FAILS if any of these are missing:
- [ ] perft 기대값 표
- [ ] 36개 전투 연출 매트릭스 **전부** (요약·생략 금지)
- [ ] 유닛 12종의 수치화된 실루엣/본 계층 명세
- [ ] AI 평가함수의 실제 가중치 수치와 PST 전체
- [ ] 네트워크 메시지 타입 전체 정의
- [ ] 성능 예산 표의 모든 수치
- [ ] 스프린트별 검증 가능한 DoD

=== PROMPT END ===

---

## 부록: 이 프롬프트가 의도적으로 강제하는 것들
## Appendix: What this prompt deliberately enforces

| 강제 사항 | 이유 |
|---|---|
| 룰 엔진과 렌더러의 완전 분리 | 서버 권위 검증에 같은 코드를 재사용하기 위함. 이걸 놓치면 후반에 서버를 새로 만들어야 함 |
| perft 테스트 필수 | 체스 엔진 버그는 후반에 발견되면 치명적. 앙파상·캐슬링 엣지케이스를 조기에 잡는 유일한 방법 |
| `AnimationRegistry` 데이터 주도 | 요구사항 R12(지속적 업그레이드)를 구조로 보장. 나중에 연출 추가 시 엔진을 안 건드림 |
| `UnitProvider` 어댑터 | 프로시저럴 → GLTF 교체 경로를 처음부터 확보 |
| 연출이 시계를 소비하지 않음 | 네트워크 대전에서 연출 길이 차이로 인한 불공정/desync 방지. 설계 초기에 정해야 함 |
| 스프린트마다 실행 가능 | Sonnet이 긴 구현 중 방향을 잃지 않게 하는 안전장치 |
| `⚠️ DECISION NEEDED` 태그 | Opus가 모르는 걸 아는 척 메우는 것을 막고, 당신의 피드백 지점을 명확히 만듦 |
