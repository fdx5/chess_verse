import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { applyMigrations } from './migrations.js';

/** D10-4 §better-sqlite3 — 동기 API, 임베디드 파일 DB. PRAGMA는 설계서 고정값 그대로. */
export function openDatabase(filePath: string): Database.Database {
  if (filePath !== ':memory:') mkdirSync(dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  applyMigrations(db);
  return db;
}
