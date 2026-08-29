import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
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
import type { UnitBoard } from '../units/UnitBoard';
import { squareToWorld } from '../units/UnitBoard';
import type { UnitInstance } from '../units/UnitProvider';
import type { OrbitCameraRig } from '../engine/Camera';
import { AnimationRegistry, type CombatSceneDef, type VfxCueDef, type SfxCueDef } from './AnimationRegistry';
import { CameraRig } from './CameraRig';
import { SoundRegistry } from '../audio/SoundRegistry';
import { MOVEMENT_PROFILES } from './movementClips';

export type CinematicPacing = 'full' | 'short' | 'off';
type Phase = 'playing' | 'restoring';

// 넘어뜨리기(topple) + 축소-소멸(shrink) 공통 상수 — King(기본값)과 Pawn/Knight/Bishop의 "쓰러짐"
// 마무리 단계가 공유한다. 절대 초 단위이며 `pacingScale`로 Short 페이싱에도 비례 축소한다.
const KNOCKDOWN_SEC = 0.62;
const LIFT_HEIGHT = 0.6;
// 100°는 90°(완전 수평)를 넘어서는 각도라 쓰러진 기물의 몸통 끝부분이 보드 표면(y=0) 아래로 파고들어
// 체스판과 겹쳐 보였다(사용자 육안 확인으로 발견). 88°로 낮춰 정확히 수평에 살짝 못 미치게 눕는다.
const KNOCKDOWN_ANGLE = (88 * Math.PI) / 180;
// 완전히 쓰러진 뒤 제거되기 전까지 서서히 작아지며 사라지는 시간 — 갑자기 팝업하듯 사라지던 것을 완화.
const SHRINK_SEC = 0.3;
const AFTERMATH_HOLD_SEC = 2;
const AFTERMATH_FADE_SEC = 0.45;

// King(기본값) 전용 — 들어올려졌다가 내리찍는 기존 연출의 타이밍.
const GENERIC_STRIKE_WINDUP_SEC = 0.18;
const GENERIC_STRIKE_DOWN_SEC = 0.14;

// 사용자 요청 §기물별 전투 연출 — 공격자 타입별 마무리 동작 타이밍(절대 초, pacingScale로 축소).
const PAWN_WINDUP_SEC = 0.2;
const PAWN_STRIKE_SEC = 0.16;
const KNIGHT_WINDUP_SEC = 0.16;
const KNIGHT_STRIKE_SEC = 0.14;
const BISHOP_WINDUP_SEC = 0.35;
const BISHOP_STRIKE_SEC = 0.12;
const ROOK_WINDUP_SEC = 0.25;
const ROOK_STRIKE_SEC = 0.16;
const ROOK_SHATTER_RELAX_SEC = 0.4;
// Queen/King finishers combine skeletal posing, projectiles and shatter meshes.
// Give those beats enough screen time to remain readable on 30–60 fps devices.
const QUEEN_WINDUP_SEC = 0.28;
const QUEEN_STRIKE_SEC = 0.22;
const QUEEN_SHATTER_RELAX_SEC = 0.55;
const KING_WINDUP_SEC = 0.3;
const KING_STRIKE_SEC = 0.22;
const KING_SHATTER_RELAX_SEC = 0.55;
const ROYAL_SHARD_COUNT = 4;
const KING_BOLT_INTERVAL_SEC = 0.18;
// Do not let a transient rendering hitch skip an entire cinematic beat.
const MAX_CINEMATIC_STEP_SEC = 1 / 20;

// 사용자 요청 §게임 내 사운드 — 공격자 타입별 전투 연출 효과음(mp3 샘플, `SoundRegistry` 참조).
const FINISHER_SFX_CUE: Record<PieceType, string> = {
  p: 'sfx.combat.pawn',
  n: 'sfx.combat.knight',
  b: 'sfx.combat.bishop',
  r: 'sfx.combat.rook',
  q: 'sfx.combat.queen',
  k: 'sfx.combat.king',
};

/** Queen/King 파쇄 연출의 파편 하나 — 원본 위치(origin)에서 driftDir 방향으로 날아가며 텀블링한다. */
interface ShatterFragment {
  holder: THREE.Object3D;
  origin: THREE.Vector3;
  driftDir: THREE.Vector3;
  rotSpeed: readonly [number, number];
  baseScale?: THREE.Vector3;
  clipPlane?: THREE.Plane;
  clipAnchorOffset?: THREE.Vector3;
  clipPlanes?: THREE.Plane[];
  clipPlaneNormals?: THREE.Vector3[];
  clipPlaneOffsets?: THREE.Vector3[];
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}
function easeInQuad(t: number): number {
  return t * t;
}
/** 낙하 가속(easeInQuad) 후 착지 시 살짝 넘어갔다(overshoot) 제자리로 가라앉는(settle) 무게감 있는 커스텀 이징. */
function easeInSettle(t: number): number {
  const overshoot = 1.08;
  const rampShare = 0.85;
  if (t < rampShare) {
    return easeInQuad(t / rampShare) * overshoot;
  }
  const local = (t - rampShare) / (1 - rampShare);
  return overshoot - (overshoot - 1) * easeOutQuad(local);
}

interface ActiveCombat {
  scene: CombatSceneDef;
  attackerType: PieceType;
  attackerColor: Color;
  attackerSquare: Square;
  defenderSquare: Square;
  attackerFrom: Square;
  elapsed: number;
  totalDuration: number;
  approachDuration: number;
  firedVfx: Set<VfxCueDef>;
  firedSfx: Set<SfxCueDef>;
  thudFired: boolean;
  phase: Phase;
  resolve: () => void;
  // 이동 경로 상수 — 매 프레임 재계산 대신 시작 시 1회 계산해 캐시(사용자 요청 §기물별 전투 연출로
  // 공격자 타입마다 다른 피니셔가 동일한 값을 반복 사용하기 때문).
  start: [number, number];
  fullEnd: [number, number];
  clampedEnd: [number, number];
  defenderWorld: [number, number];
  toppleAxis: THREE.Vector3;
  // 기물별 피니셔 전용 1회성 상태(해당 없는 타입에서는 계속 초기값).
  bishopChannelFired: boolean;
  bishopBoltFired: boolean;
  rookCrushFired: boolean;
  impactEffectFired: boolean;
  kingBoltCount: number;
  // Queen(1개: 상체)/King(3개: 머리+몸통 복제 2) 파쇄 연출에서 씬에 직접 추가한 파편들.
  shatterFragments: ShatterFragment[];
}

/**
 * D5-1/D5-3/D5-4/D5-5 §전투 연출 오케스트레이터. `AnimationRegistry.getCombatScene()`으로 얻은
 * 순수 데이터(카메라/VFX·SFX 큐 타이밍)를 재생하는 한편, 공격자 기물 타입별로 서로 다른
 * 마무리 동작(피니셔)을 실행한다(사용자 요청 §기물별 전투 연출 — Pawn 창 찌르기, Knight 검 베기,
 * Bishop 낙뢰, Rook 프레스, Queen 대각선 파쇄). King은 기존 "들어올려 내리찍기" 연출을 그대로 유지.
 */
export class CombatDirector {
  private pacing: CinematicPacing = 'full';
  private readonly cameraRig: CameraRig;
  private active: ActiveCombat | null = null;

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
      this.finalize(move.from, move.to, defenderSquare, []);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const approachBeat = scene.beats.find((b) => b.kind === 'approach');
      const authoredApproach = approachBeat?.endSec ?? scene.totalDuration * 0.3;
      const pacingScale = this.pacing === 'short' ? 0.5 : 1;
      const approachDuration = authoredApproach * pacingScale;
      const totalDuration = this.pacing === 'short'
        ? scene.totalDuration * 0.5
        : Math.max(scene.totalDuration, authoredApproach + 0.55 + AFTERMATH_HOLD_SEC + AFTERMATH_FADE_SEC);
      this.cameraRig.begin();

      // D5-2 클램프: 목적지 방향으로 (squares-0.5)/squares 지점까지만 접근(한 칸짜리 이동이면 정확히
      // 중간에서 접선). 이하 피니셔 전용 상수도 여기서 1회 계산해 active에 캐시한다.
      const start = squareToWorld(move.from);
      const fullEnd = squareToWorld(move.to);
      const squares = Math.max(Math.abs(fileOf(move.to) - fileOf(move.from)), Math.abs(rankOf(move.to) - rankOf(move.from))) || 1;
      const clampFraction = Math.max(0, (squares - 0.5) / squares);
      const clampedEnd: [number, number] = [
        THREE.MathUtils.lerp(start[0], fullEnd[0], clampFraction),
        THREE.MathUtils.lerp(start[1], fullEnd[1], clampFraction),
      ];
      const defenderWorld = squareToWorld(defenderSquare);
      const dirX = defenderWorld[0] - start[0];
      const dirZ = defenderWorld[1] - start[1];
      const dirLen = Math.hypot(dirX, dirZ) || 1;
      const toppleAxis = new THREE.Vector3(-dirZ / dirLen, 0, dirX / dirLen);

      this.active = {
        scene,
        attackerType: attackerPiece.type,
        attackerColor: attackerPiece.color,
        attackerSquare: move.to,
        defenderSquare,
        attackerFrom: move.from,
        elapsed: 0,
        totalDuration,
        approachDuration,
        firedVfx: new Set(),
        firedSfx: new Set(),
        thudFired: false,
        phase: 'playing',
        resolve,
        start,
        fullEnd,
        clampedEnd,
        defenderWorld,
        toppleAxis,
        bishopChannelFired: false,
        bishopBoltFired: false,
        rookCrushFired: false,
        impactEffectFired: false,
        kingBoltCount: 0,
        shatterFragments: [],
      };
    });
  }

  /** D5-4/D7 §연출 스킵 — 즉시 컷(복귀 보간 없이 바로 원래 카메라·최종 상태로 정리). */
  requestSkip(): void {
    const active = this.active;
    if (active === null) return;
    this.finalize(active.attackerFrom, active.attackerSquare, active.defenderSquare, active.shatterFragments);
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

    active.elapsed += Math.min(Math.max(dtSeconds, 0), MAX_CINEMATIC_STEP_SEC);

    // Short 페이싱은 totalDuration을 절반으로 줄이므로, 피니셔의 절대 초 상수도 같은 비율로
    // 축소해야 scene이 정의한 death/result 비트 안에 들어맞는다.
    const pacingScale = this.pacing === 'short' ? 0.5 : 1;

    const attackerUnit = this.unitBoard.getUnitAt(active.attackerFrom);
    const defenderUnit = this.unitBoard.getUnitAt(active.defenderSquare);

    if (active.elapsed <= active.approachDuration) {
      if (attackerUnit !== undefined) {
        const profile = MOVEMENT_PROFILES[active.attackerType];
        const approachT = Math.min(1, active.elapsed / active.approachDuration);
        attackerUnit.root.position.copy(profile.path(active.start, active.clampedEnd, approachT));
      }
    } else {
      const finisherT = active.elapsed - active.approachDuration;
      this.runFinisher(active, attackerUnit, defenderUnit, finisherT, pacingScale);
    }

    const t = Math.min(1, active.elapsed / active.totalDuration);
    for (const cue of active.scene.vfx) {
      if (!active.firedVfx.has(cue) && active.elapsed >= cue.at * pacingScale) {
        active.firedVfx.add(cue);
        this.playVfx(cue, active.defenderSquare);
      }
    }
    for (const cue of active.scene.sfx) {
      if (!active.firedSfx.has(cue) && active.elapsed >= cue.at * pacingScale) {
        active.firedSfx.add(cue);
        this.soundRegistry.play(cue.cueId);
      }
    }

    const [dx, dz] = active.defenderWorld;
    this.cameraRig.update(t, active.scene.camera, new THREE.Vector3(dx, 0.5, dz));

    if (t >= 1) {
      this.finalize(active.attackerFrom, active.attackerSquare, active.defenderSquare, active.shatterFragments);
      this.cameraRig.beginRestore();
      active.phase = 'restoring';
    }
  }

  private runFinisher(
    active: ActiveCombat,
    attackerUnit: UnitInstance | undefined,
    defenderUnit: UnitInstance | undefined,
    finisherT: number,
    pacingScale: number
  ): void {
    switch (active.attackerType) {
      case 'p':
        this.runPawnFinisher(active, attackerUnit, defenderUnit, finisherT, pacingScale);
        return;
      case 'n':
        this.runKnightFinisher(active, attackerUnit, defenderUnit, finisherT, pacingScale);
        return;
      case 'b':
        this.runBishopFinisher(active, attackerUnit, defenderUnit, finisherT, pacingScale);
        return;
      case 'r':
        this.runRookFinisher(active, attackerUnit, defenderUnit, finisherT, pacingScale);
        return;
      case 'q':
        this.runQueenFinisher(active, attackerUnit, defenderUnit, finisherT, pacingScale);
        return;
      case 'k':
        this.runKingFinisher(active, attackerUnit, defenderUnit, finisherT, pacingScale);
        return;
      default:
        this.runGenericFinisher(active, attackerUnit, defenderUnit, finisherT, pacingScale);
    }
  }

  /** King(및 미지정 타입) — 기존 "공중으로 들어올려졌다가 방어자에게 내리찍는" 연출을 그대로 유지. */
  private runGenericFinisher(
    active: ActiveCombat,
    attackerUnit: UnitInstance | undefined,
    defenderUnit: UnitInstance | undefined,
    finisherT: number,
    pacingScale: number
  ): void {
    const strikeWindupSec = GENERIC_STRIKE_WINDUP_SEC * pacingScale;
    const strikeDownSec = GENERIC_STRIKE_DOWN_SEC * pacingScale;
    const knockdownSec = KNOCKDOWN_SEC * pacingScale;
    const strikeWindupEnd = strikeWindupSec;
    const strikeDownEnd = strikeWindupEnd + strikeDownSec;
    const [clampedX, clampedZ] = active.clampedEnd;
    const [defX, defZ] = active.defenderWorld;

    if (attackerUnit !== undefined) {
      if (finisherT <= strikeWindupEnd) {
        const windupT = easeOutQuad(clamp01(finisherT / strikeWindupSec));
        attackerUnit.root.position.set(clampedX, LIFT_HEIGHT * windupT, clampedZ);
      } else if (finisherT <= strikeDownEnd) {
        const downT = easeInQuad(clamp01((finisherT - strikeWindupEnd) / strikeDownSec));
        attackerUnit.root.position.set(
          THREE.MathUtils.lerp(clampedX, defX, downT),
          THREE.MathUtils.lerp(LIFT_HEIGHT, 0, downT),
          THREE.MathUtils.lerp(clampedZ, defZ, downT)
        );
      } else {
        const [fullX, fullZ] = active.fullEnd;
        if (fullX !== defX || fullZ !== defZ) {
          const remaining = Math.max(0.001, active.totalDuration - active.approachDuration - strikeDownEnd);
          const slideT = clamp01((finisherT - strikeDownEnd) / remaining);
          attackerUnit.root.position.set(THREE.MathUtils.lerp(defX, fullX, slideT), 0, THREE.MathUtils.lerp(defZ, fullZ, slideT));
        } else {
          attackerUnit.root.position.set(defX, 0, defZ);
        }
      }
    }

    if (defenderUnit !== undefined) {
      this.applyTopple(active, defenderUnit, finisherT, strikeDownEnd, knockdownSec, pacingScale);
    }
  }

  /** Pawn — 창을 견착했다가 수평으로 내지르는 찌르기(사용자 요청). */
  private runPawnFinisher(
    active: ActiveCombat,
    attackerUnit: UnitInstance | undefined,
    defenderUnit: UnitInstance | undefined,
    finisherT: number,
    pacingScale: number
  ): void {
    const windupSec = PAWN_WINDUP_SEC * pacingScale;
    const strikeSec = PAWN_STRIKE_SEC * pacingScale;
    const knockdownSec = KNOCKDOWN_SEC * pacingScale;
    const windupEnd = windupSec;
    const strikeEnd = windupEnd + strikeSec;
    const [clampedX, clampedZ] = active.clampedEnd;
    const [startX, startZ] = active.start;
    const lungeLen = Math.hypot(clampedX - startX, clampedZ - startZ) || 1;
    const lungeUX = (clampedX - startX) / lungeLen;
    const lungeUZ = (clampedZ - startZ) / lungeLen;

    if (attackerUnit !== undefined) {
      const shoulderR = attackerUnit.bones['shoulder.R'];
      const elbowR = attackerUnit.bones['elbow.R'];
      let lunge = 0;
      if (finisherT <= windupEnd) {
        const wT = easeOutQuad(clamp01(finisherT / windupSec));
        if (shoulderR !== undefined) {
          shoulderR.rotation.x = THREE.MathUtils.lerp(0, -0.34, wT);
          shoulderR.rotation.z = THREE.MathUtils.lerp(0, -0.12, wT);
        }
        if (elbowR !== undefined) elbowR.rotation.x = THREE.MathUtils.lerp(0, 0.42, wT);
      } else if (finisherT <= strikeEnd) {
        const sT = easeInQuad(clamp01((finisherT - windupEnd) / strikeSec));
        if (shoulderR !== undefined) {
          shoulderR.rotation.x = THREE.MathUtils.lerp(-0.34, -1.12, sT);
          shoulderR.rotation.z = THREE.MathUtils.lerp(-0.12, -0.04, sT);
        }
        if (elbowR !== undefined) elbowR.rotation.x = THREE.MathUtils.lerp(0.42, -0.08, sT);
        lunge = 0.2 * sT;
      } else {
        const relaxT = easeOutQuad(clamp01((finisherT - strikeEnd) / knockdownSec));
        if (shoulderR !== undefined) {
          shoulderR.rotation.x = THREE.MathUtils.lerp(-1.12, -0.42, relaxT);
          shoulderR.rotation.z = THREE.MathUtils.lerp(-0.04, 0, relaxT);
        }
        if (elbowR !== undefined) elbowR.rotation.x = THREE.MathUtils.lerp(-0.08, 0, relaxT);
        lunge = 0.2 * (1 - 0.55 * relaxT);
      }
      attackerUnit.root.position.set(clampedX + lungeUX * lunge, 0, clampedZ + lungeUZ * lunge);
    }

    if (defenderUnit !== undefined) {
      if (!active.impactEffectFired && finisherT > strikeEnd) {
        active.impactEffectFired = true;
        const [defX, defZ] = active.defenderWorld;
        this.spawnBloodEffect(new THREE.Vector3(defX, 0.5, defZ), active.toppleAxis);
      }
      this.applyTopple(active, defenderUnit, finisherT, strikeEnd, knockdownSec, pacingScale);
    }
  }

  /** Knight — 검을 머리 위로 크게 들어 베어내리는 참격(사용자 요청). */
  private runKnightFinisher(
    active: ActiveCombat,
    attackerUnit: UnitInstance | undefined,
    defenderUnit: UnitInstance | undefined,
    finisherT: number,
    pacingScale: number
  ): void {
    const windupSec = KNIGHT_WINDUP_SEC * pacingScale;
    const strikeSec = KNIGHT_STRIKE_SEC * pacingScale;
    const knockdownSec = KNOCKDOWN_SEC * pacingScale;
    const windupEnd = windupSec;
    const strikeEnd = windupEnd + strikeSec;
    const [clampedX, clampedZ] = active.clampedEnd;

    if (attackerUnit !== undefined) {
      attackerUnit.root.position.set(clampedX, 0, clampedZ);
      const shoulderR = attackerUnit.bones['shoulder.R'];
      if (shoulderR !== undefined) {
        if (finisherT <= windupEnd) {
          const wT = easeOutQuad(clamp01(finisherT / windupSec));
          shoulderR.rotation.x = THREE.MathUtils.lerp(0, -2.5, wT);
        } else if (finisherT <= strikeEnd) {
          const sT = easeInQuad(clamp01((finisherT - windupEnd) / strikeSec));
          shoulderR.rotation.x = THREE.MathUtils.lerp(-2.5, 1.0, sT);
        } else {
          const relaxT = easeOutQuad(clamp01((finisherT - strikeEnd) / knockdownSec));
          shoulderR.rotation.x = THREE.MathUtils.lerp(1.0, 0.15, relaxT);
        }
      }
    }

    if (defenderUnit !== undefined && finisherT > strikeEnd) this.runSplitDeath(active, defenderUnit, finisherT, strikeEnd, true);
  }

  /** Bishop — 오브를 채널링해 방어자 머리 위로 낙뢰를 떨어뜨리는 원거리 연출(사용자 요청). */
  private runBishopFinisher(
    active: ActiveCombat,
    attackerUnit: UnitInstance | undefined,
    defenderUnit: UnitInstance | undefined,
    finisherT: number,
    pacingScale: number
  ): void {
    const windupSec = BISHOP_WINDUP_SEC * pacingScale;
    const strikeSec = BISHOP_STRIKE_SEC * pacingScale;
    const strikeEnd = windupSec + strikeSec;
    const [clampedX, clampedZ] = active.clampedEnd;

    if (attackerUnit !== undefined) {
      // Bishop은 접근 완료 지점에서 부양한 채 멈춰 채널링만 한다(추가 이동 없음).
      attackerUnit.root.position.set(clampedX, 0.15, clampedZ);
      if (!active.bishopChannelFired) {
        active.bishopChannelFired = true;
        this.channelBishopOrb(attackerUnit, windupSec);
      }
    }

    if (!active.bishopBoltFired && finisherT > strikeEnd) {
      active.bishopBoltFired = true;
      const [defX, defZ] = active.defenderWorld;
      this.spawnLightningBolt(new THREE.Vector3(defX, 2.8, defZ), new THREE.Vector3(defX, 0.55, defZ));
      this.playThudOnce(active);
    }

    if (defenderUnit !== undefined && finisherT > strikeEnd) this.runSplitDeath(active, defenderUnit, finisherT, strikeEnd, false);
  }

  private runSplitDeath(active: ActiveCombat, unit: UnitInstance, finisherT: number, strikeEnd: number, diagonal: boolean): void {
    this.playThudOnce(active);
    if (active.shatterFragments.length === 0) {
      unit.mixer.stopAllAction();
      const origin = unit.root.position.clone();
      const splitNormal = diagonal ? new THREE.Vector3(1, 1, 0).normalize() : new THREE.Vector3(1, 0, 0);
      const negativeNormal = splitNormal.clone().negate();
      const clipAnchorOffset = new THREE.Vector3(0, 0.52, 0);
      const splitCenter = origin.clone().add(clipAnchorOffset);
      const positivePlane = new THREE.Plane(splitNormal, -splitNormal.dot(splitCenter));
      const negativePlane = new THREE.Plane(negativeNormal, -negativeNormal.dot(splitCenter));
      const positiveHalf = this.createClippedHalf(unit.root, positivePlane);
      const negativeHalf = this.createClippedHalf(unit.root, negativePlane);
      this.scene.add(positiveHalf, negativeHalf);
      unit.root.visible = false;

      const positiveDrift = splitNormal.clone();
      const negativeDrift = splitNormal.clone().negate();
      active.shatterFragments.push(
        { holder: positiveHalf, origin: origin.clone(), driftDir: positiveDrift, rotSpeed: diagonal ? [0.65, -0.5] : [0.32, -0.24], clipPlane: positivePlane, clipAnchorOffset: clipAnchorOffset.clone() },
        { holder: negativeHalf, origin: origin.clone(), driftDir: negativeDrift, rotSpeed: diagonal ? [-0.65, 0.5] : [-0.32, 0.24], clipPlane: negativePlane, clipAnchorOffset: clipAnchorOffset.clone() }
      );

      const cutCenter = new THREE.Vector3(origin.x, 0.52, origin.z + 0.012);
      const positiveCut = this.createCutSurface(cutCenter.clone(), splitNormal);
      const negativeCut = this.createCutSurface(cutCenter.clone().addScaledVector(splitNormal, -0.012), negativeNormal);
      this.scene.add(positiveCut, negativeCut);
      active.shatterFragments.push(
        { holder: positiveCut, origin: positiveCut.position.clone(), driftDir: positiveDrift.clone(), rotSpeed: diagonal ? [0.65, -0.5] : [0.32, -0.24] },
        { holder: negativeCut, origin: negativeCut.position.clone(), driftDir: negativeDrift.clone(), rotSpeed: diagonal ? [-0.65, 0.5] : [-0.32, 0.24] }
      );
      this.spawnCutGlow(new THREE.Vector3(origin.x, 0.5, origin.z), diagonal);
      this.spawnBloodEffect(new THREE.Vector3(origin.x, 0.46, origin.z), active.toppleAxis);
    }
    const splitT = finisherT - strikeEnd;
    const hitStopSec = 0.07;
    const motionT = Math.max(0, splitT - hitStopSec);
    const separateDuration = diagonal ? 0.36 : 0.44;
    const separateT = easeOutQuad(clamp01(motionT / separateDuration));
    const fallT = Math.max(0, motionT - (diagonal ? 0.3 : 0.38));
    const separationDistance = diagonal ? 0.25 : 0.2;
    for (const fragment of active.shatterFragments) {
      const drift = fragment.driftDir;
      fragment.holder.position.set(
        fragment.origin.x + drift.x * separationDistance * separateT,
        Math.max(0.045, fragment.origin.y + drift.y * separationDistance * separateT - 1.55 * fallT * fallT),
        fragment.origin.z + drift.z * separationDistance * 0.35 * separateT
      );
      fragment.holder.rotation.z = fallT * fragment.rotSpeed[0];
      fragment.holder.rotation.x = fallT * fragment.rotSpeed[1];
      if (fragment.clipPlane !== undefined) {
        const anchor = fragment.holder.position.clone().add(fragment.clipAnchorOffset ?? new THREE.Vector3());
        fragment.clipPlane.constant = -fragment.clipPlane.normal.dot(anchor);
      }
    }
    const fadeStart = active.totalDuration - active.approachDuration - AFTERMATH_FADE_SEC;
    this.applyShatterShrink(active, unit, finisherT, fadeStart);
  }

  /** Rook — 골렘이 오른쪽 어깨와 오른팔을 뒤로 크게 젖혀 힘을 모은 뒤, 전방으로 폭발적인 오른손 펀치 런지를 날려 적 기물을 가루로 분쇄한다(사용자 요청). */
  private runRookFinisher(
    active: ActiveCombat,
    attackerUnit: UnitInstance | undefined,
    defenderUnit: UnitInstance | undefined,
    finisherT: number,
    pacingScale: number
  ): void {
    const windupSec = ROOK_WINDUP_SEC * pacingScale;
    const strikeSec = ROOK_STRIKE_SEC * pacingScale;
    const windupEnd = windupSec;
    const strikeEnd = windupEnd + strikeSec;
    const [clampedX, clampedZ] = active.clampedEnd;
    const [defX, defZ] = active.defenderWorld;

    const dirX = defX - clampedX;
    const dirZ = defZ - clampedZ;
    const dirLen = Math.hypot(dirX, dirZ) || 1;
    const lungeDirX = dirX / dirLen;
    const lungeDirZ = dirZ / dirLen;

    const shoulderR = attackerUnit?.bones['shoulder.R'];
    const elbowR = attackerUnit?.bones['elbow.R'];

    if (attackerUnit !== undefined) {
      let bodyLunge = 0;
      let bodyTiltY = 0;
      let bodyTiltZ = 0;
      let bodyLiftY = 0;

      if (finisherT <= windupEnd) {
        // 1) [와인드업]: 골렘이 오른쪽 어깨와 오른팔을 뒤로 깊숙이 젖히며 상체를 비틀고 웅크려 힘을 모음
        const wT = easeOutQuad(clamp01(finisherT / windupSec));
        bodyLunge = -0.12 * wT; // 하중을 뒤로 장전
        bodyLiftY = 0.08 * wT;  // 호흡을 가다듬으며 살짝 일어섬
        bodyTiltY = -0.65 * wT; // 오른쪽 어깨/팔을 뒤로 크게 비틂
        bodyTiltZ = 0.25 * wT;  // 오른쪽으로 무게중심 쏠림

        if (shoulderR !== undefined) {
          shoulderR.rotation.x = THREE.MathUtils.lerp(0, -1.8, wT);
          shoulderR.rotation.y = THREE.MathUtils.lerp(0, -0.6, wT);
          shoulderR.rotation.z = THREE.MathUtils.lerp(0, 0.4, wT);
        }
        if (elbowR !== undefined) elbowR.rotation.x = THREE.MathUtils.lerp(0, -1.2, wT);
      } else if (finisherT <= strikeEnd) {
        // 2) [스트라이크]: 전방으로 폭발적인 $0.38$칸 런지와 함께 오른쪽 어깨/오른손 주먹을 깊숙이 내지르는 강타
        const sT = easeInQuad(clamp01((finisherT - windupEnd) / strikeSec));
        bodyLunge = THREE.MathUtils.lerp(-0.12, 0.38, sT);
        bodyLiftY = THREE.MathUtils.lerp(0.08, 0, sT);
        bodyTiltY = THREE.MathUtils.lerp(-0.65, 0.55, sT); // 우측에서 전방으로 체중을 실어 팍 회전
        bodyTiltZ = THREE.MathUtils.lerp(0.25, -0.22, sT);

        if (shoulderR !== undefined) {
          shoulderR.rotation.x = THREE.MathUtils.lerp(-1.8, 1.4, sT);
          shoulderR.rotation.y = THREE.MathUtils.lerp(-0.6, 0.3, sT);
          shoulderR.rotation.z = THREE.MathUtils.lerp(0.4, -0.2, sT);
        }
        if (elbowR !== undefined) elbowR.rotation.x = THREE.MathUtils.lerp(-1.2, 0.2, sT);
      } else {
        // 3) [릴랙스]: 타격 반동 후 원래 위치 및 자세로 원복
        const rT = easeOutQuad(clamp01((finisherT - strikeEnd) / (ROOK_SHATTER_RELAX_SEC * pacingScale)));
        bodyLunge = 0.38 * (1 - 0.7 * rT);
        bodyLiftY = 0;
        bodyTiltY = THREE.MathUtils.lerp(0.55, 0, rT);
        bodyTiltZ = THREE.MathUtils.lerp(-0.22, 0, rT);

        if (shoulderR !== undefined) {
          shoulderR.rotation.x = THREE.MathUtils.lerp(1.4, 0.1, rT);
          shoulderR.rotation.y = THREE.MathUtils.lerp(0.3, 0, rT);
          shoulderR.rotation.z = THREE.MathUtils.lerp(-0.2, 0, rT);
        }
        if (elbowR !== undefined) elbowR.rotation.x = THREE.MathUtils.lerp(0.2, 0, rT);
      }

      attackerUnit.root.position.set(
        clampedX + lungeDirX * bodyLunge,
        bodyLiftY,
        clampedZ + lungeDirZ * bodyLunge
      );
      attackerUnit.root.rotation.set(0, bodyTiltY, bodyTiltZ);
    }

    if (defenderUnit === undefined || finisherT <= strikeEnd) return;

    // 타격 순간 사운드 재생
    this.playThudOnce(active);

    // 적 기물이 부서져 가루(8개의 미세 파편 + 헤드)가 되어 사방으로 흩날리는 연출
    if (active.shatterFragments.length === 0) {
      defenderUnit.mixer.stopAllAction();
      const bodyOrigin = defenderUnit.root.position.clone();
      active.shatterFragments.push(...this.createUnitShards(defenderUnit, bodyOrigin, 8));
      this.spawnDustCloud(new THREE.Vector3(bodyOrigin.x, 0.18, bodyOrigin.z), '#8D8172', 42, 0.95);
      this.spawnBloodEffect(new THREE.Vector3(bodyOrigin.x, 0.38, bodyOrigin.z), active.toppleAxis);
    }

    const shatterT = finisherT - strikeEnd;
    this.updateShatterFragments(active.shatterFragments, shatterT, 1.6, 3.8);

    // 원본 중심체 — 타격 직후 즉시 으스러져 가루가 되며 빠르게 축소 및 소멸
    const shrinkStart = active.totalDuration - active.approachDuration - AFTERMATH_FADE_SEC;
    this.applyShatterShrink(active, defenderUnit, finisherT, shrinkStart);
  }

  /**
   * Queen — 대각으로 베어 상체(chest 이하: 머리·팔·케이프)와 하체(hips/다리/드레스)를
   * 서로 반대 방향으로 흩날리며 파쇄한다(사용자 요청). 진짜 메시 절단 대신 기존 골격의
   * 허리 관절(spine↔chest)에서 분리해 두 덩어리로 날려보내는 방식 — 회전(텀블링)과 낙하 궤적으로
   * "대각선으로 부서짐"을 표현한다.
   */
  private runQueenFinisher(
    active: ActiveCombat,
    attackerUnit: UnitInstance | undefined,
    defenderUnit: UnitInstance | undefined,
    finisherT: number,
    pacingScale: number
  ): void {
    const windupSec = QUEEN_WINDUP_SEC * pacingScale;
    const strikeSec = QUEEN_STRIKE_SEC * pacingScale;
    const windupEnd = windupSec;
    const strikeEnd = windupEnd + strikeSec;
    const [clampedX, clampedZ] = active.clampedEnd;

    if (attackerUnit !== undefined) {
      attackerUnit.root.position.set(clampedX, 0, clampedZ);
      if (!active.impactEffectFired) {
        active.impactEffectFired = true;
        const [defX, defZ] = active.defenderWorld;
        this.spawnMagicProjectile(new THREE.Vector3(clampedX, 0.68, clampedZ), new THREE.Vector3(defX, 0.52, defZ), windupSec + strikeSec);
      }
      const shoulderR = attackerUnit.bones['shoulder.R'];
      if (shoulderR !== undefined) {
        if (finisherT <= windupEnd) {
          const wT = easeOutQuad(clamp01(finisherT / windupSec));
          shoulderR.rotation.x = THREE.MathUtils.lerp(0, -2.2, wT);
          shoulderR.rotation.z = THREE.MathUtils.lerp(0, 0.5, wT);
        } else if (finisherT <= strikeEnd) {
          const sT = easeInQuad(clamp01((finisherT - windupEnd) / strikeSec));
          shoulderR.rotation.x = THREE.MathUtils.lerp(-2.2, 1.1, sT);
          shoulderR.rotation.z = THREE.MathUtils.lerp(0.5, -0.6, sT);
        } else {
          const relaxT = easeOutQuad(clamp01((finisherT - strikeEnd) / QUEEN_SHATTER_RELAX_SEC));
          shoulderR.rotation.x = THREE.MathUtils.lerp(1.1, 0.1, relaxT);
          shoulderR.rotation.z = THREE.MathUtils.lerp(-0.6, 0, relaxT);
        }
      }
    }

    if (defenderUnit === undefined || finisherT <= strikeEnd) return;

    this.playThudOnce(active);
    if (active.shatterFragments.length === 0) {
      defenderUnit.mixer.stopAllAction();
      const origin = defenderUnit.root.position.clone();
      active.shatterFragments.push(...this.createUnitShards(defenderUnit, origin, ROYAL_SHARD_COUNT));
      this.spawnArcaneBurst(new THREE.Vector3(origin.x, 0.48, origin.z), '#D9A6FF');
      this.spawnDustCloud(new THREE.Vector3(origin.x, 0.22, origin.z), '#A76BC4', 30, 0.68);
      this.spawnBloodEffect(new THREE.Vector3(origin.x, 0.4, origin.z), active.toppleAxis);
    }

    const shatterT = finisherT - strikeEnd;
    this.updateShatterFragments(active.shatterFragments, shatterT, 1.1, 2.6);

    // 하체(hips/다리/드레스, 원본 유닛) — 상체와 반대 대각 방향으로 흩어진다.
    // 모든 조각(상체 파편 + 원본 하체) 다 서서히 작아지며 사라진다(사용자 요청 §씬 퀄리티 — 갑자기
    // 팝업하듯 사라짐 완화).
    const shrinkStart = Math.max(strikeEnd, active.totalDuration - active.approachDuration - AFTERMATH_FADE_SEC * pacingScale);
    this.applyShatterShrink(active, defenderUnit, finisherT, shrinkStart);
  }

  /**
   * King — 검을 크게 휘둘러 적 기물을 정확히 네 조각(머리 1 + 몸통 복제 2 + 원본 하체 1)으로
   * 흩날려 사라지게 한다(사용자 요청). 룩처럼 팔·다리가 없는 기물도 있어 골격 특정 부위에
   * 의존하지 않고, 머리만 분리한 뒤 나머지 몸통을 두 번 복제해 서로 다른 방향으로 날려보낸다
   * (지오메트리/재질은 캐시를 그대로 공유해 복제 비용이 거의 없다).
   */
  private runKingFinisher(
    active: ActiveCombat,
    attackerUnit: UnitInstance | undefined,
    defenderUnit: UnitInstance | undefined,
    finisherT: number,
    pacingScale: number
  ): void {
    const windupSec = KING_WINDUP_SEC * pacingScale;
    const strikeSec = KING_STRIKE_SEC * pacingScale;
    const windupEnd = windupSec;
    const strikeEnd = windupEnd + strikeSec;
    const [clampedX, clampedZ] = active.clampedEnd;

    if (attackerUnit !== undefined) {
      attackerUnit.root.position.set(clampedX, 0, clampedZ);
      const shoulderR = attackerUnit.bones['shoulder.R'];
      if (shoulderR !== undefined) {
        if (finisherT <= windupEnd) {
          const wT = easeOutQuad(clamp01(finisherT / windupSec));
          shoulderR.rotation.x = THREE.MathUtils.lerp(0, -2.3, wT);
        } else if (finisherT <= strikeEnd) {
          const sT = easeInQuad(clamp01((finisherT - windupEnd) / strikeSec));
          shoulderR.rotation.x = THREE.MathUtils.lerp(-2.3, 1.0, sT);
        } else {
          const relaxT = easeOutQuad(clamp01((finisherT - strikeEnd) / KING_SHATTER_RELAX_SEC));
          shoulderR.rotation.x = THREE.MathUtils.lerp(1.0, 0.1, relaxT);
        }
      }
    }

    if (defenderUnit === undefined || finisherT <= strikeEnd) return;

    const desiredBolts = Math.min(4, Math.floor((finisherT - strikeEnd) / (KING_BOLT_INTERVAL_SEC * pacingScale)) + 1);
    while (active.kingBoltCount < desiredBolts) {
      const [defX, defZ] = active.defenderWorld;
      const offset = active.kingBoltCount % 2 === 0 ? -0.08 : 0.08;
      this.spawnLightningBolt(new THREE.Vector3(defX + offset, 3.5, defZ - offset), new THREE.Vector3(defX, 0.5, defZ), '#68FF78');
      active.kingBoltCount += 1;
    }
    if (active.kingBoltCount < 4) return;

    this.playThudOnce(active);
    if (active.shatterFragments.length === 0) {
      defenderUnit.mixer.stopAllAction();
      // 머리를 뗀 뒤(=이제 헤드리스인) 몸통을 두 번 복제 — 지오메트리/재질은 캐시 공유라 저비용.
      const bodyOrigin = defenderUnit.root.position.clone();
      active.shatterFragments.push(...this.createUnitShards(defenderUnit, bodyOrigin, ROYAL_SHARD_COUNT));
      const bodyAngles: readonly number[] = [(-2 * Math.PI) / 3, (2 * Math.PI) / 3];
      const bodyRotSpeeds: readonly (readonly [number, number])[] = [
        [-5, 4],
        [4, -6],
      ];
      bodyAngles.forEach((angle, i) => {
        const clone = this.createDebris(i === 0 ? '#40543F' : '#29352B', 0.15);
        clone.position.copy(bodyOrigin).setY(0.48 + i * 0.1);
        this.scene.add(clone);
        active.shatterFragments.push({
          holder: clone,
          origin: bodyOrigin,
          driftDir: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
          rotSpeed: bodyRotSpeeds[i]!,
        });
      });
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2;
        const shard = this.createDebris('#354737', 0.07 + (i % 2) * 0.025);
        shard.position.copy(bodyOrigin).setY(0.4 + (i % 3) * 0.09);
        this.scene.add(shard);
        active.shatterFragments.push({ holder: shard, origin: shard.position.clone(), driftDir: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)), rotSpeed: [i % 2 === 0 ? 9 : -9, 6] });
      }
      this.spawnArcaneBurst(new THREE.Vector3(bodyOrigin.x, 0.5, bodyOrigin.z), '#68FF78');
      this.spawnDustCloud(new THREE.Vector3(bodyOrigin.x, 0.2, bodyOrigin.z), '#42634A', 36, 0.82);
      this.spawnBloodEffect(new THREE.Vector3(bodyOrigin.x, 0.42, bodyOrigin.z), active.toppleAxis);
    }

    const shatterT = Math.max(0, finisherT - strikeEnd - KING_BOLT_INTERVAL_SEC * 3 * pacingScale);
    this.updateShatterFragments(active.shatterFragments, shatterT, 1.2, 2.8);

    // 원본 유닛(하체 이하 마지막 네 번째 조각) — 나머지 세 조각과 다른 방향으로.
    const [defX, defZ] = active.defenderWorld;
    const gravity = 2.8;
    defenderUnit.root.position.set(defX - shatterT * 1.2 * 0.6, Math.max(0, shatterT * 0.5 - 0.5 * gravity * shatterT * shatterT), defZ - shatterT * 1.2 * 0.5);
    defenderUnit.root.rotation.x = shatterT * 5;
    defenderUnit.root.rotation.z = -shatterT * 4;

    const shrinkStart = Math.max(strikeEnd, active.totalDuration - active.approachDuration - AFTERMATH_FADE_SEC * pacingScale);
    this.applyShatterShrink(active, defenderUnit, finisherT, shrinkStart);
  }

  /** Queen/King 공용 — 파쇄 파편들을 원점(origin)에서 driftDir 방향으로 포물선 궤적 + 텀블링시킨다. */
  private updateShatterFragments(fragments: readonly ShatterFragment[], shatterT: number, speed: number, gravity: number): void {
    const flightT = Math.min(shatterT, 0.72);
    for (const frag of fragments) {
      frag.holder.position.set(
        frag.origin.x + frag.driftDir.x * flightT * speed,
        Math.max(0.05, frag.origin.y + flightT * 0.9 - 0.5 * gravity * flightT * flightT),
        frag.origin.z + frag.driftDir.z * flightT * speed
      );
      frag.holder.rotation.x = flightT * frag.rotSpeed[0];
      frag.holder.rotation.z = flightT * frag.rotSpeed[1];
      this.updateFragmentClipping(frag);
    }
  }

  /** Queen/King 공용 — 원본 유닛과 모든 파쇄 파편을 함께 서서히 축소시켜 사라지게 한다. */
  private applyShatterShrink(active: ActiveCombat, defenderUnit: UnitInstance, finisherT: number, shrinkStart: number): void {
    if (finisherT <= shrinkStart) return;
    const totalRel = active.totalDuration - active.approachDuration;
    const shrinkT = clamp01((finisherT - shrinkStart) / Math.max(0.001, totalRel - shrinkStart));
    const scale = 1 - easeInQuad(shrinkT) * 0.92;
    defenderUnit.root.scale.setScalar(scale);
    for (const frag of active.shatterFragments) {
      frag.baseScale ??= frag.holder.scale.clone();
      frag.holder.scale.copy(frag.baseScale).multiplyScalar(scale);
    }
  }

  /** Pawn/Knight/Bishop 및 미지정 타입(기본값) 공용 — 쓰러진 뒤(topple) 서서히 축소되며 사라지는 마무리. */
  private applyTopple(
    active: ActiveCombat,
    unit: UnitInstance,
    finisherT: number,
    toppleStartRel: number,
    knockdownSec: number,
    pacingScale: number
  ): void {
    if (finisherT <= toppleStartRel) return;
    this.playThudOnce(active);
    const knockT = easeInSettle(clamp01((finisherT - toppleStartRel) / knockdownSec));
    unit.root.quaternion.setFromAxisAngle(active.toppleAxis, KNOCKDOWN_ANGLE * knockT);

    const shrinkSec = SHRINK_SEC * pacingScale;
    const totalRel = active.totalDuration - active.approachDuration;
    const fallCompleteRel = toppleStartRel + knockdownSec;
    const shrinkStart = Math.max(fallCompleteRel, totalRel - shrinkSec);
    if (finisherT > shrinkStart) {
      const shrinkT = clamp01((finisherT - shrinkStart) / Math.max(0.001, totalRel - shrinkStart));
      unit.root.scale.setScalar(1 - easeInQuad(shrinkT) * 0.92);
    }
  }

  /** 사용자 요청 §게임 내 사운드 — 공격자 타입별 전투 연출 효과음을 타격 순간 1회만 재생한다. */
  private playThudOnce(active: ActiveCombat): void {
    if (active.thudFired) return;
    active.thudFired = true;
    const strength = active.attackerType === 'r' || active.attackerType === 'k' ? 0.095 : 0.055;
    this.cameraRig.kick(strength);
    this.soundRegistry.play(FINISHER_SFX_CUE[active.attackerType]);
  }

  private createDebris(color: string, radius: number): THREE.Mesh {
    const geometry = new THREE.DodecahedronGeometry(radius, 1);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      const distortion = 0.72 + ((i * 37) % 11) / 22;
      position.setXYZ(i, position.getX(i) * distortion, position.getY(i) * (0.68 + ((i * 19) % 9) / 18), position.getZ(i) * (0.76 + ((i * 13) % 7) / 16));
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({ color, roughness: 0.46, metalness: 0.24, clearcoat: 0.18, clearcoatRoughness: 0.72, flatShading: false })
    );
    mesh.userData['combatDisposable'] = true;
    mesh.castShadow = true;
    return mesh;
  }

  private createCutSurface(position: THREE.Vector3, normal: THREE.Vector3): THREE.Mesh {
    const material = new THREE.MeshPhysicalMaterial({
      color: '#360006',
      emissive: '#8A0713',
      emissiveIntensity: 0.7,
      roughness: 0.48,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const surface = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), material);
    surface.position.copy(position);
    surface.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
    surface.scale.set(0.34, 1.45, 1);
    surface.userData['combatDisposable'] = true;
    return surface;
  }

  private createClippedHalf(source: THREE.Object3D, plane: THREE.Plane): THREE.Object3D {
    return this.createClippedFragment(source, [plane]);
  }

  private createClippedFragment(source: THREE.Object3D, planes: THREE.Plane[]): THREE.Object3D {
    const half = cloneSkeleton(source);
    half.userData['combatClipped'] = true;
    half.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const cloneMaterial = (material: THREE.Material): THREE.Material => {
        const cloned = material.clone();
        cloned.clippingPlanes = planes;
        cloned.clipShadows = true;
        cloned.side = THREE.DoubleSide;
        return cloned;
      };
      obj.material = Array.isArray(obj.material) ? obj.material.map(cloneMaterial) : cloneMaterial(obj.material);
      obj.castShadow = true;
    });
    return half;
  }

  private createUnitShards(unit: UnitInstance, origin: THREE.Vector3, pieceCount: number): ShatterFragment[] {
    const fragments: ShatterFragment[] = [];
    const columns = 2;
    const rows = Math.max(2, Math.ceil(pieceCount / columns));
    const maxHeight = 1.45;
    for (let row = 0; row < rows; row += 1) {
      const minY = origin.y + (row / rows) * maxHeight;
      const maxY = origin.y + ((row + 1) / rows) * maxHeight;
      for (let column = 0; column < columns; column += 1) {
        if (fragments.length >= pieceCount) break;
        const side = column === 0 ? -1 : 1;
        const planes = [
          new THREE.Plane(new THREE.Vector3(side, 0, 0), -side * origin.x),
          new THREE.Plane(new THREE.Vector3(0, 1, 0), -minY),
          new THREE.Plane(new THREE.Vector3(0, -1, 0), maxY),
        ];
        const holder = this.createClippedFragment(unit.root, planes);
        this.scene.add(holder);
        const angle = (fragments.length / pieceCount) * Math.PI * 2 + side * 0.18;
        const driftDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(0.75 + row * 0.12);
        fragments.push({
          holder,
          origin: origin.clone(),
          driftDir,
          rotSpeed: [side * (4.5 + row * 1.2), (row % 2 === 0 ? 1 : -1) * (3.8 + column)],
          clipPlanes: planes,
          clipPlaneNormals: planes.map((plane) => plane.normal.clone()),
          clipPlaneOffsets: planes.map((plane) => plane.coplanarPoint(new THREE.Vector3()).sub(origin)),
        });
      }
    }
    unit.root.visible = false;
    return fragments;
  }

  private updateFragmentClipping(fragment: ShatterFragment): void {
    if (fragment.clipPlanes === undefined || fragment.clipPlaneNormals === undefined || fragment.clipPlaneOffsets === undefined) return;
    fragment.clipPlanes.forEach((plane, index) => {
      const normal = fragment.clipPlaneNormals![index]!.clone().applyQuaternion(fragment.holder.quaternion);
      const point = fragment.clipPlaneOffsets![index]!.clone().applyQuaternion(fragment.holder.quaternion).add(fragment.holder.position);
      plane.normal.copy(normal);
      plane.constant = -normal.dot(point);
    });
  }

  private spawnBloodEffect(origin: THREE.Vector3, direction: THREE.Vector3): void {
    const count = 16;
    const positions = new Float32Array(count * 3);
    const velocities = Array.from({ length: count }, () => new THREE.Vector3(
      direction.x * (0.12 + Math.random() * 0.25) + (Math.random() - 0.5) * 0.18,
      0.04 + Math.random() * 0.24,
      direction.z * (0.12 + Math.random() * 0.25) + (Math.random() - 0.5) * 0.18
    ));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dropTexture = this.makeSoftTexture('#FFFFFF', 0.72);
    const material = new THREE.PointsMaterial({ color: '#780710', map: dropTexture, alphaTest: 0.04, size: 0.045, transparent: true, opacity: 0.92, depthWrite: false });
    const drops = new THREE.Points(geometry, material);
    const bloodMat = new THREE.MeshPhysicalMaterial({ color: '#420006', roughness: 0.3, metalness: 0, clearcoat: 0.75, clearcoatRoughness: 0.18, transparent: true, opacity: 0.94, depthWrite: false });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.32, 40), bloodMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(origin.x + direction.x * 0.12, 0.012, origin.z + direction.z * 0.12);
    pool.scale.set(0.06, 0.04, 1);
    this.scene.add(drops, pool);
    const start = performance.now();
    const tick = (): void => {
      const elapsed = (performance.now() - start) / 1000;
      const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < count; i += 1) {
        const v = velocities[i]!;
        attr.setXYZ(i, origin.x + v.x * elapsed, Math.max(0.025, origin.y + v.y * elapsed - 1.8 * elapsed * elapsed), origin.z + v.z * elapsed);
      }
      attr.needsUpdate = true;
      const poolT = easeOutQuad(clamp01((elapsed - 0.12) / 0.9));
      pool.scale.set(
        THREE.MathUtils.lerp(0.06, 1.25, poolT),
        THREE.MathUtils.lerp(0.04, 0.82, poolT),
        1
      );
      material.opacity = elapsed < 2 ? 0.9 : 0.9 * (1 - clamp01((elapsed - 2) / AFTERMATH_FADE_SEC));
      bloodMat.opacity = elapsed < 2 ? 0.94 : 0.94 * (1 - clamp01((elapsed - 2) / AFTERMATH_FADE_SEC));
      if (elapsed < 2 + AFTERMATH_FADE_SEC) requestAnimationFrame(tick);
      else {
        this.scene.remove(drops, pool);
        geometry.dispose(); material.dispose(); dropTexture.dispose(); pool.geometry.dispose();
        bloodMat.dispose();
      }
    };
    requestAnimationFrame(tick);
  }

  private makeSoftTexture(color: string, core = 0.55): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context === null) throw new Error('CombatDirector: canvas 2D context unavailable');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
    gradient.addColorStop(0, color);
    gradient.addColorStop(core, color);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private spawnCutGlow(origin: THREE.Vector3, diagonal: boolean): void {
    const material = new THREE.MeshBasicMaterial({ color: '#B20D1B', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const start = diagonal ? new THREE.Vector3(-0.25, 0.25, 0) : new THREE.Vector3(0, 0.3, 0);
    const end = diagonal ? new THREE.Vector3(0.25, -0.25, 0) : new THREE.Vector3(0, -0.3, 0);
    const curve = new THREE.QuadraticBezierCurve3(start, new THREE.Vector3(diagonal ? 0.035 : 0.045, 0, 0.025), end);
    const wound = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.012, 8, false), material);
    wound.position.copy(origin);
    this.scene.add(wound);
    this.fadeTransient(wound, material, 0.42, 1.8);
  }

  private spawnMagicProjectile(from: THREE.Vector3, to: THREE.Vector3, durationSec: number): void {
    const coreMaterial = new THREE.MeshBasicMaterial({ color: '#FFF7FF', transparent: true, opacity: 0.96 });
    const shellMaterial = new THREE.MeshPhysicalMaterial({ color: '#A12BFF', emissive: '#7A00DB', emissiveIntensity: 4, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.62 });
    const glowTexture = this.makeSoftTexture('#DCA6FF', 0.18);
    const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: '#DCA6FF', transparent: true, opacity: 0.74, depthWrite: false, blending: THREE.AdditiveBlending });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.SphereGeometry(0.065, 24, 16), coreMaterial));
    group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 2), shellMaterial));
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.setScalar(0.58);
    group.add(glow);
    const light = new THREE.PointLight('#C66CFF', 2.8, 2.5, 2);
    group.add(light);
    this.scene.add(group);
    const start = performance.now();
    const duration = Math.max(0.18, durationSec);
    let lastTrailAt = -1;
    const tick = (): void => {
      const t = clamp01((performance.now() - start) / 1000 / duration);
      group.position.lerpVectors(from, to, easeInQuad(t));
      group.rotation.y = t * Math.PI * 8;
      group.scale.setScalar(0.82 + Math.sin(t * Math.PI) * 0.35);
      if (t - lastTrailAt > 0.07) {
        lastTrailAt = t;
        this.spawnMagicTrail(group.position.clone(), glowTexture);
      }
      if (t < 1) requestAnimationFrame(tick);
      else {
        this.scene.remove(group);
        group.traverse((obj) => { if (obj instanceof THREE.Mesh) obj.geometry.dispose(); });
        coreMaterial.dispose(); shellMaterial.dispose(); glowMaterial.dispose();
        setTimeout(() => glowTexture.dispose(), 350);
      }
    };
    requestAnimationFrame(tick);
  }

  private spawnMagicTrail(position: THREE.Vector3, texture: THREE.Texture): void {
    const material = new THREE.SpriteMaterial({ map: texture, color: '#A84BFF', transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(0.26);
    this.scene.add(sprite);
    const start = performance.now();
    const tick = (): void => {
      const t = clamp01((performance.now() - start) / 260);
      sprite.scale.setScalar(0.26 + t * 0.18);
      material.opacity = 0.38 * (1 - t);
      if (t < 1) requestAnimationFrame(tick);
      else { this.scene.remove(sprite); material.dispose(); }
    };
    requestAnimationFrame(tick);
  }

  private spawnArcaneBurst(origin: THREE.Vector3, color: string): void {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.12, 24), material);
    ring.position.copy(origin);
    ring.rotation.x = -Math.PI / 2;
    const glowTexture = this.makeSoftTexture('#FFFFFF', 0.16);
    const glowMaterial = new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, opacity: 0.62, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.Sprite(glowMaterial);
    glow.position.copy(origin);
    glow.scale.setScalar(0.72);
    const light = new THREE.PointLight(color, 4.5, 2.8, 2);
    light.position.copy(origin).setY(origin.y + 0.18);
    this.scene.add(ring, glow, light);
    this.fadeTransient(ring, material, 0.42, 6);
    const start = performance.now();
    const tick = (): void => {
      const t = clamp01((performance.now() - start) / 420);
      glow.scale.setScalar(0.72 + t * 1.1);
      glowMaterial.opacity = 0.62 * (1 - t);
      light.intensity = 4.5 * (1 - t);
      if (t < 1) requestAnimationFrame(tick);
      else { this.scene.remove(glow, light); glowMaterial.dispose(); glowTexture.dispose(); }
    };
    requestAnimationFrame(tick);
  }

  private spawnDustCloud(origin: THREE.Vector3, color: string, count: number, radius: number): void {
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = radius * (0.18 + Math.random() * 0.42);
      positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.12;
      positions[i * 3 + 1] = origin.y + Math.random() * 0.12;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.12;
      velocities.push(new THREE.Vector3(Math.cos(angle) * speed, 0.08 + Math.random() * 0.16, Math.sin(angle) * speed));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const texture = this.makeSoftTexture('#FFFFFF', 0.22);
    const material = new THREE.PointsMaterial({ color, map: texture, size: 0.12, transparent: true, opacity: 0.34, depthWrite: false, alphaTest: 0.015 });
    const cloud = new THREE.Points(geometry, material);
    this.scene.add(cloud);
    const start = performance.now();
    const lifetime = 1.05;
    const tick = (): void => {
      const elapsed = (performance.now() - start) / 1000;
      const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < count; i += 1) {
        const v = velocities[i]!;
        attr.setXYZ(i, positions[i * 3]! + v.x * elapsed, positions[i * 3 + 1]! + v.y * elapsed * 0.55, positions[i * 3 + 2]! + v.z * elapsed);
      }
      attr.needsUpdate = true;
      material.opacity = 0.34 * (1 - easeInQuad(clamp01(elapsed / lifetime)));
      material.size = 0.12 + elapsed * 0.08;
      if (elapsed < lifetime) requestAnimationFrame(tick);
      else { this.scene.remove(cloud); geometry.dispose(); material.dispose(); texture.dispose(); }
    };
    requestAnimationFrame(tick);
  }

  private fadeTransient(mesh: THREE.Mesh, material: THREE.MeshBasicMaterial, durationSec: number, growth: number): void {
    const start = performance.now();
    const tick = (): void => {
      const t = clamp01((performance.now() - start) / 1000 / durationSec);
      mesh.scale.setScalar(1 + t * growth);
      material.opacity = 0.85 * (1 - t);
      if (t < 1) requestAnimationFrame(tick);
      else { this.scene.remove(mesh); mesh.geometry.dispose(); material.dispose(); }
    };
    requestAnimationFrame(tick);
  }

  /**
   * Bishop 오브 재질은 `MaterialCache`(같은 진영 전체가 공유)에서 온 것이라 직접 수정하면 안 된다
   * (Sprint 8 §하얗게 밝아지던 버그와 동일 원인). 클론에만 채널링 발광을 적용했다가 원복한다.
   */
  private channelBishopOrb(attackerUnit: UnitInstance, windupSec: number): void {
    const orb = attackerUnit.root.getObjectByName('bishop.orbMesh');
    if (!(orb instanceof THREE.Mesh) || !(orb.material instanceof THREE.MeshPhysicalMaterial)) return;
    const original = orb.material;
    const glow = original.clone();
    orb.material = glow;
    const start = performance.now();
    const durationMs = Math.max(1, windupSec * 1000);
    const tick = (): void => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      glow.emissiveIntensity = THREE.MathUtils.lerp(0.9, 5, t);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          orb.material = original;
          glow.dispose();
        }, 400);
      }
    };
    requestAnimationFrame(tick);
  }

  /**
   * Bishop 낙뢰 — 방어자 머리 위에서 지그재그로 내리꽂히는 번개(사용자 요청으로 더 크고 길게 개선:
   * 굵은 바깥 글로우 + 얇은 밝은 코어의 이중 볼트, 초반 지지직 깜빡임 후 서서히 페이드,
   * 착지 지점의 확산하는 임팩트 링).
   */
  private spawnLightningBolt(top: THREE.Vector3, bottom: THREE.Vector3, color = '#B47FFF'): void {
    const segments = 10;
    const jitter = 0.32;
    const points: THREE.Vector3[] = [top.clone()];
    for (let i = 1; i < segments; i += 1) {
      const t = i / segments;
      const point = top.clone().lerp(bottom, t);
      point.x += (Math.random() - 0.5) * jitter;
      point.z += (Math.random() - 0.5) * jitter;
      points.push(point);
    }
    points.push(bottom.clone());

    const buildBoltMesh = (radius: number, material: THREE.Material): THREE.Group => {
      const boltGroup = new THREE.Group();
      for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i]!;
        const b = points[i + 1]!;
        const dir = new THREE.Vector3().subVectors(b, a);
        const len = dir.length() || 0.001;
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6), material);
        seg.position.copy(a).addScaledVector(dir, 0.5);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        boltGroup.add(seg);
      }
      return boltGroup;
    };

    const coreMat = new THREE.MeshBasicMaterial({ color: '#EAD9FF', transparent: true, opacity: 1 });
    const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
    const group = new THREE.Group();
    group.add(buildBoltMesh(0.034, glowMat));
    group.add(buildBoltMesh(0.015, coreMat));
    const impactLight = new THREE.PointLight(color, 5.5, 3.2, 2);
    impactLight.position.copy(bottom).setY(bottom.y + 0.35);
    group.add(impactLight);

    // 착지 지점 임팩트 플래시 — 확 밝아졌다 넓게 퍼지며 사라지는 링.
    const flashMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const flash = new THREE.Mesh(new THREE.RingGeometry(0.01, 0.4, 24), flashMat);
    flash.position.copy(bottom);
    flash.rotation.x = -Math.PI / 2;
    group.add(flash);

    this.scene.add(group);

    const start = performance.now();
    const lifetimeSec = 0.65;
    const flickerEndSec = 0.22; // 초반 0.22초는 지지직 깜빡이는 구간, 이후 서서히 페이드.
    const tick = (): void => {
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed < flickerEndSec) {
        const flicker = 0.55 + 0.45 * Math.abs(Math.sin(elapsed * 55));
        coreMat.opacity = flicker;
        glowMat.opacity = 0.5 * flicker;
        impactLight.intensity = 3.5 + flicker * 3;
      } else {
        const fadeT = clamp01((elapsed - flickerEndSec) / (lifetimeSec - flickerEndSec));
        coreMat.opacity = 1 - fadeT;
        glowMat.opacity = 0.5 * (1 - fadeT);
        impactLight.intensity = 5.5 * (1 - fadeT);
      }
      const flashT = Math.min(1, elapsed / 0.35);
      flash.scale.setScalar(1 + flashT * 2.2);
      flashMat.opacity = Math.max(0, 0.9 * (1 - flashT));

      if (elapsed < lifetimeSec) {
        requestAnimationFrame(tick);
      } else {
        this.scene.remove(group);
        group.traverse((obj) => {
          if (obj instanceof THREE.Mesh) obj.geometry.dispose();
        });
        coreMat.dispose();
        glowMat.dispose();
        flashMat.dispose();
      }
    };
    requestAnimationFrame(tick);
  }

  private finalize(attackerFrom: Square, attackerSquare: Square, defenderSquare: Square, shatterFragments: readonly ShatterFragment[]): void {
    // 일반 캡처는 defenderSquare === attackerSquare(=move.to), 앙파상은 다른 칸 — 어느 쪽이든 방어자가
    // 실제로 서 있는 칸(defenderSquare)에서 제거한 뒤 공격자를 attackerFrom → attackerSquare로 스냅한다.
    this.unitBoard.removeUnitAt(defenderSquare);
    this.unitBoard.relocateUnit(attackerFrom, attackerSquare);
    // Queen/King/Rook 파쇄 연출로 씬에 직접 추가해뒀던 파편들도 함께 정리한다.
    for (const frag of shatterFragments) {
      this.scene.remove(frag.holder);
      if (frag.holder instanceof THREE.Mesh && frag.holder.userData['combatDisposable'] === true) {
        frag.holder.geometry.dispose();
        if (frag.holder.material instanceof THREE.Material) frag.holder.material.dispose();
      }
      if (frag.holder.userData['combatClipped'] === true) {
        frag.holder.traverse((obj) => {
          if (!(obj instanceof THREE.Mesh)) return;
          if (Array.isArray(obj.material)) for (const material of obj.material) material.dispose();
          else obj.material.dispose();
        });
      }
    }

    // 공격자 회전 및 본 자세 복원
    const attackerUnit = this.unitBoard.getUnitAt(attackerSquare);
    if (attackerUnit !== undefined) {
      this.unitBoard.restoreFacingAt(attackerSquare);
      const shoulderR = attackerUnit.bones['shoulder.R'];
      if (shoulderR !== undefined) shoulderR.rotation.set(0, 0, 0);
      const elbowR = attackerUnit.bones['elbow.R'];
      if (elbowR !== undefined) elbowR.rotation.set(0, 0, 0);
    }
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
