# D2. RULES_ENGINE.md

## 보드 표현 (LOCKED: 0x88)

**채택: 0x88.** 128칸 `Int8Array`(또는 `PieceCode[]`), 인덱스 `sq = rank*16 + file`. 오프보드 판정은 `sq & 0x88 !== 0` 단일 비트 연산. file/rank 추출은 `file = sq & 7`, `rank = sq >> 4`. 슬라이딩 기물 레이 생성 시 방향 오프셋(-17,-16,-15,-1,1,15,16,17 등)을 더한 뒤 `& 0x88` 체크만으로 경계 처리가 끝나 코드가 단순하고 버그 표면적이 작다.

**기각 대안:**
- **Bitboard(BigInt):** 64비트 비트마스크는 이론상 빠르지만 JS `BigInt`는 네이티브 정수 연산보다 5~10배 느리고(V8 벤치마크 기준), 비트보드 디버깅(좌표 시각화)이 0x88 대비 어렵다. 클라이언트 UX(칸 하이라이트, 좌표 변환)에는 오히려 불리. AI 목표 depth(8~10, D3)는 좋은 move ordering과 TT만으로 0x88+생성기 최적화로 충분히 도달 가능 — 최상위 엔진(Stockfish급 depth 20+)을 목표로 하지 않으므로 비트보드의 이득이 비용을 정당화하지 못함.
- **Mailbox 8x8:** 배열 크기는 작지만 슬라이딩 기물 레이 생성 시 별도 경계 체크 함수가 필요해 코드가 늘고, 오프보드 판정에 분기가 추가되어 0x88보다 느리고 장황함.

## 핵심 타입

```ts
type Color = 'w' | 'b';
type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type Square = number & { readonly __brand: 'Square' }; // 0x88 index, 0..127 (valid: sq & 0x88 === 0)

interface Piece { type: PieceType; color: Color; }

const enum MoveFlag {
  CAPTURE      = 1 << 0,
  CASTLE_K     = 1 << 1,
  CASTLE_Q     = 1 << 2,
  EN_PASSANT   = 1 << 3,
  PROMOTION    = 1 << 4,
  DOUBLE_PUSH  = 1 << 5,
}
interface Move {
  from: Square;
  to: Square;
  promo?: PieceType; // 'n'|'b'|'r'|'q' only, present iff flags & PROMOTION
  flags: number;      // bitwise OR of MoveFlag
}

interface CastlingRights { wk: boolean; wq: boolean; bk: boolean; bq: boolean; }

interface Position {
  board: (Piece | null)[];     // length 128, indexed by Square; off-board slots unused
  turn: Color;
  castling: CastlingRights;
  epSquare: Square | null;      // en-passant target square, null if none
  halfmoveClock: number;        // for 50-move rule
  fullmoveNumber: number;
  hash: bigint;                 // incremental Zobrist hash, maintained by makeMove
}

type GameResult =
  | { kind: 'in_progress' }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: 'fifty_move' | 'threefold' | 'insufficient_material' | 'agreement' }
  | { kind: 'resignation'; winner: Color }
  | { kind: 'timeout'; winner: Color };
```

## 공개 API

```ts
/** 현재 turn 진영의 합법수 전체를 생성한다. 자기 킹이 체크에 노출되는 수는 제외(pseudo-legal 생성 후 필터링). */
function generateLegalMoves(pos: Position): Move[];

/** move를 적용한 새 Position을 반환한다. 원본은 변경하지 않는다(불변 설계 — 아래 근거 참조). */
function makeMove(pos: Position, move: Move): Position;

/** color 진영의 킹이 현재 공격받고 있는지 판정. */
function isInCheck(pos: Position, color: Color): boolean;

/** 체크메이트/스테일메이트/무승부/진행중 판정. history는 3회 동형반복 검사를 위한 과거 Position(또는 hash) 배열. */
function getGameResult(pos: Position, history: Position[]): GameResult;

function toFEN(pos: Position): string;
function fromFEN(fen: string): Position;

/** 표준대수기보(SAN) 생성. 모호성 해소(같은 목적지로 이동 가능한 동종 기물이 2개 이상일 때 출발 file/rank 부기)를 포함. */
function toSAN(pos: Position, move: Move): string;

/** 증분 갱신 없이 포지션으로부터 처음부터 해시를 계산할 때 사용(fromFEN 직후 등). makeMove는 이 함수를 다시 부르지 않고 XOR 증분 갱신으로 pos.hash를 만든다. */
function zobristHash(pos: Position): bigint;
```

**`unmakeMove`를 두지 않는 이유:** `makeMove`를 불변(새 `Position` 반환)으로 설계했다. AI 탐색(D3)의 negamax는 일반적으로 mutate+unmake 패턴이 GC 압력이 적어 더 빠르지만, 이 프로젝트의 depth 목표(8~10)와 movetime 예산(수백 ms~수 초, D3) 내에서는 불변 방식의 오버헤드가 감당 가능한 수준이며, 렌더러/네트워크 계층에서 과거 `Position`을 그대로 배열에 보관해 재생·롤백(D6 낙관적 예측 롤백)이 단순해지는 이득이 더 크다. `chess-core`가 렌더러 무지(D1 원칙)를 유지하면서도 여러 소비자(AI worker, 클라이언트 예측, 서버 검증, SAN 히스토리)가 동시에 과거 상태를 참조해야 하므로 불변 스타일을 채택. AI worker 내부에서만 성능이 아쉬우면 `chess-core` 상위에 mutate 전용 `FastSearchBoard` 보조 표현을 D3에서 별도로 둘 수 있음(선택 사항, 필수 아님).

## Zobrist 해싱

- 테이블 구조: `pieceKeys[12][64]` (6 piece type × 2 color, 64 실좌표 — 0x88 sq를 `((sq>>4)*8)+(sq&7)`로 압축해 인덱싱), `castlingKeys[4]` (wk/wq/bk/bq 각 1개), `epFileKeys[8]`, `sideToMoveKey` 단일 값. 전부 모듈 로드 시 결정론적 PRNG(예: 고정 시드 mulberry32)로 생성해 클라이언트/서버가 항상 동일한 키 집합을 갖도록 한다(같은 시드 하드코딩 필수 — 런타임 `Math.random()` 금지, 클라/서버 해시 불일치 방지).
- `makeMove`에서 매번 `zobristHash()` 전체 재계산 대신, 기물 이동/캡처/캐슬링/앙파상/프로모션마다 관련 `pieceKeys` 항목을 XOR로 토글하고, castling rights·ep file·side-to-move 변경분도 XOR로 반영해 O(1) 증분 갱신한다.
- **용도 1 — 3회 동형반복:** `history: Position[]`에서 `hash`가 동일한 포지션 등장 횟수를 `Map<bigint, number>`로 카운트, 3 이상이면 `draw:'threefold'`.
- **용도 2 — AI 트랜스포지션 테이블:** D3의 TT 키로 그대로 사용(`hash % TT_SIZE`로 버킷 인덱싱, `hash` 자체는 충돌 검증용 태그로 엔트리에 저장).

## Perft 검증표 (필수, 협상 불가)

| # | 포지션 | FEN |
|---|---|---|
| 1 | Start position | `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1` |
| 2 | Kiwipete | `r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1` |
| 3 | Endgame | `8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1` |
| 4 | Castling/promo edge | `r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1` |
| 5 | Talkchess pos5 | `rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8` |
| 6 | Steven Edwards pos6 | `r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10` |

기대 노드 수:

| Depth | Pos1 | Pos2 | Pos3 | Pos4 | Pos5 | Pos6 |
|---|---|---|---|---|---|---|
| 1 | 20 | 48 | 14 | 6 | 44 | 46 |
| 2 | 400 | 2039 | 191 | 264 | 1486 | 2079 |
| 3 | 8902 | 97862 | 2812 | 9467 | 62379 | 89890 |
| 4 | 197281 | 4085603 | 43238 | 422333 | 2103487 | 3894594 |
| 5 | 4865609 | 193690690 | 674624 | 15833292 | 89941194 | 164075551 |
| 6 | 119060324 | 8031647685 | 11030083 | 706045033 | (미측정) | 6923051137 |
| 7 | (미측정) | (미측정) | 178633661 | (미측정) | (미측정) | (미측정) |

**CI 포함 범위(고정):** 위 표에서 **굵은 선 없이 depth 1~4 전부 + Pos1/Pos3 depth 5**는 기본 `npm test`에 포함한다(합계 약 1,100만 노드, 목표 실행시간 < 25s). depth 5의 Pos2/Pos4/Pos5/Pos6과 모든 depth 6/7 값은 `npm run test:perft:full`(별도 스크립트, `vitest --run perft.full.test.ts`)로 분리하며 릴리스 전 1회 수동 실행한다 — 근거: Pos2 depth 5(1.94억 노드)만으로도 순수 TS 생성기에서 3~8분이 소요되어 매 커밋 CI에 부적합. `(미측정)` 항목은 "값이 없음"이 아니라 **이 프로젝트가 검증 대상으로 삼지 않는 깊이**라는 뜻이며, 구현 시 해당 칸에 대한 테스트를 작성하지 않는다.

**Vitest 테스트화:** `packages/chess-core/src/__tests__/perft.test.ts`.
```ts
import { it, expect, describe } from 'vitest';
import { perft } from '../perft';
import { fromFEN } from '../fen';

// packages/chess-core/src/__tests__/perft.test.ts 의 CI 기본 스위트 (6 포지션 전수, 생략 없음)
const CASES: { name: string; fen: string; depths: number[] }[] = [
  { name: 'startpos', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    depths: [20, 400, 8902, 197281, 4865609] },
  { name: 'kiwipete', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    depths: [48, 2039, 97862, 4085603] },
  { name: 'endgame', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    depths: [14, 191, 2812, 43238, 674624] },
  { name: 'castling-promo-edge', fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    depths: [6, 264, 9467, 422333] },
  { name: 'talkchess-pos5', fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    depths: [44, 1486, 62379, 2103487] },
  { name: 'edwards-pos6', fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
    depths: [46, 2079, 89890, 3894594] },
];

// packages/chess-core/src/__tests__/perft.full.test.ts (npm run test:perft:full 전용)
const FULL_CASES: { name: string; fen: string; depth: number; expected: number }[] = [
  { name: 'startpos',            fen: CASES[0]!.fen, depth: 6, expected: 119060324 },
  { name: 'kiwipete',            fen: CASES[1]!.fen, depth: 5, expected: 193690690 },
  { name: 'kiwipete',            fen: CASES[1]!.fen, depth: 6, expected: 8031647685 },
  { name: 'endgame',             fen: CASES[2]!.fen, depth: 6, expected: 11030083 },
  { name: 'endgame',             fen: CASES[2]!.fen, depth: 7, expected: 178633661 },
  { name: 'castling-promo-edge', fen: CASES[3]!.fen, depth: 5, expected: 15833292 },
  { name: 'castling-promo-edge', fen: CASES[3]!.fen, depth: 6, expected: 706045033 },
  { name: 'talkchess-pos5',      fen: CASES[4]!.fen, depth: 5, expected: 89941194 },
  { name: 'edwards-pos6',        fen: CASES[5]!.fen, depth: 5, expected: 164075551 },
  { name: 'edwards-pos6',        fen: CASES[5]!.fen, depth: 6, expected: 6923051137 },
];

describe('perft', () => {
  for (const c of CASES) {
    c.depths.forEach((expected, i) => {
      const depth = i + 1;
      it(`${c.name} depth ${depth} = ${expected}`, () => {
        expect(perft(fromFEN(c.fen), depth)).toBe(expected);
      }, depth >= 5 ? 30_000 : 5_000); // depth5+는 timeout 30s로 상향
    });
  }
});
```
depth 5(Pos1 4,865,609 / Pos3 674,624)는 수 초가 소요되므로 `it(..., timeout)` 세 번째 인자로 개별 타임아웃 30,000ms를 지정한다. `perft`의 반환 타입은 `number`이며 최대 검증값 8,031,647,685 < `Number.MAX_SAFE_INTEGER`(9.007e15)이므로 `bigint`가 필요 없다. `FULL_CASES`는 `it(..., 900_000)`(15분)로 지정한다. 이 분리는 기각/생략이 아니라 CI 시간 관리이므로 `⚠️ DECISION NEEDED` 항목이 아니다.

## 무승부/승리 판정 결정 트리

```
getGameResult(pos, history):
  legalMoves = generateLegalMoves(pos)
  inCheck = isInCheck(pos, pos.turn)

  IF legalMoves.length === 0:
    IF inCheck: RETURN checkmate, winner = opponent(pos.turn)
    ELSE:       RETURN stalemate

  IF pos.halfmoveClock >= 100:  RETURN draw('fifty_move')   // 100 half-moves = 50 full moves
  IF countOccurrences(history, pos.hash) >= 3: RETURN draw('threefold')
  IF isInsufficientMaterial(pos): RETURN draw('insufficient_material')

  RETURN in_progress
```

`isInsufficientMaterial`가 true인 조합: K vs K / K+N vs K / K+B vs K / K+B vs K+B(양측 비숍이 같은 색 칸에 있을 때만 — 다른 색이면 이론상 메이트 가능하므로 false). K+N vs K+N, K+2N vs K 등은 이론상 강제 메이트가 존재하지 않지만 실전 규약상 "불충분"으로 취급하지 않음(체스 규칙상 논쟁적 케이스이므로 이 프로젝트는 FIDE 기본 4가지 케이스만 자동 판정하고 나머지는 50수/합의 무승부로 처리) — 근거: FIDE 규정도 이 4가지 외에는 자동판정을 강제하지 않음.

기권(resignation)·시간패(timeout)는 룰 엔진이 아니라 D6 네트워크/매치 레이어에서 트리거되어 `GameResult`로 래핑됨(룰 엔진은 보드 상태만 안다).

## ⚠️ Open Decisions (D2)

없음. 보드 표현은 스택 문서(§2)에 의해 사실상 고정된 트레이드오프이며, `unmakeMove` 생략도 D1/D3 설계와 일관되므로 사용자 확인이 필요한 실질적 트레이드오프가 남아있지 않음.
