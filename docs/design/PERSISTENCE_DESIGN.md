# D10. PERSISTENCE_DESIGN.md — 매치 기록 영속화 · 플레이어 아이덴티티

> 대상 요구사항: **R15**(`_CONTRACTS.md` §추가 요구사항 R15). 관련 문서: D1(레이어/이벤트), D6(권위 서버·`MATCH_END`), D7(설정/화면), D9(스프린트 9).

---

## D10-0. 스코프와 상위 제약 충돌 처리

**목표:** 모든 매치 결과(로컬 2인 / CPU / 온라인)를 영속화하고, 플레이어가 언제든 자신의 전적(매치 히스토리, 승/무/패, Bo3 스코어, 상대, 일시)을 불러올 수 있게 한다. 목적은 리텐션이다.

**상위 제약과의 충돌 — 명시적 해소:** 01 프롬프트 §2는 "`localStorage` 이외의 서버 없는 영속화 가정"을 금지한다. R15는 사용자가 프롬프트 이후에 확정한 요구사항이며 **이 금지 조항을 명시적으로 대체(supersede)** 한다. 본 문서는 다음 두 가지를 새로 도입한다:
1. 클라이언트 측 **IndexedDB**(`localStorage` 초과 영속화) — R15가 "오프라인 우선 + 동기화"를 직접 지시했으므로 불가피.
2. 서버 측 **파일 기반 임베디드 DB** — R15가 "서버 DB 저장"을 직접 지시했으므로 불가피.

`localStorage`는 폐기하지 않고 **아이덴티티(≤ 1KB)와 설정(D7 `bcr:settings`)에만** 계속 사용한다 — 동기 API라 부팅 첫 프레임에 값이 필요한 용도에 적합하고, IndexedDB는 비동기라 스플래시 이전에 닉네임을 표시할 수 없기 때문. **기각한 대안:** 아이덴티티까지 IndexedDB에 두기 — 부팅 경로에 `await`가 추가되어 D9의 TTI 예산(데스크톱 3.5s)에 불리하고, 아이덴티티 손상 시 복구가 어려움.

**비목표(v1 범위 외, 명시):** 레이팅/랭킹 산출(D6-10에서 v1 미도입 확정), 리플레이 재생 UI(데이터는 저장하되 재생 화면은 v2), 관전, 소셜 그래프(친구 목록), 클라우드 설정 동기화.

---

## D10-1. 플레이어 아이덴티티 모델

### 데이터

```ts
// packages/client/src/persistence/identity.ts
interface PlayerIdentity {
  playerId: string;        // UUID v4, 클라이언트가 crypto.randomUUID()로 생성. 서버 PK와 동일 값.
  nickname: string;        // 표시명. 2~16 코드포인트(§검증 규칙).
  secret: string;          // 32바이트 난수의 base64url(43자). 히스토리 API 인증용. 서버로 원문 1회만 전송.
  createdAt: number;       // epoch ms
  serverRegisteredAt: number | null;  // 서버 players 레코드 생성 확인 시각. null=아직 오프라인 전용.
  schemaVersion: 1;
}
```

- **저장 위치:** `localStorage['bcr:identity']`에 위 객체를 JSON 직렬화. 키 이름은 D7의 `bcr:settings`와 같은 `bcr:` 네임스페이스 규칙을 따른다.
- **생성 시점:** 최초 실행 시 스플래시 직후 1회. 닉네임 입력 모달(D7 `MainMenu` 진입 전, 640×280, "이름을 정하세요" + 입력 필드 + "시작") 확정 시 `crypto.randomUUID()`와 `crypto.getRandomValues(new Uint8Array(32))`로 `playerId`/`secret`을 발급한다.
- **닉네임 검증 규칙(클라·서버 동일):** 앞뒤 공백 트림 후 길이 2~16 코드포인트, 유니코드 카테고리 `Cc`/`Cf`(제어·포맷 문자) 금지, 연속 공백 1개로 축약. 위반 시 서버는 `400 INVALID_NICKNAME`. 미입력·검증 실패 시 클라이언트 기본값 `Player-XXXX`(X = `playerId` 앞 4자리 대문자 hex).
- **닉네임 변경:** 허용(D7 설정 화면에 "이름 변경" 항목 추가). `playerId`는 절대 바뀌지 않는다. 변경은 `PLAYER_IDENTIFY` 재전송 또는 `POST /api/v1/players/identify`로 서버에 반영되며, **과거 매치 기록의 표시명은 소급 변경되지 않는다**(`matches.opponent_label`에 당시 닉네임을 비정규화 저장 — §D10-4).
- **중복 닉네임:** 허용한다(유니크 제약 없음). 근거: 저마찰 원칙상 "이미 사용 중인 이름입니다"로 사용자를 막는 순간 가입 절차와 다를 바 없어짐. 구분은 항상 `playerId`로 한다.

### 서버 등록 흐름 (온라인 최초 접촉 시)

```
클라 WS 연결 → HELLO → PLAYER_IDENTIFY { playerId, nickname, secretHash? }
   서버: players UPSERT (id=playerId) → last_seen_at 갱신
   ← PLAYER_IDENTIFIED { playerId, nickname, isNew, serverTimeMs }
   클라: identity.serverRegisteredAt = Date.now() 저장
```

- 최초 1회는 **원문 `secret`** 을 함께 보내 서버가 `secret_hash = SHA-256(secret)`을 저장한다(§D10-6 인증). 이후 접속에서는 `secret`을 보내지 않는다(`PLAYER_IDENTIFY.secret`은 `serverRegisteredAt === null`일 때만 채운다).
- 전송 채널이 WSS(TLS)임을 전제한다. 평문 `ws://`에서는 서버가 `secret` 필드를 무시하고 `PLAYER_IDENTIFIED.secretAccepted=false`를 반환, 클라이언트는 히스토리 API를 비활성화한다(로컬 기록은 계속 동작).
- **오프라인만 플레이하는 사용자**는 `serverRegisteredAt`이 영원히 `null`이어도 게임 전 기능(R9)과 로컬 전적 조회가 완전히 동작한다. 서버 등록은 "서버 전적 백업"을 켜는 행위일 뿐 게임 플레이의 전제조건이 아니다.

### ✅ 확정 — 정식 계정 도입 및 기기 이전(device migration)

R15가 명시적으로 열어둔 항목이었으나 **사용자 확정 완료(2026-08-18): 옵션 A + 백업 코드 UI 포함.**

현재 모델은 **기기/브라우저 프로필 1개 = 신원 1개**이며, `localStorage`가 지워지면(브라우저 데이터 삭제, 시크릿 모드, 기기 교체) 신원과 로컬 전적이 복구 불가하다. 순수 익명 UUID를 유지하되(이메일/OAuth 계정 시스템은 R15의 "저마찰" 원칙과 충돌하므로 v1 범위에서 제외), **D7 설정 화면에 "전적 백업 코드 보기" 항목을 반드시 포함한다**: `playerId:secret`를 사용자가 텍스트로 복사·보관 → 새 기기에서 "코드로 복원" 입력 → `POST /api/v1/players/identify`로 검증 후 서버 히스토리 pull. 구현 비용은 D7에 화면 1개 추가 + 기존 identify API 재사용 수준.

---

## D10-2. 오프라인 우선(offline-first) 저장 흐름

**원칙: 모든 매치 결과는 예외 없이 먼저 IndexedDB에 쓰이고, 그 다음에 서버로 동기화된다.** 서버 DB는 "유일한 진실"이 아니라 **백업 + 기기 간 조회 지점**이다(R15 명문).

```
                         ┌──────────────────────────────┐
 game:matchEnded  ──────▶│ MatchRecorder (client)       │
 (로컬2P/CPU/온라인 공통)  │  1) IndexedDB matches/games 쓰기 (트랜잭션 1회)
                         │  2) persist:matchSaved 이벤트 발행 (UI 즉시 갱신)
                         │  3) source==='online' 이면 여기서 종료
                         │     (서버가 이미 권위적으로 기록함 — §D10-5)
                         │  4) 그 외에는 syncQueue 에 op 추가
                         └───────────────┬──────────────┘
                                         │ 온라인이고 아이덴티티 등록됨
                                         ▼
                             POST /api/v1/matches/sync (배치 ≤ 50)
                                         │
                                   200 OK: serverMatchId[] 반환
                                         ▼
                       IndexedDB matches.syncState = 'synced' 갱신
```

**동기화 트리거(전부 명시):** ① 앱 부팅 후 2초 시점(`navigator.onLine === true`일 때), ② `window` `online` 이벤트 수신 시, ③ `net:connected` 이벤트 수신 시, ④ 로컬/CPU 매치 저장 직후(온라인이면), ⑤ 온라인 상태 지속 중 **5분 주기** 타이머. 어느 경우든 진행 중인 대국이 있으면 `game:matchEnded` 이후로 연기한다(대국 중 네트워크·CPU 경합 회피).

**재시도 정책:** 지수 백오프 **5s → 15s → 60s → 300s(상한, 이후 고정)**, 최대 **8회**. 8회 초과 시 `syncState = 'deferred'`로 두고 다음 부팅 시 다시 시도한다(데이터는 절대 폐기하지 않는다). 5xx/네트워크 오류만 재시도 대상이며, 4xx(스키마 위반 등)는 즉시 `syncState = 'rejected'`로 확정하고 `console.warn` + `persist:syncFailed` 이벤트를 발행한다.

**멱등성:** 업로드 본문의 각 레코드는 `clientLocalMatchId`(로컬 UUID)를 포함하고, 서버는 `(submitted_by_player_id, client_local_match_id)` 유니크 인덱스로 중복 삽입을 무시한다(재시도로 인한 이중 기록 방지). 서버는 중복 시에도 `200`과 기존 `serverMatchId`를 돌려준다.

**충돌 규칙:** 매치 레코드는 **append-only(불변)** 다. 같은 `clientLocalMatchId`가 다른 내용으로 재업로드되어도 서버는 최초 레코드를 유지하고 갱신하지 않는다(`conflict: 'kept-existing'` 플래그를 응답에 포함). 근거: 결과는 확정 사실이므로 last-write-wins 병합이 필요 없고, 병합 로직을 없애면 오프라인 동기화에서 가장 흔한 버그군이 통째로 사라진다. **기각한 대안:** 버전 벡터/CRDT 기반 병합 — 단조 증가하는 불변 이벤트 로그에는 과잉 설계.

---

## D10-3. 클라이언트 IndexedDB 스키마 (확정)

**DB 이름:** `bcr-history` / **버전:** `1` / **모듈 경로:** `packages/client/src/persistence/`
(`IndexedDbStore.ts`, `MatchRecorder.ts`, `SyncEngine.ts`, `HistoryClient.ts`, `identity.ts`, `schema.ts`)

| 오브젝트 스토어 | keyPath | autoIncrement | 인덱스 (이름 → keyPath, 옵션) |
|---|---|---|---|
| `identity` | `'key'` | false | 없음 (단일 레코드, `key = 'self'`) |
| `matches` | `'localMatchId'` | false | `by_endedAt` → `endedAt`; `by_syncState` → `syncState`; `by_serverMatchId` → `serverMatchId` (`{ unique: true }`); `by_source` → `source` |
| `games` | `'localGameId'` | false | `by_localMatchId` → `localMatchId`; `by_endedAt` → `endedAt`; `by_match_index` → `['localMatchId','gameIndex']` (`{ unique: true }`) |
| `syncQueue` | `'opId'` | false | `by_nextAttemptAt` → `nextAttemptAt`; `by_state` → `state` |
| `meta` | `'key'` | false | 없음 |

> `by_serverMatchId`는 `serverMatchId`가 `undefined`인 레코드를 색인하지 않는다(IndexedDB 표준 동작) — 미동기 레코드가 유니크 제약에 걸리지 않도록 **`null`이 아니라 필드를 생략**해야 한다. 구현 시 주의점.

### 레코드 타입

```ts
// packages/client/src/persistence/schema.ts
type MatchSource   = 'local2p' | 'cpu' | 'online';
type MatchFormat   = 'bo1' | 'bo3';
type MatchOutcome  = 'win' | 'loss' | 'draw' | 'aborted';   // '나' 기준
type SyncState     = 'local' | 'pending' | 'synced' | 'rejected' | 'deferred';
type GameEndReason = 'checkmate' | 'stalemate' | 'resign' | 'timeout' | 'draw50'
                   | 'repetition' | 'insufficientMaterial' | 'agreement' | 'abandon';

interface LocalMatchRecord {
  localMatchId: string;          // UUID v4 (클라 생성, 멱등 키)
  serverMatchId?: string;        // 동기화/서버기록 후에만 존재 (없으면 필드 자체를 생략)
  source: MatchSource;
  format: MatchFormat;
  myPlayerId: string;            // = PlayerIdentity.playerId
  myColorGame1: 'w' | 'b';
  opponentKind: 'human-local' | 'human-online' | 'cpu';
  opponentLabel: string;         // 표시명 스냅샷. cpu면 'CPU (Master)' 등. ≤ 32자.
  opponentPlayerId?: string;     // 온라인일 때만
  cpuDifficulty?: 'beginner' | 'intermediate' | 'advanced' | 'master';
  timeControl: 'blitz' | 'rapid' | 'unlimited';
  scoreMine: number;             // 0 / 0.5 / 1 / 1.5 / 2 (Bo3 누적)
  scoreOpponent: number;
  outcome: MatchOutcome;
  gameCount: number;             // 실제로 진행된 판 수 (1~3)
  startedAt: number;             // epoch ms
  endedAt: number;               // epoch ms
  syncState: SyncState;
  syncAttempts: number;
  appVersion: string;            // 예: '0.9.3' — 스키마 변화 추적용
  schemaVersion: 1;
}

interface LocalGameRecord {
  localGameId: string;           // UUID v4
  localMatchId: string;          // FK → LocalMatchRecord
  gameIndex: number;             // 0-based (0,1,2)
  myColor: 'w' | 'b';
  result: 'white' | 'black' | 'draw';
  reason: GameEndReason;
  plyCount: number;
  movesSan: string;              // 공백 구분 SAN 전체. 4096바이트 상한(§D10-4 근거).
  movesTruncated: boolean;       // 상한 초과로 잘렸으면 true
  finalFen: string;              // ≤ 92자
  startedAt: number;
  endedAt: number;
}

interface SyncOp {
  opId: string;                  // UUID v4
  kind: 'uploadMatch';
  localMatchId: string;
  state: 'queued' | 'inflight' | 'done' | 'failed';
  attempts: number;
  nextAttemptAt: number;         // epoch ms
  lastError?: string;            // ≤ 200자
}

interface MetaRecord {           // key: 'lastPullAt' | 'lastPruneAt' | 'schemaVersion'
  key: string;
  value: number | string;
}
```

### 용량 · 정리 규칙

- 레코드 실측 추정: `LocalMatchRecord` ≈ **380 B**, `LocalGameRecord` ≈ **200 B + movesSan(평균 80 ply × 5.2 B ≈ 420 B) ≈ 620 B**. Bo3 평균 2.2판 기준 매치당 ≈ **380 + 2.2×620 ≈ 1.75 KB**.
- **로컬 보존 상한: 최근 1,000매치** (≈ 1.75 MB — Chrome/Safari의 오리진 쿼터 대비 무시 가능). 초과 시 부팅 후 3초 시점에 `by_endedAt` 오름차순 커서로 초과분을 `matches`+`games` 동시 삭제. 단 **`syncState !== 'synced'`인 레코드는 절대 삭제하지 않는다**(서버로 못 올린 기록 유실 방지) — 미동기 레코드가 1,000건을 넘으면 정리를 건너뛰고 `console.warn`.
- 마이그레이션: `onupgradeneeded`에서 `oldVersion` 분기. v1이 최초이므로 전체 스토어를 생성만 한다. **정책:** 향후 파괴적 변경 시에도 기존 스토어를 drop하지 않고 새 버전에서 필드를 추가·백필한다(전적 유실은 리텐션 목적과 정면 배치).
- 브라우저 저장소 삭제(사생활 보호 모드 등)로 IndexedDB가 사라져도, 서버 등록을 마친 사용자는 `GET /api/v1/players/:id/matches`로 전적을 다시 pull할 수 있다(§D10-6 `pullHistory`).
- **쿼터 초과(`QuotaExceededError`) 처리:** 저장 실패 시 게임 플로우를 절대 중단하지 않는다 — `persist:saveFailed` 이벤트 + 토스트 "전적 저장에 실패했습니다"만 표시하고 대국은 정상 종료 처리한다.

---

## D10-4. 서버 DB — 선택과 스키마

### 선택: SQLite (better-sqlite3) — 확정 권고, `⚠️ DECISION NEEDED` 아님

**채택:** `better-sqlite3` (동기 API, 임베디드 파일 DB). 파일 경로 `packages/server/data/bcr.sqlite`. 모듈 경로 `packages/server/src/db/`(`connection.ts`, `migrations/001_init.sql`, `PlayerRepository.ts`, `MatchRepository.ts`, `HistoryQueries.ts`).

**근거(수치 포함):**
- 스택(01 §2)은 **상시 구동 Node 프로세스 1개 + 정적 클라이언트 CDN** 배포를 확정했다. 즉 DB 인스턴스는 애초에 단일 프로세스에서만 접근한다 → 네트워크 DB의 이점(다중 클라이언트 동시 접속)이 발생하지 않는다.
- 별도 서비스·포트·크리덴셜·백업 파이프라인이 필요 없다. 백업 = 파일 1개 복사(또는 `VACUUM INTO`).
- 쓰기 부하가 극히 낮다: 매치 종료마다 **트랜잭션 1회 / 로우 1+3개**. 동시 100매치가 동시에 끝나도 100 tx/s이며, better-sqlite3의 동기 삽입은 WAL 모드에서 통상 **수만 tx/s** 급이다. 읽기는 히스토리 페이지 조회(20행)뿐.
- 동기 API라 `MATCH_END` 직전의 "쓰기 완료 확인"이 콜백/await 없이 보장된다(§D10-5의 write-then-notify 순서를 단순하게 만든다).

**기각한 대안 — PostgreSQL:** 수평 확장·동시 쓰기·복제가 필요할 때 정답이지만, v1은 서버 인스턴스 1개이므로 그 이점이 전혀 발현되지 않는 반면 운영 비용(별도 컨테이너/관리형 인스턴스, 연결 풀, 마이그레이션 도구, 시크릿 관리)이 즉시 발생한다. **기각한 대안 — JSON 파일 append:** 트랜잭션·인덱스가 없어 히스토리 페이지네이션이 전체 파일 스캔이 되고, 동시 쓰기 시 파손 위험.

**마이그레이션 트리거(수치로 고정):** 아래 중 하나라도 참이 되면 Postgres 전환을 착수한다 — ① 서버 인스턴스를 2개 이상 운영해야 함, ② 일평균 신규 매치 > 50,000, ③ `bcr.sqlite` 파일 > 20 GB, ④ 히스토리 조회 p95 > 300ms. 전환 비용을 낮추기 위해 **모든 SQL은 `packages/server/src/db/` 안에만 존재**하며 상위 코드(`match.ts`, REST 핸들러)는 `MatchRepository`/`HistoryQueries` 인터페이스만 호출한다(§D10-9 타입).

**연결 PRAGMA(고정):** `journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`, `busy_timeout = 5000`.

### 스키마 (SQLite DDL, `migrations/001_init.sql`)

```sql
CREATE TABLE players (
  id             TEXT    PRIMARY KEY,             -- UUID v4 (클라 생성)
  nickname       TEXT    NOT NULL,                -- 2~16 코드포인트
  secret_hash    TEXT,                            -- SHA-256(secret) 소문자 hex 64자. NULL=미설정(읽기 API 사용 불가)
  created_at     INTEGER NOT NULL,                -- epoch ms
  last_seen_at   INTEGER NOT NULL,
  client_version TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE matches (
  id                    TEXT    PRIMARY KEY,      -- UUID v4 (서버 생성)
  source                TEXT    NOT NULL CHECK (source IN ('local2p','cpu','online')),
  format                TEXT    NOT NULL CHECK (format IN ('bo1','bo3')),
  player_white_id       TEXT    REFERENCES players(id) ON DELETE CASCADE,  -- 게임1 기준 백. 비등록 상대는 NULL
  player_black_id       TEXT    REFERENCES players(id) ON DELETE CASCADE,
  white_label           TEXT    NOT NULL,         -- 당시 표시명 스냅샷 (≤32자, 비정규화 — 닉 변경에 소급 영향 없음)
  black_label           TEXT    NOT NULL,
  cpu_difficulty        TEXT    CHECK (cpu_difficulty IN ('beginner','intermediate','advanced','master')),
  time_control          TEXT    NOT NULL CHECK (time_control IN ('blitz','rapid','unlimited')),
  score_white           REAL    NOT NULL,         -- 0 / 0.5 / 1 / 1.5 / 2
  score_black           REAL    NOT NULL,
  result                TEXT    NOT NULL CHECK (result IN ('white','black','draw','aborted')),
  game_count            INTEGER NOT NULL,         -- 1~3
  started_at            INTEGER NOT NULL,
  ended_at              INTEGER NOT NULL,
  verified              INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),  -- 1=서버 권위 기록(online)
  submitted_by_player_id TEXT   REFERENCES players(id) ON DELETE CASCADE,      -- 동기화 업로더. online이면 NULL
  client_local_match_id  TEXT,                    -- 업로드 멱등 키
  created_at            INTEGER NOT NULL
);

CREATE TABLE games (
  id          TEXT    PRIMARY KEY,                -- UUID v4 (서버 생성)
  match_id    TEXT    NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  game_index  INTEGER NOT NULL,                   -- 0-based
  white_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  black_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  result      TEXT    NOT NULL CHECK (result IN ('white','black','draw')),
  reason      TEXT    NOT NULL,                   -- D6 GAME_END.reason 과 동일 어휘
  ply_count   INTEGER NOT NULL,
  moves_san   TEXT,                               -- 공백 구분 SAN 전체. NULL 허용. 4096바이트 상한.
  moves_truncated INTEGER NOT NULL DEFAULT 0 CHECK (moves_truncated IN (0,1)),
  final_fen   TEXT    NOT NULL,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER NOT NULL
);

CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);  -- ('version','1')

-- 인덱스
CREATE UNIQUE INDEX ux_matches_idempotency
  ON matches(submitted_by_player_id, client_local_match_id)
  WHERE client_local_match_id IS NOT NULL;                  -- 부분 유니크 인덱스: 재시도 중복 삽입 차단
CREATE INDEX idx_matches_white_ended ON matches(player_white_id, ended_at DESC);
CREATE INDEX idx_matches_black_ended ON matches(player_black_id, ended_at DESC);
CREATE INDEX idx_matches_ended       ON matches(ended_at DESC);            -- 보존기간 배치 삭제용
CREATE UNIQUE INDEX ux_games_match_index ON games(match_id, game_index);
CREATE INDEX idx_games_match         ON games(match_id);
```

> **히스토리 조회가 두 인덱스를 타는 이유:** "내 매치"는 `player_white_id = ?` 또는 `player_black_id = ?`이므로 단일 인덱스로 커버되지 않는다. `HistoryQueries.listMatches()`는 두 인덱스를 각각 태운 `SELECT ... UNION ALL ... ORDER BY ended_at DESC LIMIT ?`로 구현한다. **기각한 대안:** `match_participants` 조인 테이블 — 로우 수가 2배가 되고 매치당 조인이 추가되는데, 참가자가 항상 정확히 2명(그중 최대 1명이 비등록)인 고정 구조라 이득이 없음.

### 결정: 개별 수(move)를 저장하는가 → **저장한다. 단 게임당 1개 TEXT 컬럼(`games.moves_san`)으로, 수 단위 테이블은 두지 않는다.**

**근거(저장 증가량 산정):**
| 방식 | 로우/게임 | 게임당 바이트 | 일 1,000매치(≈2,200게임) | 1년 |
|---|---|---|---|---|
| **채택: `moves_san` TEXT 1컬럼** | 0 (games 로우에 포함) | ≈ 420 B(80 ply × 5.2 B) | ≈ 1.7 MB/일 | ≈ **0.62 GB** |
| 기각: `moves(match_id, game_index, ply, san, fen_after)` 테이블 | 80 | ≈ 80 × (48 B 로우 + 40 B 인덱스) ≈ 7 KB | ≈ 15.5 MB/일 | ≈ **5.6 GB** |

수는 **항상 게임 단위로 통째로 읽히고**(리플레이·기보 뷰), 개별 ply를 조건 검색할 유스케이스가 v1에 없다. 따라서 정규화의 이득은 0이고 비용은 **9배**다. 대신 `ply_count`를 별도 컬럼으로 비정규화해 목록 화면이 `moves_san`을 읽지 않고도 게임 길이를 표시하게 한다(§D10-6의 목록 API는 `moves_san`을 반환하지 않음 — 페이로드 20배 절감).
**상한:** `moves_san` 4,096바이트(≈ 700 ply, 정상 대국의 상한을 크게 넘음). 초과 시 앞에서부터 4,096바이트로 자르고 `moves_truncated = 1`. 근거: 무한 반복 대국·조작된 업로드로 인한 저장소 팽창 차단.

---

## D10-5. 온라인 매치의 서버 측 기록 시점 (위조 불가 보장)

**규칙: 온라인 매치 기록은 오직 서버가, `MATCH_END` 전송 *직전에* 쓴다. 클라이언트가 보낸 온라인 결과는 어떤 경로로도 받아들이지 않는다.**

D6 §D6-3의 `GameEnd → MatchEnd` 전이 지점에 다음 순서를 삽입한다(`packages/server/src/match.ts`):

```
onMatchDecided(matchState):                       # D6-4 승리조건 충족 시 1회만 호출
  1. finalScore = matchState.matchScore           # 서버가 누적한 값 (클라 입력 아님)
  2. serverMatchId = MatchRepository.finalizeMatch({   # better-sqlite3 동기 트랜잭션 1회
       matchState, verified: 1, source: 'online',
       submittedByPlayerId: null, clientLocalMatchId: null
     })                                            # INSERT matches 1행 + INSERT games N행
  3. (커밋 완료 후에만)
     broadcast MATCH_END { ..., serverMatchId }
  4. 클라이언트: MATCH_END 수신 → IndexedDB에 syncState='synced', serverMatchId 를 채워 로컬 기록 생성
                (온라인 매치는 syncQueue 에 넣지 않는다 — 이미 서버 권위 기록이 존재)
```

- **순서가 write-then-notify인 이유:** 반대(notify-then-write)로 하면 전송 직후 프로세스가 죽었을 때 플레이어는 "결과가 저장됐다"고 믿는데 DB에는 없다. 현재 순서에서 최악의 경우는 "DB에는 있는데 클라이언트가 결과 화면을 못 봄"이며, 재접속 시 히스토리 조회로 즉시 복구된다.
- **DB 쓰기 실패 시:** 트랜잭션 롤백 후 `MATCH_END`는 **정상 전송**하되 `serverMatchId: null`로 보낸다(대국 결과 통보가 DB 사정으로 막히면 안 됨). 클라이언트는 `serverMatchId === null`이면 그 매치를 `syncQueue`에 넣어 일반 업로드 경로로 재시도한다. 서버는 `console.error` + `persist_write_failures` 카운터 증가.
- **위조 차단(3중):**
  1. `POST /api/v1/matches/sync`는 본문의 `source === 'online'`인 레코드를 **항상 거부**한다(`409 ONLINE_RESULT_SERVER_ONLY`). 온라인 결과는 오직 §D10-5 경로로만 생성된다.
  2. `verified` 컬럼: 서버 권위 기록만 `1`. 동기화로 올라온 로컬/CPU 결과는 `0`. UI(D7 전적 화면)는 `verified=0` 항목에 "로컬 기록" 배지를 표시한다.
  3. `matches.score_*`/`result`는 서버의 `matchState`에서만 채워지며, `MOVE_ACCEPTED`/`GAME_END`와 동일하게 D6-8 "클라이언트 신뢰 금지 항목"에 포함된다(D6-8 목록에 본 항목 추가 완료).
- Bo3 도중 이탈(`abandon`)로 매치가 조기 종료되면(D6-7) `result = 'aborted'`가 아니라 **몰수승 결과**(`'white'`/`'black'`)로 기록하고, 해당 게임의 `games.reason = 'abandon'`으로 남긴다. `'aborted'`는 **1국도 완료되지 않은 채 매치가 파기된 경우**에만 쓴다(이 경우 `games` 로우 0개).

### ✅ 확정 — 오프라인(로컬 2P/CPU) 결과의 취급 등급

**사용자 확정 완료(2026-08-18): 옵션 A.** `verified = 0` 기록도 전부 저장·표시하되 "로컬 기록" 배지를 달고, 통계(승률)는 **검증(온라인)/로컬을 분리 집계**해 두 줄로 보여준다. 근거: R15의 "모든 매치 결과를 저장"이라는 지시와 참여도(리텐션) 목적에는 전부 저장·노출이 맞지만, `verified=0`은 원리적으로 사용자가 조작 가능한 값이므로(IndexedDB 직접 편집 후 동기화) 검증된 온라인 전적과 뒤섞으면 안 된다.

---

## D10-6. 히스토리 조회 API — WebSocket이 아닌 HTTP REST로 결정

**결정: 히스토리 조회와 동기화 업로드는 별도 HTTP REST 엔드포인트로 제공한다. WebSocket 프로토콜(D6)에는 `PLAYER_IDENTIFY`/`PLAYER_IDENTIFIED`만 추가한다.**

**근거:**
1. **접근 패턴이 반대다.** D6 게임플레이 프로토콜은 서버 주도 push + 저지연 소량 메시지(수·시계)다. 히스토리는 **사용자가 화면을 열 때만 발생하는 on-demand pull**이며 페이로드가 크고(20건 목록 ≈ 6 KB, 상세 ≈ 3 KB) 지연 요구가 느슨하다(p95 300ms).
2. **연결 수명이 다르다.** 전적은 **대국 중이 아닐 때, 즉 WS 세션이 없을 때** 보는 경우가 대부분이다(메인 메뉴 → 전적). REST면 매치 서버에 WS를 새로 붙일 필요가 없다.
3. **표준 기능을 공짜로 얻는다.** HTTP 상태코드, `ETag`/`Cache-Control`, 페이지네이션, CDN/프록시 캐시, `curl` 디버깅, 재시도 시 멱등 처리가 전부 기성품이다. WS로 하면 요청-응답 상관 id, 타임아웃, 재시도, 순서 보장을 프로토콜 위에 직접 구현해야 한다(사실상 HTTP 재발명).
4. **인프라 추가 비용 0.** `ws`는 이미 `node:http` 서버 인스턴스에 attach된다. 같은 서버에 라우트를 얹으므로 **새 프로세스·새 포트·새 배포 단위가 생기지 않는다**(핸드오프 가이드 §2-3의 "상시 구동 Node 필요" 제약과 정합).

**기각한 대안:** ① 전부 WS 메시지(`MATCH_HISTORY_REQUEST/RESPONSE`)로 처리 — 위 4가지를 전부 직접 구현해야 하고, 대국 중이 아닌 사용자가 히스토리를 보려고 게임 소켓을 열어야 해서 서버 소켓 수가 불필요하게 늘어남. ② 전부 REST(식별까지 REST) — 매치 기록을 쓰려면 서버가 **WS 세션과 `playerId`의 연결**을 알아야 하는데, 그 바인딩은 소켓 위에서 일어나야 하므로 `PLAYER_IDENTIFY`만은 WS여야 한다.

### 엔드포인트 (`packages/server/src/http/historyApi.ts`, 베이스 `/api/v1`)

인증: 모든 엔드포인트가 헤더 `X-BCR-Player-Id`(UUID) + `X-BCR-Player-Secret`(base64url 43자)를 요구한다. 서버는 `SHA-256(secret)`을 `players.secret_hash`와 `crypto.timingSafeEqual`로 비교. 불일치 `401 UNAUTHORIZED`. **다른 `playerId`의 히스토리는 조회할 수 없다**(경로의 id와 헤더의 id가 다르면 `403 FORBIDDEN`).

| 메서드 · 경로 | 요청 | 응답 200 | 오류 |
|---|---|---|---|
| `POST /api/v1/players/identify` | `{ playerId, nickname, secret? }` | `{ playerId, nickname, isNew: boolean, secretAccepted: boolean }` | `400 INVALID_NICKNAME`, `401` (기존 secret 불일치) |
| `POST /api/v1/matches/sync` | `{ matches: SyncMatchDto[] }` (≤ **50**건, 본문 ≤ **512 KB**) | `{ results: { clientLocalMatchId, serverMatchId, conflict: 'inserted'\|'kept-existing' }[] }` | `409 ONLINE_RESULT_SERVER_ONLY`, `413 PAYLOAD_TOO_LARGE`, `422 SCHEMA_INVALID` |
| `GET /api/v1/players/:id/matches?limit=20&before=<epochMs>` | — | `MatchHistoryPage` (`limit` 기본 20, 최대 **50**) | `403`, `404 PLAYER_NOT_FOUND` |
| `GET /api/v1/matches/:matchId` | — | `MatchDetailDto` (games + `movesSan` 포함) | `403`(참가자 아님), `404` |
| `GET /api/v1/players/:id/stats` | — | `PlayerStatsDto` | `403`, `404` |
| `DELETE /api/v1/players/:id` | — | `204 No Content` (players 1행 + CASCADE로 matches/games 전삭제) | `403` |

```ts
// packages/protocol/src/history.ts — 클라·서버 공유 DTO (three 금지, chess-core 타입만 참조)
interface MatchSummaryDto {
  matchId: string; source: MatchSource; format: MatchFormat; verified: boolean;
  opponentLabel: string; myColorGame1: 'w' | 'b';
  scoreMine: number; scoreOpponent: number; outcome: MatchOutcome;
  gameCount: number; startedAt: number; endedAt: number; timeControl: string;
}
interface MatchHistoryPage {
  matches: MatchSummaryDto[];
  nextBefore: number | null;   // 커서 페이지네이션(오프셋 아님 — 새 매치 삽입 시 페이지 밀림 방지)
  totalCount: number;
}
interface GameRecordDto {
  gameIndex: number; myColor: 'w' | 'b'; result: 'white' | 'black' | 'draw';
  reason: GameEndReason; plyCount: number; movesSan: string | null;
  movesTruncated: boolean; finalFen: string; startedAt: number; endedAt: number;
}
interface MatchDetailDto extends MatchSummaryDto { games: GameRecordDto[]; }
interface PlayerStatsDto {
  playerId: string; nickname: string;
  verified:  { matches: number; wins: number; draws: number; losses: number };
  local:     { matches: number; wins: number; draws: number; losses: number };
  bySource:  Record<MatchSource, number>;
  firstPlayedAt: number | null; lastPlayedAt: number | null;
}
```

**레이트 리밋(D6-8과 같은 토큰버킷 구현 재사용):** IP당 `GET` 60 req/min, `POST /matches/sync` 6 req/min, `POST /players/identify` 10 req/min, `DELETE` 3 req/min. 초과 시 `429` + `Retry-After` 헤더.
**CORS:** `Access-Control-Allow-Origin`은 배포된 클라이언트 오리진 1개만 허용하는 화이트리스트(와일드카드 `*` 금지 — 인증 헤더를 쓰므로).
**성능 목표:** 목록 조회 서버 처리 p95 < **30ms**(SQLite 로컬 파일 + 인덱스), 엔드투엔드 p95 < **300ms**.

---

## D10-7. D6 프로토콜 변경 요약 (상세는 D6 §D6-2 표에 반영 완료)

| 메시지 | 방향 | 용도 |
|---|---|---|
| `PLAYER_IDENTIFY` | C→S | WS 세션에 `playerId`/`nickname` 바인딩, `players` UPSERT |
| `PLAYER_IDENTIFIED` | S→C | 등록 결과 확인(`isNew`, `secretAccepted`) |
| `MATCH_END` (필드 추가) | S→C | `serverMatchId: string \| null` 추가 — 클라가 로컬 기록을 `synced`로 표시하기 위함 |

히스토리 조회용 WS 메시지(`MATCH_HISTORY_REQUEST/RESPONSE`)는 **신설하지 않는다**(§D10-6 근거). `_CONTRACTS.md`의 메시지 타입 목록도 동일하게 갱신했다.

---

## D10-8. 개인정보 최소화 · 보존

**수집하지 않는 것(명시적 목록):** 실명, 이메일, 전화번호, 생년월일, 성별, 주소, 결제정보, 소셜 계정 식별자, 기기 광고 ID, 위치정보, 연락처. **가입 절차와 비밀번호가 존재하지 않는다.**

**수집·저장하는 것 전부:**
| 항목 | 위치 | 목적 | 비고 |
|---|---|---|---|
| `playerId`(랜덤 UUID) | localStorage + 서버 `players.id` | 전적 귀속 | 어떤 실제 신원과도 연결되지 않음 |
| `nickname` | 동일 | 표시 | 사용자가 자유 입력, 검증·중복확인 없음 |
| `secret_hash` | 서버만 | 본인 확인 | 원문은 서버에 저장하지 않음(SHA-256만) |
| 매치 결과·기보(SAN)·시각 | IndexedDB + 서버 | 전적 조회 | 대국 내용 외 정보 없음 |
| `client_version` | 서버 | 스키마 호환성 진단 | UA 문자열은 저장하지 않음 |

- **IP 주소:** 레이트 리밋 버킷에 **메모리 상주 10분 TTL**로만 존재하고 **디스크에 기록하지 않는다**. 액세스 로그를 남길 경우 IP 마지막 옥텟을 `0`으로 마스킹한다.
- **채팅(`CHAT`)·이모트(`EMOTE`)는 저장하지 않는다.** 메모리에서 중계만 하고 매치 종료 시 폐기 — 저장 시 신고·모더레이션·삭제 요청 대응 의무가 발생하므로 v1 범위에서 명시적으로 배제.
- **보존:** 서버는 `ended_at`이 **24개월** 이전인 `matches`를 일 1회(서버 시각 04:00) 배치 삭제한다(`idx_matches_ended` 사용, `games`는 CASCADE). `players`는 `last_seen_at`이 24개월 이전이고 남은 매치가 0건이면 함께 삭제.
- **삭제권:** D7 설정 화면에 "내 전적 삭제" 항목 추가 — ① 로컬만 삭제(IndexedDB `matches`/`games` clear), ② 서버까지 삭제(`DELETE /api/v1/players/:id` 호출 후 로컬 clear + 아이덴티티 재발급) 2단계 확인 모달. 서버 삭제는 하드 삭제(soft delete 플래그 아님)다.
- **암호화:** 저장되는 값 중 민감 정보가 없으므로 DB 파일 암호화(SQLCipher 등)는 도입하지 않는다. 전송 구간은 HTTPS/WSS를 전제한다.

### ✅ 확정 — 서버 보존 기간

**사용자 확정 완료(2026-08-18): 옵션 A, 24개월 후 자동 삭제.** 저장 상한이 예측 가능해지고(§D10-4 산정 기준 최대 ≈ 1.3 GB) 데이터 최소화 원칙에 부합한다.

---

## D10-9. 타입 계약 (D1·`_CONTRACTS.md`와 동기화된 최종 이름)

```ts
// packages/client/src/persistence/IndexedDbStore.ts
interface PersistenceStore {
  open(): Promise<void>;                                   // onupgradeneeded 처리 포함
  putMatch(m: LocalMatchRecord, games: LocalGameRecord[]): Promise<void>;  // 단일 트랜잭션
  listMatches(opts: { limit: number; before?: number }): Promise<LocalMatchRecord[]>;
  getMatchDetail(localMatchId: string): Promise<{ match: LocalMatchRecord; games: LocalGameRecord[] } | null>;
  markSynced(localMatchId: string, serverMatchId: string): Promise<void>;
  pendingSyncOps(nowMs: number, limit: number): Promise<SyncOp[]>;
  prune(maxMatches: number): Promise<number>;              // 삭제된 매치 수 반환
  clearAll(): Promise<void>;
}

// packages/client/src/persistence/MatchRecorder.ts
interface MatchRecorder { record(input: MatchRecordInput): Promise<LocalMatchRecord>; }  // game:matchEnded 구독

// packages/client/src/persistence/SyncEngine.ts
interface SyncEngine { start(): void; stop(): void; syncNow(): Promise<{ uploaded: number; failed: number }>; }

// packages/client/src/persistence/HistoryClient.ts  (REST 호출부)
interface HistoryClient {
  identify(id: PlayerIdentity): Promise<{ isNew: boolean; secretAccepted: boolean }>;
  uploadMatches(batch: SyncMatchDto[]): Promise<SyncUploadResult[]>;
  fetchHistory(playerId: string, opts: { limit: number; before?: number }): Promise<MatchHistoryPage>;
  fetchMatch(matchId: string): Promise<MatchDetailDto>;
  fetchStats(playerId: string): Promise<PlayerStatsDto>;
  deleteAccount(playerId: string): Promise<void>;
}

// packages/server/src/db/MatchRepository.ts
interface MatchRepository {
  finalizeMatch(input: FinalizeMatchInput): string;         // 동기(better-sqlite3), serverMatchId 반환
  insertSyncedMatch(input: SyncedMatchInput): { serverMatchId: string; conflict: 'inserted' | 'kept-existing' };
}
// packages/server/src/db/HistoryQueries.ts
interface HistoryQueries {
  listMatches(playerId: string, limit: number, before?: number): MatchHistoryPage;
  getMatchDetail(matchId: string, requesterId: string): MatchDetailDto | null;
  getStats(playerId: string): PlayerStatsDto | null;
}
// packages/server/src/db/PlayerRepository.ts
interface PlayerRepository {
  upsert(input: { id: string; nickname: string; secret?: string; clientVersion?: string }):
    { isNew: boolean; secretAccepted: boolean };
  verifySecret(playerId: string, secret: string): boolean;  // timingSafeEqual
  deleteCascade(playerId: string): void;
}
```

**이벤트 버스 추가분(D1 §이벤트 버스에 반영 완료):** `persist:matchSaved`, `persist:matchSynced`, `persist:syncFailed`, `persist:saveFailed`, `persist:historyLoaded`.

---

## D10-10. 검증 (Sprint 9 DoD에 반영)

1. **왕복 통합 테스트**(Vitest, `packages/server/src/db/__tests__/roundtrip.test.ts` + `packages/client/src/persistence/__tests__/sync.test.ts`, IndexedDB는 `fake-indexeddb`로 대체): CPU 매치 1건을 IndexedDB에 기록 → `SyncEngine.syncNow()` → SQLite `matches`/`games` 삽입 확인 → `GET /players/:id/matches`가 동일 값 반환 → 로컬 DB를 비우고 pull하면 원본과 필드 단위로 일치(`endedAt`, `scoreMine`, `movesSan` 포함).
2. **멱등성 테스트:** 같은 배치를 3회 업로드해도 `SELECT COUNT(*) FROM matches` 증가분이 정확히 1.
3. **위조 차단 테스트:** `source:'online'` 레코드 업로드 시 `409`, 타인 `playerId` 조회 시 `403`, 잘못된 secret으로 `401`.
4. **오프라인 테스트:** 서버를 내린 상태에서 CPU 매치 3건 완주 → 전부 IndexedDB에 `syncState:'local'`로 존재하고 전적 화면에 표시됨 → 서버 기동 후 60초 이내 전부 `synced`.
5. **권위 기록 테스트:** 온라인 Bo3 완주 시 `MATCH_END` 수신 **이전에** 서버 DB에 로우가 존재함을 서버 측 훅으로 확인(write-then-notify 순서 검증).

---

## ⚠️ Open Decisions (D10) — 요약

| # | 항목 | 옵션 A (추천) | 옵션 B | 비고 |
|---|---|---|---|---|
| 1 | 정식 계정 / 기기 이전 (§D10-1) | 익명 UUID 유지 + 백업 코드 UI를 v1에 포함 | 이메일/OAuth 계정 연동 | R15가 명시적으로 열어둔 항목 |
| 2 | 오프라인 결과 취급 (§D10-5) | 저장·표시하되 `verified=0` 배지 + 통계 분리 집계 | 로컬 전용(서버 미업로드) | 조작 가능성 vs 리텐션 |
| 3 | 서버 보존 기간 (§D10-8) | 24개월 자동 삭제 | 무기한 | 저장 상한 예측성 vs 서사 |

**결정 필요 없음(근거가 명확해 확정한 항목):** 서버 DB = SQLite(better-sqlite3), 히스토리 = HTTP REST, 수는 `games.moves_san` TEXT 1컬럼, 온라인 결과는 서버 단독 기록, 매치 레코드는 append-only.
