# D3. AI_DESIGN.md

## 난이도 4단계

| 난이도 | 목표 Elo | Depth | Movetime(ms) | 블런더 확률 | 랜덤 선택 폭(top-N) | 성격 |
|---|---|---|---|---|---|---|
| Beginner | 600–800 | 1–2 | 300 | 25% (재료 손실 -100cp 이상 수를 의도적으로 섞음) | 상위 5수 중 랜덤 | 눈에 보이는 캡처를 탐욕적으로 선호, 방어 개념 약함 |
| Intermediate | 1200–1400 | 3–4 | 800 | 8% | 상위 3수 중 랜덤 | 기본 전술(포크/핀)은 봄, 장기 계획 없음 |
| Advanced | 1700–1900 | 5–7 | 2000 | 0% | 항상 최선수 | 명확한 실수 없음, 동형반복 회피 |
| Master | 2200+ | 8+ (반복심화, 시간 허용 시 12까지) | 4000 | 0% | 항상 최선수 | 포지셔널 플레이, 오프닝북+엔드게임 지식 |

블런더는 "루트에서 생성된 합법수를 얕은 depth(Beginner=1, Intermediate=2)로 평가 후 정렬한 리스트에서, 확률적으로 top-N 밖의 수(단 최선수 대비 -150cp 이내로 캡)를 선택"하는 방식으로 구현 — 즉 완전 랜덤이 아니라 "그럴듯하지만 최적은 아닌 수"를 고르게 하여 부자연스러운 실수를 방지한다.

## 평가 함수

### 재료값 (centipawn)
`p=100, n=320, b=330, r=500, q=900, k=20000(합산 제외, 존재 확인용)`

### Piece-Square Table (미들게임/엔드게임, White 시점, 8x8 rank8→rank1 순)

**Pawn (MG)**
```
 0   0   0   0   0   0   0   0
 98 134  61  95  68 126  34 -11
 -6   7  26  31  65  56  25 -20
-14  13   6  21  23  12  17 -23
-27  -2  -5  12  17   6  10 -25
-26  -4  -4 -10   3   3  33 -12
-35  -1 -20 -23 -15  24  38 -22
  0   0   0   0   0   0   0   0
```
**Pawn (EG)**
```
  0   0   0   0   0   0   0   0
178 173 158 134 147 132 165 187
 94 100  85  67  56  53  82  84
 32  24  13   5  -2   4  17  17
 13   9  -3  -7  -7  -8   3  -1
  4   7  -6   1   0  -5  -1  -8
 13   8   8  10  13   0   2  -7
  0   0   0   0   0   0   0   0
```
**Knight (MG)**
```
-167 -89 -34 -49  61 -97 -15 -107
 -73 -41  72  36  23  62   7  -17
 -47  60  37  65  84 129  73   44
  -9  17  19  53  37  69  18   22
 -13   4  16  13  28  19  21   -8
 -23  -9  12  10  19  17  25  -16
 -29 -53 -12  -3  -1  18 -14  -19
-105 -21 -58 -33 -17 -28 -19  -23
```
**Knight (EG)**
```
-58 -38 -13 -28 -31 -27 -63 -99
-25  -8 -25  -2  -9 -25 -24 -52
-24 -20  10   9  -1  -9 -19 -41
-17   3  22  22  22  11   8 -18
-18  -6  16  25  16  17   4 -18
-23  -3  -1  15  10  -3 -20 -22
-42 -20 -10  -5  -2 -20 -23 -44
-29 -51 -23 -15 -22 -18 -50 -64
```
**Bishop (MG)**
```
-29   4 -82 -37 -25 -42   7  -8
-26  16 -18 -13  30  59  18 -47
-16  37  43  40  35  50  37  -2
 -4   5  19  50  37  37   7  -2
 -6  13  13  26  34  12  10   4
  0  15  15  15  14  27  18  10
  4  15  16   0   7  21  33   1
-33  -3 -14 -21 -13 -12 -39 -21
```
**Bishop (EG)**
```
-14 -21 -11  -8 -7  -9 -17 -24
 -8  -4   7 -12 -3 -13  -4 -14
  2  -8   0  -1 -2   6   0   4
 -3   9  12   9 14  10   3   2
 -6   3  13  19  7  10  -3  -9
-12  -3   8  10 13   3  -7 -15
-14 -18  -7  -1  4  -9 -15 -27
-23  -9 -23  -5 -9 -16  -5 -17
```
**Rook (MG)**
```
 32  42  32  51 63  9  31  43
 27  32  58  62 80 67  26  44
 -5  19  26  36 17 45  61  16
-24 -11   7  26 24 35   -8 -20
-36 -26 -12  -1  9 -7    6 -23
-45 -25 -16 -17  3  0   -5 -33
-44 -16 -20  -9 -1 11   -6 -71
-19 -13   1  17 16  7  -37 -26
```
**Rook (EG)**
```
13 10 18 15 12 12  8  5
11 13 13 11 -3  3  8  3
 7  7  7  5  4 -3 -5  -3
 4  3 13  1  2  1 -1   2
 3  5  8  4 -5 -6 -8 -11
-4  0 -5 -1 -7 -12 -8 -16
-6 -6  0  2 -9 -9 -11 -3
-9  2  3 -1 -5 -13  4 -20
```
**Queen (MG)**
```
-28   0  29  12  59  44  43  45
-24 -39  -5   1 -16  57  28  54
-13 -17   7   8  29  56  47  57
-27 -27 -16 -16  -1  17  -2   1
 -9 -26  -9 -10  -2  -4   3   -3
-14   2 -11  -2  -5   2  14   5
-35  -8  11   2   8  15  -3   1
 -1 -18  -9  10 -15 -25 -31 -50
```
**Queen (EG)**
```
 -9  22  22  27  27  19  10  20
-17  20  32  41  58  25  30   0
-20   6   9  49  47  35  19   9
  3  22  24  45  57  40  57  36
-18  28  19  47  31  34  39  23
-16 -27  15   6   9  17  10   5
-22 -23 -30 -16 -16 -23 -36 -32
-33 -28 -22 -43  -5 -32 -20 -41
```
**King (MG)**
```
-65  23  16 -15 -56 -34   2  13
 29  -1 -20  -7  -8  -4 -38 -29
 -9  24   2 -16 -20   6  22 -22
-17 -20 -12 -27 -30 -25 -14 -36
-49  -1 -27 -39 -46 -44 -33 -51
-14 -14 -22 -46 -44 -30 -15 -27
  1   7  -8 -64 -43 -16   9   8
-15  36  12 -54   8 -28  24  14
```
**King (EG)**
```
-74 -35 -18 -18 -11  15   4 -17
-12  17  14  17  17  38  23  11
 10  17  23  15  20  45  44  13
 -8  22  24  27  26  33  26   3
-18  -4  21  24  27  23   9 -11
-19  -3  11  21  23  16   7  -9
-27 -11   4  13  14   4  -5 -17
-53 -34 -21 -11 -28 -14 -24 -43
```
(위 PST는 표준 PeSTO/Simplified Evaluation 계열 공개 값을 채택 — Black은 랭크를 반전(mirror)해 동일 테이블 재사용.)

### 폰 구조
- 고립폰: **-15**
- 이중폰: **-12** (같은 파일에 초과되는 폰 1개당)
- 통과폰 보너스 (rank 2→7, White 기준 진행 방향):

| Rank | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|
| 보너스 | 5 | 10 | 20 | 40 | 70 | 120 |

- 연결 통과폰(같은 랭크 인접 파일에 또 다른 통과폰): 추가 **+15**

### 킹 안전
- 폰 쉴드: 킹 앞 3칸(같은 파일+양 인접 파일, 킹 전방 1랭크) 중 아군 폰 존재 시 칸당 **+8**
- 킹 인접 오픈파일: 파일당 **-20** (세미오픈 **-10**)
- King-zone 공격 가중치(공격 기물 종류별, 킹 반경 2칸 내 진입 시 누적): `n=20, b=20, r=40, q=80` — 합계를 `KING_SAFETY_TABLE[min(sum/10, 7)] = [0,0,10,25,50,80,130,200]`에 매핑해 감점

### 기동성 (합법수 1개당 centipawn)
`n=4, b=5, r=2, q=1` (킹/폰 기동성은 미평가)

### 기타
- 비숍 페어: **+30**
- 룩 오픈파일: **+20**, 세미오픈파일: **+10**

### Tapered Eval
```
phase = Σ(remaining non-pawn material weight), maxPhase = 24
  weight: n=1, b=1, r=2, q=4 (per side, so maxPhase = 2*(2*1+2*1+2*2+1*4)=24)
mgScore = Σ(MG 항목)
egScore = Σ(EG 항목)
eval = (mgScore * phase + egScore * (maxPhase - phase)) / maxPhase
return side-to-move 기준 부호 반전(negamax 관례)
```

## 탐색 알고리즘 (의사코드)

```
function negamax(pos, depth, alpha, beta, ply):
  ttEntry = TT.lookup(pos.hash)
  if ttEntry && ttEntry.depth >= depth:
    if ttEntry.flag == EXACT: return ttEntry.score
    if ttEntry.flag == LOWER: alpha = max(alpha, ttEntry.score)
    if ttEntry.flag == UPPER: beta = min(beta, ttEntry.score)
    if alpha >= beta: return ttEntry.score

  if depth == 0: return quiescence(pos, alpha, beta)

  // null-move pruning (Advanced/Master만, depth >= 3, 자신이 체크 상태 아닐 때)
  if allowNullMove && depth >= 3 && !isInCheck(pos, pos.turn):
    score = -negamax(makeNullMove(pos), depth-1-2, -beta, -beta+1, ply+1)
    if score >= beta: return beta  // fail-hard beta cutoff

  moves = orderMoves(generateLegalMoves(pos), ttEntry?.bestMove, killers[ply], historyTable)
  bestScore = -INF; bestMove = null
  for i, move in moves:
    // Late Move Reduction: 정숙수(non-capture) & i>=4 & depth>=3 이면 depth-1 대신 depth-2로 축소 탐색하고, 그 결과가 score > alpha 이면 depth-1로 전체 재탐색
    // move.flags는 D2의 비트필드(number)이므로 비트 AND로 판정한다 — `move.flags.CAPTURE` 같은 속성 접근 금지
    reduction = (i >= 4 && (move.flags & MoveFlag.CAPTURE) === 0 && depth >= 3) ? 1 : 0
    child = makeMove(pos, move)
    score = -negamax(child, depth-1-reduction, -beta, -alpha, ply+1)
    if reduction > 0 && score > alpha:
      score = -negamax(child, depth-1, -beta, -alpha, ply+1)  // 재탐색
    if score > bestScore: bestScore = score; bestMove = move
    alpha = max(alpha, score)
    if alpha >= beta:
      if (move.flags & MoveFlag.CAPTURE) === 0: killers[ply].add(move); historyTable[move] += depth*depth
      break
  TT.store(pos.hash, depth, bestScore, bestMove, flag)
  return bestScore

function quiescence(pos, alpha, beta):
  standPat = evaluate(pos)
  if standPat >= beta: return beta
  alpha = max(alpha, standPat)
  for move in generateCaptures(pos):  // MVV-LVA 정렬된 캡처만
    score = -quiescence(makeMove(pos, move), -beta, -alpha)
    if score >= beta: return beta
    alpha = max(alpha, score)
  return alpha

function orderMoves(moves, ttMove, killers, history):
  // 1) ttMove 최우선  2) MVV-LVA 캡처 (victimValue*10 - attackerValue)
  // 3) killer moves(같은 ply에서 컷오프 낸 정숙수 2개)  4) history heuristic 점수 내림차순
```

Iterative deepening: depth 1부터 목표 depth(또는 시간 소진)까지 순차 증가, 매 depth 완료 시 `bestMove` 갱신 및 `AI_SEARCH_PROGRESS` 전송. Master는 aspiration window(이전 depth 점수 ±50cp 범위로 alpha/beta 시작, fail시 window를 2배로 넓혀 재탐색) 사용.

## Web Worker 실행 설계

```ts
// packages/client/src/ai/AiWorkerHandle.ts 및 worker/ai.worker.ts 공유 타입
type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'master'; // 위 난이도표 4행과 1:1 대응

// 메인 스레드 → Worker
type AiRequest =
  | { type: 'AI_SEARCH_REQUEST'; position: Position; difficulty: Difficulty; movetimeMs: number; requestId: string }
  | { type: 'AI_SEARCH_ABORT'; requestId: string };

// Worker → 메인 스레드
type AiResponse =
  | { type: 'AI_SEARCH_PROGRESS'; requestId: string; depth: number; scoreCp: number; pv: Move[]; nodes: number }
  | { type: 'AI_SEARCH_RESULT'; requestId: string; move: Move; evalScoreCp: number }
  | { type: 'AI_SEARCH_ABORTED'; requestId: string };
```
- `movetimeMs`는 난이도표의 값을 그대로 사용, iterative deepening 루프는 `performance.now() - startTime > movetimeMs`가 되는 즉시 현재 depth 완료 후 종료(진행 중이던 depth는 완료시키지 않고 이전 depth의 bestMove 반환 — 부분 탐색 결과 오염 방지).
- 취소: 워커 내부에 `let aborted = false` 플래그, `AI_SEARCH_ABORT` 수신 시 true로 설정하고 negamax 루프 최상위에서 매 1000노드마다 체크해 조기 반환. 메인 스레드는 `AI_SEARCH_ABORTED` 수신 전까지 새 요청을 보내지 않음(직렬화).
- 진행률 보고: 매 완료된 depth마다 1회(`AI_SEARCH_PROGRESS`) — 초당 다회 보고로 postMessage 오버헤드를 만들지 않음.
- 메인 스레드는 절대 블록되지 않음 — `chess-core`는 의존성 0이라 Worker 번들에 그대로 포함 가능.

## 사고 중 연출 시간

| 난이도 | 최소 지연(ms) | 최대 지연(ms) |
|---|---|---|
| Beginner | 400 | 1200 |
| Intermediate | 500 | 2000 |
| Advanced | 600 | 3000 |
| Master | 800 | 4000 |

Worker가 movetime보다 빨리 끝나도(예: Beginner depth1 완료가 50ms) 최소 지연만큼 UI에서 "생각 중" 인디케이터를 유지한 뒤 수를 반영한다. movetime 자체가 이미 최대 지연에 가까운 Advanced/Master는 실질적으로 movetime이 지배적.

## ⚠️ Open Decisions (D3)

**오프닝북 데이터 포맷**
- **옵션 A (추천):** 경량 자체 JSON 포맷 `{ fenPrefix: string; moves: { move: string; weight: number }[] }[]`, 첫 6~8 ply 주요 오프닝만 커버, 50~200KB.
- **옵션 B:** Polyglot `.bin` 표준 포맷, 더 방대한 커버리지지만 바이너리 파서 필요, 번들 크기 및 복잡도 증가.
- **추천 근거:** 락인된 스택 원칙("승인 안 된 의존성 금지")과 번들 크기 예산(D9) 통제를 위해 옵션 A. Master 난이도 하나만을 위한 기능이므로 최소 구현으로 충분.
