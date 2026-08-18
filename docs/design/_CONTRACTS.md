# _CONTRACTS.md — 문서 간 공유 타입/네이밍 계약 (내부 작업용, D1~D10 작성자 전원 필독)

> 이 파일은 최종 산출물이 아니라 D1~D10 작성 시 **이름 충돌을 막기 위한 내부 기준선**이다.
> D1(ARCHITECTURE.md)이 최종적으로 이 내용을 흡수/정리한다. 각 문서는 아래 이름을 임의로 바꾸지 말 것.
> **문서 간 이름이 충돌하면 이 파일이 정본이다.**

## 디렉토리 구조 (고정)
```
packages/
  chess-core/      # 룰 엔진, 순수 TS, 의존성 0 (three 금지)
    src/
      types.ts       # Color, PieceType, Square, Move, MoveFlag(비트필드), Position
      board.ts        # 보드 표현 (0x88 채택, D2에서 근거)
      movegen.ts
      makemove.ts
      zobrist.ts
      fen.ts
      san.ts
      result.ts       # 게임 결과 판정 (체크메이트/스테일메이트/무승부)
      perft.ts
  protocol/        # 클라-서버 공유 메시지 타입 (chess-core에 의존 가능, three 금지)
    src/
      messages.ts     # discriminated union 전체
  client/
    src/
      engine/       # Renderer, Scene, Camera, PostFX, QualityTier
      units/        # UnitProvider, ProceduralUnitFactory, GLTFUnitProvider, builders/*Builder
      anim/         # AnimationRegistry, clip DSL, AnimationController, CombatDirector
      audio/         # AudioBus, SynthVoice
      ui/
      net/           # NetClient, PredictionBuffer, ReconnectController
      persistence/   # (R15/D10) schema, identity, IndexedDbStore, MatchRecorder, SyncEngine, HistoryClient
      ai/            # AI Worker 클라이언트측 핸들
      input/
      game/          # GameSession FSM, EventBus
  server/
    data/bcr.sqlite  # (R15/D10) 런타임 생성, git 미추적
    src/
      room.ts / match.ts / clock.ts / netServer.ts / session.ts (chess-core, protocol 재사용)
      http/historyApi.ts   # (R15/D10) /api/v1 REST, ws와 동일 node:http 서버에 attach
      db/                  # (R15/D10) SQL은 이 디렉토리 밖에 존재 금지
        connection.ts / migrations/001_init.sql
        PlayerRepository.ts / MatchRepository.ts / HistoryQueries.ts
```

## 의존 방향 (고정)
`chess-core` ← `protocol` ← `client`, `server` (화살표는 "의존받는" 방향, 즉 위쪽이 아래를 모름)
- `chess-core`: 의존성 0. `three` import 금지.
- `protocol`: `chess-core` 타입만 참조 가능.
- `client`, `server`: `chess-core` + `protocol` 사용 가능. `client`→`server` 금지, `server`→`three`/`client` 금지.

## 핵심 타입 (D2가 정의하고 전 문서가 따름)
```ts
type Color = 'w' | 'b';
type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type Square = number & { readonly __brand: 'Square' }; // 0x88 인덱스
interface Piece { type: PieceType; color: Color; }
interface CastlingRights { wk: boolean; wq: boolean; bk: boolean; bq: boolean; }

// move flags는 **비트필드(number)** 다 — 객체가 아니다(D2 확정).
// `move.flags.CAPTURE` 같은 속성 접근은 오류이며 `(move.flags & MoveFlag.CAPTURE) !== 0`으로 판정한다.
const enum MoveFlag {
  CAPTURE = 1 << 0, CASTLE_K = 1 << 1, CASTLE_Q = 1 << 2,
  EN_PASSANT = 1 << 3, PROMOTION = 1 << 4, DOUBLE_PUSH = 1 << 5,
}
interface Move { from: Square; to: Square; promo?: PieceType; flags: number; }
interface Position {
  board: (Piece|null)[];        // length 128
  turn: Color; castling: CastlingRights; epSquare: Square|null;
  halfmoveClock: number; fullmoveNumber: number;
  hash: bigint;                  // 증분 Zobrist (D2). makeMove가 유지.
}
type GameResult =
  | { kind: 'in_progress' } | { kind: 'checkmate'; winner: Color } | { kind: 'stalemate' }
  | { kind: 'draw'; reason: 'fifty_move' | 'threefold' | 'insufficient_material' | 'agreement' }
  | { kind: 'resignation'; winner: Color } | { kind: 'timeout'; winner: Color };
type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'master';  // D3
```
보드 표현: **0x88** 채택 (D2 §근거 참조 — 클라 UX 좌표 변환 용이, AI depth 8+ 목표에도 비트보드 대비 충분, BigInt 비트보드는 JS 엔진에서 정수 비트보드보다 느림).

## 유닛 / 프레젠테이션 계약 (D4가 정의)
```ts
type QualityTier = 'low' | 'medium' | 'high' | 'ultra';
interface UnitInstance { root: THREE.Object3D; bones: Record<string, THREE.Bone>; mixer: THREE.AnimationMixer; dispose(): void; }
interface UnitProvider { create(type: PieceType, color: Color, quality: QualityTier): UnitInstance; }
```
본 이름 네이밍 컨벤션 (전 유닛 공통, 예외는 D4가 명시): `root, hips, spine, chest, head, shoulder.L, shoulder.R, elbow.L, elbow.R, hand.L, hand.R, thigh.L, thigh.R, knee.L, knee.R, foot.L, foot.R`

## 애니메이션 레지스트리 계약 (D5가 정의)
```ts
interface AnimClipDef { id: string; duration: number; loop: boolean; tracks: TrackDef[]; }
interface CombatSceneDef {
  id: string; // `${attacker}.${defender}`
  attacker: PieceType; defender: PieceType;
  version: string;              // semver, 재등록 시 상위 버전이 이김(D5-1)
  totalDuration: number;
  camera: CameraShotDef;
  beats: BeatDef[];
  vfx: VfxCueDef[]; sfx: SfxCueDef[];
  skipPointSec: number;
}
// BeatDef / VfxCueDef / SfxCueDef / CameraShotDef 의 필드는 D5-1이 정본.
interface AnimationRegistry {
  registerClip(def: AnimClipDef): void;
  registerCombatScene(def: CombatSceneDef): void;
  getMovementClip(type: PieceType): AnimClipDef;                      // 미등록 시 throw(필수 12종)
  getCombatScene(attacker: PieceType, defender: PieceType): CombatSceneDef; // 미등록 시 'generic.strike' 폴백
}
```
> 등록 메서드는 **`registerClip`/`registerCombatScene` 2개**다(D5-1 확정). 단일 `register(entry)` 오버로드는 폐기.

## 이벤트 버스 (D1이 최종 취합, 각 문서는 자기 영역 이벤트만 제안)
네이밍 컨벤션: `domain:eventName` (예: `game:moveApplied`, `anim:combatSceneStart`, `net:moveRejected`)

## 네트워크 프로토콜 봉투 (D6가 정의)
```ts
interface Envelope<T extends string, P> { type: T; seq: number; ts: number; payload: P; }
```
메시지 타입 목록 **총 20종**(01 프롬프트 §D6의 16종 + D6/D10에서 확정한 4종):
`HELLO, QUEUE_JOIN, MATCH_FOUND, MOVE, MOVE_ACCEPTED, MOVE_REJECTED, STATE_SYNC, CLOCK_SYNC, DRAW_OFFER, RESIGN, GAME_END, MATCH_END, OPPONENT_DISCONNECTED, RECONNECT, CHAT, EMOTE, ROOM_CREATED, INTERMISSION_READY, PLAYER_IDENTIFY, PLAYER_IDENTIFIED`
- `ROOM_CREATED`(S→C): 룸코드 발급 ack (D6 §D6-9 확정).
- `INTERMISSION_READY`(C↔S): Bo3 판간 준비 완료 (D6 §D6-4 / D7 §1).
- `PLAYER_IDENTIFY`(C→S) / `PLAYER_IDENTIFIED`(S→C): R15 플레이어 식별 (D10 §D10-1).
- 히스토리 조회는 **WS 메시지가 아니라 HTTP REST**(`/api/v1`, D10 §D10-6). `MATCH_HISTORY_REQUEST/RESPONSE`는 **신설하지 않는다**.
보조 타입: `type GameStatus = 'countdown'|'active'|'gameEnded'|'intermission'|'matchEnded';` `interface MatchScore { you: number; opponent: number; }`

## 영속화 계약 (D10이 정의, R15) — 이름 변경 금지

```ts
// ── 공유 어휘 (packages/protocol/src/history.ts) ─────────────────────────
type MatchSource   = 'local2p' | 'cpu' | 'online';
type MatchFormat   = 'bo1' | 'bo3';
type MatchOutcome  = 'win' | 'loss' | 'draw' | 'aborted';       // '나' 기준
type SyncState     = 'local' | 'pending' | 'synced' | 'rejected' | 'deferred';
type GameEndReason = 'checkmate' | 'stalemate' | 'resign' | 'timeout' | 'draw50'
                   | 'repetition' | 'insufficientMaterial' | 'agreement' | 'abandon';

interface MatchSummaryDto { /* D10 §D10-6 정본 */ }
interface MatchHistoryPage { matches: MatchSummaryDto[]; nextBefore: number | null; totalCount: number; }
interface GameRecordDto { /* D10 §D10-6 정본 */ }
interface MatchDetailDto extends MatchSummaryDto { games: GameRecordDto[]; }
interface PlayerStatsDto { /* D10 §D10-6 정본 */ }

// ── 클라이언트 (packages/client/src/persistence/) ────────────────────────
interface PlayerIdentity { playerId: string; nickname: string; secret: string;
                           createdAt: number; serverRegisteredAt: number | null; schemaVersion: 1; }
interface LocalMatchRecord { /* keyPath: localMatchId — D10 §D10-3 정본 */ }
interface LocalGameRecord  { /* keyPath: localGameId  — D10 §D10-3 정본 */ }
interface SyncOp           { /* keyPath: opId         — D10 §D10-3 정본 */ }
interface PersistenceStore { open; putMatch; listMatches; getMatchDetail; markSynced;
                             pendingSyncOps; prune; clearAll }   // 시그니처는 D10 §D10-9
interface MatchRecorder { record(input: MatchRecordInput): Promise<LocalMatchRecord>; }
interface SyncEngine    { start(): void; stop(): void; syncNow(): Promise<{ uploaded: number; failed: number }>; }
interface HistoryClient { identify; uploadMatches; fetchHistory; fetchMatch; fetchStats; deleteAccount }

// ── 서버 (packages/server/src/db/) ───────────────────────────────────────
interface PlayerRepository { upsert; verifySecret; deleteCascade }
interface MatchRepository  { finalizeMatch(input): string; insertSyncedMatch(input): {...} }  // 동기 API
interface HistoryQueries   { listMatches; getMatchDetail; getStats }
```

**고정 상수(문서 간 동일해야 함):**
| 항목 | 값 |
|---|---|
| localStorage 키 | `bcr:identity`(아이덴티티), `bcr:settings`(D7 설정) |
| IndexedDB 이름 / 버전 | `bcr-history` / `1` |
| IndexedDB 스토어 | `identity`, `matches`, `games`, `syncQueue`, `meta` |
| 서버 DB | SQLite(`better-sqlite3`), 파일 `packages/server/data/bcr.sqlite` |
| 서버 테이블 | `players`, `matches`, `games`, `schema_meta` |
| REST 베이스 | `/api/v1` (`ws`와 동일 `node:http` 서버) |
| 인증 헤더 | `X-BCR-Player-Id`, `X-BCR-Player-Secret` |
| 이벤트 | `persist:matchSaved`, `persist:matchSynced`, `persist:syncFailed`, `persist:saveFailed`, `persist:historyLoaded`, `persist:identityReady`, `game:matchEnded` |
| 한도 | 동기화 배치 ≤ 50건 / 본문 ≤ 512KB, 히스토리 `limit` ≤ 50(기본 20), `moves_san` ≤ 4096B, 로컬 보존 1,000매치, 서버 보존 24개월 |

## 유닛 콘셉트 (제품 개요에서 고정, 변경 금지)
Pawn=Footsoldier, Knight=Mounted Knight, Bishop=Cleric, Rook=Brick Golem, Queen=Battle Queen, King=King. 진영 컬러: 백=warm ivory/gold, 흑=cold obsidian/silver.

## 스택 (고정, 01 프롬프트 §2 그대로)
TypeScript strict + Three.js r160+ WebGL2 + Vite + 이벤트버스/FSM(React 금지) + Web Audio API(HTMLAudioElement 금지) + Node+ws 서버 + Vitest/Playwright.

**R15로 추가된 유일한 예외:** 서버 전용 의존성 `better-sqlite3`(D10 §D10-4 근거)와 브라우저 내장 IndexedDB. 01 프롬프트 §2의 "`localStorage` 이외의 서버 없는 영속화 가정 금지"는 R15가 명시적으로 대체한다(D10 §D10-0). 클라이언트 번들에는 신규 의존성이 추가되지 않으므로 D9-1 초기 로드 예산(900KB gzip)에 영향이 없다.

## 추가 요구사항 R14 (사용자 확정, 01 프롬프트 이후 추가) — 중세 분위기 고정
- **전체 아트/오디오 톤은 중세(Medieval) 판타지로 고정한다.** D4의 "고급스러운 보드게임 디오라마" 룩은 이 중세 톤 위에서 구현하며, 근현대적/미래적 모티프(네온, 홀로그램 등)는 금지.
- **배경음악(BGM)은 반드시 중세풍이어야 한다.** D8 오디오 설계의 앰비언스/BGM 레이어는 중세 악기 팔레트(류트, 하프, 프렌치호른/내추럴호른, 타악기로는 프레임 드럼·타보르, 현으로는 비올) 기반의 절차적 합성 또는 해당 스타일 샘플로 작성한다. 테마 3종(Castle Hall/Frozen Keep/Volcanic Ruin) 각각의 BGM이 이 중세 팔레트 안에서 분위기만 달라져야 한다(장엄한 홀 / 음산한 겨울 성채 / 위협적인 화산 요새).
- D1 Executive Summary와 D4 아트 디렉션 서두에 이 고정 톤을 명시할 것.

## 추가 요구사항 R15 (사용자 확정) — 매치 결과 영속화(DB) + 플레이어 ID
- **모든 매치 결과(로컬 2인/CPU/온라인 공통)를 서버 DB에 저장**하고, 플레이어가 나중에도 자신의 전적(매치 히스토리, 승/패/무, Bo3 스코어, 상대, 일시)을 **불러올 수 있어야** 한다. 참여도(retention)를 높이는 것이 목적.
- **Player ID:** 가입 없는 저마찰(low-friction) 방식을 기본으로 한다 — 최초 실행 시 닉네임을 입력받고 클라이언트가 영구 식별자(UUID)를 발급해 `localStorage`에 저장, 서버에도 `players` 레코드로 등록한다. 동일 기기 재방문 시 자동 인식. (본격 계정/로그인 시스템 도입 여부는 ⚠️ DECISION NEEDED로 남기되, v1은 닉네임+UUID로 충분하다고 가정)
- CPU 대전/로컬 2인은 서버 연결 없이도 플레이 가능해야 하므로(R9), 이 경우의 기록은 **클라이언트 로컬 DB(IndexedDB) 우선 저장 후, 온라인 연결 시 서버로 동기화**하는 구조를 취한다. 서버 DB가 유일한 진실 소스가 아니라, 오프라인 우선 + 동기화 모델.
- 이 요구사항은 **새 문서 `D10. PERSISTENCE_DESIGN.md`** 로 다룬다 (DB 스키마, 서버 API, 클라이언트 IndexedDB 스키마, 동기화 규칙, 개인정보 최소화 원칙 포함). `D6 NETWORK_DESIGN.md`에는 이를 위한 메시지 타입이 추가되어야 하며, `D9` 로드맵에는 이를 위한 스프린트 갱신이 필요하다.
- D1 Executive Summary에도 이 요구사항(R15)을 반영할 것.

### R15 반영 완료 상태 (2026-08 갱신)
| 항목 | 상태 |
|---|---|
| `docs/design/PERSISTENCE_DESIGN.md` (D10) 작성 | ✅ 완료 |
| D6 메시지 추가 | ✅ `PLAYER_IDENTIFY` / `PLAYER_IDENTIFIED` 신설, `MATCH_END`에 `serverMatchId` 추가. **히스토리 조회는 WS가 아닌 HTTP REST로 결정**(D10 §D10-6 근거) → `MATCH_HISTORY_REQUEST/RESPONSE`는 신설하지 않음 |
| D1 반영 | ✅ Executive Summary, 레이어 다이어그램, 의존 규칙, 이벤트 버스, 문서 인덱스 |
| D9 반영 | ✅ Sprint 9에 통합(9a/9b 분할 권장) + DoD 10항목 + 리스크 3건 + 예산 3행 |
| D7 반영 | ✅ NicknamePrompt / History / MatchDetail 화면 + 설정 3항목 |
| 이 파일 반영 | ✅ §영속화 계약, 메시지 20종, 디렉토리, 스택 예외 |
| 미결(사용자 답변 필요) | ⚠️ D10 Open Decisions 3건 — 계정/기기 이전, 오프라인 결과 취급 등급, 서버 보존 기간 |
