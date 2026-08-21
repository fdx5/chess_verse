import { createHash, timingSafeEqual } from 'node:crypto';
import type { Client } from '@libsql/client';

interface PlayerRow {
  id: string;
  nickname: string;
  secret_hash: string | null;
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** D10-1/D10-6 §플레이어 아이덴티티 — Turso/Libsql 비동기 UPSERT + secret 기반 인증. */
export class PlayerRepository {
  constructor(private readonly client: Client) {}

  /** WS `PLAYER_IDENTIFY` 및 REST `POST /players/identify` 공용 진입점. */
  async upsert(input: { id: string; nickname: string; secret?: string; clientVersion?: string }): Promise<{ isNew: boolean; secretAccepted: boolean }> {
    const now = Date.now();
    const existingRes = await this.client.execute({
      sql: 'SELECT id, nickname, secret_hash FROM players WHERE id = ?',
      args: [input.id],
    });
    const existingRow = existingRes.rows[0];
    const existing: PlayerRow | undefined = existingRow
      ? {
          id: String(existingRow['id']),
          nickname: String(existingRow['nickname']),
          secret_hash: existingRow['secret_hash'] !== null ? String(existingRow['secret_hash']) : null,
        }
      : undefined;

    const isNew = existing === undefined;

    let secretAccepted: boolean;
    let secretHash: string | null;
    if (existing === undefined || existing.secret_hash === null) {
      secretHash = input.secret !== undefined ? hashSecret(input.secret) : null;
      secretAccepted = input.secret !== undefined;
    } else if (input.secret !== undefined) {
      secretHash = existing.secret_hash;
      secretAccepted = await this.verifySecret(input.id, input.secret);
    } else {
      secretHash = existing.secret_hash;
      secretAccepted = true;
    }

    if (isNew) {
      await this.client.execute({
        sql: `INSERT INTO players (id, nickname, secret_hash, created_at, last_seen_at, client_version, schema_version)
              VALUES (?, ?, ?, ?, ?, ?, 1)`,
        args: [input.id, input.nickname, secretHash, now, now, input.clientVersion ?? null],
      });
    } else {
      await this.client.execute({
        sql: 'UPDATE players SET nickname = ?, secret_hash = ?, last_seen_at = ?, client_version = ? WHERE id = ?',
        args: [input.nickname, secretHash, now, input.clientVersion ?? null, input.id],
      });
    }
    return { isNew, secretAccepted };
  }

  async verifySecret(playerId: string, secret: string): Promise<boolean> {
    const res = await this.client.execute({
      sql: 'SELECT secret_hash FROM players WHERE id = ?',
      args: [playerId],
    });
    const row = res.rows[0];
    if (!row || row['secret_hash'] === null || row['secret_hash'] === undefined) return false;
    const secretHashStr = String(row['secret_hash']);
    const a = Buffer.from(hashSecret(secret), 'hex');
    const b = Buffer.from(secretHashStr, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  async getNickname(playerId: string): Promise<string | null> {
    const res = await this.client.execute({
      sql: 'SELECT nickname FROM players WHERE id = ?',
      args: [playerId],
    });
    const row = res.rows[0];
    return row && row['nickname'] !== undefined ? String(row['nickname']) : null;
  }

  /** 닉네임 중복 여부 확인 (대소문자 무시) */
  async isNicknameAvailable(nickname: string, excludePlayerId?: string): Promise<boolean> {
    const res = await this.client.execute({
      sql: 'SELECT id FROM players WHERE nickname = ? COLLATE NOCASE',
      args: [nickname],
    });
    const row = res.rows[0];
    if (!row) return true;
    if (excludePlayerId !== undefined && String(row['id']) === excludePlayerId) return true;
    return false;
  }

  /** 닉네임으로 플레이어 레코드 조회 */
  async findByNickname(nickname: string): Promise<PlayerRow | null> {
    const res = await this.client.execute({
      sql: 'SELECT id, nickname, secret_hash FROM players WHERE nickname = ? COLLATE NOCASE',
      args: [nickname],
    });
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: String(row['id']),
      nickname: String(row['nickname']),
      secret_hash: row['secret_hash'] !== null && row['secret_hash'] !== undefined ? String(row['secret_hash']) : null,
    };
  }

  async deleteCascade(playerId: string): Promise<void> {
    await this.client.execute({
      sql: 'DELETE FROM players WHERE id = ?',
      args: [playerId],
    });
  }
}
