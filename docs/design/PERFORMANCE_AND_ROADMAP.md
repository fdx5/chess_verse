# D9. PERFORMANCE_AND_ROADMAP.md

## D9-1. 성능 예산 (Performance Budget)

Battle Chess Reforged는 스타일라이즈드 로우폴리 아트로, 화면에 동시에 존재하는 유닛은 최대 32개(기물 32개, 캡처되어 제거된 유닛은 씬에서 dispose됨)이며 지오메트리는 절차적으로 생성되지만 저폴리 예산을 스스로 지켜야 한다. 아래 수치는 Three.js r160+ WebGL2와 **D4 §1/§5가 확정한 실제 유닛 예산**(LOD0 유닛당 380~900 tri, 유닛당 파츠 12~22개, 파츠당 평균 25~45 tri)을 전제로 산정했다. **스켈레탈 유닛에는 `InstancedMesh`를 쓰지 않는다**(D4 §6 확정: 인스턴스별 본 행렬을 표준 Three.js API로 줄 수 없음) — 대신 `GeometryCache`/`MaterialCache` 공유 + 머티리얼 단위 파츠 병합으로 draw call을 줄인다. `InstancedMesh`는 애니메이션이 없는 두 곳에만 쓴다: **LOD2 빌보드 임포스터**와 **파티클 풀**.

| 항목 | 데스크톱(1080p) | 모바일 |
|---|---|---|
| 목표 FPS | 60 (연출 중에도 유지) | 60, 최저 30 (Low 티어 하한) |
| Draw call | ≤ 350 | ≤ 120 |
| 삼각형 수 | ≤ 1,200,000 | ≤ 350,000 |
| 초기 로드(JS gzip) | ≤ 900 KB | ≤ 900 KB (동일 번들, 코드 스플리팅으로 초기 청크만 카운트) |
| Time to interactive | ≤ 3.5 s (유선/broadband 기준) | ≤ 5.0 s (4G 기준) |
| 힙 메모리 | ≤ 450 MB | ≤ 250 MB |
| 매치 기록 IndexedDB 쓰기(R15) | ≤ 20 ms (트랜잭션 1회) | ≤ 40 ms |
| 전적 목록 조회 종단간(R15) | ≤ 300 ms p95 (서버 처리 ≤ 30 ms) | ≤ 500 ms p95 |
| 로컬 전적 저장소 사용량(R15) | ≤ 1.75 MB (최근 1,000매치) | 동일 |

근거:
- **Draw call**: 데스크톱은 유닛 32개 × 유닛당 **머티리얼 그룹 8개**(직물/금속트림/가죽/무기/발광 오브/그림자 플레인/장식 ×2 — 같은 머티리얼 파츠는 `BufferGeometryUtils.mergeGeometries`로 유닛당 1 draw call로 병합) = 256, + 보드 타일 2(밝은칸/어두운칸 각 1 병합 메시) + 프레임 1 + 스카이박스 1 + 파티클 InstancedMesh 4 + 데칼/그림자 2 + PostFX 패스 4 ≈ 274, 여유 28% 포함해 상한 **350**. 모바일은 (a) 머티리얼 그룹을 8→3(직물/금속/기타)으로 축소, (b) LOD1을 8칸이 아니라 **6칸**부터 적용, (c) PostFX를 FXAA 1패스로 제한하여 32×3 + 보드 3 + 파티클 2 + 기타 6 ≈ 107, 상한 **120**.
- **삼각형 수**: D4 §5 기준 LOD0 유닛 평균 580 tri × 32 = 18,560, 보드 타일 64칸 × 12 = 768, 프레임 약 2,400, 콘택트 섀도우 플레인 32 × 2 = 64, 파티클 최대 256 쿼드 × 2 = 512, 환경/스카이박스 약 1,200 → **씬 실측 합계 약 23,500 tri**. 상한을 120만으로 크게 잡은 이유는 향후 테마 확장(배경 소품·군중 장식·확장 기물)에 대비한 헤드룸이며, **Sprint 11의 실측 목표치는 상한이 아니라 50,000 tri 이하**로 별도 규정한다(상한만 보고 무의미하게 폴리곤을 늘리는 것을 막기 위한 이중 기준). 모바일은 LOD1(유닛 평균 200 tri) 강제로 씬 합계 약 12,000 tri, 상한 35만·실측 목표 30,000 tri 이하.
- **초기 로드**: 절차적 생성이라 3D 모델 파일이 없으므로 번들 크기는 코드+절차적 생성 로직+오디오 신스 코드가 대부분. 900KB gzip은 Three.js(≈150KB gzip) + 앱 코드(≈500KB) + 초기 오디오/애니메이션 데이터(≈150KB) 여유 포함. 전투 연출 매트릭스 데이터(36종)는 초기 번들에서 제외(§코드 스플리팅).
- **TTI**: 체스는 첫 상호작용까지 지연이 이탈로 직결되는 캐주얼 게임이므로 데스크톱 3.5s, 모바일 4G 5.0s를 상한으로 잡음(Lighthouse "Good" 기준 근사).
- **힙 메모리**: 절차적 지오메트리·텍스처 캐시·AudioBuffer를 포함해도 체스는 오픈월드가 아니므로 데스크톱 450MB, 모바일(iOS Safari tab kill 임계 ≈ 600MB~1GB 기종별)은 여유를 크게 두어 250MB. 이 중 **BGM 사전 렌더 버퍼가 단일 테마 약 12MB**(D8 §BGM — 3테마 동시 상주는 금지)를 차지한다.
- **영속화(R15)**: IndexedDB 쓰기는 매치 종료 시 1회뿐이며(매치당 로우 1+최대 3개, ≈ 1.75 KB) 게임 루프 밖에서 일어나므로 프레임 예산에 영향이 없다. 20ms 상한은 "결과 모달이 뜨기 전에 저장이 끝난다"는 UX 기준이다. 전적 조회 300ms p95는 SQLite 인덱스 조회(서버 30ms) + 왕복 RTT + 20건 렌더를 합산한 값이며, 초과 시 목록 `limit`을 20→10으로 낮춘다.

### 최적화 전략

**지오메트리/머티리얼 공유 및 캐싱, 파츠 병합, LOD, 프러스텀 컬링**
- 모든 절차적 지오메트리는 `GeometryCache: Map<string, BufferGeometry>` 키(`${pieceType}.${partName}.${lodLevel}`)로 1회 생성 후 재사용. 머티리얼은 `MaterialCache: Map<string, MeshStandardMaterial>` 키(`${color}.${theme}.${lodLevel}`).
- 동형 유닛(폰 8개, 나이트/비숍/룩 2개씩)은 **지오메트리·머티리얼 리소스만 공유**하고 각각 독립 `SkinnedMesh` + 독립 `AnimationMixer`를 갖는다(D4 §6 확정 — `InstancedMesh`는 인스턴스별 본 행렬을 지원하지 않으므로 스켈레탈 유닛에 적용 불가). draw call은 인스턴싱이 아니라 **유닛 내부 머티리얼 단위 병합**으로 줄인다: 같은 머티리얼을 쓰는 파츠들을 유닛 생성 시 1회 `mergeGeometries`로 합쳐 유닛당 메시 수를 12~22개 → 8개(모바일 3개)로 낮춘다. 병합은 스킨 웨이트/본 인덱스 속성을 보존해야 하므로 파츠 빌더가 `skinIndex`/`skinWeight` 어트리뷰트를 채운 상태로 병합한다.
- 예외적으로 `InstancedMesh`를 쓰는 두 곳: **LOD2 빌보드 임포스터**(정지 스프라이트, D4 §6), **`ParticlePool`**(본 없음). 이 둘만 인스턴스 카운트를 런타임에 조정(`InstancedMesh.count` 갱신, 재생성 없음)한다.
- LOD 전환은 D4의 거리 기준(LOD0<8칸, LOD1<16칸, LOD2≥16칸, 보드 한 칸=1유닛)을 그대로 사용하며 `THREE.LOD` 오브젝트로 구현, 카메라 거리 변경 시에만 재평가(프레임마다 아님 — 0.2초 간격 폴링).
- 프러스텀 컬링은 Three.js 기본 `frustumCulled=true` 유지 + 보드 전체가 카메라 안에 항상 있으므로 유닛 컬링 이득은 작고, 대신 파티클/이펙트 오브젝트에 수동 AABB 컬링 적용(파티클 시스템은 `frustumCulled=false` 기본값이므로).

**그림자 전략**
- **단일 방향광 + 베이크된 콘택트 섀도우**를 채택(실시간 섀도우맵 기각). 보드와 유닛은 게임 중 위치만 바뀌고 조명은 고정이므로, 유닛 발밑에 원형 그라디언트 알파 텍스처를 `DecalGeometry` 또는 단순 plane으로 배치해 콘택트 섀도우를 흉내낸다. 유닛 이동 시 그림자 plane도 함께 이동(추가 비용 거의 0).
- 이유: `PCFSoftShadowMap` 실시간 그림자는 셰도우맵 렌더 패스(추가 draw call ×유닛수)가 발생해 모바일 60fps 목표와 충돌. 체스는 태양각이 안 바뀌는 실내/디오라마 연출이라 실시간 그림자의 이점(동적 광원)이 없음.
- 예외: 전투 연출 중 카메라가 근접할 때만 해당 유닛 1~2개에 한해 `THREE.SpotLightShadow`를 임시로 활성화(연출 종료 시 즉시 dispose) — High/Ultra 티어에서만.

**포스트프로세싱 예산 (품질 티어별)**
| 티어 | SSAO | Bloom | FXAA/TAA | 해상도 스케일 |
|---|---|---|---|---|
| Low | 끔 | 끔 | FXAA | 0.75× |
| Medium | 끔 | 켬(임계값 높게, 연출시만) | FXAA | 1.0× |
| High | 켬(half-res) | 켬 | SMAA | 1.0× |
| Ultra | 켬(full-res) | 켬 | TAA | devicePixelRatio 그대로(클램프 내) |

**렌더 온디맨드**
- `RenderScheduler`가 `dirty` 플래그를 관리: 카메라 조작 입력, 유닛 애니메이션 믹서 활성 상태(`AnimationMixer` 업데이트 필요 여부), 파티클 생존, UI 트랜지션 중 하나라도 참이면 `requestAnimationFrame` 루프가 렌더를 수행하고, 전부 거짓이면 다음 입력/이벤트가 올 때까지 **렌더를 스킵**(루프 자체는 유지하되 `renderer.render()` 호출을 건너뜀 — rAF 콜백 등록은 유지해 입력 이벤트 지연 없이 즉시 재개 가능). 체스는 상대 턴 대기 중 정적 구간이 전체 시간의 70% 이상이므로 배터리/발열에 큰 이득.
- 정적 구간에서도 아이들 애니메이션(호흡 노이즈)이 있으므로 완전 정지는 아니며, `idleUpdateHz=10`으로 아이들 전용 저빈도 렌더 모드를 둔다(10fps로 아이들 브리딩만 갱신, 입력 시 즉시 60fps 복귀).

**오브젝트 풀링**
- 파티클: `ParticlePool` 사전 할당 256개(파티클 인스턴스, `InstancedMesh` 기반), 전투 연출 1회당 평균 24~40개 소비 — 동시 최대 2개 연출 오버랩(스킵 큐잉 중) 가정 시 128개면 충분하나 여유로 256.
- 데칼(콘택트 섀도우 제외 타격 이펙트 데칼): `DecalPool` 32개, TTL 2초 후 자동 반환.
- 오디오 노드: `AudioVoicePool` 채널 32개(§D8 보이스 상한과 일치: sfx 22 + ui 4 + ambience 2 + music 4), `AudioBufferSourceNode`/`OscillatorNode`는 1회용이라 노드 자체는 풀링 불가 — 대신 `GainNode`/`BiquadFilterNode` 같은 재사용 가능 이펙트 체인 노드를 8개 풀로 유지.

**디바이스 자동 감지 → 품질 티어 자동 선택 알고리즘**
1. `WEBGL_debug_renderer_info` 확장으로 GPU 렌더러 문자열 취득. 문자열에 `Mali-4|Adreno 3|Adreno 4|PowerVR SGX`(저사양 GPU 시그니처) 포함 시 즉시 `Low` 후보.
2. `navigator.hardwareConcurrency`: ≤4 → 후보 한 단계 하향, ≥8 → 상향 후보.
3. `devicePixelRatio` 원본값 기록(클램프 전) — 3 이상인 고밀도 저사양 모바일은 하향 가중치.
4. **첫 90프레임 실측**: 앱 부팅 직후 낮은 임시 품질(Medium)로 90프레임 렌더하며 프레임타임 이동평균 계산. 평균 프레임타임 > 20ms(50fps 미만)이면 `Low`로 하향, < 12ms(83fps 초과 여유)이면 `High` 후보로 상향. 이 실측이 1~3의 휴리스틱보다 **최종 우선**(실측이 이론을 이김).
5. 최종 티어는 `min(GPU문자열 후보, 코어수 후보, 실측 후보)`로 보수적 선택. 사용자는 설정에서 항상 수동 override 가능(D7 설정 화면).

**devicePixelRatio 클램프 정책**: 데스크톱 상한 2.0, 모바일 상한 **1.5**(Low/Medium 티어), High/Ultra 모바일은 2.0까지 허용. `renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap))`.

**GC 압력 최소화 규칙**
- 게임 루프(렌더/애니메이션 업데이트) 핫 패스에서 `new THREE.Vector3()`, `new THREE.Quaternion()` 등 신규 할당 금지. 모듈 스코프에 `_tmpVec3`, `_tmpQuat` 등 재사용 스크래치 변수를 두고 `.set()`/`.copy()`로만 조작.
- 경로 보간(베지에/포물선) 계산도 매 프레임 배열 재생성 금지 — 사전 계산된 제어점 배열을 클로저로 캡처해 재사용.
- 파티클/데칼은 위 풀링 규칙을 따름. `Array.prototype.map/filter`로 매 프레임 새 배열을 만드는 패턴 금지, 인덱스 기반 for 루프 사용.

**에셋/코드 스플리팅**
- Vite의 동적 `import()` 기반 코드 스플리팅. 전투 연출 매트릭스(36종)는 **공격자별 6개 청크**(`anim/data/combatScenes/pawn.ts` … `king.ts`)로 분리, 각 청크는 해당 공격자 기물의 **첫 캡처 발생 시** 지연 로드(`import('./data/combatScenes/rook')`). 초기 번들에는 범용 폴백 연출(`generic.strike`)만 포함.
- 게임이 유휴 상태(입력 없음 3초 이상, 렌더 온디맨드가 이미 스킵 중)로 판단되면 `requestIdleCallback`으로 남은 청크를 백그라운드 프리로드해 실제 캡처 시 로딩 지연을 숨김.
- AI 오프닝북 데이터(§D3)도 별도 청크로 분리, 마스터 난이도 최초 선택 시 로드.

---

## D9-2. 구현 로드맵

원칙: **매 스프린트 종료 시 `npm run build` 성공 + 브라우저 콘솔 에러 0 + 이전 스프린트 기능 회귀 없음**이 always-runnable의 검증 기준이다. 총 12개 스프린트.

### Sprint 1 — 프로젝트 스캐폴딩 + chess-core 룰 엔진
- 목표: 모노레포 구조를 세우고 완전한 규칙 엔진을 perft로 검증한다.
- 산출 파일: `package.json`(workspaces), `vite.config.ts`, `tsconfig.base.json`, `packages/chess-core/{package.json,tsconfig.json,src/types.ts,src/board.ts,src/movegen.ts,src/makemove.ts,src/zobrist.ts,src/fen.ts,src/san.ts,src/result.ts,src/perft.ts,src/index.ts}`, `packages/chess-core/src/__tests__/{perft.test.ts,perft.full.test.ts,movegen.test.ts}`
- DoD: `npx tsc --noEmit` 0 에러, D2 perft 표의 6개 포지션 전부 지정 depth까지 노드 수 정확히 일치, `npm run build` 성공(빈 클라이언트 셸이라도), `packages/chess-core`가 `three`를 import하지 않음을 정적 검사(grep)로 확인.
- 의존성: 없음(최초 스프린트).
- 리스크: Medium — 앙파상/캐슬링/프로모션 엣지케이스에서 perft 불일치가 흔함.

### Sprint 2 — 3D 씬 부트스트랩
- 목표: 빈 보드가 60fps로 렌더링되는 씬을 세우고 품질 티어 인프라를 마련한다.
- 산출 파일: `packages/client/{package.json,index.html,src/main.ts,src/engine/Renderer.ts,src/engine/Scene.ts,src/engine/Camera.ts,src/engine/QualityTier.ts,src/engine/RenderScheduler.ts,src/engine/DeviceDetect.ts}`
- DoD: 브라우저에서 체커보드+조명이 렌더됨, 콘솔 에러 0, `RenderScheduler` 온디맨드 렌더가 유휴 시 rAF 호출 내부에서 `render()` 스킵되는 것을 로그로 확인 가능, 품질 티어 자동감지 결과가 콘솔에 출력됨.
- 의존성: Sprint 1(패키지 구조).
- 리스크: Low.

### Sprint 3 — 절차적 유닛 12종 + 리깅 + 아이들 애니메이션
- 목표: 12개 유닛이 보드 위 정위치에 서 있고 아이들 애니메이션이 재생된다.
- 산출 파일: `packages/client/src/units/{UnitProvider.ts,ProceduralUnitFactory.ts,GLTFUnitProvider.ts,BoneRig.ts,builders/{PawnBuilder.ts,KnightBuilder.ts,BishopBuilder.ts,RookBuilder.ts,QueenBuilder.ts,KingBuilder.ts}}`, `packages/client/src/engine/{GeometryCache.ts,MaterialCache.ts}`, `packages/client/src/anim/{dsl.ts,AnimClipCompiler.ts,AnimationRegistry.ts,data/movementClips/idle.ts}`
- DoD: 12유닛(6종×2진영) 전부 생성, 톱다운 스크린샷에서 실루엣 구분 가능(D4 치수 대조), 본 이름이 _CONTRACTS.md 컨벤션과 일치, 아이들 애니메이션 루프 재생 중 콘솔 에러 0.
- 의존성: Sprint 2(씬), D4/D5 설계.
- 리스크: Medium — 절차적 지오메트리 파츠 조립이 반복 작업 많음.

### Sprint 4 — 입력/선택/합법수 하이라이트 + 이동 애니메이션 + 기본 HUD
- 목표: 플레이어가 클릭으로 기물을 선택하고 합법수를 확인 후 이동시킬 수 있다(로컬 2인, 캡처 연출은 다음 스프린트).
- 산출 파일: `packages/client/src/input/{PointerController.ts,Raycaster.ts}`, `packages/client/src/game/{GameSession.ts,EventBus.ts,HotSeatController.ts}`, `packages/client/src/ui/{HUD.ts,MoveList.ts,TurnIndicator.ts}`, `packages/client/src/anim/movementClips.ts`
- DoD: chess-core로 합법수 계산→하이라이트 표시, 클릭 이동 시 유닛이 D5-2 방식대로 걷기/도약/활공 애니메이션으로 이동(순간이동 없음), 캐슬링/앙파상/프로모션 UI 포함 전체 규칙이 로컬 2인 플레이로 완주 가능, 콘솔 에러 0.
- 의존성: Sprint 1, 3.
- 리스크: Medium.

### Sprint 5 — 캡처 시 범용 전투 연출 + 오디오 코어
- 목표: 캡처 발생 시 `generic.strike` 폴백 연출과 기본 사운드가 재생되는 파이프라인을 검증한다.
- 산출 파일: `packages/client/src/anim/{CombatDirector.ts,AnimationController.ts,data/combatScenes/generic.strike.ts}`, `packages/client/src/audio/{AudioGraph.ts,SoundRegistry.ts,synth/{footstep.ts,impact.ts,shimmer.ts,stinger.ts}}`
- DoD: 아무 캡처나 발생시켜도 `generic.strike` 연출+사운드가 재생되고 게임 상태가 정확히 갱신됨, 연출 스킵(탭/ESC) 동작, 콘솔 에러 0, `AnimationRegistry.register()`만으로 새 연출을 추가할 수 있음을 단위테스트로 증명(엔진 코드 미수정).
- 의존성: Sprint 3, 4.
- 리스크: Medium — 레지스트리 설계가 이 스프린트에서 검증되지 않으면 Sprint 6이 전부 무너짐.

### Sprint 6 — 전투 연출 매트릭스 전체(데이터 주도) + 카메라 시네마틱
- 목표: D5-3의 36개 조합을 전부 데이터로 등록하고 시네마틱 카메라 전환을 구현한다.
- 산출 파일: `packages/client/src/anim/data/combatScenes/{pawn.ts,knight.ts,bishop.ts,rook.ts,queen.ts,king.ts,index.ts}`, `packages/client/src/anim/CameraRig.ts`
- DoD: 36개 조합 전부 `getCombatScene()`으로 조회 가능(단위테스트로 36건 전수 검사), 각 연출 추가 커밋에서 `packages/client/src/anim/CombatDirector.ts` 등 엔진 파일 diff가 0줄(레지스트리 데이터 파일만 변경), 카메라가 연출 종료 후 원래 궤도 카메라로 보간 복귀.
- 의존성: Sprint 5.
- 리스크: High — 분량이 크므로 가이드 권장대로 공격자별 6분할 세션 진행 권장.

### Sprint 7 — AI Worker + 4단계 난이도
- 목표: 4단계 CPU 난이도가 Web Worker에서 동작하며 메인 스레드를 블록하지 않는다.
- 산출 파일: `packages/client/src/ai/{AiWorkerHandle.ts,worker/ai.worker.ts,worker/search.ts,worker/evaluate.ts,worker/pst.ts,worker/openingBook.ts}`
- DoD: 4개 난이도 전부 동작, 메인 스레드 프레임타임이 AI 사고 중에도 20ms 미만 유지(rAF 드랍 없음), 마스터 vs 초급 자기대국 20판에서 마스터가 15승 이상, `ai.worker.ts`가 `postMessage`로만 통신(직접 DOM/Three 접근 없음).
- 의존성: Sprint 1(chess-core 재사용), Sprint 4.
- 리스크: High — 탐색 성능 튜닝과 Worker 프로토콜 설계가 동시에 걸림.

### Sprint 8 — Bo3 매치 플로우 + 결과/설정 화면
- 목표: 3판 2선승 매치 전체 흐름과 설정 화면을 완성한다.
- 산출 파일: `packages/client/src/game/{MatchController.ts,MatchState.ts}`, `packages/client/src/ui/{ResultModal.ts,IntermissionScreen.ts,SettingsScreen.ts,MainMenu.ts}`
- DoD: 로컬/CPU 대전에서 Bo3·Bo1 전체 매치를 완주해 최종 승자 화면까지 도달, 설정 변경(연출 길이/품질 티어 등)이 즉시 반영, 콘솔 에러 0, **매치 종료 시 `game:matchEnded` 이벤트가 D1 §이벤트 버스의 페이로드 형태 그대로 정확히 1회 발행됨**(Sprint 9b의 `MatchRecorder`가 구독할 지점 — 이 이벤트가 없으면 R15 영속화를 붙일 수 없으므로 Sprint 8에서 선행 확보한다).
- 의존성: Sprint 4, 6, 7.
- 리스크: Medium.

### Sprint 9 — 서버 + 온라인 대전 + 재접속 + **전적 영속화(R15)**
- 목표: 권위 서버 기반 온라인 1:1이 재접속을 포함해 안정적으로 동작하고, **모든 매치 결과가 오프라인 우선으로 영속화되어 서버와 왕복 동기화**된다.
- **스코프 판단:** 영속화를 별도 스프린트로 분리하지 않고 Sprint 9에 포함한다. 근거: D10의 서버 측 쓰기 지점이 `match.ts`의 `MATCH_END` 경로 **바로 그 코드**이며(D10 §D10-5의 write-then-notify 순서), REST 라우트도 이 스프린트에서 처음 만드는 `node:http` 서버에 attach된다. 다른 스프린트로 미루면 같은 파일을 두 번 열고 순서 보장 로직을 재작업해야 한다. 다만 분량이 커지므로 **세션 2개로 분할 권장** — 9a(서버/프로토콜/재접속), 9b(영속화: DB·IndexedDB·동기화·전적 화면).
- 산출 파일:
  - 9a: `packages/protocol/src/messages.ts`(20종), `packages/server/{package.json,src/index.ts,src/room.ts,src/match.ts,src/clock.ts,src/netServer.ts,src/session.ts}`, `packages/client/src/net/{NetClient.ts,PredictionBuffer.ts,ReconnectController.ts}`
  - 9b: `packages/protocol/src/history.ts`, `packages/server/src/db/{connection.ts,migrations/001_init.sql,PlayerRepository.ts,MatchRepository.ts,HistoryQueries.ts}`, `packages/server/src/http/historyApi.ts`, `packages/client/src/persistence/{schema.ts,identity.ts,IndexedDbStore.ts,MatchRecorder.ts,SyncEngine.ts,HistoryClient.ts}`, `packages/client/src/ui/{NicknameModal.ts,HistoryScreen.ts,MatchDetailView.ts}`, 테스트 `packages/server/src/db/__tests__/roundtrip.test.ts`, `packages/client/src/persistence/__tests__/sync.test.ts`
- DoD(전부 검증 가능한 형태):
  1. 두 브라우저 탭으로 온라인 Bo3를 끝까지 완주, 콘솔 에러 0.
  2. 한쪽 새로고침 후 **60초 grace period**(D6-6) 내 재접속 시 FEN·기보·양측 시계가 재접속 전과 완전 일치(자동 비교 테스트로 확인).
  3. 서버가 클라이언트가 보낸 불법수를 100% 거부(fuzz 1,000건, 통과율 0%).
  4. 낙관적 예측 롤백 UX 동작(`MOVE_REJECTED` 강제 주입 시 200ms 이내 스냅백 + 토스트).
  5. **전적 왕복 통합 테스트 통과**(D10 §D10-10-1): CPU 매치 1건이 IndexedDB → `POST /api/v1/matches/sync` → SQLite `matches`/`games`에 기록되고, `GET /api/v1/players/:id/matches`가 동일 값을 반환하며, 로컬 DB를 비운 뒤 pull하면 `endedAt`·`scoreMine`·`movesSan`까지 필드 단위로 일치.
  6. **멱등성:** 같은 동기화 배치를 3회 업로드해도 `SELECT COUNT(*) FROM matches` 증가분이 정확히 1.
  7. **위조 차단:** `source:'online'` 업로드 → `409`, 타인 `playerId` 히스토리 조회 → `403`, 잘못된 secret → `401` (3건 전부 테스트로 확인).
  8. **오프라인 동작:** 서버를 내린 상태에서 CPU 매치 3건 완주 → 전부 전적 화면에 표시(`syncState:'local'`) → 서버 기동 후 60초 이내 전부 `synced`로 전이.
  9. **권위 기록 순서:** 온라인 매치 종료 시 `MATCH_END` 전송 **이전에** DB 로우가 존재함을 서버 훅으로 확인(write-then-notify).
  10. `grep -rn "SELECT \|INSERT \|CREATE TABLE" packages/server/src --include=*.ts` 결과가 `packages/server/src/db/` 경로에만 매치.
- 의존성: Sprint 1(chess-core 서버 재사용), Sprint 8(매치 플로우 — `game:matchEnded` 이벤트 발행 지점).
- 리스크: High — 온라인 동기화와 영속화가 한 스프린트에 겹침. 완화: 위 9a/9b 세션 분할, 9a 완료 시점에 온라인 대전만으로 회귀 검증 후 9b 착수.
- 신규 의존성: `better-sqlite3`(서버 전용, D10 §D10-4 근거). 클라이언트 번들에는 추가 의존성 없음(IndexedDB는 브라우저 내장) — D9-1 초기 로드 예산 900KB에 영향 0.

### Sprint 10 — 모바일 최적화 + 반응형 UI + 터치
- 목표: 모바일 브라우저(실기)에서 터치 조작과 반응형 레이아웃이 완전히 동작한다.
- 산출 파일: `packages/client/src/input/TouchGhost.ts`, `packages/client/src/ui/responsive/*`, 기존 UI 파일들에 브레이크포인트 CSS 수정
- DoD: 실기(또는 실기 프로파일 에뮬레이션) 터치로 전체 게임 플로우 완주, 세로/가로 레이아웃 전환 확인, 최소 터치 타깃 44×44px 전수 확인, Low 티어 강제 시 30fps 이상 유지.
- 의존성: Sprint 8.
- 리스크: Medium.

### Sprint 11 — 성능 프로파일링 & 예산 충족
- 목표: D9-1 예산표의 모든 수치를 실측으로 충족시킨다.
- 산출 파일: 기존 엔진/유닛/애니메이션 파일들에 대한 최적화 수정(신규 파일 없음이 기본), `docs/PERF_REPORT.md`(측정 전/후 표)
- DoD: 데스크톱/모바일 각각 FPS/draw call/삼각형/TTI/힙 수치가 예산표 이내임을 실측 로그로 제시, 회귀 없음.
- 의존성: Sprint 1~10 전체.
- 리스크: High — 여러 스프린트에 걸쳐 누적된 비용을 한 번에 정산.

### Sprint 12 — 폴리시
- 목표: 파티클/포스트프로세싱/테마 3종/접근성을 완성해 출시 품질로 마무리한다.
- 산출 파일: `packages/client/src/engine/PostFX.ts`, `packages/client/src/engine/themes/{castleHall.ts,frozenKeep.ts,volcanicRuin.ts,index.ts}`, 접근성 관련 UI 수정(색맹 대응, `prefers-reduced-motion`, 키보드 조작)
- DoD: 3테마 전환 확인, `prefers-reduced-motion` 시 연출 자동 Off, 키보드만으로 전체 게임 플로우 완주 가능, Lighthouse 접근성 점수 90+.
- 의존성: Sprint 1~11 전체.
- 리스크: Medium.

---

## D9-3. 리스크 레지스터

| 리스크 | 영향도 | 발생확률 | 완화책 | 조기경보 신호 |
|---|---|---|---|---|
| 체스 룰 버그(앙파상/캐슬링)가 온라인 대전 desync로 뒤늦게 발견 | High | Medium | Sprint 1에서 perft 전부 통과를 필수 게이트로 강제, 서버/클라 동일 코드 공유 | perft 노드 수 불일치, 온라인 대전 중 "합법수인데 거부됨" 리포트 |
| 전투 연출이 하드코딩되어 R12(지속 업그레이드) 붕괴 | High | Medium | Sprint 5에서 레지스트리만으로 신규 연출 추가가 되는지 검증 후 Sprint 6 진행, 연출 추가 시 엔진 diff 0줄을 CI로 확인 | 연출 추가 커밋에 `CombatDirector.ts` 등 엔진 파일이 포함됨 |
| 룰 엔진이 렌더러(Three.js)에 오염되어 서버 재사용 불가 | High | Low | `chess-core`의 `three` import를 CI에서 grep으로 강제 차단 | `chess-core/src`에 `from 'three'` 매치 |
| AI가 메인 스레드를 블록해 마스터 난이도에서 화면 멈춤 | High | Medium | 처음부터 Web Worker로 설계(Sprint 7), "나중에 옮기기" 금지 | 마스터 난이도 사고 중 rAF 드랍/입력 지연 |
| 모바일 성능 붕괴(실기 10fps) | High | High | 품질 티어를 Sprint 2부터 도입, 매 스프린트 저사양 티어 확인, Sprint 11에서 정산 | 저사양 실기 실측 FPS < 30 |
| 전투 연출 길이가 온라인 대전 시계를 소비해 불공정 시비 | Medium | Medium | D5-4 규칙(연출은 시계 미소비)을 네트워크 설계에 반영, Sprint 9에서 검증 | 동일 수인데 두 클라이언트의 체감 턴 소요시간이 다름 |
| 스코프 크리프로 프로젝트가 끝나지 않음 | High | High | 스프린트당 1세션 원칙, DoD 대조, 설계에 없는 기능 추가 금지 | `DEVIATIONS.md`에 "추가 제안" 항목이 5건 이상 누적 |
| 절차적 지오메트리 생성 코드가 반복적이라 Sprint 3이 예상보다 지연 | Medium | Medium | 공통 파츠 빌더 헬퍼(Box/Cylinder/Capsule 조합 유틸)를 먼저 만들어 6종에 재사용 | Sprint 3이 다른 스프린트 대비 세션 2배 이상 소요 |
| 재접속(Reconnect) 시 상태 재전송 페이로드 누락으로 클라이언트 상태 불일치 | Medium | Medium | Sprint 9 DoD에 재접속 후 전체 상태 비교 테스트 포함 | 재접속 후 보드는 맞는데 시계/기보가 어긋남 |
| (R15) 오프라인 동기화 재시도로 전적이 중복 기록됨 | Medium | Medium | `(submitted_by_player_id, client_local_match_id)` 부분 유니크 인덱스 + append-only 규칙(D10 §D10-2), Sprint 9 DoD 6번(3회 업로드 = +1건)으로 검증 | 전적 화면에 같은 매치가 2개 이상 표시 |
| (R15) 브라우저 저장소 삭제로 신원·로컬 전적 유실 | Medium | High | 서버 등록을 마친 사용자는 `GET /players/:id/matches`로 복구(D10 §D10-3). 미등록 사용자는 복구 불가 → **백업 코드 UI 도입 여부가 D10 Open Decision 1** | "전적이 사라졌다" 문의, `serverRegisteredAt === null` 비율이 높음 |
| (R15) DB 쓰기 지연이 `MATCH_END` 전송을 막아 결과 화면이 늦게 뜸 | Low | Low | better-sqlite3 동기 트랜잭션 1회(로우 1+3개, 통상 < 5ms). 쓰기 실패 시 `serverMatchId: null`로 즉시 전송하고 일반 동기화 경로로 강등(D10 §D10-5) | 매치 종료 후 결과 모달까지 200ms 초과 지연 |

## ⚠️ 사용자 확인 필요 항목 (Open Decisions, D9)

`⚠️ DECISION NEEDED`: 위 예산표·로드맵 수치 산정 자체는 근거를 명시했으므로 결정 필요 항목 없음. 단, 아래 트레이드오프는 D9-1 전략 선택에 영향을 주므로 명시한다.

- **콘택트 섀도우 vs 부분 실시간 그림자**: Option A(채택안) = 전 상황 베이크된 콘택트 섀도우, 전투 연출 중에만 임시 스팟라이트 그림자. Option B = 항상 실시간 그림자(더 사실적이나 모바일 예산 위반 위험). **추천: Option A** — 60fps 모바일 목표가 절대 우선.
- **초기 로드 900KB gzip 상한**: Option A(채택안) = 3D 캐주얼 웹게임 평균(Lighthouse "Good" 근사)에 맞춘 900KB. Option B = 더 보수적인 500KB(엄격, 하지만 절차적 오디오/애니메이션 데이터 여유가 줄어듦). **추천: Option A**, 단 Sprint 11에서 실측 후 500KB 근접 시 추가 스플리팅 검토.
