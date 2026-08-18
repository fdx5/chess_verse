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
} from '@battle-chess/chess-core';
import type { UnitBoard } from '../units/UnitBoard';
import { squareToWorld } from '../units/UnitBoard';
import type { OrbitCameraRig } from '../engine/Camera';
import { AnimationRegistry, type CombatSceneDef, type VfxCueDef, type SfxCueDef } from './AnimationRegistry';
import { CameraRig } from './CameraRig';
import { SoundRegistry } from '../audio/SoundRegistry';
import { MOVEMENT_PROFILES } from './movementClips';

export type CinematicPacing = 'full' | 'short' | 'off';
type Phase = 'playing' | 'restoring';

/**
 * D5-1/D5-3/D5-4/D5-5 §전투 연출 오케스트레이터. `AnimationRegistry.getCombatScene()`으로 얻은
 * 순수 데이터만 재생하며, 신규 연출 추가 시 이 파일은 절대 수정되지 않는다(R12 핵심 보장 — Sprint 6에서
 * 36개 조합을 등록해도 이 클래스 diff가 0이어야 한다).
 */
export class CombatDirector {
  private pacing: CinematicPacing = 'full';
  private readonly cameraRig: CameraRig;
  private active: {
    scene: CombatSceneDef;
    attackerType: PieceType;
    attackerSquare: Square;
    defenderSquare: Square;
    attackerFrom: Square;
    elapsed: number;
    totalDuration: number;
    approachDuration: number;
    firedVfx: Set<VfxCueDef>;
    firedSfx: Set<SfxCueDef>;
    phase: Phase;
    resolve: () => void;
  } | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly unitBoard: UnitBoard,
    orbitCameraRig: OrbitCameraRig,
    private readonly animationRegistry: AnimationRegistry,
    private readonly soundRegistry: SoundRegistry
  ) {
    this.cameraRig = new CameraRig(orbitCameraRig);
  }

  setPacing(pacing: CinematicPacing): void {
    this.pacing = pacing;
  }

  isPlaying(): boolean {
    return this.active !== null;
  }

  /** 캡처(앙파상 포함)를 수반하는 이동을 재생하고, 완료(또는 스킵) 시 resolve되는 Promise를 반환한다. */
  playCapture(move: Move, prevPosition: Position): Promise<void> {
    const attackerPiece = prevPosition.board[move.from];
    if (attackerPiece === null || attackerPiece === undefined) throw new Error('CombatDirector: attacker square empty');
    const isEnPassant = (move.flags & MoveFlag.EN_PASSANT) !== 0;
    const defenderSquare = isEnPassant ? squareOf(fileOf(move.to), rankOf(move.from)) : move.to;
    const defenderPiece = prevPosition.board[defenderSquare];
    if (defenderPiece === null || defenderPiece === undefined) throw new Error('CombatDirector: defender square empty');

    const scene = this.animationRegistry.getCombatScene(attackerPiece.type, defenderPiece.type);

    if (this.pacing === 'off') {
      this.finalize(move.from, move.to, defenderSquare);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const totalDuration = this.pacing === 'short' ? scene.totalDuration * 0.5 : scene.totalDuration;
      const approachBeat = scene.beats.find((b) => b.kind === 'approach');
      const approachDuration = approachBeat !== undefined ? (approachBeat.endSec / scene.totalDuration) * totalDuration : totalDuration * 0.3;
      this.cameraRig.begin();
      this.active = {
        scene,
        attackerType: attackerPiece.type,
        attackerSquare: move.to,
        defenderSquare,
        attackerFrom: move.from,
        elapsed: 0,
        totalDuration,
        approachDuration,
        firedVfx: new Set(),
        firedSfx: new Set(),
        phase: 'playing',
        resolve,
      };
    });
  }

  /** D5-4/D7 §연출 스킵 — 즉시 컷(복귀 보간 없이 바로 원래 카메라·최종 상태로 정리). */
  requestSkip(): void {
    const active = this.active;
    if (active === null) return;
    this.finalize(active.attackerFrom, active.attackerSquare, active.defenderSquare);
    this.cameraRig.beginRestore();
    this.cameraRig.updateRestore(999); // 강제로 1프레임 만에 복귀 완료시킴(즉시 컷)
    this.active = null;
    active.resolve();
  }

  update(dtSeconds: number): void {
    const active = this.active;
    if (active === null) return;

    if (active.phase === 'restoring') {
      const done = this.cameraRig.updateRestore(dtSeconds);
      if (done) {
        this.active = null;
        active.resolve();
      }
      return;
    }

    active.elapsed += dtSeconds;

    // D5-2 클램프: 목적지 방향으로 (squares-0.5)/squares 지점까지만 이동(한 칸짜리 이동이면 정확히
    // 중간에서 접선). 나머지는 이 연출이 넘겨받아 최종 위치를 확정한다(approach 비트 구간에 한정).
    const attackerUnit = this.unitBoard.getUnitAt(active.attackerFrom);
    if (attackerUnit !== undefined) {
      const approachT = Math.min(1, active.elapsed / active.approachDuration);
      const profile = MOVEMENT_PROFILES[active.attackerType];
      const start = squareToWorld(active.attackerFrom);
      const fullEnd = squareToWorld(active.attackerSquare);
      const squares =
        Math.max(
          Math.abs(fileOf(active.attackerSquare) - fileOf(active.attackerFrom)),
          Math.abs(rankOf(active.attackerSquare) - rankOf(active.attackerFrom))
        ) || 1;
      const clampFraction = Math.max(0, (squares - 0.5) / squares);
      const clampedEnd: [number, number] = [
        THREE.MathUtils.lerp(start[0], fullEnd[0], clampFraction),
        THREE.MathUtils.lerp(start[1], fullEnd[1], clampFraction),
      ];
      attackerUnit.root.position.copy(profile.path(start, clampedEnd, approachT));
    }

    const t = Math.min(1, active.elapsed / active.totalDuration);
    for (const cue of active.scene.vfx) {
      if (!active.firedVfx.has(cue) && t >= cue.at / active.scene.totalDuration) {
        active.firedVfx.add(cue);
        this.playVfx(cue, active.defenderSquare);
      }
    }
    for (const cue of active.scene.sfx) {
      if (!active.firedSfx.has(cue) && t >= cue.at / active.scene.totalDuration) {
        active.firedSfx.add(cue);
        this.soundRegistry.play(cue.cueId);
      }
    }

    const [dx, dz] = squareToWorld(active.defenderSquare);
    this.cameraRig.update(t, active.scene.camera, new THREE.Vector3(dx, 0.5, dz));

    if (t >= 1) {
      this.finalize(active.attackerFrom, active.attackerSquare, active.defenderSquare);
      this.cameraRig.beginRestore();
      active.phase = 'restoring';
    }
  }

  private finalize(attackerFrom: Square, attackerSquare: Square, defenderSquare: Square): void {
    // 일반 캡처는 defenderSquare === attackerSquare(=move.to), 앙파상은 다른 칸 — 어느 쪽이든 방어자가
    // 실제로 서 있는 칸(defenderSquare)에서 제거한 뒤 공격자를 attackerFrom → attackerSquare로 스냅한다.
    this.unitBoard.removeUnitAt(defenderSquare);
    this.unitBoard.relocateUnit(attackerFrom, attackerSquare);
  }

  private playVfx(cue: VfxCueDef, defenderSquare: Square): void {
    if (cue.effectId === 'vfx.flash.white') {
      this.flashDefender(defenderSquare);
      return;
    }
    if (cue.effectId === 'vfx.dissolve.particles') {
      this.spawnDissolveParticles(defenderSquare, cue.particleCount, cue.lifetimeSec);
    }
  }

  /**
   * 방어자 전용 파츠 재질은 `MaterialCache`(같은 진영의 모든 유닛이 공유)에서 온 것이라, 여기서
   * `emissiveIntensity`를 직접 수정하면 같은 진영의 다른 모든 기물까지 함께 밝아지는 버그가 난다
   * (사용자 실측으로 발견 — "기물 하나를 잡으면 전 기물이 하얗게 변함"). 원본 재질은 절대 건드리지 않고,
   * 이 유닛의 메시에만 임시로 밝힌 클론을 씌웠다가 복원한다.
   */
  private flashDefender(square: Square): void {
    const unit = this.unitBoard.getUnitAt(square);
    if (unit === undefined) return;
    unit.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshPhysicalMaterial) {
        const original = obj.material;
        const flashMaterial = original.clone();
        flashMaterial.emissiveIntensity = 1.4;
        obj.material = flashMaterial;
        setTimeout(() => {
          obj.material = original;
          flashMaterial.dispose();
        }, 150);
      }
    });
  }

  private spawnDissolveParticles(square: Square, count: number, lifetimeSec: number): void {
    const [x, z] = squareToWorld(square);
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = x;
      positions[i * 3 + 1] = 0.3;
      positions[i * 3 + 2] = z;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * 0.6;
      velocities[i * 3] = Math.cos(angle) * speed * 0.3;
      velocities[i * 3 + 1] = 0.6 + Math.random() * 0.8;
      velocities[i * 3 + 2] = Math.sin(angle) * speed * 0.3;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: '#F2E8D5', size: 0.045, transparent: true, opacity: 1, depthWrite: false });
    const points = new THREE.Points(geometry, material);
    this.scene.add(points);

    const start = performance.now();
    const tick = (): void => {
      const elapsed = (performance.now() - start) / 1000;
      const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < count; i += 1) {
        posAttr.setX(i, positions[i * 3]! + velocities[i * 3]! * elapsed);
        posAttr.setY(i, positions[i * 3 + 1]! + velocities[i * 3 + 1]! * elapsed - 0.5 * 1.2 * elapsed * elapsed);
        posAttr.setZ(i, positions[i * 3 + 2]! + velocities[i * 3 + 2]! * elapsed);
      }
      posAttr.needsUpdate = true;
      material.opacity = Math.max(0, 1 - elapsed / lifetimeSec);
      if (elapsed < lifetimeSec) requestAnimationFrame(tick);
      else {
        this.scene.remove(points);
        geometry.dispose();
        material.dispose();
      }
    };
    requestAnimationFrame(tick);
  }
}
