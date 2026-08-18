import type { CombatSceneDef } from '../../AnimationRegistry';
import { genericStrike } from './generic.strike';
import { PAWN_COMBAT_SCENES } from './pawn';
import { KNIGHT_COMBAT_SCENES } from './knight';
import { BISHOP_COMBAT_SCENES } from './bishop';
import { ROOK_COMBAT_SCENES } from './rook';
import { QUEEN_COMBAT_SCENES } from './queen';
import { KING_COMBAT_SCENES } from './king';

/** D5-3 §전투 연출 매트릭스 — 공격자 6종 × 방어자 6종 = 36개 조합 전부 + 범용 폴백 1개. */
export const ALL_COMBAT_SCENES: readonly CombatSceneDef[] = [
  genericStrike,
  ...PAWN_COMBAT_SCENES,
  ...KNIGHT_COMBAT_SCENES,
  ...BISHOP_COMBAT_SCENES,
  ...ROOK_COMBAT_SCENES,
  ...QUEEN_COMBAT_SCENES,
  ...KING_COMBAT_SCENES,
];
