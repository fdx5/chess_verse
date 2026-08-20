import type { SyncMatchDto } from '@battle-chess/protocol';
import type { LocalGameRecord } from '../game/MatchState';
import type { HistoryClient } from './HistoryClient';
import type { PlayerIdentity } from './identity';
import type { IndexedDbStore } from './IndexedDbStore';
import type { LocalMatchRecord, SyncOp } from './schema';

const RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 300_000];
const MAX_ATTEMPTS = 8;
const PERIODIC_SYNC_MS = 5 * 60_000;
const SYNC_BATCH_SIZE = 50;

function toSyncDto(match: LocalMatchRecord, games: readonly LocalGameRecord[]): SyncMatchDto | null {
  if (match.source === 'online') return null; // D10-2 §3 — 온라인은 서버가 이미 권위 기록을 가지고 있다.
  return {
    clientLocalMatchId: match.localMatchId,
    source: match.source,
    format: match.format,
    myColorGame1: match.myColorGame1,
    opponentLabel: match.opponentLabel,
    ...(match.cpuDifficulty !== undefined ? { cpuDifficulty: match.cpuDifficulty } : {}),
    timeControl: match.timeControl,
    scoreMine: match.scoreMine,
    scoreOpponent: match.scoreOpponent,
    outcome: match.outcome,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    piecesLostMine: match.piecesLostMine,
    durationSeconds: match.durationSeconds,
    score: match.score,
    games: games.map((g) => ({
      gameIndex: g.gameIndex,
      myColor: g.myColor,
      result: g.result,
      reason: g.reason,
      plyCount: g.plyCount,
      movesSan: g.movesSan,
      movesTruncated: g.movesTruncated,
      finalFen: g.finalFen,
      startedAt: g.startedAt,
      endedAt: g.endedAt,
    })),
  };
}

/** D10-2 §오프라인 우선 동기화 — 지수 백오프(5s→15s→60s→300s), 최대 8회, 5분 주기 타이머. */
export class SyncEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private identity: PlayerIdentity | null = null;
  private running = false;

  constructor(
    private readonly store: IndexedDbStore,
    private readonly client: HistoryClient
  ) {}

  setIdentity(identity: PlayerIdentity | null): void {
    this.identity = identity;
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.syncNow(), PERIODIC_SYNC_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async syncNow(): Promise<{ uploaded: number; failed: number }> {
    if (this.running || this.identity === null) return { uploaded: 0, failed: 0 };
    this.running = true;
    let uploaded = 0;
    let failed = 0;
    try {
      const ops = await this.store.pendingSyncOps(Date.now(), SYNC_BATCH_SIZE);
      if (ops.length === 0) return { uploaded: 0, failed: 0 };

      const batch: { op: SyncOp; dto: SyncMatchDto }[] = [];
      for (const op of ops) {
        const detail = await this.store.getMatchDetail(op.localMatchId);
        if (detail === null) {
          await this.store.deleteSyncOp(op.opId);
          continue;
        }
        const dto = toSyncDto(detail.match, detail.games);
        if (dto === null) {
          await this.store.deleteSyncOp(op.opId);
          continue;
        }
        batch.push({ op, dto });
      }
      if (batch.length === 0) return { uploaded: 0, failed: 0 };

      try {
        const results = await this.client.uploadMatches(this.identity, batch.map((b) => b.dto));
        const byLocalId = new Map(results.map((r) => [r.clientLocalMatchId, r]));
        for (const { op } of batch) {
          const result = byLocalId.get(op.localMatchId);
          if (result === undefined) {
            failed += 1;
            continue;
          }
          await this.store.markSynced(op.localMatchId, result.serverMatchId);
          await this.store.deleteSyncOp(op.opId);
          uploaded += 1;
        }
      } catch (err) {
        console.warn('[SyncEngine] 업로드 실패, 재시도 예약:', err);
        for (const { op } of batch) {
          const nextAttempts = op.attempts + 1;
          if (nextAttempts > MAX_ATTEMPTS) {
            await this.store.updateSyncOp({ ...op, state: 'failed', attempts: nextAttempts, lastError: String(err).slice(0, 200) });
          } else {
            const delay = RETRY_DELAYS_MS[Math.min(nextAttempts - 1, RETRY_DELAYS_MS.length - 1)] ?? 300_000;
            await this.store.updateSyncOp({ ...op, attempts: nextAttempts, nextAttemptAt: Date.now() + delay, lastError: String(err).slice(0, 200) });
          }
          failed += 1;
        }
      }
    } finally {
      this.running = false;
    }
    return { uploaded, failed };
  }
}
