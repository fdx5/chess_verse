# DEVIATIONS.md — 설계 대비 구현 이탈 기록

형식:
```
## [스프린트 N] 항목명
- 설계: ...
- 문제: ...
- 제안: ...
- 결정: (사용자 확인 대기)
```

## [스프린트 1] Zobrist 해시 증분 갱신 vs 전체 재계산
- 설계: D2는 `makeMove`가 관련 `pieceKeys`/`castlingKeys`/`epFileKeys`/`sideToMoveKey`만 XOR로 토글하는 O(1) 증분 갱신을 명시.
- 문제: 없음(구현 불가 아님) — Sprint 1은 정확성(perft 통과)이 최우선이므로, 버그 표면적이 작은 `zobristHash(pos)` 전체 재계산(O(64))을 `makeMove` 내부에서 그대로 호출하는 방식으로 우선 구현함.
- 제안: Sprint 11(성능 프로파일링)에서 AI 탐색 핫패스의 실측 결과 해시 재계산이 병목으로 확인되면 그때 증분 XOR 갱신으로 교체.
- 결정: 채택(낮은 리스크 최적화 유예) — perft 26/26 통과로 정확성은 이미 검증됨. 사용자 확인 필요 시 알려주시면 지금 증분 방식으로 교체 가능.

## [스프린트 3] `units/builders/PartKit.ts` 추가 파일
- 설계: D9 Sprint 3 산출 파일 목록에는 6개 Builder + UnitProvider/ProceduralUnitFactory/GLTFUnitProvider/BoneRig만 명시.
- 문제: 없음 — D9 §Sprint 3 리스크 항목이 스스로 "공통 파츠 빌더 헬퍼(Box/Cylinder/Capsule 조합 유틸)를 먼저 만들어 6종에 재사용"할 것을 명시적으로 권고했으므로, 그 권고를 따른 최소 추가 파일.
- 제안/결정: 채택. 6개 Builder가 전부 이 헬퍼로 사지(팔/다리)를 조립해 반복 코드를 줄임.

## [스프린트 3] 본(Bone) 리깅 방식 — 스킨 웨이트 없는 강체(rigid) 계층
- 설계: 01 프롬프트 §1.3 "절차적으로 생성한 파츠를 THREE.Bone 계층에 바인딩하여 스켈레탈 애니메이션이 가능하도록 설계"만 명시하고, 버텍스 스키닝(SkinnedMesh + skinIndex/skinWeight) 여부는 명시하지 않음.
- 문제: 없음 — D4 §2 파츠 분해가 이미 각 사지를 독립된 실린더/박스 세그먼트로 분해하고 있어(예: Pawn 팔 = shoulder→elbow→hand 세그먼트 메시), 연속 표면을 매끄럽게 변형시키는 버텍스 스키닝이 애초에 불필요함.
- 결정: 각 `THREE.Bone`이 자신의 파츠 메시를 직접 자식으로 소유하는 강체(rigid) 계층으로 구현(본 회전 = 자식 메시 전체 회전). `AnimationMixer`는 이 계층에 `THREE.Bone.quaternion` 트랙으로 정상 바인딩되므로 애니메이션 재생 방식 자체는 설계와 동일. SkinnedMesh 버텍스 블렌딩이 필요해지면(예: 매끄러운 로브 변형) 개별 파츠만 골라 전환 가능.

## [스프린트 4] `units/UnitBoard.ts` 추가 파일
- 설계: D9 Sprint 4 산출 파일 목록에는 `input/{PointerController,Raycaster}`, `game/{GameSession,EventBus,HotSeatController}`, `ui/{HUD,MoveList,TurnIndicator}`, `anim/movementClips.ts`만 명시.
- 문제: 없음 — `Position`(chess-core) ↔ 씬 그래프의 `UnitInstance` 32개를 동기화(생성/제거/캐슬링·앙파상·프로모션 처리)하고 D5-2 이동 트윈·D7 하이라이트를 구동할 책임 소재가 명시된 파일 중 어디에도 자연스럽게 속하지 않아 별도 클래스로 분리.
- 결정: 채택. `GameSession`은 순수 룰/이벤트만 다루고(렌더러 비의존 유지), `UnitBoard`가 그 결과를 씬에 반영하는 어댑터 역할 — D1 레이어 경계 원칙(룰 엔진이 렌더러를 모름)과 정합.

## [스프린트 4] 캡처 시 이동 클램프 미적용(정식 클램프는 Sprint 5부터)
- 설계: D5-2는 "캡처를 수반하는 이동은 이동 클립이 목적지 한 칸 앞까지만 재생되고, 이후 D5-3 전투 연출이 이어받아 최종 위치를 확정"한다고 명시.
- 문제: 없음 — Sprint 4 DoD 자체가 "캡처 연출은 다음 스프린트"로 명시적으로 유예. 전투 연출(D5-3/`CombatDirector`)이 아직 없는 상태에서 절반 클램프만 적용하면 유닛이 목적지 0.5칸 앞에 영구히 멈춰 선 것처럼 보여 오히려 더 어색함.
- 결정: Sprint 4에서는 캡처 시 방어자를 즉시 제거하고 공격자를 목적지까지 완전히 이동시킨다(클램프 없음). Sprint 5(범용 전투 연출)에서 D5-2 클램프 규칙 + `CombatDirector` 핸드오프를 정식 도입.

## [스프린트 4] Rook 이동의 "칸 경계 정지" 단순화
- 설계: D5-2 Rook 행은 "직선, 단 스텝 단위로 끊어 이동(칸 경계마다 **정지** 후 스톰프)"를 명시.
- 문제: 없음 — 현재 `rookSteppedPath`는 칸 경계마다 이징을 리셋(가속-감속 재시작)해 "끊어 이동하는 무게감"은 재현하지만, 경계에서 완전히 0초간 멈춰있는 정지 구간(포즈 홀드)까지는 넣지 않았다. 총 이동시간(`0.45 * squares`)은 설계값 그대로 유지.
- 제안: Sprint 6(카메라 시네마틱)나 Sprint 11(폴리시)에서 스텝 사이에 짧은 정지 프레임(예: 각 세그먼트의 마지막 8%를 홀드)을 추가해 더 정확히 재현 가능.
- 결정: 낮은 리스크로 유예(시각적 차이가 미묘함). 사용자 확인 필요 시 지금 추가 가능.

## [스프린트 5] 버그: `registerCombatScene()`이 `def.id` 문자열을 신뢰해 조회 불가 상태를 만들 수 있었음
- 설계: D5-1은 `id: string; // \`${attacker}.${defender}\`` 컨벤션만 명시하고, 등록 시 이 문자열을 어떻게 검증/정규화할지는 정하지 않음.
- 문제: `registerCombatScene(def)`이 `def.id`를 그대로 Map 키로 사용했는데, `getCombatScene(attacker, defender)`는 `${attacker}.${defender}`(PieceType 단일 문자 코드, 예: `'p.n'`)로 **계산한** 키로 조회했다. 저자가 `id`를 컨벤션과 다르게 적으면(예: 사람이 읽기 쉬운 `'pawn.knight'`) 등록은 성공하지만 조회는 항상 실패해 조용히 `generic.strike` 폴백으로 새는 버그였다. Sprint 5 DoD가 요구한 "레지스트리 확장성 단위테스트"를 작성하는 과정에서 바로 이 실수를 재현해 발견함(정확히 Sprint 3에서 겪은 "영단어 vs 단일문자 PieceType 코드 혼동"과 같은 계열의 버그).
- 결정: `registerCombatScene()`이 `def.id` 대신 `combatSceneId(def.attacker, def.defender)`로 키를 **직접 계산**하도록 수정(단, `id === 'generic.strike'`는 실제 대전쌍이 아니므로 리터럴 키 유지). 이제 저자가 `id` 필드를 컨벤션과 다르게 적어도 조회가 항상 성공한다 — Sprint 6에서 36개 연출을 등록할 때 이런 종류의 오탈자가 재발할 수 없도록 구조적으로 막음. 회귀 테스트는 `packages/client/src/anim/__tests__/AnimationRegistry.test.ts`에 포함.

## [스프린트 6] VFX/SFX 큐를 D5-3 산문 묘사 그대로 구현하지 않고 기존 2개 effectId/7개 cueId로 한정
- 설계: D5-3의 36개 연출 각각에 고유한 VFX/SFX 산문 묘사가 있다(예: `sfx.pawn.clash.leather`, `sfx.golem.crack.stone`, "자수정색 파티클 트레일", "낙엽형 파티클" 등 — 수십 종의 서로 다른 큐를 암시).
- 문제: 없음(구현 불가 아님) — Sprint 5까지 구현된 엔진(`CombatDirector.playVfx()`, `SoundRegistry`)은 딱 2개의 VFX effectId(`vfx.flash.white`, `vfx.dissolve.particles`)와 7개의 절차합성 SFX cueId만 실제로 처리한다. Sprint 6 DoD의 핵심은 "36개 조합이 전부 조회 가능하고 엔진 파일 diff가 0"이지 "36개가 시청각적으로 전부 다르게 들리고 보인다"가 아니므로, 이번 스프린트는 방어적으로 **기존에 이미 구현된 id만 재사용**했다(존재하지 않는 effectId/cueId를 쓰면 `CombatDirector.playVfx()`가 조용히 무시하거나 `SoundRegistry.play()`가 `console.warn`을 남겨 "콘솔 에러 0" DoD를 위협할 수 있었음 — 실제로 `CombatSceneMatrix.test.ts`에 이를 강제하는 테스트를 추가함).
- 제안: Sprint 11(성능 프로파일링) 또는 Sprint 12(폴리시)에서 D8 사운드 큐 시트/D5-3 VFX 묘사 전체를 실제 절차합성 함수·파티클 프리셋으로 확장하고, 36개 연출의 `vfx`/`sfx` 필드를 그 풍부한 큐 목록으로 교체.
- 결정: 채택(의도적 스코프 절제). 시각적으로는 전 36개가 동일한 흰 플래시+디졸브 파티클을 쓰지만, **카메라 프레이밍·비트 타이밍·hitStopFrames·파티클 개수·연출 길이는 36개 전부 D5-3 수치 그대로 달라** 체감상 구분은 된다. 사용자 확인 필요 시 지금 D8 큐 확장에 착수 가능.

## [스프린트 7] 이동성(mobility) 평가를 유사(pseudo-legal) 공격 칸 수로 근사
- 설계: D3 §평가 함수 "기동성(합법수 1개당 centipawn)"은 완전한 합법수(체크 필터링 포함) 개수를 명시.
- 문제: 없음 — `evaluate()`는 탐색 트리의 모든 노드(수백만 회)에서 호출되는 핫패스인데, `chess-core`의 `generateLegalMoves()`는 항상 `pos.turn` 한쪽만 생성하고 체크 필터링 비용이 크다. 임의 색(백/흑 둘 다)의 완전 합법수를 매 평가마다 계산하는 것은 사실상 모든 상용 체스 엔진이 피하는 방식이며, 유사공격 칸 수(자신의 기물이 아닌 칸으로의 이동/공격 가능 칸)로 근사하는 것이 표준 관행이다.
- 결정: 채택. `evaluate.ts`의 `countMobility()`가 나이트/비숍/룩/퀸에 대해 오프셋 기반 유사공격 칸 수를 직접 계산(움직임 생성기 재사용 안 함, `chess-core`의 `KNIGHT_OFFSETS`/`BISHOP_OFFSETS`/`ROOK_OFFSETS`만 재사용).

## [스프린트 7] Beginner/Intermediate 난이도의 "얕은 depth" 값 — 문서 내 두 표기 중 하나를 채택
- 설계: D3 §난이도표는 Beginner "Depth 1–2", Intermediate "Depth 3–4"라고 쓰는 반면, 바로 아래 블런더 설명 문단은 "루트에서 생성된 합법수를 얕은 depth(Beginner=1, Intermediate=2)로 평가 후 정렬"이라고 써서 서로 다른 숫자를 제시한다.
- 문제: 없음(설계 문서 내부 표기 불일치) — 두 표기가 상충하므로 임의로 골라야 했다.
- 결정: 블런더 문단의 구체적 수치(Beginner=1, Intermediate=2)를 채택 — 이 문단이 "루트 수 정렬 후 top-N/블런더 선택"이라는 Beginner/Intermediate의 **전체 동작 메커니즘**을 설명하는 유일한 곳이라 알고리즘적으로 더 구체적이고 실행 가능한 근거이기 때문. 두 난이도 모두 `evaluateRootMovesShallow()`로 이 depth를 그대로 사용.

## [스프린트 7] 오프닝북 fenPrefix 3건이 서로 연결되지 않는 상태였음(테스트 작성 중 발견·수정)
- 설계: D3 Open Decision에서 채택한 옵션 A(경량 JSON 오프닝북)는 `fenPrefix` 문자열이 실제 체스 진행으로 도달 가능해야 의미가 있음.
- 문제: 손으로 작성한 FEN 문자열 중 (1) 앙파상 필드(`e6` 등)를 빠뜨려 두었던 것, (2) "1.e4 e5" 이후 노드로 바로 건너뛰고 "1.e4"(흑 차례) 중간 노드를 등록하지 않아 그 갈래가 끊겨 있던 것 — 2가지 실수가 있었다. `packages/client/src/ai/worker/__tests__/openingBook.test.ts`(북 항목 전체가 시작 포지션에서 실제로 도달 가능한지 그래프 탐색으로 검증)를 작성하는 과정에서 둘 다 발견해 즉시 수정함(이 테스트가 실패하는 것으로 발견 → `fenPrefix` 비교 필드에서 ep를 제외하도록 완화하고, 누락된 중간 노드를 채워 넣음).
- 결정: `fenPrefix` 비교를 board+turn+castling 3필드로 한정(ep 제외)하고, King's Pawn/Queen's Pawn 두 라인만 첫 노드부터 끝까지 완전히 연결된 체인으로 재구성. 회귀 테스트는 그대로 유지.

## [스프린트 7] AI Worker를 아직 게임 UI에 연결하지 않음(main.ts 미변경)
- 설계: D9 Sprint 7 산출 파일 목록은 `ai/{AiWorkerHandle.ts, worker/*}`뿐이며, CPU 대전 모드 선택 UI는 명시하지 않음.
- 문제: 없음 — 원래 요구사항(R3 "CPU 대전 4단계")의 UI 진입점(로컬2인/CPU대전/온라인 선택)은 D9 로드맵상 Sprint 8("Bo3 매치 플로우 + 결과/설정 화면")의 스코프다. Sprint 7에서 `main.ts`를 건드려 CPU 모드를 억지로 끼워 넣으면 스코프 크리프(§00 가이드 위험 신호)가 된다.
- 결정: 이번 스프린트는 AI 엔진·Worker 통신 프로토콜 자체의 정확성만 보장(단위테스트 6종 + 자기대국 20판 20:0). `main.ts`는 여전히 Sprint 4의 로컬 2인 핫시트만 지원 — Sprint 8에서 CPU 대전 진입점과 함께 `AiWorkerHandle`을 실제로 연결한다.

## [스프린트 7] 자기대국 검증 테스트는 실제 movetime이 아니라 축소된 depth로 실행
- 설계: D3 난이도표의 실제 movetime은 Beginner 300ms / Master 4000ms.
- 문제: 없음 — 그 값 그대로 20판(왕복 다수 수)을 자기대국시키면 테스트 1건에 수십 분이 걸려 CI/로컬 반복 실행에 부담이 된다.
- 결정: `selfPlay.test.ts`는 "Master급"(depth5, null-move+LMR+TT+killers+quiescence+aspiration 전부 켬)과 "Beginner급"(depth1, 기능 전부 끔)의 **기능 격차는 실제 난이도 정의와 동일하게 유지**하되 depth만 낮춰 5분 내로 실행되게 함. 결과는 20:0(마스터 전승) — DoD 기준(15승 이상)을 크게 상회. 실제 production movetime 기준 수동 검증은 Sprint 8에서 UI 연결 후 진행 권장.

## [스프린트 8] 버그: 빈 `mainMenuContainer` 래퍼가 화면 전체의 포인터 이벤트를 가로챔
- 설계: 없음(구현 실수) — `main.ts`가 `MainMenu`를 담을 `mainMenuContainer`라는 `position:absolute;inset:0` 래퍼 div를 별도로 만들고 그 안에 `MainMenu`(자체적으로 `show()/hide()`를 갖는 컴포넌트)를 넣었다.
- 문제: `mainMenu.hide()`는 `MainMenu` 자신의 `el`(내용물)만 `display:none`으로 감췄고, 그 부모인 `mainMenuContainer`는 계속 화면 전체를 덮은 채 남아있었다. 빈 `<div>`라도 `display:none`이 아니면 기본값 `pointer-events:auto`로 클릭·드래그를 전부 가로채므로, 매치 시작 후 캔버스(체스판)는 렌더링되지만 클릭은 물론 `OrbitControls` 카메라 드래그조차 전혀 반응하지 않는 상태가 됐다(사용자 보고로 발견 — 콘솔 에러 없이 조용히 막혀 있어 코드 리뷰만으로는 놓치기 쉬운 종류의 버그였다).
- 결정: 불필요한 `mainMenuContainer` 래퍼를 제거하고 `MainMenu`가 `app`에 직접 마운트되도록 수정(다른 화면들 — `SettingsScreen`/`IntermissionScreen`/`ResultModal` — 은 처음부터 래퍼 없이 자기 자신의 최상위 엘리먼트로 `show/hide`를 하고 있어 이 문제가 없었다). 앞으로 전체화면 오버레이 컴포넌트를 추가할 때는 **컴포넌트가 자기 자신의 최상위 엘리먼트를 직접 표시/숨김 처리하게 하고, 별도 래퍼 div로 감싸지 않는다**는 규칙을 유지.

## [스프린트 8] 버그: 일반(비캡처) 이동 후 CPU 차례가 트리거되지 않음
- 설계: 없음(구현 누락) — `main.ts`의 `game:moveApplied` 핸들러는 캡처 이동일 때만(`combatDirector.playCapture().then()` 콜백 안에서) `maybeTriggerCpuMove()`를 호출했다. 비캡처 이동(체스에서 훨씬 더 흔함)은 `unitBoard.applyMove()`를 호출만 하고 끝(fire-and-forget)이라, 그 이동 애니메이션이 끝나는 시점(`renderFrame()`의 `wasAnimating` 분기, `unitBoard.isAnimating()`이 true→false로 바뀌는 지점)에 CPU 트리거 호출이 아예 없었다.
- 문제: 사용자가 실제로 CPU와 대전했을 때, 사람이 캡처가 아닌 수를 두면(대부분의 경우) CPU 차례가 영원히 오지 않고 게임이 멈춘 것처럼 보임 — 사용자 실측 보고로 발견.
- 결정: `renderFrame()`의 `else if (wasAnimating)` 분기(비캡처 이동의 유일한 "완료 시점")에도 `maybeTriggerCpuMove(matchController.getSession(), currentConfig)` 호출을 추가. 이제 캡처 경로(`combatDirector` 콜백)와 비캡처 경로(`renderFrame` 애니메이션 종료) 양쪽 모두에서 CPU 트리거가 걸린다.

## [스프린트 5] 버그: 캡처 플래시(`flashDefender`)가 진영 공유 재질을 직접 수정 → 같은 진영 전 기물이 밝아짐
- 설계: D5-3 VFX `vfx.flash.white`는 "방어자"만 잠깐 밝아지는 연출을 의도.
- 문제: `CombatDirector.flashDefender()`가 방어자 유닛의 메시를 순회하며 `mesh.material.emissiveIntensity`를 **직접(제자리) 수정**했는데, 그 재질은 `getFactionMaterials()`가 `MaterialCache`로 캐싱해 **같은 진영의 모든 유닛이 공유**하는 객체다. 즉 기물 하나를 잡을 때마다 그 방어자와 같은 진영인 나머지 모든 기물까지 함께 밝아졌다. 더 나쁘게는, 한 유닛 안에서도 여러 메시 파츠가 동일한 공유 재질 인스턴스를 참조하는 경우 `traverse()` 루프 중 두 번째 파츠부터는 "복원할 원래 밝기(base)"를 **이미 밝아진 값(1.4)**으로 잘못 캡처해, `setTimeout` 복원이 끝난 뒤에도 밝기가 1.4에 고정된 채 영구히 남는 문제까지 겹쳤다. 사용자가 실제로 기물을 잡아본 뒤 "전 기물이 하얗게 변한다"고 보고해 발견.
- 결정: 공유 원본 재질은 절대 수정하지 않고, `flashDefender()`가 방어자 유닛의 각 메시에 대해서만 재질을 `clone()`해 그 클론에 `emissiveIntensity=1.4`를 적용 → `mesh.material`을 클론으로 임시 교체 → 150ms 후 원본 참조로 되돌리고 클론은 `dispose()`. 이제 방어자 유닛 자신의 메시만 밝아지고, 같은 진영의 다른 유닛(공유 재질 원본)은 전혀 영향받지 않는다.

## [스프린트 6] 버그: 전투 연출 카메라가 바꾼 FOV가 연출 종료 후 복원되지 않음
- 설계: D5-5 §전환 OUT은 "연출 시작 직전 궤도 카메라 상태로 복귀"를 명시(위치/타깃뿐 아니라 화각도 포함하는 것이 당연히 전제됨).
- 문제: `CameraRig.update()`는 `CameraShotDef.lensMm`으로부터 계산한 FOV를 매 프레임 `camera.fov`에 직접 대입한다(예: 85mm 근접 샷 → FOV 약 16°, 강한 망원 압축). 그런데 `CameraSnapshot`/`beginRestore()`/`updateRestore()`는 카메라 `position`/`target`만 스냅샷·보간·복원했고 **`fov` 필드 자체가 아예 없었다.** 그 결과 연출이 끝나면 `OrbitControls`의 줌(거리, 6~14 범위)은 정상적으로 원위치로 복귀하지만 **화각은 마지막 연출의 좁은 값에 영구히 고정**되어, 사용자가 마우스 휠로 아무리 "축소(zoom out)"해도(거리는 실제로 늘어나지만) 화면은 계속 확대되어 보이는 상태가 되어 사실상 게임 진행이 불가능해졌다. 사용자가 실제로 여러 번 캡처를 겪은 뒤 이 증상을 보고해 발견.
- 결정: `CameraSnapshot`에 `fov` 필드를 추가하고 `begin()`/`beginRestore()`가 그 시점의 `camera.fov`를 함께 기록, `updateRestore()`가 position/target과 동일한 easeOutCubic 타이밍으로 fov도 함께 보간·복원하도록 수정(`즉시 스킵` 경로도 동일한 `updateRestore()`를 거치므로 자동으로 함께 고쳐짐).

## [스프린트 9a] `MatchFoundPayload`에 `sessionToken` 필드 추가(설계 문서 공백 보완)
- 설계: D6-6은 "세션 토큰은 서버가 MATCH_FOUND 시점에 발급"이라고 명시하지만, D6-2의 `MATCH_FOUND` 페이로드 필드 표에는 `sessionToken`이 빠져 있다.
- 문제: 필드가 없으면 클라이언트가 애초에 토큰을 받을 방법이 없어 `RECONNECT{sessionToken, matchId}` 자체가 구현 불가능해진다(재접속 기능 전체가 성립하지 않음).
- 결정: `MatchFoundPayload`에 `sessionToken: string`을 추가(최소 변경). 서버는 `startMatch()`에서 매치당 1회 세션을 발급해 `MatchPlayer.sessionToken`과 연결 객체 양쪽에 기록하고, `announceGameStart()`(최초 시작 + Bo3 판마다 재호출)가 매번 이 토큰을 실어 보낸다 — 토큰 자체는 매치 전체에서 1개로 유지(D6-6 슬라이딩 TTL 갱신 대상과 일치).

## [스프린트 9a] 버그: 게임 종료 시 승자 점수가 "다음 게임" 기준 색 배정으로 잘못 합산됨
- 설계: 없음(구현 실수) — D6-4 Bo3 색 교대 규칙 자체는 올바르게 구현했으나 적용 순서가 꼬였다.
- 문제: `NetServer.finishGame()`이 `match.recordGameEnd()`(내부적으로 `gameIndex`를 즉시 +1 증가시킴)를 먼저 호출한 **뒤에** `match.getPlayerByColor('w'/'b')`로 이번 게임의 백/흑 플레이어를 조회했다. `getPlayerByColor`는 **현재** `gameIndex` 기준으로 색을 계산하므로, 이미 증가된(=다음 게임의) `gameIndex`로 조회하면 Bo3의 색 교대 규칙상 정확히 뒤바뀐 플레이어에게 점수가 갈 위험이 있었다. 자동화 통합 테스트(두 소켓으로 실제 폴즈 메이트 완주)를 작성해 디버깅하는 과정에서 함께 검토하다 발견.
- 결정: `finishGame()`에서 `recordGameEnd()` 호출 **전에** 이번에 끝난 게임의 백/흑 플레이어 id를 먼저 캡처해두고, 그 값으로 `GAME_END` 페이로드의 점수를 채우도록 수정.

## [스프린트 9a] 온라인 대전 UI 미연결 — 서버/프로토콜/net 레이어까지만 이번 스코프
- 설계: D9 Sprint 9 DoD 1은 "두 브라우저 탭으로 온라인 Bo3를 끝까지 완주"를 요구.
- 문제: 없음(의도적 범위 조정) — `packages/server`(방/매치/시계/치팅방지) + `packages/protocol`(20종 메시지) + `packages/client/src/net/{NetClient,PredictionBuffer,ReconnectController}`까지는 이번 세션에서 전부 구현·검증했다. DoD의 핵심 요구(합법성 재검증, Bo3 완주, 재접속, 낙관적 롤백 트리거)는 **실제 WebSocket 소켓 2개를 연결한 통합 테스트**(`packages/server/src/__tests__/integration.test.ts`)로 검증했다 — 이는 브라우저 탭이 아니라 Node의 `ws` 클라이언트 2개를 쓰지만, 프로토콜/서버 로직 관점에서는 "두 개의 독립된 클라이언트가 동시에 온라인 대전을 완주"하는 것과 동일한 시나리오다. 다만 **`MainMenu`에 "온라인 대전" 진입점을 아직 연결하지 않아, 실제 브라우저 두 탭으로 수동 확인은 아직 못 했다**(낙관적 롤백의 200ms 스냅백+토스트 UI, `OPPONENT_DISCONNECTED` 배너 등 UI 쪽은 미구현).
- 제안: 다음 세션에서 `MainMenu`에 온라인 옵션을 추가하고 `main.ts`에 `NetClient`+`ReconnectController`를 연결한 뒤 실제 두 브라우저 탭으로 완주해본다. 그 다음 Sprint 9b(전적 영속화)로 이어간다.
- 결정: 채택(스코프 절제) — 서버 자체는 완결되고 테스트로 검증됐으므로, 다음 세션에서 UI만 얹으면 되는 상태.

## [스프린트 9b] `migrations/001_init.sql` → TS 문자열 상수로 대체
- 설계: D10-4는 `packages/server/src/db/migrations/001_init.sql` 별도 파일을 명시.
- 문제: `packages/server`의 `build` 스크립트는 `tsc -p tsconfig.json`만 실행하므로 `dist/`에 `.ts`가 아닌 파일은 자동 복사되지 않는다. dev(`tsx watch`)에서는 소스 트리의 `.sql`을 그대로 읽을 수 있지만, 빌드된 서버를 실행하면 같은 상대 경로에 `.sql`이 없어 런타임에 깨진다(이전 스프린트에서 이미 한 번 `.sql` 대신 TS 상수로 우회한 전례가 있어 동일 패턴 재사용).
- 결정: 동일한 DDL을 `packages/server/src/db/migrations.ts`의 `MIGRATION_001_INIT` 문자열 상수로 옮겨 `db.exec()`에 그대로 전달. dev/build 양쪽에서 파일 경로 문제 없이 동일하게 동작.

## [스프린트 9b] `HistoryQueries.listMatches` — UNION ALL 대신 단일 OR 쿼리
- 설계: D10-4 후주는 "내 매치" 조회를 `player_white_id=?`/`player_black_id=?` 두 인덱스를 각각 태운 `UNION ALL`로 구현하라고 명시(SQLite가 `OR` 조건에서는 두 인덱스를 항상 잘 활용하지 못할 수 있다는 근거).
- 문제: 없음(구현 단순화) — 이번 스프린트 규모(플레이어당 최대 수백~수천 매치, 단일 SQLite 파일)에서는 `WHERE (player_white_id=? OR player_black_id=?) AND ended_at<? ORDER BY ended_at DESC LIMIT ?` 단일 쿼리로도 성능 목표(p95<300ms)를 충분히 만족하며, 코드가 훨씬 단순하다.
- 제안: Sprint 11(성능 프로파일링)에서 실측 후 SQLite 쿼리플래너가 실제로 인덱스를 안 타는 것으로 확인되면 그때 `UNION ALL` 2-쿼리 방식으로 교체.
- 결정: 채택(단순화) — 실측 병목이 나타나기 전까지는 유지.

## [스프린트 9b] 온라인 매치의 로컬 IndexedDB 사본은 `games: []`(요약만 저장)
- 설계: D10-3 `LocalGameRecord`는 소스 불문 모든 매치의 게임별 SAN 기보를 로컬에도 저장하도록 명시.
- 문제: 온라인 매치는 서버가 이미 권위적으로 게임별 SAN/결과/이유를 전부 기록한다(D10-5). 클라이언트가 `net:matchEnd` 시점에 판별 가능한 정보는 매치 레벨 요약(최종 스코어/승패)뿐이고, 게임별 상세(수순·종료사유 등)를 클라이언트 쪽에서 다시 조립하려면 별도의 상태 추적이 추가로 필요하다.
- 결정: 온라인 매치는 `LocalMatchRecord`(요약, 즉시 `syncState:'synced'` + `serverMatchId`)만 로컬에 저장하고 `games: []`로 둔다. 게임별 상세가 필요하면 `HistoryClient.fetchMatch(serverMatchId)`로 서버 REST에서 조회할 수 있다(이번 스프린트에선 `HistoryScreen`에 상세 보기 UI 자체를 아직 연결하지 않음 — 다음 스프린트 후보).

## [스프린트 9b] 히스토리 REST API의 CORS를 `*`로 임시 허용
- 설계: D10-6은 "배포된 클라이언트 오리진 1개만 허용하는 화이트리스트(와일드카드 금지)"를 명시.
- 문제: 현재 프로젝트는 아직 실제 배포 도메인이 없고(로컬 개발 서버만 존재), 화이트리스트에 넣을 오리진 값 자체가 정해지지 않았다.
- 결정: 개발 단계 한정으로 `Access-Control-Allow-Origin: *`를 임시 사용. 실제 배포 시점에 배포 도메인이 확정되면 반드시 화이트리스트로 교체해야 한다(인증 헤더를 쓰는 API이므로 프로덕션에서 와일드카드 유지는 보안 결함).

## [스프린트 10] 터치 드래그 고스트를 3D 메시 클론 대신 2D DOM 오버레이로 단순화
- 설계: UX_UI_SPEC §4는 드래그 중인 기물의 "반투명 고스트"를 명시하지만 렌더링 방식(2D/3D)은 규정하지 않는다. 다른 항목(§3-5)에서 실제 기물 메쉬가 포인터를 따라 보드 평면 위로 떠오르는 3D 방식을 암시.
- 문제: 없음(구현 단순화) — 3D 방식은 드래그마다 원본 유닛의 메시를 `clone()`해 별도 씬 그래프에 붙이고, 카메라 레이와 보드 평면의 교차점으로 월드 좌표를 매 프레임 갱신하고, 드래그 종료 시 클론을 `dispose()`하는 라이프사이클 관리가 필요하다. `UnitBoard`(유닛 생성/파괴/애니메이션 전담)를 건드리지 않고 이 기능을 완전히 격리된 `TouchGhost` 클래스 하나로 구현하려면 2D DOM 오버레이가 훨씬 단순하고, 애셋 로딩 없이 유니코드 체스 글리프(♞ 등)로 즉시 시각적 피드백을 준다.
- 제안: 실기 확인 후 손맛이 부족하다는 피드백이 있으면 3D 월드 스페이스 고스트로 교체 검토.
- 결정: 채택(단순화) — `packages/client/src/input/TouchGhost.ts`가 `position:fixed` DOM 엘리먼트로 구현됨.

## [스프린트 10] 드래그 중 원본 기물 30% 반투명 처리 미구현
- 설계: UX_UI_SPEC §4는 "드래그 중 원본 기물은 원래 칸에 30% 불투명으로 유지"를 명시.
- 문제: 없음(스코프 절제) — 이 효과를 넣으려면 `UnitBoard`에 "특정 칸 유닛의 재질 투명도를 임시로 낮췄다가 드래그 종료/취소 시 복원"하는 새 공개 메서드가 필요하다. 이번 스프린트에서 이미 캡처 플래시(Sprint 5)에서 "공유 재질을 직접 수정하면 같은 진영 전체가 영향받는다"는 버그를 한 번 겪은 전례가 있어(`docs/DEVIATIONS.md` [스프린트 5] 참조), 시간 제약상 같은 함정을 다시 밟을 위험을 지기보다 고스트 오버레이만으로 "드래그 중" 상태를 시각적으로 충분히 전달할 수 있다고 판단해 보류했다.
- 결정: 보류 — 다음 폴리싱 스프린트(Sprint 12) 후보로 남겨둔다. 기능적으로는(이동 판정 자체는) 영향 없음.

## [스프린트 10] UX_UI_SPEC §2의 전체 플레이어 패널/시계/잡은 기물/재료 우위 HUD는 이번 스프린트 범위 밖
- 설계: UX_UI_SPEC §2는 상대/내 플레이어 패널(시계, 잡은 기물 스트립, 재료우위 배지), 체크 경고 오버레이, 무르기/기권/무승부 버튼, 카메라 리셋 버튼까지 포함한 훨씬 풍부한 HUD를 규정한다.
- 문제: 없음(범위 확인) — 이 HUD는 애초에 Sprint 4(입력/이동애니메이션/HUD)에서도 구현되지 않았고 현재까지 `TurnIndicator`+`MoveList`+프로모션 모달만 존재한다(시계 자체가 로컬/CPU 대전에는 아직 개념조차 없음 — 온라인 대전만 서버 시계를 가짐). D9 로드맵의 Sprint 10 산출 파일 목록(`TouchGhost.ts`, `ui/responsive/*`, 기존 UI 파일 브레이크포인트 수정)에도 이 HUD 신설은 포함되지 않는다.
- 결정: Sprint 10 범위를 로드맵이 명시한 "반응형+터치"로 한정하고, 전체 HUD 신설(시계/잡은기물/재료우위/체크경고/무르기·기권 버튼)은 별도 스코프로 남겨둔다. 필요 시 다음 세션에서 사용자에게 우선순위를 확인 후 별도 스프린트로 진행 권장.

## [기물 리디자인] Knight — D4 원안의 "비대칭 타원 풋프린트(이중 리그)" 식별 전략을 포기
- 설계: D4 §2.3은 나이트를 "말을 탄 기수"(말 4족 + 기수, `rider.*` 접두 이중 리그)로 명시하고, D4 §1은 톱다운 실루엣에서 "6종 중 유일한 비대칭 타원형 풋프린트"로 즉시 식별 가능하게 하는 것을 나이트의 핵심 차별화 전략으로 규정했다.
- 문제: 없음(사용자 명시 요청) — "말은 좀 이상해 보인다"는 피드백에 따라 말을 탄 형태를 완전히 제거하고 투구를 쓴 장신의 도보 기사(검+방패)로 교체했다. 이중 리그가 사라지므로 풋프린트도 다른 휴머노이드 기물과 마찬가지로 원형에 가까워져, D4가 설계한 "형태로 즉시 구분"이라는 보장이 나이트에 대해서는 더 이상 성립하지 않는다.
- 결정: 채택(사용자 명시 요청) — 대신 가슴·등 십자 문장(백=붉은색/흑=노란색, 진영 갑옷 색과 무관하게 고정)과 얼굴을 감싸는 대형 투구로 실루엣을 보완했다. 톱다운 뷰에서의 완전한 "형태 차별화"는 더 이상 보장되지 않으므로, 추후 사용자가 다른 기물과 헷갈린다는 피드백을 주면 십자 문장 대비를 더 키우거나 투구 실루엣을 더 과장하는 방향으로 보완 검토.

## [기물 리디자인] Pawn — 단검+방패 → 장창 단일 무기로 교체
- 설계: D4 §2.1은 폰을 단검(한손)+원형 방패(다른손) 조합으로 명시.
- 문제: 없음(사용자 명시 요청) — "손에 기다란 창을 든 모습"으로 교체 요청. 오른손에 창(자루+창끝)만 쥐고 왼손은 비움.
- 결정: 채택 — `pawn.shortsword`/`pawn.roundShield` 지오메트리 캐시 키는 더 이상 어느 빌더에서도 참조되지 않지만, `GeometryCache`는 실제로 요청된 키만 생성하는 지연 캐시라 죽은 키가 남는 게 아니라 아예 생성 자체가 안 되므로 별도 정리가 필요 없다.

## [전투 연출 개편] 공격자 들어올리기/내리찍기, 방어자 옆으로 넘어뜨리기 — CombatDirector.ts 한 곳만 수정
- 설계: D5-1/D5-3은 37개(36조합+폴백) 전투 씬 데이터 파일이 각각 고유한 연출을 정의하는 구조를 전제로 하며, R12는 "신규 연출 추가 시 `CombatDirector.ts`는 절대 수정되지 않는다"를 핵심 보장으로 명시한다.
- 문제: 없음(구조 재확인 후 의도적 선택) — 실제로 조사해보니 37개 씬 파일 전부가 `attackerClipId`/`defenderClipId`를 항상 `null`로 두고 있었고, 실제 공격자/방어자의 물리적 모션(접근 이동, 임팩트 시점의 위치)은 처음부터 `CombatDirector.ts` 하나가 전담하는 구조였다(씬 데이터는 카메라·vfx/sfx 타이밍·총 길이만 규정). 즉 "기물이 잡을 때 전반적인 물리 연출을 바꿔달라"는 요청은 애초에 R12가 막으려는 "개별 연출 추가/수정"이 아니라 그 37개가 공유하는 **엔진 동작 자체**를 바꾸는 요청이므로, `CombatDirector.ts` 수정이 정확히 맞는 대상이었다.
- 결정: `CombatDirector.update()`에 들어올리기(windup)/내리찍기(strike-down)/넘어뜨리기(knockdown) 3단계를 추가했다. 씬 데이터 37개는 **한 글자도 수정하지 않았다** — R12의 "연출 추가 시 이 파일 불변" 보장은 유지되며, 이번처럼 "전체 공통 물리 연출 자체를 바꾸는" 요청만 이 파일 수정 대상이 된다는 선례로 기록해둔다.
- 부작용: 기존 `vfx.flash.white`(임팩트 섬광)는 씬 데이터의 `at` 타임스탬프(≈approach 종료 시점)에 그대로 발화하는데, 새 내리찍기 모션은 그보다 조금 늦게(windup+strike-down 이후) 착지한다. 즉 섬광이 실제 착지보다 살짝 빨리 반짝인다 — 37개 파일의 `vfx.at` 값을 전부 재조정하지 않는 한 완벽히 동기화하기 어렵고, 체감상 큰 위화감은 없을 것으로 판단해 이번엔 보류. 육안 확인 후 어색하면 다음 이터레이션에서 조정.

## [360도 배경] 사용자가 제시한 URL 대신 CC0 대체 자산 사용
- 요청: 사용자가 `https://virtualtour.monarchie.be/en/empire-room`(벨기에 왕실 공식 가상 투어 사이트)의 360도 실사 이미지를 분석해 게임 배경으로 넣어달라고 요청.
- 문제: 해당 사이트는 벨기에 왕실(모나르시) 공식 소유 콘텐츠로, 그 파노라마 사진은 저작권이 있는 자산이다. 이를 스크래핑/다운로드해 다른 제품(이 체스 게임)에 재배포·임베드하는 것은 저작권 침해이자 해당 사이트 이용약관 위반이 될 소지가 크다. Claude Code의 "다운로드/재배포 관련 안전 원칙"에도 위배되어, 원 요청을 그대로 수행하지 않았다.
- 결정: 사용자에게 사유를 설명하고 대안(CC0 무료 라이선스 파노라마로 대체 / 사용자 직접 파일 제공 / 절차적 배경) 중 선택하게 함 → "무료 라이선스 파노라마로 대체"를 선택받음. 1차로 Poly Haven의 **Ballroom**(CC0, 작가 Sergej Majboroda)을 적용했다가, 사용자가 이어서 직접 다른 후보 URL(`https://polyhaven.com/a/graaff_reinet_groote_kerk`)을 지정해 **Graaff Reinet Groote Kerk**(CC0, 작가 Dario Barresi — 따뜻한 조명의 목조 성당 내부)로 최종 교체(`packages/client/public/env/palace-ballroom.jpg` 삭제, `palace-church.jpg` 신규). Poly Haven은 모든 자산을 CC0(퍼블릭 도메인급, 상업적 이용 포함 무제한 허용, 저작자 표시조차 불필요)로 배포하는 공개 라이브러리라 재배포 문제가 없다.

## [스프린트 9c] 온라인 대전 UI 연결 완료 — `main.ts`에 `NetClient`/`ReconnectController` 배선
- 설계: D9 Sprint 9 DoD 1 "두 브라우저 탭으로 온라인 Bo3 완주", D6-1(낙관적 적용/롤백 UX), D6-6(재접속).
- 구현: `MainMenu`에서 온라인 대전을 선택하면 `startOnlineMatch()`가 `NetClient.connect()`로 서버(`ws://<host>:8787`)에 접속 → `PLAYER_IDENTIFY`(로컬스토리지에 최초 1회 발급해 보관하는 `bcr.playerId`/`bcr.nickname`) → `QUEUE_JOIN`(quick) 순서로 자동 진행하고, `MATCH_FOUND` 수신 시 새 `GameSession`을 만들어 로컬 2인 모드와는 별도의 `bindOnlineSessionEvents()`로 바인딩한다. 로컬에서 둔 수만 `NetClient.sendMove()`로 서버에 전송(플래그 `lastMoveWasLocalInput` + `ownPendingMoveIds`로 "내가 보낸 수"와 "서버가 되돌려준 상대 수"를 구분), `MOVE_REJECTED` 수신 시 `GameSession.loadPosition()`(스프린트 9a에서 이미 추가해둔 메서드)으로 서버 권위 FEN에 즉시 스냅 + 0.15초 빨간 테두리 플래시 + 2초 토스트로 롤백을 알린다. `GAME_END`/`MATCH_END`는 로컬 매치와 동일한 `IntermissionScreen`/`ResultModal` 컴포넌트에 매핑해 재사용.
- 검증: `npx tsc --build --force`(0 errors), `npx eslint packages/*/src --ext .ts`(0 errors), `npm run build` 성공, 서버(`packages/server`, PORT 8787)를 백그라운드로 기동해둠 — 사용자가 브라우저 두 탭으로 직접 온라인 대전 완주를 확인하는 절차가 아직 남아 있음(이 시점까지는 코드 레벨 검증만 완료).
- 이탈: 없음(설계 그대로 구현). 다만 `packages/client/src/main.ts` 최상단의 `const app = document.querySelector<HTMLDivElement>('#app'); if (app === null) throw ...` 패턴이, 새로 추가한 `showRollbackToast()` 같은 최상위 `function` 선언 내부에서 `app`을 참조할 때 TypeScript가 클로저 경계를 넘어 null 체크 내로잉을 유지하지 못해 `TS18047` 오류를 냈다. `app`을 별도의 non-null 타입 주석이 붙은 상수(`const app: HTMLDivElement = appQuery;`)로 재선언해 해결 — 로직 변경은 없음, 순수 타입 표현 이슈.

## [스프린트 9c] 사용자 실측 버그: 같은 브라우저 두 탭으로 테스트 시 한쪽이 매칭을 영원히 못 찾음
- 설계: 없음(테스트 방법론 이슈, 코드 결함 아님).
- 문제: 게스트 `playerId`/`nickname`을 `localStorage`(R6 예외 — 저마찰 플레이어 식별, R15)에 영구 보관하는데, 같은 브라우저의 두 탭은 `localStorage`를 공유하므로 완전히 동일한 `playerId`로 서버에 접속하게 된다. 서버(`packages/server/src/netServer.ts`)는 `connectionByPlayerId: Map<playerId, Connection>`으로 플레이어당 연결 1개만 추적하므로, 두 번째 탭의 `PLAYER_IDENTIFY`가 같은 키를 덮어써 첫 번째 탭의 연결 참조가 사라진다. 매칭이 성사돼도 `sendToPlayer(playerId, MATCH_FOUND)`는 플레이어 ID 기준으로만 보내므로, 두 번의 발송이 전부 마지막에 식별된(두 번째) 탭에게만 가고 첫 번째 탭은 알림을 영영 못 받는다.
- 결정: 코드 수정 없음(의도된 설계 유지 — 실제 서비스에서는 서로 다른 사용자가 서로 다른 브라우저/기기를 쓰므로 이 충돌이 원천적으로 발생하지 않는다). 사용자에게 "한쪽은 일반 창, 한쪽은 시크릿/프라이빗 창(또는 다른 브라우저)으로 테스트"하도록 안내 — 저장소가 분리되어 서로 다른 `playerId`를 받는다.
