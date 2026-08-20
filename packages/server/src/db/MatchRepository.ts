import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Color } from '@battle-chess/chess-core';
import type { GameEndReason, MatchFormat, MatchOutcome, TimeControlKind } from '@battle-chess/protocol';

export interface FinalizeGameInput {
  gameIndex: number;
  whitePlayerId: string;
  blackPlayerId: string;
  result: 'white' | 'black' | 'draw';
  reason: GameEndReason;
  plyCount: number;
  movesSan: string;
  movesTruncated: boolean;
  finalFen: string;
  startedAt: number;
  endedAt: number;
}

export interface FinalizeMatchInput {
  format: MatchFormat;
  playerWhiteId: string;
  playerBlackId: string;
  whiteLabel: string;
  blackLabel: string;
  timeControl: TimeControlKind;
  scoreWhite: number;
  scoreBlack: number;
  result: 'white' | 'black' | 'draw' | 'aborted';
  startedAt: number;
  endedAt: number;
  games: FinalizeGameInput[];
}

export interface SyncedGameInput {
  gameIndex: number;
  myColor: Color;
  result: 'white' | 'black' | 'draw';
  reason: GameEndReason;
  plyCount: number;
  movesSan: string;
  movesTruncated: boolean;
  finalFen: string;
  startedAt: number;
  endedAt: number;
}

export interface SyncedMatchInput {
  clientLocalMatchId: string;
  submittedByPlayerId: string;
  source: 'local2p' | 'cpu';
  format: MatchFormat;
  myColorGame1: Color;
  opponentLabel: string;
  cpuDifficulty?: string;
  timeControl: TimeControlKind;
  scoreMine: number;
  scoreOpponent: number;
  outcome: MatchOutcome;
  startedAt: number;
  endedAt: number;
  piecesLostMine?: number | undefined;
  durationSeconds?: number | undefined;
  score?: number | undefined;
  games: SyncedGameInput[];
}

function colorToResult(c: Color): 'white' | 'black' {
  return c === 'w' ? 'white' : 'black';
}

/** D10-4/D10-5 §매치 기록 저장 — 온라인(권위) / 오프라인 동기화 업로드 두 경로. */
export class MatchRepository {
  constructor(private readonly db: Database.Database) {}

  /** D10-5 §온라인 매치 — 서버 권위 기록. `MATCH_END` 전송 직전에 동기 트랜잭션으로 쓴다. */
  finalizeMatch(input: FinalizeMatchInput): string {
    const matchId = randomUUID();
    const now = Date.now();

    const insertMatch = this.db.prepare(
      `INSERT INTO matches (id, source, format, player_white_id, player_black_id, white_label, black_label,
         cpu_difficulty, time_control, score_white, score_black, result, game_count, started_at, ended_at,
         verified, submitted_by_player_id, client_local_match_id, created_at)
       VALUES (@id, 'online', @format, @playerWhiteId, @playerBlackId, @whiteLabel, @blackLabel,
         NULL, @timeControl, @scoreWhite, @scoreBlack, @result, @gameCount, @startedAt, @endedAt,
         1, NULL, NULL, @createdAt)`
    );
    const insertGame = this.db.prepare(
      `INSERT INTO games (id, match_id, game_index, white_player_id, black_player_id, result, reason,
         ply_count, moves_san, moves_truncated, final_fen, started_at, ended_at)
       VALUES (@id, @matchId, @gameIndex, @whitePlayerId, @blackPlayerId, @result, @reason,
         @plyCount, @movesSan, @movesTruncated, @finalFen, @startedAt, @endedAt)`
    );

    const tx = this.db.transaction(() => {
      insertMatch.run({
        id: matchId,
        format: input.format,
        playerWhiteId: input.playerWhiteId,
        playerBlackId: input.playerBlackId,
        whiteLabel: input.whiteLabel,
        blackLabel: input.blackLabel,
        timeControl: input.timeControl,
        scoreWhite: input.scoreWhite,
        scoreBlack: input.scoreBlack,
        result: input.result,
        gameCount: input.games.length,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        createdAt: now,
      });
      for (const g of input.games) {
        insertGame.run({
          id: randomUUID(),
          matchId,
          gameIndex: g.gameIndex,
          whitePlayerId: g.whitePlayerId,
          blackPlayerId: g.blackPlayerId,
          result: g.result,
          reason: g.reason,
          plyCount: g.plyCount,
          movesSan: g.movesSan,
          movesTruncated: g.movesTruncated ? 1 : 0,
          finalFen: g.finalFen,
          startedAt: g.startedAt,
          endedAt: g.endedAt,
        });
      }
    });
    tx();
    return matchId;
  }

  /** D10-2 §오프라인 동기화 업로드 — 멱등(같은 clientLocalMatchId 재업로드 시 기존 것을 유지). */
  insertSyncedMatch(input: SyncedMatchInput): { serverMatchId: string; conflict: 'inserted' | 'kept-existing' } {
    const existing = this.db
      .prepare('SELECT id FROM matches WHERE submitted_by_player_id = ? AND client_local_match_id = ?')
      .get(input.submittedByPlayerId, input.clientLocalMatchId) as { id: string } | undefined;
    if (existing !== undefined) return { serverMatchId: existing.id, conflict: 'kept-existing' };

    const matchId = randomUUID();
    const now = Date.now();
    const myColor = input.myColorGame1;
    const opponentColor: Color = myColor === 'w' ? 'b' : 'w';
    const playerWhiteId = myColor === 'w' ? input.submittedByPlayerId : null;
    const playerBlackId = myColor === 'b' ? input.submittedByPlayerId : null;
    const whiteLabel = myColor === 'w' ? '(나)' : input.opponentLabel;
    const blackLabel = myColor === 'b' ? '(나)' : input.opponentLabel;
    const scoreWhite = myColor === 'w' ? input.scoreMine : input.scoreOpponent;
    const scoreBlack = myColor === 'b' ? input.scoreMine : input.scoreOpponent;
    const result: 'white' | 'black' | 'draw' | 'aborted' =
      input.outcome === 'aborted' ? 'aborted' : input.outcome === 'draw' ? 'draw' : input.outcome === 'win' ? colorToResult(myColor) : colorToResult(opponentColor);

    const piecesLostWhite = myColor === 'w' ? (input.piecesLostMine ?? 0) : 0;
    const piecesLostBlack = myColor === 'b' ? (input.piecesLostMine ?? 0) : 0;
    const durationMs = input.durationSeconds !== undefined ? input.durationSeconds * 1000 : (input.endedAt - input.startedAt);
    const leaderboardScore = input.score ?? 0;

    const insertMatch = this.db.prepare(
      `INSERT INTO matches (id, source, format, player_white_id, player_black_id, white_label, black_label,
         cpu_difficulty, time_control, score_white, score_black, result, game_count, started_at, ended_at,
         verified, submitted_by_player_id, client_local_match_id, created_at,
         pieces_lost_white, pieces_lost_black, duration_ms, leaderboard_score)
       VALUES (@id, @source, @format, @playerWhiteId, @playerBlackId, @whiteLabel, @blackLabel,
         @cpuDifficulty, @timeControl, @scoreWhite, @scoreBlack, @result, @gameCount, @startedAt, @endedAt,
         0, @submittedByPlayerId, @clientLocalMatchId, @createdAt,
         @piecesLostWhite, @piecesLostBlack, @durationMs, @leaderboardScore)`
    );
    const insertGame = this.db.prepare(
      `INSERT INTO games (id, match_id, game_index, white_player_id, black_player_id, result, reason,
         ply_count, moves_san, moves_truncated, final_fen, started_at, ended_at)
       VALUES (@id, @matchId, @gameIndex, @whitePlayerId, @blackPlayerId, @result, @reason,
         @plyCount, @movesSan, @movesTruncated, @finalFen, @startedAt, @endedAt)`
    );

    const tx = this.db.transaction(() => {
      insertMatch.run({
        id: matchId,
        source: input.source,
        format: input.format,
        playerWhiteId,
        playerBlackId,
        whiteLabel,
        blackLabel,
        cpuDifficulty: input.cpuDifficulty ?? null,
        timeControl: input.timeControl,
        scoreWhite,
        scoreBlack,
        result,
        gameCount: input.games.length,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        submittedByPlayerId: input.submittedByPlayerId,
        clientLocalMatchId: input.clientLocalMatchId,
        createdAt: now,
        piecesLostWhite,
        piecesLostBlack,
        durationMs,
        leaderboardScore,
      });
      for (const g of input.games) {
        insertGame.run({
          id: randomUUID(),
          matchId,
          gameIndex: g.gameIndex,
          whitePlayerId: g.myColor === 'w' ? input.submittedByPlayerId : null,
          blackPlayerId: g.myColor === 'b' ? input.submittedByPlayerId : null,
          result: g.result,
          reason: g.reason,
          plyCount: g.plyCount,
          movesSan: g.movesSan,
          movesTruncated: g.movesTruncated ? 1 : 0,
          finalFen: g.finalFen,
          startedAt: g.startedAt,
          endedAt: g.endedAt,
        });
      }
    });
    tx();
    return { serverMatchId: matchId, conflict: 'inserted' };
  }
}
