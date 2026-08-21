import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { applyMigrations } from './migrations.js';

export interface DatabaseOptions {
  url?: string;
  authToken?: string;
  filePath?: string;
}

/**
 * Turso 클라우드 영구 DB 및 로컬 Libsql/SQLite 통합 연결 진입점.
 * 1. TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 이 주어지면 원격 Turso 클라우드로 자동 연결.
 * 2. 환경 변수가 없으면 지정된 로컬 SQLite 파일(file:...)로 연결.
 */
export async function openDatabase(options?: DatabaseOptions): Promise<Client> {
  const tursoUrl = options?.url ?? process.env['TURSO_DATABASE_URL'] ?? process.env['TURSO_URL'] ?? process.env['DATABASE_URL'];
  const tursoAuthToken = options?.authToken ?? process.env['TURSO_AUTH_TOKEN'];

  let client: Client;

  if (tursoUrl && tursoUrl.startsWith('libsql://') || tursoUrl?.startsWith('https://') || tursoUrl?.startsWith('http://')) {
    console.log(`[db] Connecting to Turso cloud database: ${tursoUrl}`);
    client = createClient({
      url: tursoUrl,
      ...(tursoAuthToken !== undefined ? { authToken: tursoAuthToken } : {}),
    });
  } else {
    const rawPath = options?.filePath ?? process.env['BCR_DB_PATH'] ?? 'data/bcr.sqlite';
    if (rawPath !== ':memory:') {
      mkdirSync(dirname(rawPath), { recursive: true });
    }
    const fileUrl = rawPath === ':memory:' ? ':memory:' : `file:${rawPath.replace(/\\/g, '/')}`;
    console.log(`[db] Connecting to local SQLite file: ${fileUrl}`);
    client = createClient({
      url: fileUrl,
    });
  }

  await applyMigrations(client);
  return client;
}
