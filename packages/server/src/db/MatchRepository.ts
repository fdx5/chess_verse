import { randomUUID } from 'node:crypto';
import type { Client, InStatement } from '@libsql/client';
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

/** D10-4/D10-5 §매치 및 상세 기보 영구 저장 — Turso 클라우드/Libsql 비동기 배치 트랜잭션. */
export class MatchRepository {
  constructor(private readonly client: Client) {}

  /** D10-5 §온라인 매치 — 서버 권위 기록. `MATCH_END` 전송 직전에 원자적 배치로 쓴다. */
  async finalizeMatch(input: FinalizeMatchInput): Promise<string> {
    const matchId = randomUUID();
    const now = Date.now();

    const statements: InStatement[] = [
      {
        sql: `INSERT INTO matches (id, source, format, player_white_id, player_black_id, white_label, black_label,
               cpu_difficulty, time_control, score_white, score_black, result, game_count, started_at, ended_at,
               verified, submitted_by_player_id, client_local_match_id, created_at)
             VALUES (?, 'online', ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, ?)`,
        args: [
          matchId,
          input.format,
          input.playerWhiteId,
          input.playerBlackId,
          input.whiteLabel,
          input.blackLabel,
          input.timeControl,
          input.scoreWhite,
          input.scoreBlack,
          input.result,
          input.games.length,
          input.startedAt,
          input.endedAt,
          now,
        ],
      },
    ];

    for (const g of input.games) {
      statements.push({
        sql: `INSERT INTO games (id, match_id, game_index, white_player_id, black_player_id, result, reason,
               ply_count, moves_san, moves_truncated, final_fen, started_at, ended_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          matchId,
          g.gameIndex,
          g.whitePlayerId,
          g.blackPlayerId,
          g.result,
          g.reason,
          g.plyCount,
          g.movesSan,
          g.movesTruncated ? 1 : 0,
          g.finalFen,
          g.startedAt,
          g.endedAt,
        ],
      });
    }

    await this.client.batch(statements, 'write');
    return matchId;
  }

  /** D10-2 §오프라인 동기화 업로드 — 멱등(같은 clientLocalMatchId 재업로드 시 기존 것을 유지). */
  async insertSyncedMatch(input: SyncedMatchInput): Promise<{ serverMatchId: string; conflict: 'inserted' | 'kept-existing' }> {
    const existingRes = await this.client.execute({
      sql: 'SELECT id FROM matches WHERE submitted_by_player_id = ? AND client_local_match_id = ?',
      args: [input.submittedByPlayerId, input.clientLocalMatchId],
    });
    const existing = existingRes.rows[0];
    if (existing) return { serverMatchId: String(existing['id']), conflict: 'kept-existing' };

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

    const statements: InStatement[] = [
      {
        sql: `INSERT INTO matches (id, source, format, player_white_id, player_black_id, white_label, black_label,
               cpu_difficulty, time_control, score_white, score_black, result, game_count, started_at, ended_at,
               verified, submitted_by_player_id, client_local_match_id, created_at,
               pieces_lost_white, pieces_lost_black, duration_ms, leaderboard_score)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          matchId,
          input.source,
          input.format,
          playerWhiteId,
          playerBlackId,
          whiteLabel,
          blackLabel,
          input.cpuDifficulty ?? null,
          input.timeControl,
          scoreWhite,
          scoreBlack,
          result,
          input.games.length,
          input.startedAt,
          input.endedAt,
          input.submittedByPlayerId,
          input.clientLocalMatchId,
          now,
          piecesLostWhite,
          piecesLostBlack,
          durationMs,
          leaderboardScore,
        ],
      },
    ];

    for (const g of input.games) {
      statements.push({
        sql: `INSERT INTO games (id, match_id, game_index, white_player_id, black_player_id, result, reason,
               ply_count, moves_san, moves_truncated, final_fen, started_at, ended_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          matchId,
          g.gameIndex,
          g.myColor === 'w' ? input.submittedByPlayerId : null,
          g.myColor === 'b' ? input.submittedByPlayerId : null,
          g.result,
          g.reason,
          g.plyCount,
          g.movesSan,
          g.movesTruncated ? 1 : 0,
          g.finalFen,
          g.startedAt,
          g.endedAt,
        ],
      });
    }

    await this.client.batch(statements, 'write');
    return { serverMatchId: matchId, conflict: 'inserted' };
  }
}
