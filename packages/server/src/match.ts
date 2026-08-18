import { randomUUID } from 'node:crypto';
import { fromFEN, toFEN, generateLegalMoves, makeMove, getGameResult, otherColor, type Color, type Move, type Position, type GameResult } from '@battle-chess/chess-core';
import type { GameEndReason, MatchFormat, MoveRejectReason, TimeControlPreset } from '@battle-chess/protocol';
import { ServerClock } from './clock.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const WIN_SCORE_BO3 = 2;

export interface MatchPlayer {
  playerId: string;
  displayName: string;
  sessionToken: string;
}

export interface GameRecord {
  gameIndex: number;
  result: 'white' | 'black' | 'draw';
  reason: GameEndReason;
}

export type MoveApplyResult = { accepted: true; resultingFen: string; move: Move } | { accepted: false; reason: MoveRejectReason };

/** D6-3/D6-4 §룸/매치 생명주기 + Bo3 색 교대/스코어 관리. chess-core를 그대로 재사용해 모든 수를 재검증한다. */
export class MatchState {
  readonly matchId = randomUUID();
  readonly playerAColorGame1: Color = Math.random() < 0.5 ? 'w' : 'b';
  gameIndex = 0;
  phase: 'active' | 'intermission' | 'ended' = 'active';
  position: Position;
  moveHistory: Move[] = [];
  private positionHistory: Position[];
  clock: ServerClock;
  readonly scoreByPlayerId: Record<string, number> = {};
  readonly games: GameRecord[] = [];

  constructor(
    readonly playerA: MatchPlayer,
    readonly playerB: MatchPlayer,
    readonly format: MatchFormat,
    readonly timeControl: TimeControlPreset
  ) {
    this.position = fromFEN(START_FEN);
    this.positionHistory = [this.position];
    this.clock = new ServerClock(timeControl, Date.now());
    this.scoreByPlayerId[playerA.playerId] = 0;
    this.scoreByPlayerId[playerB.playerId] = 0;
  }

  /** D6-4: 게임1 무작위 배정, 게임2 반대색, 게임3(있다면) 게임1과 동일 배정. */
  private colorForGame(gameIndex: number, isPlayerA: boolean): Color {
    const aColor = gameIndex % 2 === 0 ? this.playerAColorGame1 : otherColor(this.playerAColorGame1);
    return isPlayerA ? aColor : otherColor(aColor);
  }

  getColorOf(playerId: string): Color {
    const isPlayerA = playerId === this.playerA.playerId;
    return this.colorForGame(this.gameIndex, isPlayerA);
  }

  getOpponent(playerId: string): MatchPlayer {
    return playerId === this.playerA.playerId ? this.playerB : this.playerA;
  }

  getPlayerByColor(color: Color): MatchPlayer {
    return this.getColorOf(this.playerA.playerId) === color ? this.playerA : this.playerB;
  }

  applyMove(playerId: string, requestedMove: Pick<Move, 'from' | 'to' | 'promo'>, clientTs: number, serverRecvTs: number): MoveApplyResult {
    if (this.phase !== 'active') return { accepted: false, reason: 'gameOver' };
    const myColor = this.getColorOf(playerId);
    if (this.position.turn !== myColor) return { accepted: false, reason: 'notYourTurn' };

    const legal = generateLegalMoves(this.position);
    const match = legal.find((m) => m.from === requestedMove.from && m.to === requestedMove.to && (requestedMove.promo === undefined || m.promo === requestedMove.promo));
    if (match === undefined) return { accepted: false, reason: 'illegal' };

    this.clock.applyMove(myColor, clientTs, serverRecvTs);
    this.position = makeMove(this.position, match);
    this.moveHistory.push(match);
    this.positionHistory.push(this.position);
    return { accepted: true, resultingFen: toFEN(this.position), move: match };
  }

  getResult(): GameResult {
    return getGameResult(this.position, this.positionHistory);
  }

  isTimeExpiredFor(color: Color, now: number): boolean {
    return this.clock.isExpired(color, now);
  }

  /** 게임 하나가 끝났을 때 호출 — 점수 반영 + Bo3 매치 종료 여부 판정. */
  recordGameEnd(result: 'white' | 'black' | 'draw', reason: GameEndReason): { matchComplete: boolean } {
    this.games.push({ gameIndex: this.gameIndex, result, reason });

    if (result === 'draw') {
      this.scoreByPlayerId[this.playerA.playerId] = (this.scoreByPlayerId[this.playerA.playerId] ?? 0) + 0.5;
      this.scoreByPlayerId[this.playerB.playerId] = (this.scoreByPlayerId[this.playerB.playerId] ?? 0) + 0.5;
    } else {
      const winnerColor: Color = result === 'white' ? 'w' : 'b';
      const winner = this.getPlayerByColor(winnerColor);
      this.scoreByPlayerId[winner.playerId] = (this.scoreByPlayerId[winner.playerId] ?? 0) + 1;
    }

    this.gameIndex += 1;
    const scoreA = this.scoreByPlayerId[this.playerA.playerId] ?? 0;
    const scoreB = this.scoreByPlayerId[this.playerB.playerId] ?? 0;
    const matchComplete = this.format === 'bo1' ? this.games.length >= 1 : scoreA >= WIN_SCORE_BO3 || scoreB >= WIN_SCORE_BO3 || this.games.length >= 3;

    this.phase = matchComplete ? 'ended' : 'intermission';
    return { matchComplete };
  }

  startNextGame(): void {
    this.position = fromFEN(START_FEN);
    this.positionHistory = [this.position];
    this.moveHistory = [];
    this.clock = new ServerClock(this.timeControl, Date.now());
    this.phase = 'active';
  }

  /** 이탈(abandon) 처리 — 남은 판 전부를 상대 승리로 몰수 처리하고 매치를 즉시 종료한다(D6-7). */
  abandonBy(playerId: string): { winnerPlayerId: string } {
    const winner = this.getOpponent(playerId);
    this.recordGameEnd(this.getColorOf(winner.playerId) === 'w' ? 'white' : 'black', 'abandon');
    this.phase = 'ended';
    return { winnerPlayerId: winner.playerId };
  }
}
