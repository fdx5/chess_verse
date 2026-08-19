import { createHash, timingSafeEqual } from 'node:crypto';
import type Database from 'better-sqlite3';

interface PlayerRow {
  id: string;
  nickname: string;
  secret_hash: string | null;
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** D10-1/D10-6 §플레이어 아이덴티티 — UPSERT + secret 기반 인증(SHA-256, timingSafeEqual). */
export class PlayerRepository {
  constructor(private readonly db: Database.Database) {}

  /** WS `PLAYER_IDENTIFY` 및 REST `POST /players/identify` 공용 진입점. */
  upsert(input: { id: string; nickname: string; secret?: string; clientVersion?: string }): { isNew: boolean; secretAccepted: boolean } {
    const now = Date.now();
    const existing = this.db.prepare('SELECT id, nickname, secret_hash FROM players WHERE id = ?').get(input.id) as PlayerRow | undefined;
    const isNew = existing === undefined;

    let secretAccepted: boolean;
    let secretHash: string | null;
    if (existing === undefined || existing.secret_hash === null) {
      // 최초 등록, 또는 이전에 secret이 한 번도 설정되지 않은 레코드 — 이번에 온 secret을 그대로 채택.
      secretHash = input.secret !== undefined ? hashSecret(input.secret) : null;
      secretAccepted = input.secret !== undefined;
    } else if (input.secret !== undefined) {
      // 이미 secret이 설정된 신원 — 백업 코드 복원 등으로 secret이 다시 왔으면 검증한다.
      secretHash = existing.secret_hash;
      secretAccepted = this.verifySecret(input.id, input.secret);
    } else {
      // 같은 기기의 재접속(하트비트 등) — secret 재전송 없이도 이미 인증된 신원으로 취급.
      secretHash = existing.secret_hash;
      secretAccepted = true;
    }

    if (isNew) {
      this.db
        .prepare(
          `INSERT INTO players (id, nickname, secret_hash, created_at, last_seen_at, client_version, schema_version)
           VALUES (?, ?, ?, ?, ?, ?, 1)`
        )
        .run(input.id, input.nickname, secretHash, now, now, input.clientVersion ?? null);
    } else {
      this.db
        .prepare('UPDATE players SET nickname = ?, secret_hash = ?, last_seen_at = ?, client_version = ? WHERE id = ?')
        .run(input.nickname, secretHash, now, input.clientVersion ?? null, input.id);
    }
    return { isNew, secretAccepted };
  }

  verifySecret(playerId: string, secret: string): boolean {
    const row = this.db.prepare('SELECT secret_hash FROM players WHERE id = ?').get(playerId) as { secret_hash: string | null } | undefined;
    if (row === undefined || row.secret_hash === null) return false;
    const a = Buffer.from(hashSecret(secret), 'hex');
    const b = Buffer.from(row.secret_hash, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  getNickname(playerId: string): string | null {
    const row = this.db.prepare('SELECT nickname FROM players WHERE id = ?').get(playerId) as { nickname: string } | undefined;
    return row?.nickname ?? null;
  }

  deleteCascade(playerId: string): void {
    this.db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
  }
}
