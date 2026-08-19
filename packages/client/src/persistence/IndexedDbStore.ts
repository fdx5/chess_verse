import type { LocalGameRecord } from '../game/MatchState';
import { DB_NAME, DB_VERSION, type LocalMatchRecord, type SyncOp } from './schema';

/** D10-3 §IndexedDB 스키마 — matches/games/syncQueue/meta 4개 오브젝트 스토어. */
export class IndexedDbStore {
  private db: IDBDatabase | null = null;

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('matches')) {
          const matches = db.createObjectStore('matches', { keyPath: 'localMatchId' });
          matches.createIndex('by_endedAt', 'endedAt');
          matches.createIndex('by_syncState', 'syncState');
          matches.createIndex('by_serverMatchId', 'serverMatchId', { unique: true });
          matches.createIndex('by_source', 'source');
        }
        if (!db.objectStoreNames.contains('games')) {
          const games = db.createObjectStore('games', { keyPath: 'localGameId' });
          games.createIndex('by_localMatchId', 'localMatchId');
          games.createIndex('by_endedAt', 'endedAt');
          games.createIndex('by_match_index', ['localMatchId', 'gameIndex'], { unique: true });
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          const syncQueue = db.createObjectStore('syncQueue', { keyPath: 'opId' });
          syncQueue.createIndex('by_nextAttemptAt', 'nextAttemptAt');
          syncQueue.createIndex('by_state', 'state');
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onerror = () => reject(req.error as Error);
    });
  }

  private requireDb(): IDBDatabase {
    if (this.db === null) throw new Error('IndexedDbStore.open()을 먼저 호출해야 합니다');
    return this.db;
  }

  putMatch(match: LocalMatchRecord, games: readonly LocalGameRecord[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDb().transaction(['matches', 'games'], 'readwrite');
      tx.objectStore('matches').put(match);
      for (const g of games) tx.objectStore('games').put(g);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error as Error);
    });
  }

  listMatches(opts: { limit: number; before?: number }): Promise<LocalMatchRecord[]> {
    return new Promise((resolve, reject) => {
      const results: LocalMatchRecord[] = [];
      const index = this.requireDb().transaction('matches', 'readonly').objectStore('matches').index('by_endedAt');
      const range = opts.before !== undefined ? IDBKeyRange.upperBound(opts.before, true) : undefined;
      const req = range !== undefined ? index.openCursor(range, 'prev') : index.openCursor(null, 'prev');
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor === null || results.length >= opts.limit) {
          resolve(results);
          return;
        }
        results.push(cursor.value as LocalMatchRecord);
        cursor.continue();
      };
      req.onerror = () => reject(req.error as Error);
    });
  }

  getMatchDetail(localMatchId: string): Promise<{ match: LocalMatchRecord; games: LocalGameRecord[] } | null> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDb().transaction(['matches', 'games'], 'readonly');
      const matchReq = tx.objectStore('matches').get(localMatchId);
      const gamesReq = tx.objectStore('games').index('by_localMatchId').getAll(localMatchId);
      tx.oncomplete = () => {
        const match = matchReq.result as LocalMatchRecord | undefined;
        if (match === undefined) {
          resolve(null);
          return;
        }
        const games = (gamesReq.result as LocalGameRecord[]).slice().sort((a, b) => a.gameIndex - b.gameIndex);
        resolve({ match, games });
      };
      tx.onerror = () => reject(tx.error as Error);
    });
  }

  markSynced(localMatchId: string, serverMatchId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDb().transaction('matches', 'readwrite');
      const store = tx.objectStore('matches');
      const req = store.get(localMatchId);
      req.onsuccess = () => {
        const match = req.result as LocalMatchRecord | undefined;
        if (match === undefined) return;
        match.serverMatchId = serverMatchId;
        match.syncState = 'synced';
        store.put(match);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error as Error);
    });
  }

  enqueueSyncOp(op: SyncOp): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDb().transaction('syncQueue', 'readwrite');
      tx.objectStore('syncQueue').put(op);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error as Error);
    });
  }

  updateSyncOp(op: SyncOp): Promise<void> {
    return this.enqueueSyncOp(op);
  }

  deleteSyncOp(opId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDb().transaction('syncQueue', 'readwrite');
      tx.objectStore('syncQueue').delete(opId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error as Error);
    });
  }

  pendingSyncOps(nowMs: number, limit: number): Promise<SyncOp[]> {
    return new Promise((resolve, reject) => {
      const results: SyncOp[] = [];
      const req = this.requireDb().transaction('syncQueue', 'readonly').objectStore('syncQueue').index('by_nextAttemptAt').openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor === null || results.length >= limit) {
          resolve(results);
          return;
        }
        const op = cursor.value as SyncOp;
        if (op.state === 'queued' && op.nextAttemptAt <= nowMs) results.push(op);
        cursor.continue();
      };
      req.onerror = () => reject(req.error as Error);
    });
  }

  /** D10-3 §용량 정리 — 최근 `maxMatches`건 초과분을 오래된 순으로 삭제. `synced`가 아닌 레코드는 보호한다. */
  prune(maxMatches: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDb().transaction(['matches', 'games'], 'readwrite');
      const matchesStore = tx.objectStore('matches');
      const index = matchesStore.index('by_endedAt');
      let total = 0;
      let deleted = 0;
      const countReq = matchesStore.count();
      countReq.onsuccess = () => {
        total = countReq.result;
        if (total <= maxMatches) {
          resolve(0);
          return;
        }
        const overflow = total - maxMatches;
        const cursorReq = index.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor === null || deleted >= overflow) return;
          const match = cursor.value as LocalMatchRecord;
          if (match.syncState === 'synced') {
            tx.objectStore('games').index('by_localMatchId').getAllKeys(match.localMatchId).onsuccess = (ev) => {
              const keys = (ev.target as IDBRequest<IDBValidKey[]>).result;
              for (const key of keys) tx.objectStore('games').delete(key);
            };
            matchesStore.delete(match.localMatchId);
            deleted += 1;
          }
          cursor.continue();
        };
      };
      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => reject(tx.error as Error);
    });
  }

  clearAll(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.requireDb().transaction(['matches', 'games', 'syncQueue'], 'readwrite');
      tx.objectStore('matches').clear();
      tx.objectStore('games').clear();
      tx.objectStore('syncQueue').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error as Error);
    });
  }
}
