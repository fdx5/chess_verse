import {
  ALL_SQUARES,
  fileOf,
  rankOf,
  squareOf,
  isOffboard,
  KNIGHT_OFFSETS,
  BISHOP_OFFSETS,
  ROOK_OFFSETS,
  type Position,
  type PieceType,
  type Color,
  type Square,
} from '@battle-chess/chess-core';
import { MATERIAL_VALUE, PHASE_WEIGHT, MAX_PHASE, pstMg, pstEg } from './pst';

/** D3 §평가 함수 — 전부 이 파일에 그대로 옮긴 수치. AI Worker 내부에서만 호출된다(메인 스레드 미접근). */

const ISOLATED_PENALTY = -15;
const DOUBLED_PENALTY = -12;
// D3: "통과폰 보너스 (rank 2→7, White 기준 진행 방향)" — 인덱스는 "진행 방향 기준 랭크 번호"(2~7).
const PASSED_BONUS: Record<number, number> = { 2: 5, 3: 10, 4: 20, 5: 40, 6: 70, 7: 120 };
const CONNECTED_PASSED_BONUS = 15;

const PAWN_SHIELD_BONUS = 8;
const KING_OPEN_FILE_PENALTY = -20;
const KING_SEMI_OPEN_FILE_PENALTY = -10;
const KING_ZONE_WEIGHT: Record<PieceType, number> = { p: 0, n: 20, b: 20, r: 40, q: 80, k: 0 };
const KING_SAFETY_TABLE = [0, 0, 10, 25, 50, 80, 130, 200] as const;

const MOBILITY_WEIGHT: Record<PieceType, number> = { p: 0, n: 4, b: 5, r: 2, q: 1, k: 0 };

const BISHOP_PAIR_BONUS = 30;
const ROOK_OPEN_FILE_BONUS = 20;
const ROOK_SEMI_OPEN_FILE_BONUS = 10;

const QUEEN_SLIDE_OFFSETS = [...ROOK_OFFSETS, ...BISHOP_OFFSETS];

function otherColor(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

/**
 * 유사(pseudo-legal) 공격 대상 칸 수를 이동성 지표로 쓴다(D3는 "합법수 1개당"이라고 쓰지만, 임의 색의
 * 완전 합법수 계산은 매 평가마다 체크 필터링 비용이 커서 표준적으로 pseudo-legal 근사를 쓴다 —
 * `docs/DEVIATIONS.md` [Sprint 7] 참조).
 */
function countMobility(pos: Position, sq: Square, type: PieceType, color: Color): number {
  if (type === 'n') {
    let count = 0;
    for (const offset of KNIGHT_OFFSETS) {
      const target = sq + offset;
      if (isOffboard(target)) continue;
      const occ = pos.board[target];
      if (occ === null || occ === undefined || occ.color !== color) count += 1;
    }
    return count;
  }
  const directions = type === 'b' ? BISHOP_OFFSETS : type === 'r' ? ROOK_OFFSETS : type === 'q' ? QUEEN_SLIDE_OFFSETS : [];
  let count = 0;
  for (const offset of directions) {
    let target = sq + offset;
    while (!isOffboard(target)) {
      const occ = pos.board[target];
      if (occ === null || occ === undefined) {
        count += 1;
      } else {
        if (occ.color !== color) count += 1;
        break;
      }
      target += offset;
    }
  }
  return count;
}

export function evaluate(pos: Position): number {
  let mg = 0;
  let eg = 0;
  let phase = 0;

  const pawnCountByFile: Record<Color, number[]> = { w: new Array(8).fill(0) as number[], b: new Array(8).fill(0) as number[] };
  const pawnAnyByFile: number[] = new Array(8).fill(0) as number[];
  let whiteBishops = 0;
  let blackBishops = 0;
  let whiteKingSq: Square | null = null;
  let blackKingSq: Square | null = null;

  for (const sq of ALL_SQUARES) {
    const piece = pos.board[sq];
    if (piece === null || piece === undefined) continue;
    const file = fileOf(sq);
    if (piece.type === 'p') {
      pawnCountByFile[piece.color][file] = (pawnCountByFile[piece.color][file] ?? 0) + 1;
      pawnAnyByFile[file] = (pawnAnyByFile[file] ?? 0) + 1;
    }
    if (piece.type === 'b') {
      if (piece.color === 'w') whiteBishops += 1;
      else blackBishops += 1;
    }
    if (piece.type === 'k') {
      if (piece.color === 'w') whiteKingSq = sq;
      else blackKingSq = sq;
    }
  }

  // 통과폰 여부를 먼저 전부 계산(연결 통과폰 보너스가 다른 통과폰의 존재를 참조하므로).
  const passedSquares = new Set<Square>();
  for (const sq of ALL_SQUARES) {
    const piece = pos.board[sq];
    if (piece === null || piece === undefined || piece.type !== 'p') continue;
    const file = fileOf(sq);
    const rank = rankOf(sq);
    const isWhite = piece.color === 'w';
    const enemy = otherColor(piece.color);
    let passed = true;
    for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1) && passed; f += 1) {
      for (let r = 0; r < 8; r += 1) {
        const ahead = isWhite ? r > rank : r < rank;
        if (!ahead) continue;
        const other = pos.board[squareOf(f, r)];
        if (other !== null && other !== undefined && other.type === 'p' && other.color === enemy) {
          passed = false;
          break;
        }
      }
    }
    if (passed) passedSquares.add(sq);
  }

  for (const sq of ALL_SQUARES) {
    const piece = pos.board[sq];
    if (piece === null || piece === undefined) continue;
    const isWhite = piece.color === 'w';
    const sign = isWhite ? 1 : -1;
    const file = fileOf(sq);
    const rank = rankOf(sq);

    if (piece.type !== 'k') {
      mg += sign * MATERIAL_VALUE[piece.type];
      eg += sign * MATERIAL_VALUE[piece.type];
    }
    mg += sign * pstMg(piece.type, isWhite, file, rank);
    eg += sign * pstEg(piece.type, isWhite, file, rank);
    phase += PHASE_WEIGHT[piece.type];

    if (piece.type !== 'p' && piece.type !== 'k') {
      const mobility = countMobility(pos, sq, piece.type, piece.color) * MOBILITY_WEIGHT[piece.type];
      mg += sign * mobility;
      eg += sign * mobility;
    }

    if (piece.type === 'p') {
      const own = pawnCountByFile[piece.color];
      const leftHas = file > 0 && (own[file - 1] ?? 0) > 0;
      const rightHas = file < 7 && (own[file + 1] ?? 0) > 0;
      if (!leftHas && !rightHas) {
        mg += sign * ISOLATED_PENALTY;
        eg += sign * ISOLATED_PENALTY;
      }
      if (passedSquares.has(sq)) {
        const mappedRank = isWhite ? rank + 1 : 8 - rank;
        let bonus = PASSED_BONUS[mappedRank] ?? 0;
        const leftPassed = file > 0 && passedSquares.has(squareOf(file - 1, rank)) && pos.board[squareOf(file - 1, rank)]?.color === piece.color;
        const rightPassed = file < 7 && passedSquares.has(squareOf(file + 1, rank)) && pos.board[squareOf(file + 1, rank)]?.color === piece.color;
        if (leftPassed || rightPassed) bonus += CONNECTED_PASSED_BONUS;
        mg += sign * bonus;
        eg += sign * bonus;
      }
    }

    if (piece.type === 'r') {
      const anyPawnsOnFile = (pawnAnyByFile[file] ?? 0) > 0;
      const ownPawnsOnFile = (pawnCountByFile[piece.color][file] ?? 0) > 0;
      if (!anyPawnsOnFile) mg += sign * ROOK_OPEN_FILE_BONUS;
      else if (!ownPawnsOnFile) mg += sign * ROOK_SEMI_OPEN_FILE_BONUS;
    }
  }

  // 이중폰: 파일당 초과 폰 1개마다 페널티.
  for (const color of ['w', 'b'] as const) {
    const sign = color === 'w' ? 1 : -1;
    for (let f = 0; f < 8; f += 1) {
      const count = pawnCountByFile[color][f] ?? 0;
      if (count > 1) {
        const penalty = DOUBLED_PENALTY * (count - 1);
        mg += sign * penalty;
        eg += sign * penalty;
      }
    }
  }

  if (whiteBishops >= 2) mg += BISHOP_PAIR_BONUS;
  if (blackBishops >= 2) mg -= BISHOP_PAIR_BONUS;

  mg += kingSafety(pos, whiteKingSq, 'w');
  mg -= kingSafety(pos, blackKingSq, 'b');

  const clampedPhase = Math.min(MAX_PHASE, phase);
  const score = (mg * clampedPhase + eg * (MAX_PHASE - clampedPhase)) / MAX_PHASE;
  return pos.turn === 'w' ? score : -score;
}

function kingSafety(pos: Position, kingSq: Square | null, color: Color): number {
  if (kingSq === null) return 0;
  const file = fileOf(kingSq);
  const rank = rankOf(kingSq);
  const forward = color === 'w' ? 1 : -1;

  let shield = 0;
  for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f += 1) {
    const r = rank + forward;
    if (r < 0 || r > 7) continue;
    const occ = pos.board[squareOf(f, r)];
    if (occ !== null && occ !== undefined && occ.type === 'p' && occ.color === color) shield += PAWN_SHIELD_BONUS;
  }

  let fileSafety = 0;
  for (let f = Math.max(0, file - 1); f <= Math.min(7, file + 1); f += 1) {
    const anyPawns = ALL_SQUARES.some((sq) => fileOf(sq) === f && pos.board[sq]?.type === 'p');
    const ownPawns = ALL_SQUARES.some((sq) => fileOf(sq) === f && pos.board[sq]?.type === 'p' && pos.board[sq]?.color === color);
    if (!anyPawns) fileSafety += KING_OPEN_FILE_PENALTY;
    else if (!ownPawns) fileSafety += KING_SEMI_OPEN_FILE_PENALTY;
  }

  const enemy = otherColor(color);
  let attackWeight = 0;
  for (const sq of ALL_SQUARES) {
    const piece = pos.board[sq];
    if (piece === null || piece === undefined || piece.color !== enemy) continue;
    const dist = Math.max(Math.abs(fileOf(sq) - file), Math.abs(rankOf(sq) - rank));
    if (dist <= 2) attackWeight += KING_ZONE_WEIGHT[piece.type];
  }
  const tableIndex = Math.min(Math.floor(attackWeight / 10), KING_SAFETY_TABLE.length - 1);
  const zonePenalty = -(KING_SAFETY_TABLE[tableIndex] ?? 0);

  return shield + fileSafety + zonePenalty;
}
