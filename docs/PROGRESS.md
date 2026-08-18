# PROGRESS.md — 스프린트별 진행 기록

## 설계 단계 (Opus 역할) — 완료

- D1~D9 설계 문서 9종을 `docs/design/`에 작성 완료 (2026-08-18).
- D5-3 전투 연출 매트릭스 36조합 전부 포함(생략 없음), `docs/design/ANIMATION_SYSTEM.md`에 병합.
- D9-1 성능 예산표 전 항목 수치 채움, D9-2 스프린트 12개 분할 완료.
- D2 perft 기대값 표(6개 표준 포지션) 포함.
- 전체 취합 Open Decisions는 `docs/design/ARCHITECTURE.md` 하단 참조 — 전부 옵션 A(현 설계 유지) 추천.

## Sprint 1 — 프로젝트 스캐폴딩 + chess-core 룰 엔진 — 완료 ✅

- 목표: 모노레포 구조 + 완전한 규칙 엔진 + perft 검증
- 생성 파일:
  - `package.json`, `tsconfig.base.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`
  - `packages/chess-core/{package.json,tsconfig.json,src/{types,board,movegen,makemove,zobrist,fen,san,result,perft,index}.ts,src/__tests__/perft.test.ts}`
  - `packages/client/{package.json,tsconfig.json,index.html,src/main.ts}` (Sprint 2에서 3D 씬으로 확장 예정인 최소 셸)
- 검증 결과:
  - `npx tsc --build --force`: 0 에러
  - `eslint packages/*/src --ext .ts`: 0 에러 (any 금지 규칙 포함)
  - `vitest run`: **26/26 통과** — D2 perft 표 6개 포지션(startpos/kiwipete/endgame/castling-promo-edge/talkchess-pos5/steven-edwards-pos6) 전부 지정 depth까지 노드 수 정확히 일치 (앙파상·캐슬링·프로모션 엣지케이스 포함)
  - `npm run build`: 성공 (chess-core tsc 빌드 + client vite 빌드, gzip 3.14KB)
  - `chess-core`에 `three` import 없음 확인 (grep 0건)
  - `any` 타입 0건, `TODO`/`FIXME` 0건
- DoD 충족 여부: D9-2 Sprint 1 DoD 4항목 전부 충족 ✅
- 이탈 기록: `docs/DEVIATIONS.md` 참조 (Zobrist 증분 갱신을 전체 재계산으로 대체 — 정확성엔 영향 없음, 성능 최적화는 Sprint 11로 유예)
- 다음 스프린트 준비 상태: ✅ (Sprint 2 — 3D 씬 부트스트랩 진행 가능)

## Sprint 2 — 3D 씬 부트스트랩 — 완료 ✅

- 목표: 빈 체커보드가 렌더링되는 씬 + 품질 티어 자동감지 인프라
- 생성 파일:
  - `packages/client/src/engine/{QualityTier,DeviceDetect,RenderScheduler,Renderer,Camera,Scene}.ts`
  - `packages/client/src/main.ts`(교체), `packages/client/index.html`(캔버스 마운트로 수정)
  - `packages/client/package.json`에 `three@^0.160.1` 의존성, devDependency `@types/three` 추가
- 구현 내용:
  - `Scene.ts`: 8×8 체커보드(밝은/어두운 칸 각 1개로 지오메트리 병합), 테두리 프레임(ExtrudeGeometry), 그라디언트 스카이(정점 컬러), Castle Hall 테마 조명(D4 §8.3 수치 그대로)
  - `Camera.ts`: `OrbitControls` 기반 D5-5 수치(minPolar 0.35/maxPolar 1.15/minDist 6/maxDist 14/damping 0.08) 그대로 적용
  - `RenderScheduler.ts`: dirty-flag 렌더 온디맨드, idle 시 10Hz로만 갱신 + `console.debug`로 idle 진입/복귀 로그
  - `DeviceDetect.ts`: D9 5단계 알고리즘(GPU 문자열/코어수/dpr/90프레임 실측) 그대로 구현, `QualityTier.ts`의 `minTier()`로 보수적 최종 선택
  - `Renderer.ts`: devicePixelRatio를 데스크톱 2.0/모바일 1.5(Low·Medium)·2.0(High·Ultra) 상한으로 클램프
- 검증 결과:
  - `npx tsc --build --force`: 0 에러
  - `eslint packages/*/src --ext .ts`: 0 에러
  - `vitest run`: 26/26 통과(기존 chess-core perft, 이번 스프린트는 렌더링 스모크 위주라 신규 유닛테스트 없음 — 시각적 결과물이라 D2/D9 원칙상 필수는 아님)
  - `npm run build`: 성공, gzip 132.00 KB(예산 900KB 대비 여유, three.js 포함)
  - `chess-core`에 `three` import 없음(grep 0건), `any`/`TODO`/`FIXME` 0건
- **브라우저 육안 확인**: 사용자가 `localhost:5180`에서 직접 확인, 콘솔 에러 없음 확인 완료(2026-08-18).
- DoD 충족 여부: D9-2 Sprint 2 DoD 4항목 전부 충족 ✅
- 다음 스프린트 준비 상태: ✅ (Sprint 3 — 절차적 유닛 12종 진행 가능)

## Sprint 3 — 절차적 유닛 12종 + 리깅 + 아이들 애니메이션 — 구현 완료(브라우저 육안 확인 대기) ⚠️

- 목표: 12유닛(6종×2진영)이 보드 위 정위치에 서 있고 아이들 애니메이션이 재생된다.
- 생성 파일:
  - `packages/client/src/units/{UnitProvider,BoneRig,ProceduralUnitFactory,GLTFUnitProvider}.ts`
  - `packages/client/src/units/builders/{PartKit(추가 파일, DEVIATIONS 기록),Pawn,Knight,Bishop,Rook,Queen,King}Builder.ts`
  - `packages/client/src/engine/{GeometryCache,MaterialCache}.ts`
  - `packages/client/src/anim/{dsl,AnimClipCompiler,AnimationRegistry}.ts`, `anim/data/movementClips/idle.ts`
  - `packages/client/src/main.ts`(교체 — 12유닛 대표 배치 + Idle 재생 + mixer 업데이트 연결)
- 구현 내용:
  - D4 §2 파츠 분해를 그대로 따라 6종 전부 절차적 지오메트리로 조립(Pawn/Bishop/Knight-이중리그/Rook-부유블록/Queen-cape본체인/King-crossFinial)
  - 본 이름은 `_CONTRACTS.md` 컨벤션 그대로(`hips/spine/chest/head/shoulder.L·R/elbow.L·R/hand.L·R/thigh.L·R/knee.L·R/foot.L·R`), Knight 기수는 `rider.` 접두, Rook 부유블록은 `float.0..3`, Queen은 `cape.root/mid/end` 추가
  - `AnimationRegistry`가 D5-1 인터페이스대로 `registerClip/registerCombatScene/getMovementClip/getCombatScene` 구현 + Sprint 3용 `bindIdleClip/getIdleClip` 확장
  - Idle 클립 6종을 D5-1 키프레임 DSL로 작성해 `AnimClipCompiler`로 `THREE.AnimationClip` 컴파일 후 각 유닛 `AnimationMixer`에서 재생
  - `RenderScheduler`의 idle 10Hz 틱이 `renderFrame` 내부의 `mixer.update(dt)`를 계속 구동해 정적 구간에도 호흡 애니메이션이 저빈도로 유지됨(D9 온디맨드 원칙과 정합)
  - `GLTFUnitProvider`는 스텁이 아닌 실제 `GLTFLoader`+`SkeletonUtils.clone` 기반 구현(`preload()` 선행 필요, 동일 `UnitProvider` 인터페이스)
- 검증 결과:
  - `npx tsc --build --force`: 0 에러
  - `eslint packages/*/src --ext .ts`: 0 에러
  - `vitest run`: 26/26 통과(신규 유닛테스트 없음 — 사유는 Sprint 2와 동일, 시각 결과물)
  - `npm run build`: 성공, gzip 147.29 KB
  - `chess-core`에 `three` import 없음, `any`/`TODO`/`FIXME` 0건
- 이탈 기록: `docs/DEVIATIONS.md` [스프린트 3] 2건(PartKit.ts 추가 파일 — D9 리스크 완화 권고에 따른 것, 강체 본 계층 vs 스킨 웨이트)
- **버그 발견·수정 (사용자 육안 확인으로 발견)**: `main.ts`가 Idle 클립 id(`'pawn.idle'` 등 영단어 프리픽스)를 `split('.')[0] as PieceType`로 강제 캐스팅해 바인딩 — 런타임에 문자열 `'pawn'`이 실제 `PieceType`(`'p'`)와 달라 `AnimationRegistry.getIdleClip()`이 전부 throw, 콘솔에 `Uncaught Error: AnimationRegistry: no idle clip bound` 발생. `IDLE_CLIP_PIECE_TYPE` 명시적 매핑으로 교체해 수정, tsc/lint 재확인 완료.
- **미검증 항목 ⚠️**: 브라우저 확장 미연결로 직접 육안 확인은 여전히 못함. 사용자가 `localhost:5180`(vite dev, HMR 자동 반영)에서 재확인 필요: (1) 12유닛 표시, (2) 톱다운 실루엣 구분, (3) Idle 애니메이션 재생, (4) 콘솔 에러 0건.
- DoD 충족 여부: 코드 레벨 충족 + 버그 수정 완료, "콘솔 에러 0 육안 확인"만 재검증 대기
- 다음 스프린트 준비 상태: ⚠️ (브라우저 재확인 후 Sprint 4 — 입력/이동애니메이션/HUD 진행 권장)

## Sprint 3.5 — 유닛 시각 품질 개선 (사용자 피드백, Sprint 4 착수 전 삽입)

- 배경: 사용자가 콘솔 에러 해결을 확인한 뒤 "유닛 그래픽 품질이 너무 낮다"(파츠가 따로 노는 조립물, 평판한 재질, 실루엣 미구분, 전반적 저품질)고 피드백. `Battle Chess: Game of Kings` 수준을 기대했으나, 절차적 생성(코드로 기본 도형 조합)은 실제 아티스트 스컬핑·텍스처링 기반 상용 게임 에셋과 근본적으로 다른 상한선을 가진다는 점을 설명하고 사용자가 "절차적 생성 한도 내 최대 개선"을 선택(GLTF 실제 모델 교체는 외부 에셋 조달이 필요해 보류).
- 개선 내용 (`packages/client/src/units/builders/PartKit.ts` 중심):
  - `RoundedBoxGeometry`(모서리 베벨) 도입 — 몸통/머리 등 주요 실루엣 파츠에 적용
  - 원기둥 세그먼트 8→16, 구체 세그먼트 12×8→20×16
  - Pawn/King/Queen 로브·상체를 박스 스택 대신 연속 `LatheGeometry` 실루엣으로 재구성(반경 세그먼트 24→32), 두 단으로 나눈 경우 30% 겹치게 배치해 이음매 은폐
  - 사지(팔/다리)에 `taperedLimbGeom` 도입 — 관절 쪽 굵고 먼 쪽 가는 테이퍼 + 30% 길이 오버랩으로 관절 틈 제거
  - `MeshStandardMaterial` → `MeshPhysicalMaterial`(clearcoat)로 전 유닛 재질 교체, roughness 하향 조정으로 "왁스 먹인 고급 말" 광택 부여
  - `Scene.ts`에 반대편 필 라이트(낮은 강도, 그림자 없음) 추가로 재질 입체감 보강
  - Rook(골렘)은 컨셉상 각짐이 의도이므로 완전 매끈화 대신 베벨+블록 간 겹침 정도로 절제
- 영향 파일: `PartKit.ts`, 6개 Builder 전부, `Scene.ts`(lighting)
- 검증 결과: `tsc` 0에러, `eslint` 0에러, `npm run build` 성공(gzip 148.67 KB), `any`/`TODO` 0건
- **한계 고지(사용자에게 전달 완료)**: 절차적 생성의 물리적 상한으로 인해 상용 게임(Battle Chess: Game of Kings 등) 수준에는 도달 불가 — "정교한 스타일라이즈드 인디" 수준이 현실적 목표. 추가 향상이 필요하면 D4의 `GLTFUnitProvider` 어댑터로 외부 GLTF 에셋을 드롭인 교체하는 경로가 이미 준비되어 있음.
- **미검증 항목 ⚠️**: 브라우저 확장 미연결로 육안 확인 못함 — 사용자가 `localhost:5180`(HMR 자동 반영)에서 재확인 필요.

## Sprint 4 — 입력/선택/합법수 하이라이트 + 이동 애니메이션 + 기본 HUD — 구현 완료(브라우저 육안 확인 대기) ⚠️

- 목표: 클릭으로 기물 선택 → 합법수 하이라이트 → 클릭 이동. 캐슬링/앙파상/프로모션 포함 전체 규칙으로 로컬 2인 완주 가능.
- 생성 파일:
  - `packages/client/src/input/{Raycaster,PointerController}.ts`
  - `packages/client/src/game/{EventBus,GameSession,HotSeatController}.ts`
  - `packages/client/src/ui/{HUD,MoveList,TurnIndicator}.ts`
  - `packages/client/src/anim/movementClips.ts`
  - `packages/client/src/units/UnitBoard.ts`(추가 파일, DEVIATIONS 기록)
  - `packages/client/src/main.ts`(교체 — Sprint 3의 대표 12유닛 데모를 실제 32기물 `Position` 기반 게임으로 전환)
- 구현 내용:
  - `GameSession`이 `chess-core`(`generateLegalMoves`/`makeMove`/`toSAN`/`getGameResult`)를 감싸고 `EventBus`로 `selectionChanged`/`moveApplied`/`promotionNeeded`/`gameEnded`를 emit — 렌더러가 룰 엔진을 직접 건드리지 않음(D1 레이어 경계)
  - `UnitBoard`가 `Position`↔`UnitInstance` 32개를 동기화, 캐슬링(룩 동반 이동)·앙파상(대각선 뒤 칸 기물 제거)·프로모션(유닛 교체) 전부 처리
  - `movementClips.ts`에 D5-2 표의 6종 전체 구현: Pawn(직선), Knight(2구간 포물선 총 0.65s 고정), Bishop(2차 베지에 활공+0.15 부양), Rook(칸별 easeInQuad 스텝), Queen(3차 베지에 S자), King(직선, 느림) — 소요시간 공식과 이징 함수 전부 설계 수치 그대로
  - `Raycaster`는 개별 유닛 메시가 아니라 보드 평면 1개만 레이캐스트(D7 성능 규칙), `PointerController`는 이동거리/시간 임계값으로 OrbitControls 카메라 드래그와 기물 클릭을 구분
  - HUD: 턴 인디케이터, SAN 기보 목록, 프로모션 선택 모달(퀸/룩/비숍/나이트, 44×44px 이상 버튼)
  - 애니메이션 중 입력 잠금(`inputLocked`) + `RenderScheduler.markDirty()` 유지로 이동 중 60fps 보장
- 검증 결과:
  - `npx tsc --build --force`: 0 에러
  - `eslint packages/*/src --ext .ts`: 0 에러
  - `vitest run`: 26/26 통과(신규 유닛테스트 없음 — 게임 세션 로직은 chess-core 위에 얇게 얹은 것이라 chess-core 자체 테스트로 핵심 정확성은 이미 커버됨. 다음 스프린트에서 UI 통합 시나리오 테스트 추가 검토)
  - `npm run build`: 성공, gzip 156.42 KB(예산 900KB 대비 여유)
  - `chess-core`에 `three` import 없음, `any`/`TODO`/`FIXME` 0건
- 이탈 기록: `docs/DEVIATIONS.md` [스프린트 4] 3건(UnitBoard.ts 추가 파일, 캡처 클램프 미적용 — Sprint 5 이후 정식 도입, Rook 정지 프레임 단순화)
- **브라우저 육안 확인**: 사용자가 `localhost:5180`에서 직접 확인, 콘솔 에러 없음 확인 완료(2026-08-18).
- DoD 충족 여부: D9-2 Sprint 4 DoD 전 항목 충족 ✅
- 다음 스프린트 준비 상태: ✅ (Sprint 5 — 범용 전투 연출 + 오디오 코어 진행 가능)

## Sprint 5 — 캡처 시 범용 전투 연출 + 오디오 코어 — 구현 완료(브라우저 육안 확인 대기) ⚠️

- 목표: 캡처 발생 시 `generic.strike` 폴백 연출과 기본 사운드가 재생되는 파이프라인 검증.
- 생성 파일:
  - `packages/client/src/anim/{CombatDirector,AnimationController}.ts`, `anim/data/combatScenes/generic.strike.ts`
  - `packages/client/src/audio/{AudioGraph,SoundRegistry}.ts`, `audio/synth/{footstep,impact,shimmer,stinger}.ts`
  - `packages/client/src/anim/__tests__/AnimationRegistry.test.ts`(D9 DoD 요구 — 레지스트리 확장성 증명)
- 구현 내용:
  - `CombatDirector`가 `AnimationRegistry.getCombatScene()`이 반환한 순수 데이터만 재생 — 신규 연출 추가 시 이 클래스는 절대 수정되지 않음(R12, Sprint 6에서 diff 0 검증 예정)
  - D5-2 클램프 규칙(캡처 이동은 목적지 (squares-0.5)/squares 지점까지만 재생) 정식 도입 — Sprint 4 DEVIATIONS 항목 해소
  - D5-5 시네마틱 카메라: OrbitControls 비활성화 후 `CombatSceneDef.camera.curve`를 방어자 기준 오프셋으로 보간, 종료 시 원래 카메라 위치/타깃으로 복원
  - VFX: 임팩트 시 흰 플래시(emissive 순간 상승), 소멸 시 80개 파티클 버스트(포물선 낙하+opacity 페이드)
  - SFX: `AudioGraph`(master→sfx/ui/music/ambience 버스) + `SoundRegistry` + 4종 절차적 합성(footstep/impact/shimmer/stinger, 오실레이터+노이즈+엔벨로프+필터, D8 철학) — 첫 제스처에서 `AudioContext.resume()`, 백그라운드 전환 시 suspend
  - 연출 스킵: 캡처 연출 재생 중 클릭 또는 ESC로 즉시 스킵(`CombatDirector.requestSkip()`) → 최종 상태로 즉시 정리
  - `CinematicPacing`(Full/Short/Off) 메커니즘 구현(D5-4) — Short는 0.5배속, Off는 연출 생략하고 즉시 확정. 설정 UI 연결은 Sprint 8(설정 화면)에서
- 검증 결과:
  - `npx tsc --build --force`: 0 에러
  - `eslint packages/*/src --ext .ts`: 0 에러
  - `vitest run`: **30/30 통과**(chess-core 26 + 신규 `AnimationRegistry.test.ts` 4건 — 미등록 조합 폴백, `registerCombatScene()`만으로 신규 조합 조회 가능함을 증명, semver 핫스왑, idle 클립 미바인딩 시 throw)
  - `npm run build`: 성공, gzip 160.07 KB
  - `chess-core`에 `three` import 없음, `any`/`TODO`/`FIXME` 0건
- **버그 발견·수정(레지스트리 확장성 테스트 작성 중 발견)**: `registerCombatScene()`이 호출자가 준 `def.id` 문자열을 그대로 Map 키로 썼는데, 조회는 `${attacker}.${defender}`로 **계산한** 키를 썼다 — id 컨벤션을 안 지키면 조용히 폴백으로 새는 버그였음. `combatSceneId(def.attacker, def.defender)`로 키를 직접 계산하도록 수정(제네릭 폴백만 예외). `docs/DEVIATIONS.md` [스프린트 5] 참조. Sprint 6에서 36개 연출을 등록하기 전에 발견되어 다행.
- 이탈 기록: `docs/DEVIATIONS.md` [스프린트 5] 1건(위 버그 수정)
- **미검증 항목 ⚠️**: 브라우저 확장 미연결로 육안 확인 못함. 확인 필요: (1) 아무 기물이나 캡처하면 흰 플래시+파티클+사운드가 재생되는지, (2) 연출 중 카메라가 전환됐다가 원위치로 복귀하는지, (3) 클릭/ESC로 스킵이 되는지, (4) 스킵/재생 후 기물 개수·위치가 정확한지(체스 상태 정합성), (5) 콘솔 에러 0건. `localhost:5180`(HMR 자동 반영)에서 확인 가능.
- DoD 충족 여부: 코드 레벨(폴백 연출+사운드 재생, 스킵, 레지스트리 확장성 단위테스트) 충족, "브라우저 실측"만 미완료
- 다음 스프린트 준비 상태: ⚠️ (브라우저 확인 후 Sprint 6 — 전투 연출 매트릭스 36종 전체, 공격자별 6분할 세션 권장)

## Sprint 6 — 전투 연출 매트릭스 36종 전체(데이터 주도) + 카메라 시네마틱 — 구현 완료(브라우저 육안 확인 대기) ⚠️

- 목표: D5-3의 36개 조합을 전부 데이터로 등록하고 시네마틱 카메라 전환을 구현한다.
- 생성 파일:
  - `packages/client/src/anim/data/combatScenes/{pawn,knight,bishop,rook,queen,king,index}.ts` — 36개 `CombatSceneDef` + 취합 인덱스
  - `packages/client/src/anim/CameraRig.ts` — `CombatDirector`에서 카메라 수학을 분리(Catmull-Rom 커브 보간, 0.4s easeOutCubic 복귀)
  - `packages/client/src/anim/__tests__/CombatSceneMatrix.test.ts`(D9 DoD 요구 — 36건 전수 조회 검증)
- 구현 내용:
  - 가이드 권장대로 **공격자별 6분할**로 병렬 작업(폰/나이트/비숍/룩/퀸/킹 각 서브에이전트 1개) — 각자 D5-3 산문에서 총 길이·비트 타이밍·히트스톱·스킵 지점·카메라를 그대로 옮기고, King이 방어자인 6개 조합은 `kind:'result'`(체크메이트 플로리시, 유닛 비소멸), King×King은 상징적 대치로 처리
  - `CombatDirector.ts`/`AnimationController.ts`/`AnimationRegistry.ts`는 이번 스프린트에서 **한 줄도 수정되지 않음**(CameraRig 분리는 36개 등록 이전의 1회성 아키텍처 정리) — R12 "연출 추가 시 엔진 diff 0" 보장을 6개 서브에이전트 결과물 전부에 대해 확인
  - `CameraRig`: `CameraShotDef.curve`를 `THREE.CatmullRomCurve3`로 보간(제어점 1개 이상 지원), `lensMm`→FOV 환산, 종료 시 0.4s easeOutCubic으로 원래 궤도 카메라 위치/타깃 복귀(즉시 스킵 시엔 강제 1프레임 완료)
- 검증 결과:
  - `npx tsc --build --force`: 0 에러
  - `eslint packages/*/src --ext .ts`: 0 에러
  - `vitest run`: **70/70 통과**(chess-core 26 + AnimationRegistry 4 + `CombatSceneMatrix.test.ts` 40건 — 36개 조합 전수 개별 검증 + King 방어자 result 비트 + King 공격자 death 비트 + 전 씬 vfx/sfx가 엔진 구현 id만 사용하는지 검증)
  - `npm run build`: 성공, gzip 163.23 KB(예산 900KB 대비 여유)
  - `chess-core`에 `three` import 없음, `any`/`TODO`/`FIXME` 0건
- 이탈 기록: `docs/DEVIATIONS.md` [스프린트 6] 1건(VFX/SFX를 D5-3 산문 그대로가 아니라 기존 2개 effectId/7개 cueId로 한정 — 카메라/타이밍/hitStop/파티클수는 36개 전부 설계 수치 그대로 다름)
- **미검증 항목 ⚠️**: 브라우저 확장 미연결로 육안 확인 못함. 확인 필요: (1) 서로 다른 기물 조합으로 여러 번 캡처해 매번 카메라 프레이밍·타이밍이 달라지는지, (2) 킹을 체크메이트로 몰았을 때 킹이 사라지지 않고 항복 포즈만 취하는지(가능하면), (3) 연출 반복 재생 후에도 콘솔 에러 0건.
- DoD 충족 여부: D9-2 Sprint 6 DoD 전 항목 코드 레벨 충족(36건 조회+단위테스트, 엔진 diff 0, 카메라 복귀), "브라우저 실측"만 미완료
- 사용자가 별도 육안 재확인 언급 없이 "다음 진행해"로 Sprint 7 착수 지시(2026-08-18) — 브라우저 실측은 추후 필요 시 진행
- 다음 스프린트 준비 상태: ✅ (Sprint 7 — AI Worker + 4단계 난이도 진행)

## Sprint 7 — AI Worker + 4단계 난이도 — 구현 완료 ✅

- 목표: 4단계 CPU 난이도가 Web Worker에서 동작하며 메인 스레드를 블록하지 않는다.
- 생성 파일:
  - `packages/client/src/ai/worker/{pst,evaluate,search,openingBook,ai.worker}.ts`, `packages/client/src/ai/AiWorkerHandle.ts`
  - `packages/client/src/ai/worker/__tests__/{evaluate,search,openingBook,selfPlay}.test.ts`
- 구현 내용:
  - `pst.ts`: D3 PST 12개 표(6기물×MG/EG) 전부 원문 수치 그대로, White/Black 랭크 미러링
  - `evaluate.ts`: 재료값+PST(Tapered) + 폰구조(고립/이중/통과+연결통과) + 킹 안전(폰쉴드/오픈파일/킹존공격) + 기동성 + 비숍페어 + 룩오픈파일 — D3 수치 전부 반영
  - `search.ts`: negamax + alpha-beta + TT + quiescence + null-move pruning + LMR + aspiration window + MVV-LVA/killer/history 무브오더링 + 반복심화(`iterativeDeepen`), Beginner/Intermediate 전용 `evaluateRootMovesShallow`(풀윈도우 루트 수 독립 평가)
  - `openingBook.ts`: 경량 JSON 포맷(D3 Open Decision 옵션 A) King's Pawn/Queen's Pawn 2계열 완전 연결 체인
  - `ai.worker.ts`: `AI_SEARCH_REQUEST/ABORT` ↔ `AI_SEARCH_PROGRESS/RESULT/ABORTED` 프로토콜, 4난이도 설정 테이블(depth/기능플래그/블런더확률/topN/북사용여부), `postMessage`/`addEventListener`만 사용(DOM/Three 미접근 — `self` 전역 타입 충돌 없이 파일 로컬 선언으로 우회)
  - `AiWorkerHandle.ts`: 메인 스레드 핸들, 요청 직렬화(이전 요청 abort 완료 후 신규 요청), Worker 생성/종료 관리
- 검증 결과:
  - `npx tsc --build --force`: 0 에러
  - `eslint packages/*/src --ext .ts`: 0 에러
  - `vitest run`: **79/79 통과**(기존 68 + 신규 11: evaluate 대칭성 3 + search 메이트인1/걸린기물포획/얕은평가 정렬 3 + openingBook 연결성 2 + **자기대국 20판 20:0**(DoD 기준 15승 이상 대비 압도))
  - `npm run build`: 성공, gzip 163.23 KB — AI 코드는 아직 `main.ts`가 참조하지 않아 앱 번들에는 포함 안 됨(Sprint 8에서 CPU 모드 진입점과 함께 연결 예정, 의도적)
  - `chess-core`/`ai` 어디에도 `three` import 없음, `any`/`TODO`/`FIXME` 0건
- **버그 발견·수정(테스트 작성 중 발견)**: 오프닝북 fenPrefix 2건이 실전 도달 불가능한 상태(앙파상 필드 누락 1건, 중간 노드 누락으로 체인 단절 1건) — 그래프 도달성 테스트로 잡아냄. `docs/DEVIATIONS.md` [스프린트 7] 참조.
- 이탈 기록: `docs/DEVIATIONS.md` [스프린트 7] 5건(이동성 유사공격칸 근사, Beginner/Intermediate depth 문서 불일치 해소, 오프닝북 버그 수정, AI-UI 미연결은 의도적 Sprint 8 이관, 자기대국 테스트 depth 축소)
- DoD 충족 여부: D9-2 Sprint 7 DoD 전 항목 충족 ✅ — 4난이도 동작(단위테스트), 자기대국 20:0(기준 15승 이상), `ai.worker.ts` postMessage 전용 통신 확인. "메인 스레드 프레임타임 20ms 미만 유지"는 실제 게임 루프에 연결된 Sprint 8 이후 브라우저 실측 필요(현재는 AI가 UI에 연결 안 돼 있어 실측 대상 자체가 없음)
- 다음 스프린트 준비 상태: ✅ (Sprint 8 — Bo3 매치 플로우 + 결과/설정 화면, 여기서 AI Worker를 실제 CPU 대전 모드에 연결)

## Sprint 8 — Bo3 매치 플로우 + 결과/설정 화면 — 구현 완료(브라우저 육안 확인 대기) ⚠️

- 목표: 3판 2선승 매치 전체 흐름과 설정 화면 완성, 로컬/CPU 대전에서 Bo3·Bo1 완주 → 최종 승자 화면.
- 생성 파일:
  - `packages/client/src/game/{MatchState,MatchController}.ts`
  - `packages/client/src/ui/{ResultModal,IntermissionScreen,SettingsScreen,MainMenu}.ts`
  - `packages/client/src/main.ts`(대폭 교체 — 메뉴→매치→결과 흐름 + CPU 자동 착수 연결)
  - `packages/client/src/game/GameSession.ts`(수정 — `game:gameEnded` 페이로드에 `position` 추가, `MatchController`가 최종 FEN을 만들 수 있도록)
- 구현 내용:
  - `MatchController`가 Bo1/Bo3 판 진행·D6 색 교대 규칙(판마다 교대)·스코어 집계·매치 종료 판정을 전담. 게임 종료마다 D10 스키마 그대로의 `LocalGameRecord`(SAN 4096B 상한 처리 포함)를 축적
  - **매치 종료 시 `game:matchEnded`를 D1 §이벤트 버스 표(`ARCHITECTURE.md`)의 페이로드 필드명과 1:1 정확히 일치**하게 발행(`localMatchId/source/format/scoreMine/scoreOpponent/outcome/games`) — Sprint 9 `MatchRecorder`가 그대로 구독 가능하도록 선행 확보(DoD 명시 요구사항)
  - `MainMenu`: 로컬2인/CPU대전 선택, CPU 시 난이도 4단계 노출, Bo1/Bo3 선택, 설정 진입
  - `SettingsScreen`: 그래픽 품질(Low~Ultra)/연출 길이(Full/Short/Off)/볼륨 3종 — 변경 즉시 `renderer.setPixelRatioCap`/`combatDirector.setPacing`/`audioGraph` 버스 게인에 반영(재시작 불필요)
  - `IntermissionScreen`: 판 종료마다(마지막 판 제외) 결과+누적 스코어+"다음 판 시작" 표시. `ResultModal`: 매치 최종 결과+"다시 하기"/"메인 메뉴" 표시
  - **CPU 대전 연결**: `AiWorkerHandle`을 `main.ts`에서 지연 생성(lazy), 사람 쪽 수가 정착되면(캡처 연출 종료 또는 이동 애니메이션 종료) CPU 차례인지 확인 후 자동으로 `requestMove()` 호출 → D3 §사고 중 연출 시간(최소 지연 400~800ms)을 채운 뒤 `session.attemptMove()`로 반영. CPU 차례엔 클릭 입력 무시
- 검증 결과:
  - `npx tsc --build --force`: 0 에러 (2건의 `exactOptionalPropertyTypes` 위반 수정: `promo`/`cpuDifficulty` optional 필드에 `undefined`를 명시 대입하는 대신 조건부 스프레드로 필드 자체를 생략)
  - `eslint packages/*/src --ext .ts`: 0 에러
  - `vitest run`: **79/79 통과**(신규 유닛테스트 없음 — 이번 스프린트는 오케스트레이션/UI 배선이라 기존 AI·룰엔진 테스트가 이미 핵심 로직을 커버. 게임/매치 통합 시나리오 테스트는 Sprint 9의 서버 연동 테스트에서 함께 다룰 예정)
  - `npm run build`: 성공, gzip **167.35 KB** — **AI Worker가 이번에 처음으로 실제 앱 번들에 연결**되어 별도 청크(`ai.worker-*.js`, 20.69 KB)로 정상 분리된 것을 빌드 로그로 확인
  - `chess-core`에 `three` import 없음, `any`/`TODO`/`FIXME` 0건
- 이탈 기록: 없음(신규 파일 전부 D9 Sprint 8 산출 파일 목록과 정확히 일치)
- **미검증 항목 ⚠️**: 브라우저 확장 미연결로 육안 확인 못함. 확인 필요: (1) 메인 메뉴에서 로컬2인/CPU 선택 후 시작이 되는지, (2) CPU 대전에서 실제로 AI가 자동으로 응수하는지(생각 중 최소 지연 체감), (3) Bo3에서 판 종료 후 인터미션→다음 판→색 교대가 맞는지, (4) 최종 매치 결과 화면과 스코어가 정확한지, (5) 설정 변경(품질/연출길이/볼륨)이 즉시 반영되는지, (6) 콘솔 에러 0건. `localhost:5180`(HMR 자동 반영)에서 확인 가능 — 이번엔 첫 화면이 메인 메뉴로 바뀌어 "시작" 버튼을 눌러야 보드가 나타남에 유의.
- **버그 발견·수정(사용자 육안 확인으로 발견)**: 매치 시작 후 클릭·카메라 드래그가 전혀 반응하지 않음(콘솔 에러 없음). 원인: `MainMenu`를 감싼 빈 `mainMenuContainer` 래퍼 div(`inset:0`)가 `mainMenu.hide()` 이후에도 화면 전체를 덮은 채 남아 모든 포인터 이벤트를 가로챔. 래퍼를 제거하고 `MainMenu`를 `app`에 직접 마운트하도록 수정. `docs/DEVIATIONS.md` [스프린트 8] 참조. tsc/lint/build 재확인 완료.
- DoD 충족 여부: 코드 레벨(Bo3/Bo1 완주 로직, 설정 즉시반영, `game:matchEnded` 정확한 페이로드) 충족 + 클릭 무반응 버그 수정, "브라우저 재확인"만 대기
- **추가 버그 3건**(사용자 실측으로 순차 발견·전부 수정, 전부 `docs/DEVIATIONS.md`에 기록): (1) 비캡처 이동 후 CPU 차례가 트리거되지 않아 CPU가 멈춰 있던 문제, (2) 캡처 플래시가 진영 공유 재질을 직접 수정해 같은 진영 전 기물이 하얗게 밝아지던 문제, (3) 전투 연출 카메라의 FOV가 복원되지 않아 줌아웃이 막히던 문제(게임 진행 불가 수준의 심각도). 사용자가 전부 재확인 완료.
- 다음 스프린트 준비 상태: ✅ (Sprint 9 — 서버+온라인 대전+재접속+전적 영속화(R15), 세션 2개 분할: 9a 서버/재접속, 9b 영속화)

## Sprint 9a — 서버 + 온라인 대전(프로토콜/재접속) — 구현 완료(온라인 UI 미연결) ⚠️

- 목표: 권위 서버 기반 온라인 1:1이 재접속을 포함해 안정적으로 동작한다.
- 생성 파일:
  - `packages/protocol/{package.json,tsconfig.json,src/{messages,index}.ts}` — 20종 메시지 discriminated union(Envelope 패턴)
  - `packages/server/{package.json,tsconfig.json,src/{index,session,clock,room,match,netServer}.ts,src/__tests__/{match,integration}.test.ts}`
  - `packages/client/src/net/{NetClient,PredictionBuffer,ReconnectController}.ts`
  - 루트 `tsconfig.json`(protocol/server 참조 추가), `package.json`(`ws`/`@types/node`/`@types/ws`/`tsx` 의존성 추가)
- 구현 내용:
  - `MatchState`: chess-core를 그대로 재사용해 서버가 모든 수를 재검증(`generateLegalMoves` 대조), D6-4 Bo3 색 교대(게임1 무작위/게임2 반대/게임3 게임1과 동일)·스코어·매치종료 판정
  - `ServerClock`: 서버 권위 시계 + 레이턴시 보상(최대 150ms 차감), 프리셋별 증가시간
  - `RoomManager`: quick 매칭 큐 + 6자리 룸코드(D6-9 문자셋) 발급/입장/만료
  - `NetServer`: HELLO/PLAYER_IDENTIFY/QUEUE_JOIN/MOVE/RESIGN/RECONNECT/DRAW_OFFER/CHAT/EMOTE/INTERMISSION_READY 전부 라우팅, MOVE 레이트리밋(초당5), 하트비트 스윕(20초 무응답 disconnect), 재접속 grace 60초(D6-6), 이탈 시 몰수패(D6-7)
  - `NetClient`: 브라우저 WebSocket 래퍼, 15초 하트비트, `PredictionBuffer`로 미확인 수 추적, `ReconnectController`가 세션 토큰을 `localStorage`에 보관하고 연결 끊김 시 자동 재접속 시도
- 검증 결과:
  - `npx tsc --build --force`: 0 에러
  - `eslint packages/*/src --ext .ts`: 0 에러
  - `vitest run`: **87/87 통과**(기존 79 + 신규 8건 — `match.test.ts` 5건(불법수 1000건 근사 거부, Bo3 색교대, 매치종료 판정) + `integration.test.ts` 3건(**실제 소켓 2개로 폴즈메이트 완주 → MATCH_END 양쪽 수신**, 불법수 MOVE_REJECTED, **재접속 STATE_SYNC 완전 일치**))
  - `npm run build`: 성공, gzip 167.38 KB(net 레이어는 아직 `main.ts`가 참조 안 해 번들 크기 불변)
  - 서버 `tsx`로 직접 기동해 HTTP 응답 확인(`[server] listening on :8787`)
  - `chess-core`에 `three` import 없음, `any`/`TODO`/`FIXME` 0건
- **버그 발견·수정 2건(통합 테스트 작성 중 발견)**: (1) 게임 종료 시 `gameIndex`가 이미 증가된 뒤에 승자 색-플레이어 매핑을 조회해 점수가 잘못 합산될 뻔한 문제, (2) 테스트 하네스 자체의 경합(동시 도착 메시지를 `received.length=0`으로 지워버림) — 둘 다 `docs/DEVIATIONS.md` [스프린트 9a] 기록
- **설계 공백 보완**: `MATCH_FOUND` 페이로드에 `sessionToken` 필드 추가(D6-6은 이 시점 발급을 명시하지만 D6-2 필드 표에는 누락되어 있어 재접속이 원천적으로 불가능했음)
- 이탈 기록: `docs/DEVIATIONS.md` [스프린트 9a] 4건
- **미완료 항목 ⚠️**: `MainMenu`에 "온라인 대전" 진입점을 아직 연결하지 않음 — 서버/프로토콜/net 레이어는 실제 WebSocket 통합 테스트로 검증됐지만, 실제 브라우저 두 탭으로 수동 확인은 다음 세션 과제. 낙관적 롤백의 200ms 스냅백+토스트 UI, `OPPONENT_DISCONNECTED` 배너 UI도 미구현.
- DoD 충족 여부: 서버측 로직(불법수 거부, Bo3 완주, 재접속 STATE_SYNC) 전부 자동화 테스트로 검증 완료. "브라우저 두 탭 수동 완주"·"롤백 UX 200ms 육안 확인"은 온라인 UI 연결 후 진행 필요
- 다음 세션 준비 상태: ⚠️ (온라인 UI 연결 + 브라우저 실측 후 Sprint 9b — 전적 영속화(R15) 진행 권장)

## Sprint 9c — 온라인 대전 UI 연결

- 목표: `MainMenu`의 "온라인 대전" 진입점을 실제 `NetClient`/서버에 연결해, 브라우저 두 탭으로 온라인 Bo1/Bo3를 완주할 수 있게 한다.
- 생성/수정 파일:
  - `packages/client/src/game/GameSession.ts`(수정 — `game:positionReset` 이벤트 + `loadPosition(fen)` 메서드 추가, D6-1/D6-6 롤백·재접속용)
  - `packages/client/src/ui/MainMenu.ts`(수정 — 대전 방식 토글에 `online` 추가)
  - `packages/client/src/main.ts`(대폭 수정 — 온라인 모드 상태/이벤트 배선 전체 추가)
- 구현 내용:
  - `startOnlineMatch()`: `NetClient`/`ReconnectController`를 지연 생성(lazy) → `connect()` → `HELLO`(자동) → `PLAYER_IDENTIFY`(로컬스토리지 `bcr.playerId`/`bcr.nickname`, 최초 1회 발급 후 재사용 — 로그인 없는 저마찰 식별) → `QUEUE_JOIN`(quick, 매치 형식은 메뉴에서 고른 Bo1/Bo3 그대로 전달) 순으로 자동 진행
  - `MATCH_FOUND` 수신 시 새 `GameSession`을 생성해 `bindOnlineSessionEvents()`로 바인딩(로컬/CPU용 `bindSessionEvents()`와는 별도 경로 — `MatchController`/`HotSeatController`를 쓰지 않고 온라인 매치는 서버가 곧 `MatchController` 역할)
  - 내가 둔 수만 서버로 전송: `lastMoveWasLocalInput` 플래그를 클릭 처리 시점에 세팅 → `game:moveApplied`에서 그 플래그가 서 있을 때만 `clientMoveId`를 발급해 `NetClient.sendMove()` 호출 + `ownPendingMoveIds`에 등록. `MOVE_ACCEPTED` 수신 시 그 id가 내가 보낸 것이면 무시(이미 낙관적으로 반영됨), 아니면 상대 수이므로 `attemptMove()`로 반영
  - `MOVE_REJECTED` 수신 시 `GameSession.loadPosition(authoritativePosition)`으로 서버 권위 FEN에 즉시 스냅 + D6-1 명시 롤백 UX(0.15초 빨간 테두리 플래시 + 2초 토스트, `showRollbackToast()`)
  - `GAME_END`/`MATCH_END`는 로컬 매치와 동일한 `IntermissionScreen`/`ResultModal` 컴포넌트로 매핑 재사용(서버 페이로드 → `GameResult`/`MatchOutcome` 변환 헬퍼 `serverGameEndToResult()` 신설)
  - `OPPONENT_DISCONNECTED` 수신 시 HUD 턴 텍스트에 남은 유예시간(초) 표시
  - 클릭 입력 게이팅: `trySquareClick()`이 `currentConfig.source==='online'`이면 `onlineSession`/`onlineMyColor` 기준으로 분기(내 차례가 아니면 무시), 기존 로컬/CPU 분기와 공통 로직(`handleBoardClick()`)은 헬퍼로 추출해 3개 모드가 공유
- 검증 결과:
  - `npx tsc --build --force`: 최초 2건(`TS18047 'app' is possibly 'null'` — 최상위 `function` 선언 내부 클로저에서 null-narrowing이 유지되지 않는 문제) → `app` 선언을 non-null 타입 주석이 붙은 상수로 재선언해 해결, 이후 0 에러
  - `eslint packages/*/src --ext .ts`: 0 에러
  - `npm run build`: 성공
  - `vitest run`: 백그라운드 실행 중(신규 테스트 파일 없음 — 이번 스프린트는 UI 배선이라 net/서버 로직은 Sprint 9a 통합 테스트가 이미 커버)
  - 게임 서버(`packages/server`, PORT 8787)를 `npm run dev --workspace=packages/server`로 백그라운드 기동, `netstat`으로 리스닝 확인. 클라이언트 dev 서버(`localhost:5180`)는 계속 기동 중
- 이탈 기록: `docs/DEVIATIONS.md` [스프린트 9c] 참조(TS18047 타입 표현 이슈 1건, 로직 변경 없음)
- **미검증 항목 ⚠️**: 브라우저 확장 미연결로 육안 확인 못함. 확인 필요: (1) 메인 메뉴에서 "온라인 대전" 선택 후 매칭이 진행되는지(두 탭을 동시에 열어야 매칭됨), (2) 두 탭에서 번갈아 수를 두면 상대 화면에 그대로 반영되는지, (3) 캡처/프로모션 연출이 온라인 모드에서도 로컬과 동일하게 재생되는지, (4) 일부러 불법수를 유발했을 때(예: 네트워크 지연 중 동시 클릭) 롤백 플래시+토스트가 뜨는지, (5) Bo3 완주 후 인터미션→다음 판 색 교대→최종 결과 화면이 맞는지, (6) 한쪽 탭을 닫았을 때 상대 화면에 "연결 끊김" 메시지가 뜨는지, (7) 콘솔 에러 0건. `localhost:5180`을 새 탭 2개로 열어 확인 — 서버는 이미 `:8787`에서 실행 중.
- DoD 충족 여부: 코드 레벨 배선 완료(서버는 Sprint 9a에서 자동화 테스트로 이미 검증) + tsc/eslint/build green, "브라우저 두 탭 실측"만 대기
- **사용자 실측 이슈 1건**: 같은 브라우저 두 탭으로 테스트 시 `localStorage` 공유로 인해 두 탭이 동일한 `playerId`를 받아 한쪽이 매칭 알림을 못 받는 문제 — 코드 결함이 아니라 테스트 방법론 이슈로 판정(실제 서비스에서는 발생 불가), 시크릿 창/다른 브라우저로 재테스트 안내. `docs/DEVIATIONS.md` [스프린트 9c] 참조.
- **추가 요청 반영**: 매칭 20초 타임아웃 UX — `packages/client/src/ui/MatchmakingScreen.ts` 신설(검색 중 모달 + 타임아웃 시 "대기 중인 온라인 사용자가 없습니다" 안내와 "메인 메뉴로" 버튼). `main.ts`에 `startQueueTimeout()`/`clearQueueTimeout()` 배선 — `QUEUE_JOIN` 전송 직후 20초 타이머 시작, `MATCH_FOUND` 수신 시 취소, 타임아웃 시 소켓 연결을 끊고 안내 화면 표시 후 버튼 클릭으로 메인 메뉴 복귀. tsc/eslint/build 재확인 완료(0 에러).
- 다음 스프린트 준비 상태: ⚠️ (사용자가 시크릿 창 등으로 두 탭 온라인 대전 실측 확인 후 Sprint 9b — 전적 영속화(R15)로 진행)
