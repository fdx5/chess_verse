import type Database from 'better-sqlite3';
import type { Color } from '@battle-chess/chess-core';
import type { Difficulty, GameEndReason, MatchDetailDto, MatchFormat, MatchHistoryPage, MatchOutcome, MatchSource, MatchSummaryDto, PlayerStatsBucket, PlayerStatsDto, TimeControlKind } from '@battle-chess/protocol';

interface MatchRow {
  id: string;
  source: MatchSource;
  format: MatchFormat;
  player_white_id: string | null;
  player_black_id: string | null;
  white_label: string;
  black_label: string;
  time_control: TimeControlKind;
  score_white: number;
  score_black: number;
  result: 'white' | 'black' | 'draw' | 'aborted';
  game_count: number;
  started_at: number;
  ended_at: number;
  verified: number;
}

interface GameRow {
  game_index: number;
  white_player_id: string | null;
  black_player_id: string | null;
  result: 'white' | 'black' | 'draw';
  reason: GameEndReason;
  ply_count: number;
  moves_san: string | null;
  moves_truncated: number;
  final_fen: string;
  started_at: number;
  ended_at: number;
}

function outcomeFor(row: MatchRow, viewerId: string): MatchOutcome {
  if (row.result === 'aborted') return 'aborted';
  if (row.result === 'draw') return 'draw';
  const myColor: Color = row.player_white_id === viewerId ? 'w' : 'b';
  const winnerColor: Color = row.result === 'white' ? 'w' : 'b';
  return myColor === winnerColor ? 'win' : 'loss';
}

function rowToSummary(row: MatchRow, viewerId: string): MatchSummaryDto {
  const myColorGame1: Color = row.player_white_id === viewerId ? 'w' : 'b';
  const opponentLabel = myColorGame1 === 'w' ? row.black_label : row.white_label;
  const scoreMine = myColorGame1 === 'w' ? row.score_white : row.score_black;
  const scoreOpponent = myColorGame1 === 'w' ? row.score_black : row.score_white;
  return {
    matchId: row.id,
    source: row.source,
    format: row.format,
    verified: row.verified === 1,
    opponentLabel,
    myColorGame1,
    scoreMine,
    scoreOpponent,
    outcome: outcomeFor(row, viewerId),
    gameCount: row.game_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    timeControl: row.time_control,
  };
}

const emptyBucket = (): PlayerStatsBucket => ({ matches: 0, wins: 0, draws: 0, losses: 0 });

/** D10-6 §히스토리 조회 — REST 핸들러가 호출하는 순수 쿼리 계층. */
export class HistoryQueries {
  constructor(private readonly db: Database.Database) {}

  listMatches(playerId: string, limit: number, before?: number): MatchHistoryPage {
    const cappedLimit = Math.min(Math.max(Math.trunc(limit) || 20, 1), 50);
    const cursor = before ?? Number.MAX_SAFE_INTEGER;
    const rows = this.db
      .prepare(
        `SELECT * FROM matches
         WHERE (player_white_id = ? OR player_black_id = ?) AND ended_at < ?
         ORDER BY ended_at DESC LIMIT ?`
      )
      .all(playerId, playerId, cursor, cappedLimit + 1) as MatchRow[];
    const totalRow = this.db.prepare('SELECT COUNT(*) as c FROM matches WHERE player_white_id = ? OR player_black_id = ?').get(playerId, playerId) as { c: number };

    const hasMore = rows.length > cappedLimit;
    const page = hasMore ? rows.slice(0, cappedLimit) : rows;
    const lastRow = page[page.length - 1];
    return {
      matches: page.map((r) => rowToSummary(r, playerId)),
      nextBefore: hasMore && lastRow !== undefined ? lastRow.ended_at : null,
      totalCount: totalRow.c,
    };
  }

  getMatchDetail(matchId: string, requesterId: string): MatchDetailDto | null {
    const row = this.db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as MatchRow | undefined;
    if (row === undefined) return null;
    if (row.player_white_id !== requesterId && row.player_black_id !== requesterId) return null;

    const gameRows = this.db.prepare('SELECT * FROM games WHERE match_id = ? ORDER BY game_index ASC').all(matchId) as GameRow[];
    const myColorGame1: Color = row.player_white_id === requesterId ? 'w' : 'b';
    const games = gameRows.map((g) => {
      const myColor: Color = g.white_player_id === requesterId ? 'w' : g.black_player_id === requesterId ? 'b' : myColorGame1;
      return {
        gameIndex: g.game_index,
        myColor,
        result: g.result,
        reason: g.reason,
        plyCount: g.ply_count,
        movesSan: g.moves_san,
        movesTruncated: g.moves_truncated === 1,
        finalFen: g.final_fen,
        startedAt: g.started_at,
        endedAt: g.ended_at,
      };
    });
    return { ...rowToSummary(row, requesterId), games };
  }

  getStats(playerId: string): PlayerStatsDto | null {
    const player = this.db.prepare('SELECT id, nickname FROM players WHERE id = ?').get(playerId) as { id: string; nickname: string } | undefined;
    if (player === undefined) return null;

    const rows = this.db.prepare('SELECT * FROM matches WHERE player_white_id = ? OR player_black_id = ? ORDER BY ended_at ASC').all(playerId, playerId) as MatchRow[];
    const verified = emptyBucket();
    const local = emptyBucket();
    const bySource: Record<MatchSource, number> = { local2p: 0, cpu: 0, online: 0 };
    let firstPlayedAt: number | null = null;
    let lastPlayedAt: number | null = null;

    for (const row of rows) {
      const bucket = row.verified === 1 ? verified : local;
      bucket.matches += 1;
      const outcome = outcomeFor(row, playerId);
      if (outcome === 'win') bucket.wins += 1;
      else if (outcome === 'draw') bucket.draws += 1;
      else if (outcome === 'loss') bucket.losses += 1;
      bySource[row.source] += 1;
      if (firstPlayedAt === null || row.started_at < firstPlayedAt) firstPlayedAt = row.started_at;
      if (lastPlayedAt === null || row.ended_at > lastPlayedAt) lastPlayedAt = row.ended_at;
    }

    return { playerId, nickname: player.nickname, verified, local, bySource, firstPlayedAt, lastPlayedAt };
  }

  /** CPU 대전 난이도별 순위표 조회 (점수 내림차순, 소요시간 오름차순) */
  getLeaderboard(difficulty: Difficulty, limit = 50): import('@battle-chess/protocol').LeaderboardEntryDto[] {
    const cappedLimit = Math.min(Math.max(limit, 1), 100);
    const rows = this.db.prepare(`
      SELECT 
        m.id as match_id,
        COALESCE(m.submitted_by_player_id, m.player_white_id, m.player_black_id) as player_id,
        COALESCE(p.nickname, m.white_label, m.black_label, '플레이어') as nickname,
        m.cpu_difficulty,
        CASE WHEN m.duration_ms > 0 THEN CAST(m.duration_ms / 1000 AS INTEGER) ELSE CAST((m.ended_at - m.started_at) / 1000 AS INTEGER) END as duration_seconds,
        CASE WHEN m.player_white_id IS NOT NULL THEN m.pieces_lost_white ELSE m.pieces_lost_black END as pieces_lost,
        m.leaderboard_score as score,
        m.ended_at
      FROM matches m
      LEFT JOIN players p ON p.id = COALESCE(m.submitted_by_player_id, m.player_white_id, m.player_black_id)
      WHERE m.source = 'cpu' 
        AND m.cpu_difficulty = ?
        AND m.leaderboard_score > 0
      ORDER BY m.leaderboard_score DESC, duration_seconds ASC, m.ended_at ASC
      LIMIT ?
    `).all(difficulty, cappedLimit) as {
      match_id: string;
      player_id: string;
      nickname: string;
      cpu_difficulty: Difficulty;
      duration_seconds: number;
      pieces_lost: number;
      score: number;
      ended_at: number;
    }[];

    return rows.map((r, index) => {
      const resolvedNick = (r.nickname && r.nickname !== '(나)') ? r.nickname : (pNickname(this.db, r.player_id) ?? '플레이어');
      return {
        rank: index + 1,
        matchId: r.match_id,
        playerId: r.player_id,
        nickname: resolvedNick,
        cpuDifficulty: r.cpu_difficulty,
        durationSeconds: Math.max(1, r.duration_seconds),
        piecesLost: r.pieces_lost,
        score: r.score,
        endedAt: r.ended_at,
      };
    });
  }
}

function pNickname(db: import('better-sqlite3').Database, playerId: string): string | null {
  const row = db.prepare('SELECT nickname FROM players WHERE id = ?').get(playerId) as { nickname: string } | undefined;
  return row?.nickname ?? null;
}
