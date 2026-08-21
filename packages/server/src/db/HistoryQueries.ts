import type { Client } from '@libsql/client';
import type { Color } from '@battle-chess/chess-core';
import type { Difficulty, GameEndReason, MatchDetailDto, MatchFormat, MatchHistoryPage, MatchOutcome, MatchSource, MatchSummaryDto, PlayerStatsBucket, PlayerStatsDto, PublicMatchLogPageDto, TimeControlKind } from '@battle-chess/protocol';

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

/** D10-6 §히스토리 조회 — Turso 클라우드/Libsql 비동기 쿼리 계층. */
export class HistoryQueries {
  constructor(private readonly client: Client) {}

  /** 전적 로그 화면용 전체 사용자 최근 대전 목록. */
  async listPublicMatches(limit: number, before?: number): Promise<PublicMatchLogPageDto> {
    const cappedLimit = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
    const cursor = before ?? Number.MAX_SAFE_INTEGER;
    const res = await this.client.execute({
      sql: `SELECT id, source, white_label, black_label, score_white, score_black,
                   result, game_count, ended_at
            FROM matches WHERE ended_at < ?
            ORDER BY ended_at DESC LIMIT ?`,
      args: [cursor, cappedLimit + 1],
    });
    const totalRes = await this.client.execute('SELECT COUNT(*) AS c FROM matches');
    const hasMore = res.rows.length > cappedLimit;
    const rows = hasMore ? res.rows.slice(0, cappedLimit) : res.rows;
    const matches = rows.map((row) => ({
      matchId: String(row['id']),
      source: row['source'] as MatchSource,
      whiteLabel: String(row['white_label']),
      blackLabel: String(row['black_label']),
      scoreWhite: Number(row['score_white']),
      scoreBlack: Number(row['score_black']),
      result: row['result'] as 'white' | 'black' | 'draw' | 'aborted',
      gameCount: Number(row['game_count']),
      endedAt: Number(row['ended_at']),
    }));
    const last = matches[matches.length - 1];
    return { matches, nextBefore: hasMore && last !== undefined ? last.endedAt : null, totalCount: Number(totalRes.rows[0]?.['c'] ?? 0) };
  }

  async listMatches(playerId: string, limit: number, before?: number): Promise<MatchHistoryPage> {
    const cappedLimit = Math.min(Math.max(Math.trunc(limit) || 20, 1), 50);
    const cursor = before ?? Number.MAX_SAFE_INTEGER;
    const res = await this.client.execute({
      sql: `SELECT * FROM matches
            WHERE (player_white_id = ? OR player_black_id = ?) AND ended_at < ?
            ORDER BY ended_at DESC LIMIT ?`,
      args: [playerId, playerId, cursor, cappedLimit + 1],
    });

    const rows: MatchRow[] = res.rows.map((r) => ({
      id: String(r['id']),
      source: r['source'] as MatchSource,
      format: r['format'] as MatchFormat,
      player_white_id: r['player_white_id'] !== null ? String(r['player_white_id']) : null,
      player_black_id: r['player_black_id'] !== null ? String(r['player_black_id']) : null,
      white_label: String(r['white_label']),
      black_label: String(r['black_label']),
      time_control: r['time_control'] as TimeControlKind,
      score_white: Number(r['score_white']),
      score_black: Number(r['score_black']),
      result: r['result'] as 'white' | 'black' | 'draw' | 'aborted',
      game_count: Number(r['game_count']),
      started_at: Number(r['started_at']),
      ended_at: Number(r['ended_at']),
      verified: Number(r['verified']),
    }));

    const totalRes = await this.client.execute({
      sql: 'SELECT COUNT(*) as c FROM matches WHERE player_white_id = ? OR player_black_id = ?',
      args: [playerId, playerId],
    });
    const totalCount = Number(totalRes.rows[0]?.['c'] ?? 0);

    const hasMore = rows.length > cappedLimit;
    const page = hasMore ? rows.slice(0, cappedLimit) : rows;
    const lastRow = page[page.length - 1];
    return {
      matches: page.map((r) => rowToSummary(r, playerId)),
      nextBefore: hasMore && lastRow !== undefined ? lastRow.ended_at : null,
      totalCount,
    };
  }

  async getMatchDetail(matchId: string, requesterId: string): Promise<MatchDetailDto | null> {
    const res = await this.client.execute({
      sql: 'SELECT * FROM matches WHERE id = ?',
      args: [matchId],
    });
    const r = res.rows[0];
    if (!r) return null;

    const row: MatchRow = {
      id: String(r['id']),
      source: r['source'] as MatchSource,
      format: r['format'] as MatchFormat,
      player_white_id: r['player_white_id'] !== null ? String(r['player_white_id']) : null,
      player_black_id: r['player_black_id'] !== null ? String(r['player_black_id']) : null,
      white_label: String(r['white_label']),
      black_label: String(r['black_label']),
      time_control: r['time_control'] as TimeControlKind,
      score_white: Number(r['score_white']),
      score_black: Number(r['score_black']),
      result: r['result'] as 'white' | 'black' | 'draw' | 'aborted',
      game_count: Number(r['game_count']),
      started_at: Number(r['started_at']),
      ended_at: Number(r['ended_at']),
      verified: Number(r['verified']),
    };

    if (row.player_white_id !== requesterId && row.player_black_id !== requesterId) return null;

    const gameRes = await this.client.execute({
      sql: 'SELECT * FROM games WHERE match_id = ? ORDER BY game_index ASC',
      args: [matchId],
    });

    const gameRows: GameRow[] = gameRes.rows.map((g) => ({
      game_index: Number(g['game_index']),
      white_player_id: g['white_player_id'] !== null ? String(g['white_player_id']) : null,
      black_player_id: g['black_player_id'] !== null ? String(g['black_player_id']) : null,
      result: g['result'] as 'white' | 'black' | 'draw',
      reason: g['reason'] as GameEndReason,
      ply_count: Number(g['ply_count']),
      moves_san: g['moves_san'] !== null ? String(g['moves_san']) : null,
      moves_truncated: Number(g['moves_truncated']),
      final_fen: String(g['final_fen']),
      started_at: Number(g['started_at']),
      ended_at: Number(g['ended_at']),
    }));

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

  async getStats(playerId: string): Promise<PlayerStatsDto | null> {
    const playerRes = await this.client.execute({
      sql: 'SELECT id, nickname FROM players WHERE id = ?',
      args: [playerId],
    });
    const player = playerRes.rows[0];
    if (!player) return null;

    const res = await this.client.execute({
      sql: 'SELECT * FROM matches WHERE player_white_id = ? OR player_black_id = ? ORDER BY ended_at ASC',
      args: [playerId, playerId],
    });

    const rows: MatchRow[] = res.rows.map((r) => ({
      id: String(r['id']),
      source: r['source'] as MatchSource,
      format: r['format'] as MatchFormat,
      player_white_id: r['player_white_id'] !== null ? String(r['player_white_id']) : null,
      player_black_id: r['player_black_id'] !== null ? String(r['player_black_id']) : null,
      white_label: String(r['white_label']),
      black_label: String(r['black_label']),
      time_control: r['time_control'] as TimeControlKind,
      score_white: Number(r['score_white']),
      score_black: Number(r['score_black']),
      result: r['result'] as 'white' | 'black' | 'draw' | 'aborted',
      game_count: Number(r['game_count']),
      started_at: Number(r['started_at']),
      ended_at: Number(r['ended_at']),
      verified: Number(r['verified']),
    }));

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

    return { playerId, nickname: String(player['nickname']), verified, local, bySource, firstPlayedAt, lastPlayedAt };
  }

  /** CPU 대전 난이도별 순위표 조회 (점수 내림차순, 소요시간 오름차순) */
  async getLeaderboard(difficulty: Difficulty, limit = 50): Promise<import('@battle-chess/protocol').LeaderboardEntryDto[]> {
    const cappedLimit = Math.min(Math.max(limit, 1), 100);
    const res = await this.client.execute({
      sql: `
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
      `,
      args: [difficulty, cappedLimit],
    });

    const entries: import('@battle-chess/protocol').LeaderboardEntryDto[] = [];
    for (let index = 0; index < res.rows.length; index++) {
      const r = res.rows[index];
      if (!r) continue;
      const playerId = String(r['player_id']);
      let nick = r['nickname'] !== null ? String(r['nickname']) : '';
      if (!nick || nick === '(나)') {
        nick = (await this.pNickname(playerId)) ?? '플레이어';
      }

      entries.push({
        rank: index + 1,
        matchId: String(r['match_id']),
        playerId,
        nickname: nick,
        cpuDifficulty: r['cpu_difficulty'] as Difficulty,
        durationSeconds: Math.max(1, Number(r['duration_seconds'])),
        piecesLost: Number(r['pieces_lost']),
        score: Number(r['score']),
        endedAt: Number(r['ended_at']),
      });
    }

    return entries;
  }

  private async pNickname(playerId: string): Promise<string | null> {
    const res = await this.client.execute({
      sql: 'SELECT nickname FROM players WHERE id = ?',
      args: [playerId],
    });
    const row = res.rows[0];
    return row && row['nickname'] !== undefined ? String(row['nickname']) : null;
  }
}
