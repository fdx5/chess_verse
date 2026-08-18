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

export function squareToWorld(sq: Square): [number, number] {
  return [fileOf(sq) - BOARD_HALF + 0.5, rankOf(sq) - BOARD_HALF + 0.5];
}

interface ActiveMove {
  unit: UnitInstance;
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
    this.dotMat = new THREE.MeshBasicMaterial({ color: '#F2E8D5', transparent: true, opacity: 0.85, depthWrite: false });
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
    if (color === 'b') instance.root.rotation.y = Math.PI;
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
    this.activeMoves.push({
      unit,
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
      if (t >= 1) this.activeMoves.splice(i, 1);
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
