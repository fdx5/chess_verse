import type { CastlingRights, Color, Piece, PieceType, Position, Square } from './types.js';
import { algebraicToSquare, squareOf, squareToAlgebraic } from './board.js';
import { zobristHash } from './zobrist.js';

const PIECE_LETTERS: Record<PieceType, string> = {
  p: 'p',
  n: 'n',
  b: 'b',
  r: 'r',
  q: 'q',
  k: 'k',
};

function pieceToChar(piece: Piece): string {
  const letter = PIECE_LETTERS[piece.type];
  return piece.color === 'w' ? letter.toUpperCase() : letter;
}

function charToPiece(ch: string): Piece {
  const lower = ch.toLowerCase() as PieceType;
  const color: Color = ch === ch.toUpperCase() ? 'w' : 'b';
  return { type: lower, color };
}

export function toFEN(pos: Position): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const sq = squareOf(file, rank);
      const piece = pos.board[sq];
      if (!piece) {
        empty++;
      } else {
        if (empty > 0) {
          row += String(empty);
          empty = 0;
        }
        row += pieceToChar(piece);
      }
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  const boardPart = rows.join('/');

  const turnPart = pos.turn;

  let castlingPart = '';
  if (pos.castling.wk) castlingPart += 'K';
  if (pos.castling.wq) castlingPart += 'Q';
  if (pos.castling.bk) castlingPart += 'k';
  if (pos.castling.bq) castlingPart += 'q';
  if (castlingPart === '') castlingPart = '-';

  const epPart = pos.epSquare !== null ? squareToAlgebraic(pos.epSquare) : '-';

  return `${boardPart} ${turnPart} ${castlingPart} ${epPart} ${pos.halfmoveClock} ${pos.fullmoveNumber}`;
}

export function fromFEN(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  const [boardPart, turnPart, castlingPart, epPart, halfmovePart, fullmovePart] = parts;
  if (!boardPart || !turnPart) {
    throw new Error(`Invalid FEN: ${fen}`);
  }

  const board: (Piece | null)[] = new Array(128).fill(null);
  const ranks = boardPart.split('/');
  if (ranks.length !== 8) {
    throw new Error(`Invalid FEN board: ${boardPart}`);
  }
  for (let i = 0; i < 8; i++) {
    const rank = 7 - i;
    const rowStr = ranks[i] ?? '';
    let file = 0;
    for (const ch of rowStr) {
      if (/\d/.test(ch)) {
        file += Number(ch);
      } else {
        const sq = squareOf(file, rank);
        board[sq] = charToPiece(ch);
        file++;
      }
    }
  }

  const turn: Color = turnPart === 'b' ? 'b' : 'w';

  const castling: CastlingRights = {
    wk: castlingPart?.includes('K') ?? false,
    wq: castlingPart?.includes('Q') ?? false,
    bk: castlingPart?.includes('k') ?? false,
    bq: castlingPart?.includes('q') ?? false,
  };

  const epSquare: Square | null =
    epPart && epPart !== '-' ? algebraicToSquare(epPart) : null;

  const halfmoveClock = halfmovePart ? Number(halfmovePart) : 0;
  const fullmoveNumber = fullmovePart ? Number(fullmovePart) : 1;

  const partial: Position = {
    board,
    turn,
    castling,
    epSquare,
    halfmoveClock,
    fullmoveNumber,
    hash: 0n,
  };
  return { ...partial, hash: zobristHash(partial) };
}
