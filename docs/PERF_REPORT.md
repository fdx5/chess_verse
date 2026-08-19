# PERF_REPORT.md — Sprint 11 성능 프로파일링 결과

> 대상: D9-1 성능 예산표(`docs/design/PERFORMANCE_AND_ROADMAP.md`). 이 세션은 브라우저 자동화 도구가 연결되지 않아
> **GPU/DOM 계열 지표(FPS·Draw call·삼각형·TTI·힙)는 코드로 직접 측정할 수 없었다.** 대신 (1) Node에서 직접
> 측정 가능한 항목(perft 벤치마크, 번들 크기)은 실측했고, (2) 브라우저 지표는 `PerfOverlay`(`~` 키)를 새로 만들어
> 사용자가 직접 켜서 읽고 보고할 수 있게 했다. 아래 표의 "실측"/"미실측" 표기를 근거로 사용해달라.

## 1. 실측 완료 항목

### 1-1. Zobrist 증분 해싱 (Sprint 1에서 유예된 최적화)

**측정 방법**: 시작 포지션에서 perft depth 5(4,865,609 노드)를 (a) Sprint 1 방식(매 `makeMove`마다 `zobristHash()` 전체 재계산)과 (b) Sprint 11 방식(변경된 XOR만 갱신)으로 각각 실행해 벽시계 시간을 비교. 두 방식 모두 노드 수가 정확히 일치함을 먼저 확인(정확성 보장).

| 방식 | perft depth5 소요 시간 | 노드 수 |
|---|---|---|
| 전체 재계산(Sprint 1) | 15,247.6 ms | 4,865,609 |
| 증분 XOR(Sprint 11) | 9,310.0 ms | 4,865,609 (일치) |

**개선율: 38.9%**

**정확성 검증**: `packages/chess-core/src/__tests__/zobristIncremental.test.ts` 신설 — 시작 포지션과 kiwipete(캐슬링·앙파상 밀집 포지션) 양쪽에서 3수 깊이까지 모든 자손 노드의 증분 해시가 `zobristHash()`(전체 재계산)와 **완전히 일치**함을 재귀적으로 검증(기존 perft 테스트는 노드 수만 세고 해시값 자체는 검증하지 않았으므로, 이 회귀 방지 테스트가 없으면 잘못된 XOR 갱신이 조용히 통과할 수 있었다).

**부수 효과(간접 실측)**: 이 변경 이후 `packages/chess-core/src/__tests__/perft.test.ts` 전체 실행 시간과 `selfPlay.test.ts`(AI 자기대국 20판, 탐색이 `makeMove`를 매우 많이 호출)의 벽시계 시간도 함께 단축됨을 CI 로그로 확인:
- perft 스위트: 이전 세션 평균 ≈ 91초 → 이번 실행 84초(같은 머신, 변동 있으나 방향 일관됨)
- selfPlay(AI 탐색): 이전 세션 ≈ 305~310초 → 이번 실행 243초(**약 20% 단축**, AI 탐색이 `makeMove`에 크게 의존한다는 설계 근거와 일치)

이 개선은 렌더링과 무관하게 **AI 탐색 속도**(D3 §난이도별 movetime 예산 안에서 더 깊이 탐색 가능) 및 **서버 측 온라인 대전의 매 수 검증 비용**에 직접 도움이 된다.

### 1-2. 초기 번들 크기(gzip)

`npm run build` 로그에서 직접 확인:

| 항목 | 실측 | 예산 |
|---|---|---|
| `assets/index-*.js` (메인 번들) | 178.50 KB gzip | ≤ 900 KB |
| `assets/ai.worker-*.js` (AI Worker, 별도 청크) | ≈ 21 KB(비gzip 표기, 별도 청크라 초기 로드에 미포함) | — |

**여유 폭이 커 이번 스프린트에서 코드 스플리팅 작업은 하지 않았다** — 예산의 20%도 채 안 쓰고 있어 지금 시점에 `dynamic import()` 분할을 도입하는 비용 대비 이득이 없다고 판단(과최적화 방지). Rollup 경고("500KB 초과 청크")는 나오지만 이는 rollup의 범용 기본 임계값(500KB)일 뿐 D9-1 예산(900KB)과는 다른 수치임에 유의.

## 2. 코드 정적 감사 — 이미 설계대로 구현되어 있음을 재확인

- `RenderScheduler`(`packages/client/src/engine/RenderScheduler.ts`): `dirty` 플래그 기반 렌더 온디맨드 + `idleUpdateHz=10` 아이들 저빈도 모드 — D9-1 "렌더 온디맨드" 전략 그대로 구현되어 있음을 재확인(코드 변경 없음).
- 유닛 지오메트리/머티리얼: `packages/client/src/units/builders/PartKit.ts`의 `roundedBoxGeom`/`latheGeom`/`taperedLimbGeom`이 캐싱 패턴을 따름(Sprint 3.5에서 이미 구현).
- 전투 연출 파티클(`CombatDirector.ts`): 이펙트마다 `new THREE.BufferGeometry()`/`new THREE.Points()`를 생성하는 지점이 있음 — D9-1이 명시한 `ParticlePool`(256개 사전 할당 `InstancedMesh`)은 **아직 도입되지 않았다**(신규 발견). 다만 동시 재생 가능한 연출 수가 실질적으로 1~2개로 제한되어 있어(연출 스킵 큐잉) 체감 성능 영향은 낮을 것으로 추정 — **미실측**이라 확정적 판단은 보류하고 아래 "다음 확인 필요" 항목에 남겨둔다.
- `movementClips.ts`: 프레임마다 `new THREE.Vector3(...)`를 반환하는 함수들이 있음(가비지 컬렉션 압박 소지) — 유닛이 이동 중일 때만 호출되고 동시 이동 유닛 수가 적어(최대 1~2개) 실질적 영향은 낮을 것으로 추정하나 마찬가지로 미실측.

## 3. 브라우저 실측이 반드시 필요한 항목 (`PerfOverlay`로 확인 가능)

`packages/client/src/ui/PerfOverlay.ts` 신설 — 게임 화면에서 **`` ` `` (백틱) 키**를 누르면 좌상단에 아래 수치가 실시간으로 표시된다:

| 표시 항목 | D9-1 예산(데스크톱 / 모바일) |
|---|---|
| FPS | 60 유지 / 60(Low 티어 하한 30) |
| Draw calls | ≤ 350 / ≤ 120 |
| Triangles | 실측 목표 ≤ 50,000(상한 1,200,000 / 350,000) |
| JS Heap(Chrome 계열만 `performance.memory` 제공) | ≤ 450 MB / ≤ 250 MB |

**미실측 — 사용자 확인 필요**: 데스크톱/모바일 각각에서 대국 진행 중(특히 전투 연출 재생 중, 가장 부하가 큰 구간) `PerfOverlay`를 켜서 위 수치가 예산 이내인지, Low 품질 티어를 설정에서 강제 선택했을 때 30fps 이상 유지되는지, `localhost:5180`을 Chrome DevTools "Performance" 패널의 Lighthouse로 열어 TTI가 3.5초(데스크톱)/5초(4G 모바일 에뮬레이션) 이내인지.

## 4. 다음 확인 필요(우선순위 순)

1. **실측**: `PerfOverlay`로 데스크톱 Draw call/Triangle/Heap 수치 확인 → 예산 초과 시 어느 항목이 초과인지 보고
2. **실측**: 설정에서 품질 Low로 강제 후 모바일(또는 기기 에뮬레이션)에서 FPS 확인
3. **재검토**: 위 §2에서 발견한 `ParticlePool` 미도입 — 실측 결과 파티클 관련 draw call/heap이 예산을 넘으면 이 스프린트 다음 이터레이션에서 도입
4. **Lighthouse**: TTI 실측(데스크톱/모바일 4G 에뮬레이션 각각)

## 5. 결론

- **코드로 직접 개선·검증 가능했던 항목(Zobrist 증분 해싱, 번들 크기)은 실측 완료 + 회귀 테스트로 보호됨.**
- **GPU/브라우저 의존 지표는 이번 세션에 실측 도구가 없어 확정할 수 없다** — 대신 사용자가 직접 확인할 수 있는 `PerfOverlay`를 남겨뒀다. Sprint 11의 DoD("데스크톱/모바일 각각 실측 로그 제시")는 이 리포트 §3/§4의 사용자 확인이 완료되어야 최종 충족된다.
