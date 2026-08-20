/**
 * D10-4 §서버 DB 스키마. 설계서는 별도 `migrations/001_init.sql` 파일을 명시하지만, `tsc`로 빌드된
 * dist에는 비-TS 파일이 자동 복사되지 않아 런타임 파일 경로 문제가 생긴다(`docs/DEVIATIONS.md` 참조).
 * 동일한 DDL을 TS 문자열 상수로 대체해 dev(tsx)/build(tsc) 양쪽에서 동일하게 동작하도록 했다.
 */
export const MIGRATION_001_INIT = `
CREATE TABLE IF NOT EXISTS players (
  id             TEXT    PRIMARY KEY,
  nickname       TEXT    NOT NULL,
  secret_hash    TEXT,
  created_at     INTEGER NOT NULL,
  last_seen_at   INTEGER NOT NULL,
  client_version TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS matches (
  id                     TEXT    PRIMARY KEY,
  source                 TEXT    NOT NULL CHECK (source IN ('local2p','cpu','online')),
  format                 TEXT    NOT NULL CHECK (format IN ('bo1','bo3')),
  player_white_id        TEXT    REFERENCES players(id) ON DELETE CASCADE,
  player_black_id        TEXT    REFERENCES players(id) ON DELETE CASCADE,
  white_label            TEXT    NOT NULL,
  black_label            TEXT    NOT NULL,
  cpu_difficulty         TEXT    CHECK (cpu_difficulty IN ('beginner','intermediate','advanced','master')),
  time_control           TEXT    NOT NULL CHECK (time_control IN ('blitz','rapid','unlimited')),
  score_white            REAL    NOT NULL,
  score_black            REAL    NOT NULL,
  result                 TEXT    NOT NULL CHECK (result IN ('white','black','draw','aborted')),
  game_count             INTEGER NOT NULL,
  started_at             INTEGER NOT NULL,
  ended_at               INTEGER NOT NULL,
  verified               INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  submitted_by_player_id TEXT    REFERENCES players(id) ON DELETE CASCADE,
  client_local_match_id  TEXT,
  created_at             INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id              TEXT    PRIMARY KEY,
  match_id        TEXT    NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  game_index      INTEGER NOT NULL,
  white_player_id TEXT    REFERENCES players(id) ON DELETE SET NULL,
  black_player_id TEXT    REFERENCES players(id) ON DELETE SET NULL,
  result          TEXT    NOT NULL CHECK (result IN ('white','black','draw')),
  reason          TEXT    NOT NULL,
  ply_count       INTEGER NOT NULL,
  moves_san       TEXT,
  moves_truncated INTEGER NOT NULL DEFAULT 0 CHECK (moves_truncated IN (0,1)),
  final_fen       TEXT    NOT NULL,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS ux_matches_idempotency
  ON matches(submitted_by_player_id, client_local_match_id)
  WHERE client_local_match_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_white_ended ON matches(player_white_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_black_ended ON matches(player_black_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_ended       ON matches(ended_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_games_match_index ON games(match_id, game_index);
CREATE INDEX IF NOT EXISTS idx_games_match         ON games(match_id);

INSERT OR IGNORE INTO schema_meta(key, value) VALUES ('version', '1');
`;

/** 사용자 원칙 §DB 영구성 보장 — 기존 데이터를 일절 삭제하지 않고 누락된 컬럼만 안전하게 추가 */
export function applyMigrations(db: import('better-sqlite3').Database): void {
  db.exec(MIGRATION_001_INIT);

  const matchCols = db.prepare(`PRAGMA table_info(matches)`).all() as { name: string }[];
  const matchColNames = new Set(matchCols.map((c) => c.name));

  if (!matchColNames.has('pieces_lost_white')) {
    db.exec(`ALTER TABLE matches ADD COLUMN pieces_lost_white INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!matchColNames.has('pieces_lost_black')) {
    db.exec(`ALTER TABLE matches ADD COLUMN pieces_lost_black INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!matchColNames.has('duration_ms')) {
    db.exec(`ALTER TABLE matches ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!matchColNames.has('leaderboard_score')) {
    db.exec(`ALTER TABLE matches ADD COLUMN leaderboard_score INTEGER NOT NULL DEFAULT 0;`);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_matches_leaderboard ON matches(source, result, cpu_difficulty, leaderboard_score DESC);
    CREATE INDEX IF NOT EXISTS idx_players_nickname ON players(nickname);
  `);
}
