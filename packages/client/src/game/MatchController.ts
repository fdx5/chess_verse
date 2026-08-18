import { otherColor, toFEN, type Color, type GameResult, type Position } from '@battle-chess/chess-core';
import { EventBus } from './EventBus';
import { GameSession } from './GameSession';
import { buildGameRecord, type LocalGameRecord, type MatchConfig, type MatchOutcome } from './MatchState';

export interface MatchEventMap {
  'match:gameStarted': { gameIndex: number; myColor: Color; session: GameSession };
  'match:gameEnded': { gameIndex: number; result: GameResult; scoreMine: number; scoreOpponent: number };
  // 이름/페이로드는 D1 §이벤트 버스 표(ARCHITECTURE.md)의 `game:matchEnded` 항목과 1:1 — Sprint 9
  // MatchRecorder가 그대로 구독하는 지점이므로 필드명을 임의로 바꾸지 않는다.
  'game:matchEnded': {
    localMatchId: string;
    source: MatchConfig['source'];
    format: MatchConfig['format'];
    scoreMine: number;
    scoreOpponent: number;
    outcome: MatchOutcome;
    games: LocalGameRecord[];
  };
}

function generateId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID !== undefined) return cryptoObj.randomUUID();
  return `id-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

const WIN_SCORE_BO3 = 2;

/**
 * D9 Sprint 8 §MatchController — Bo1/Bo3 매치 흐름을 관장한다. 매치 종료 시 `match:matchEnded`를
 * D1 §이벤트 버스 `game:matchEnded` 페이로드 형태 그대로(필드명 1:1) 발행한다(Sprint 9 MatchRecorder 구독 지점).
 */
export class MatchController {
  readonly bus = new EventBus<MatchEventMap>();
  private readonly localMatchId = generateId();
  private readonly games: LocalGameRecord[] = [];
  private scoreMine = 0;
  private scoreOpponent = 0;
  private gameIndex = 0;
  private session: GameSession;
  private sanMoves: string[] = [];
  private gameStartedAt = Date.now();
  private unsubscribeMove: (() => void) | null = null;

  constructor(private readonly config: MatchConfig) {
    this.session = new GameSession();
    this.wireSession();
  }

  getSession(): GameSession {
    return this.session;
  }

  getGameIndex(): number {
    return this.gameIndex;
  }

  getMyColorForCurrentGame(): Color {
    // D6 §Bo3 매치 상태 관리: 판마다 색 교대.
    return this.gameIndex % 2 === 0 ? this.config.myColorGame1 : otherColor(this.config.myColorGame1);
  }

  getScore(): { mine: number; opponent: number } {
    return { mine: this.scoreMine, opponent: this.scoreOpponent };
  }

  isMatchComplete(): boolean {
    if (this.config.format === 'bo1') return this.games.length >= 1;
    return this.scoreMine >= WIN_SCORE_BO3 || this.scoreOpponent >= WIN_SCORE_BO3 || this.games.length >= 3;
  }

  /** 인터미션 이후 다음 판을 시작한다. 매치가 이미 끝났으면 아무 것도 하지 않는다. */
  startNextGame(): void {
    if (this.isMatchComplete()) return;
    this.unsubscribeMove?.();
    this.session = new GameSession();
    this.sanMoves = [];
    this.gameStartedAt = Date.now();
    this.wireSession();
    this.bus.emit('match:gameStarted', { gameIndex: this.gameIndex, myColor: this.getMyColorForCurrentGame(), session: this.session });
  }

  private wireSession(): void {
    this.unsubscribeMove = this.session.bus.on('game:moveApplied', ({ san }) => {
      this.sanMoves.push(san);
    });
    this.session.bus.on('game:gameEnded', ({ result, position }) => {
      this.onGameEnded(result, position);
    });
  }

  private onGameEnded(result: GameResult, position: Position): void {
    const myColor = this.getMyColorForCurrentGame();
    const record = buildGameRecord({
      localGameId: generateId(),
      localMatchId: this.localMatchId,
      gameIndex: this.gameIndex,
      myColor,
      result,
      movesSan: this.sanMoves,
      finalFen: toFEN(position),
      startedAt: this.gameStartedAt,
      endedAt: Date.now(),
    });
    this.games.push(record);

    if (record.result === 'draw') {
      this.scoreMine += 0.5;
      this.scoreOpponent += 0.5;
    } else if (record.result === (myColor === 'w' ? 'white' : 'black')) {
      this.scoreMine += 1;
    } else {
      this.scoreOpponent += 1;
    }

    this.gameIndex += 1;
    this.bus.emit('match:gameEnded', { gameIndex: this.gameIndex - 1, result, scoreMine: this.scoreMine, scoreOpponent: this.scoreOpponent });

    if (this.isMatchComplete()) {
      const outcome: MatchOutcome = this.scoreMine > this.scoreOpponent ? 'win' : this.scoreMine < this.scoreOpponent ? 'loss' : 'draw';
      this.bus.emit('game:matchEnded', {
        localMatchId: this.localMatchId,
        source: this.config.source,
        format: this.config.format,
        scoreMine: this.scoreMine,
        scoreOpponent: this.scoreOpponent,
        outcome,
        games: this.games,
      });
    }
  }
}
