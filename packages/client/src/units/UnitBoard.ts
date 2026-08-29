import * as THREE from 'three';
import {
  fileOf,
  rankOf,
  squareOf,
  MoveFlag,
  type Position,
  type Move,
  type Square,
  type PieceType,
  type Color,
} from '@battle-chess/chess-core';
import type { UnitInstance, UnitProvider, QualityTier } from './UnitProvider';
import { AnimationRegistry } from '../anim/AnimationRegistry';
import { compileClip } from '../anim/AnimClipCompiler';
import { MOVEMENT_PROFILES } from '../anim/movementClips';

const BOARD_HALF = 4.0;

/** 백은 +Z(흑 진영), 흑은 -Z(백 진영)를 향한다. */
export function facingRotationY(color: Color): number {
  return color === 'w' ? 0 : Math.PI;
}

// 사용자 요청 — 다리가 있는 기물(Pawn/Knight/King)은 이동 중 걷는 것처럼 다리를 움직인다.
// 이동 소요시간(초 단위, 칸수와 무관하게 고정된 보폭 주기)에 맞춰 넓적다리를 좌우 교대로
// 흔들고 앞으로 나가는 쪽 무릎을 굽힌다. Bishop(부유)·Rook(석탑)·Queen(드레스로 다리가 가려짐)은
// 대상에서 제외한다.
const LEGGED_PIECE_TYPES = new Set<PieceType>(['p', 'n', 'k']);
const STRIDE_HZ = 2.2;
const LEG_SWING_AMPLITUDE = 0.5;
const KNEE_BEND_AMPLITUDE = 0.55;

function applyWalkCycle(unit: UnitInstance, elapsedSec: number): void {
  const thighL = unit.bones['thigh.L'];
  const thighR = unit.bones['thigh.R'];
  if (thighL === undefined || thighR === undefined) return;
  const phase = elapsedSec * STRIDE_HZ * Math.PI * 2;
  const swing = Math.sin(phase);
  thighL.rotation.x = swing * LEG_SWING_AMPLITUDE;
  thighR.rotation.x = -swing * LEG_SWING_AMPLITUDE;
  const kneeL = unit.bones['knee.L'];
  const kneeR = unit.bones['knee.R'];
  if (kneeL !== undefined) kneeL.rotation.x = Math.max(0, -swing) * KNEE_BEND_AMPLITUDE;
  if (kneeR !== undefined) kneeR.rotation.x = Math.max(0, swing) * KNEE_BEND_AMPLITUDE;
}

function resetWalkCycle(unit: UnitInstance): void {
  const bones = unit.bones;
  ['thigh.L', 'thigh.R', 'knee.L', 'knee.R'].forEach((name) => {
    const bone = bones[name];
    if (bone !== undefined) bone.rotation.x = 0;
  });
}

/**
 * 사용자 요청 §폰 발판 — 조각된 폰처럼 캐릭터가 별도 발판(pedestal) 위에 서 있는 애셋은, 이동 중
 * 발판에서 내려와 실제 지면(y=0)을 걷는 것처럼 보여야 한다. `character`/`pedestal`이라는 이름의
 * 자식 노드가 있는 애셋에서만 동작하는 범용 메커니즘이라 다른(발판 없는) 기물에는 영향이 없다.
 * `character` 메시 정점은 "발판 위에 선" 기본 상태로 이미 구워져 있으므로(rest = y 오프셋 0),
 * 이동 중에는 애셋에 구운 `userData.transitDropY`(glTF node extras → three.js userData로 전달됨)
 * 만큼 아래로 내려 발이 실제 지면에 닿게 하고, 이동이 끝나면 0으로 되돌린다.
 */
function setPedestalStanding(unit: UnitInstance, standing: boolean): void {
  const pedestal = unit.root.getObjectByName('pedestal');
  const character = unit.root.getObjectByName('character');
  if (pedestal === undefined || character === undefined) return;

  const dropY = typeof character.userData['transitDropY'] === 'number' ? (character.userData['transitDropY'] as number) : 0;
  pedestal.visible = standing;
  character.position.y = standing ? 0 : -dropY;
}

export function squareToWorld(sq: Square): [number, number] {
  return [fileOf(sq) - BOARD_HALF + 0.5, rankOf(sq) - BOARD_HALF + 0.5];
}

interface ActiveMove {
  unit: UnitInstance;
  type: PieceType;
  start: [number, number];
  end: [number, number];
  elapsed: number;
  duration: number;
  pathFn: (typeof MOVEMENT_PROFILES)['p']['path'];
}

/**
 * `packages/client/src/units/UnitBoard.ts` — D9 Sprint 4 산출 파일 목록에는 없는 추가 파일(`docs/DEVIATIONS.md` 기록).
 * chess-core `Position` ↔ 씬 그래프의 `UnitInstance` 32개를 동기화하고, D5-2 이동 애니메이션과
 * 합법수 하이라이트(D7)를 담당한다.
 */
export class UnitBoard {
  private readonly unitsBySquare = new Map<Square, UnitInstance>();
  private readonly unitColors = new WeakMap<UnitInstance, Color>();
  private readonly activeMoves: ActiveMove[] = [];
  private readonly highlightGroup = new THREE.Group();
  private readonly dotGeom: THREE.BufferGeometry;
  private readonly ringGeom: THREE.BufferGeometry;
  private readonly dotMat: THREE.MeshBasicMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly unitFactory: UnitProvider,
    private readonly animationRegistry: AnimationRegistry,
    private readonly quality: QualityTier
  ) {
    this.highlightGroup.name = 'highlights';
    scene.add(this.highlightGroup);
    this.dotGeom = new THREE.CircleGeometry(0.09, 20);
    this.ringGeom = new THREE.RingGeometry(0.32, 0.4, 24);
    this.dotMat = new THREE.MeshBasicMaterial({ color: '#0057E7', transparent: true, opacity: 0.96, depthWrite: false });
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#D4535A', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  }

  initFromPosition(position: Position): void {
    for (const unit of this.unitsBySquare.values()) unit.dispose();
    this.unitsBySquare.clear();

    for (let rank = 0; rank < 8; rank += 1) {
      for (let file = 0; file < 8; file += 1) {
        const sq = squareOf(file, rank);
        const piece = position.board[sq];
        if (piece === null || piece === undefined) continue;
        this.spawn(sq, piece.type, piece.color);
      }
    }
  }

  private spawn(square: Square, type: PieceType, color: Color): UnitInstance {
    const instance = this.unitFactory.create(type, color, this.quality);
    const [x, z] = squareToWorld(square);
    instance.root.position.set(x, 0, z);
    this.unitColors.set(instance, color);
    this.restoreUnitFacing(instance);
    instance.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        // Pawn feet sit directly under a dense single-piece skinned mesh, which
        // caused strong self-shadow patches on the ankles and feet. Pawns still
        // cast onto the board; they simply do not receive their own shadow map.
        obj.receiveShadow = type !== 'p';
      }
    });
    this.scene.add(instance.root);

    const idleDef = this.animationRegistry.getIdleClip(type);
    const action = instance.mixer.clipAction(compileClip(idleDef));
    action.play();

    this.unitsBySquare.set(square, instance);
    return instance;
  }

  getUnitAt(square: Square): UnitInstance | undefined {
    return this.unitsBySquare.get(square);
  }

  /** CombatDirector(Sprint 5)가 전투 연출 종료 시점에 방어자를 제거하기 위해 사용하는 공개 API. */
  removeUnitAt(square: Square): void {
    this.removeAt(square);
  }

  /** CombatDirector가 클램프 이동 종료 후 공격자를 최종 칸으로 순간 스냅·재등록할 때 사용한다. */
  relocateUnit(from: Square, to: Square): void {
    const unit = this.unitsBySquare.get(from);
    if (unit === undefined) return;
    this.unitsBySquare.delete(from);
    this.unitsBySquare.set(to, unit);
    const [x, z] = squareToWorld(to);
    unit.root.position.set(x, 0, z);
    this.restoreUnitFacing(unit);
  }

  /** 전투 연출 등에서 임시 변경된 루트 회전을 진영의 정면 방향으로 되돌린다. */
  restoreFacingAt(square: Square): void {
    const unit = this.unitsBySquare.get(square);
    if (unit !== undefined) this.restoreUnitFacing(unit);
  }

  private restoreUnitFacing(unit: UnitInstance): void {
    const color = this.unitColors.get(unit);
    if (color === undefined) return;
    unit.root.rotation.set(0, facingRotationY(color), 0);
  }

  private removeAt(square: Square): void {
    const unit = this.unitsBySquare.get(square);
    if (unit === undefined) return;
    unit.dispose();
    this.unitsBySquare.delete(square);
  }

  /** D5-2 이동 애니메이션 시작 — 캐슬링/앙파상/프로모션을 전부 처리한다(D9 Sprint 4 DoD). */
  applyMove(move: Move, prevPosition: Position): void {
    const mover = this.unitsBySquare.get(move.from);
    if (mover === undefined) throw new Error(`UnitBoard.applyMove: no unit at from-square`);
    const movingPiece = prevPosition.board[move.from];
    if (movingPiece === null || movingPiece === undefined) throw new Error('UnitBoard.applyMove: from-square is empty in prevPosition');

    const isCapture = (move.flags & MoveFlag.CAPTURE) !== 0;
    const isEnPassant = (move.flags & MoveFlag.EN_PASSANT) !== 0;
    const isCastleK = (move.flags & MoveFlag.CASTLE_K) !== 0;
    const isCastleQ = (move.flags & MoveFlag.CASTLE_Q) !== 0;
    const isPromotion = (move.flags & MoveFlag.PROMOTION) !== 0;

    if (isEnPassant) {
      const capturedSquare = squareOf(fileOf(move.to), rankOf(move.from));
      this.removeAt(capturedSquare);
    } else if (isCapture) {
      this.removeAt(move.to);
    }

    this.unitsBySquare.delete(move.from);
    this.unitsBySquare.set(move.to, mover);
    this.queueMovement(mover, movingPiece.type, move.from, move.to);

    if (isCastleK || isCastleQ) {
      const rank = rankOf(move.from);
      const rookFrom = squareOf(isCastleK ? 7 : 0, rank);
      const rookTo = squareOf(isCastleK ? 5 : 3, rank);
      const rook = this.unitsBySquare.get(rookFrom);
      if (rook !== undefined) {
        this.unitsBySquare.delete(rookFrom);
        this.unitsBySquare.set(rookTo, rook);
        this.queueMovement(rook, 'r', rookFrom, rookTo);
      }
    }

    if (isPromotion && move.promo !== undefined) {
      this.removeAt(move.to);
      this.unitsBySquare.delete(move.to);
      const promoted = this.spawn(move.to, move.promo, movingPiece.color);
      const [x, z] = squareToWorld(move.to);
      promoted.root.position.set(x, 0, z);
    }
  }

  private queueMovement(unit: UnitInstance, type: PieceType, from: Square, to: Square): void {
    const profile = MOVEMENT_PROFILES[type];
    const squares = Math.max(Math.abs(fileOf(to) - fileOf(from)), Math.abs(rankOf(to) - rankOf(from))) || 1;
    setPedestalStanding(unit, false);
    this.activeMoves.push({
      unit,
      type,
      start: squareToWorld(from),
      end: squareToWorld(to),
      elapsed: 0,
      duration: profile.duration(squares),
      pathFn: profile.path,
    });
  }

  update(dtSeconds: number): void {
    for (const unit of this.unitsBySquare.values()) unit.mixer.update(dtSeconds);

    if (this.activeMoves.length === 0) return;
    for (let i = this.activeMoves.length - 1; i >= 0; i -= 1) {
      const move = this.activeMoves[i];
      if (move === undefined) continue;
      move.elapsed += dtSeconds;
      const t = Math.min(1, move.elapsed / move.duration);
      const pos = move.pathFn(move.start, move.end, t);
      move.unit.root.position.copy(pos);
      if (LEGGED_PIECE_TYPES.has(move.type)) applyWalkCycle(move.unit, move.elapsed);
      if (t >= 1) {
        if (LEGGED_PIECE_TYPES.has(move.type)) resetWalkCycle(move.unit);
        setPedestalStanding(move.unit, true);
        this.restoreUnitFacing(move.unit);
        this.activeMoves.splice(i, 1);
      }
    }
  }

  isAnimating(): boolean {
    return this.activeMoves.length > 0;
  }

  showHighlights(selected: Square | null, targets: readonly Move[]): void {
    this.clearHighlights();
    if (selected === null) return;
    for (const move of targets) {
      const [x, z] = squareToWorld(move.to);
      const isCapture = (move.flags & MoveFlag.CAPTURE) !== 0;
      const mesh = new THREE.Mesh(isCapture ? this.ringGeom : this.dotGeom, isCapture ? this.ringMat : this.dotMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.01, z);
      this.highlightGroup.add(mesh);
    }
  }

  clearHighlights(): void {
    while (this.highlightGroup.children.length > 0) {
      const child = this.highlightGroup.children[0];
      if (child === undefined) break;
      this.highlightGroup.remove(child);
    }
  }
}
