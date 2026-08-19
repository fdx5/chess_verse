import type { Color } from '@battle-chess/chess-core';
import type { Difficulty } from '../ai/AiWorkerHandle';
import type { LocalGameRecord, MatchFormat, MatchOutcome, MatchSource } from '../game/MatchState';
import type { IndexedDbStore } from './IndexedDbStore';
import type { LocalMatchRecord } from './schema';

export interface MatchRecordInput {
  localMatchId: string;
  source: MatchSource;
  format: MatchFormat;
  myPlayerId: string;
  myColorGame1: Color;
  opponentKind: 'human-local' | 'human-online' | 'cpu';
  opponentLabel: string;
  opponentPlayerId?: string;
  cpuDifficulty?: Difficulty;
  timeControl: 'blitz' | 'rapid' | 'unlimited';
  scoreMine: number;
  scoreOpponent: number;
  outcome: MatchOutcome;
  startedAt: number;
  endedAt: number;
  games: LocalGameRecord[];
  /** 온라인 매치는 서버가 이미 권위적으로 기록했으므로 여기 채워서 넘기면 곧장 synced로 저장된다(D10-5). */
  serverMatchId?: string;
}

const APP_VERSION = '0.1.0';

/** D10-2/D10-9 §MatchRecorder — `game:matchEnded`/`net:matchEnd` 수신 시 이 record()를 호출한다. */
export class MatchRecorder {
  constructor(
    private readonly store: IndexedDbStore,
    private readonly onRecorded?: (record: LocalMatchRecord) => void
  ) {}

  async record(input: MatchRecordInput): Promise<LocalMatchRecord | null> {
    const record: LocalMatchRecord = {
      localMatchId: input.localMatchId,
      ...(input.serverMatchId !== undefined ? { serverMatchId: input.serverMatchId } : {}),
      source: input.source,
      format: input.format,
      myPlayerId: input.myPlayerId,
      myColorGame1: input.myColorGame1,
      opponentKind: input.opponentKind,
      opponentLabel: input.opponentLabel.slice(0, 32),
      ...(input.opponentPlayerId !== undefined ? { opponentPlayerId: input.opponentPlayerId } : {}),
      ...(input.cpuDifficulty !== undefined ? { cpuDifficulty: input.cpuDifficulty } : {}),
      timeControl: input.timeControl,
      scoreMine: input.scoreMine,
      scoreOpponent: input.scoreOpponent,
      outcome: input.outcome,
      gameCount: input.games.length,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      syncState: input.source === 'online' ? 'synced' : 'local',
      syncAttempts: 0,
      appVersion: APP_VERSION,
      schemaVersion: 1,
    };

    try {
      await this.store.putMatch(record, input.games);
    } catch (err) {
      // D10-3 §쿼터 초과 등 저장 실패 시에도 대국 흐름 자체는 막지 않는다.
      console.warn('[MatchRecorder] IndexedDB 저장 실패:', err);
      return null;
    }

    if (input.source !== 'online') {
      await this.store.enqueueSyncOp({
        opId: crypto.randomUUID(),
        kind: 'uploadMatch',
        localMatchId: record.localMatchId,
        state: 'queued',
        attempts: 0,
        nextAttemptAt: Date.now(),
      });
    }

    this.onRecorded?.(record);
    return record;
  }
}
