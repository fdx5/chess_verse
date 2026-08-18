import {
  fromFEN,
  generateLegalMoves,
  makeMove,
  toSAN,
  getGameResult,
  MoveFlag,
  type Position,
  type Move,
  type Square,
  type PieceType,
  type Color,
  type GameResult,
} from '@battle-chess/chess-core';
import { EventBus } from './EventBus';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface GameEventMap {
  'game:selectionChanged': { square: Square | null; legalTargets: Move[] };
  'game:moveApplied': { move: Move; san: string; prevPosition: Position; nextPosition: Position };
  'game:promotionNeeded': { move: Move; color: Color; resolve: (promo: PieceType) => void };
  'game:gameEnded': { result: GameResult; position: Position };
  /** D6-1 §롤백/재접속 — 서버가 보낸 권위 포지션으로 애니메이션 없이 즉시 스냅한다. */
  'game:positionReset': { position: Position };
}

/** D1 §Game State(FSM) 레이어 — chess-core를 감싸는 로컬 2인(핫시트) 게임 세션. */
export class GameSession {
  readonly bus = new EventBus<GameEventMap>();
  private position: Position;
  private readonly history: Position[];
  private selected: Square | null = null;

  constructor(fen: string = START_FEN) {
    this.position = fromFEN(fen);
    this.history = [this.position];
  }

  getPosition(): Position {
    return this.position;
  }

  getSelected(): Square | null {
    return this.selected;
  }

  select(square: Square | null): void {
    this.selected = square;
    const legalTargets = square === null ? [] : this.legalMovesFrom(square);
    this.bus.emit('game:selectionChanged', { square, legalTargets });
  }

  legalMovesFrom(square: Square): Move[] {
    return generateLegalMoves(this.position).filter((m) => m.from === square);
  }

  /** 프로모션이 필요한데 `move.promo`가 없으면 `game:promotionNeeded`를 emit하고 UI 응답을 기다린다. */
  attemptMove(move: Pick<Move, 'from' | 'to'> & { promo?: PieceType }): boolean {
    const legal = generateLegalMoves(this.position);
    const candidates = legal.filter((m) => m.from === move.from && m.to === move.to);
    if (candidates.length === 0) return false;

    const needsPromotion = candidates.some((m) => (m.flags & MoveFlag.PROMOTION) !== 0);
    if (needsPromotion && move.promo === undefined) {
      const color = this.position.turn;
      this.bus.emit('game:promotionNeeded', {
        move: candidates[0] as Move,
        color,
        resolve: (promo: PieceType) => {
          const chosen = candidates.find((m) => m.promo === promo);
          if (chosen !== undefined) this.commitMove(chosen);
        },
      });
      return true;
    }

    const finalMove = candidates.find((m) => move.promo === undefined || m.promo === move.promo) ?? candidates[0];
    if (finalMove === undefined) return false;
    this.commitMove(finalMove);
    return true;
  }

  /** D6-1 §롤백 UX / D6-6 §재접속 — 서버 권위 FEN으로 즉시 스냅(트윈 없음). */
  loadPosition(fen: string): void {
    this.position = fromFEN(fen);
    this.history.length = 0;
    this.history.push(this.position);
    this.selected = null;
    this.bus.emit('game:positionReset', { position: this.position });
  }

  private commitMove(move: Move): void {
    const san = toSAN(this.position, move);
    const prevPosition = this.position;
    const nextPosition = makeMove(this.position, move);
    this.position = nextPosition;
    this.history.push(nextPosition);
    this.selected = null;
    this.bus.emit('game:moveApplied', { move, san, prevPosition, nextPosition });

    const result = getGameResult(nextPosition, this.history);
    if (result.kind !== 'in_progress') {
      this.bus.emit('game:gameEnded', { result, position: nextPosition });
    }
  }
}
