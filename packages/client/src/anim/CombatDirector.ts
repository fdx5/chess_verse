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
import type { UnitBoard } from '../units/UnitBoard';
import { squareToWorld } from '../units/UnitBoard';
import type { UnitInstance } from '../units/UnitProvider';
import type { OrbitCameraRig } from '../engine/Camera';
import { AnimationRegistry, type CombatSceneDef, type VfxCueDef, type SfxCueDef } from './AnimationRegistry';
import { CameraRig } from './CameraRig';
import { SoundRegistry } from '../audio/SoundRegistry';
import { MOVEMENT_PROFILES } from './movementClips';
import { detachSubtree } from './effects/FinisherEffects';

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
const QUEEN_WINDUP_SEC = 0.16;
const QUEEN_STRIKE_SEC = 0.14;
const QUEEN_SHATTER_RELAX_SEC = 0.4;
const KING_WINDUP_SEC = 0.18;
const KING_STRIKE_SEC = 0.14;
const KING_SHATTER_RELAX_SEC = 0.4;

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

/** 룩 전용 거대 오른손 주먹(Right Fist) 모델을 생성한다 — 스컬프트/탑 형태의 룩이라도 명확한 오른손 강타 펀치를 시각화한다. */
function createRookFist(isWhite: boolean): THREE.Group {
  const fistGroup = new THREE.Group();
  fistGroup.name = 'rook.rightFist';

  const stoneColor = isWhite ? 0xbaa882 : 0x332f29;
  const accentColor = isWhite ? 0xd4af37 : 0x5a554e;
  const mat = new THREE.MeshStandardMaterial({
    color: stoneColor,
    roughness: 0.65,
    metalness: 0.25,
    emissive: accentColor,
    emissiveIntensity: 0.2,
  });

  // 손목/팔뚝
  const forearmGeom = new THREE.CylinderGeometry(0.08, 0.12, 0.35, 12);
  forearmGeom.rotateX(Math.PI / 2);
  const forearm = new THREE.Mesh(forearmGeom, mat);
  forearm.position.set(0, 0, -0.18);
  fistGroup.add(forearm);

  // 주먹 덩어리
  const palmGeom = new THREE.BoxGeometry(0.24, 0.2, 0.26);
  const palm = new THREE.Mesh(palmGeom, mat);
  fistGroup.add(palm);

  // 손가락 마디 (4개 손가락이 쥔 형태)
  const knucklesGeom = new THREE.BoxGeometry(0.25, 0.1, 0.14);
  const knuckles = new THREE.Mesh(knucklesGeom, mat);
  knuckles.position.set(0, 0.04, 0.14);
  fistGroup.add(knuckles);

  // 엄지손가락
  const thumbGeom = new THREE.BoxGeometry(0.08, 0.14, 0.12);
  const thumb = new THREE.Mesh(thumbGeom, mat);
  thumb.position.set(-0.13, 0.02, 0.06);
  thumb.rotation.z = 0.35;
  fistGroup.add(thumb);

  return fistGroup;
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
  rookFistHolder?: THREE.Group | undefined;
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
      const totalDuration = this.pacing === 'short' ? scene.totalDuration * 0.5 : scene.totalDuration;
      const approachBeat = scene.beats.find((b) => b.kind === 'approach');
      const approachDuration = approachBeat !== undefined ? (approachBeat.endSec / scene.totalDuration) * totalDuration : totalDuration * 0.3;
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

    active.elapsed += dtSeconds;

    // Short 페이싱은 totalDuration을 절반으로 줄이므로, 피니셔의 절대 초 상수도 같은 비율로
    // 축소해야 scene이 정의한 death/result 비트 안에 들어맞는다.
    const pacingScale = active.totalDuration / active.scene.totalDuration;

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
      let lunge = 0;
      if (finisherT <= windupEnd) {
        const wT = easeOutQuad(clamp01(finisherT / windupSec));
        if (shoulderR !== undefined) shoulderR.rotation.x = THREE.MathUtils.lerp(0, -0.5, wT);
      } else if (finisherT <= strikeEnd) {
        const sT = easeInQuad(clamp01((finisherT - windupEnd) / strikeSec));
        if (shoulderR !== undefined) shoulderR.rotation.x = THREE.MathUtils.lerp(-0.5, -1.9, sT);
        lunge = 0.16 * sT;
      } else {
        const relaxT = easeOutQuad(clamp01((finisherT - strikeEnd) / knockdownSec));
        if (shoulderR !== undefined) shoulderR.rotation.x = THREE.MathUtils.lerp(-1.9, -0.9, relaxT);
        lunge = 0.16 * (1 - 0.5 * relaxT);
      }
      attackerUnit.root.position.set(clampedX + lungeUX * lunge, 0, clampedZ + lungeUZ * lunge);
    }

    if (defenderUnit !== undefined) {
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

    if (defenderUnit !== undefined) {
      this.applyTopple(active, defenderUnit, finisherT, strikeEnd, knockdownSec, pacingScale);
    }
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
    const knockdownSec = KNOCKDOWN_SEC * pacingScale;
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

    if (defenderUnit !== undefined) {
      this.applyTopple(active, defenderUnit, finisherT, strikeEnd, knockdownSec, pacingScale);
    }
  }

  /** Rook — 오른손을 뒤로 뺐다가 강력하게 내질러 적 기물을 산산조각 내어 가루로 소멸시킨다(사용자 요청). */
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
    // 우측 수직 벡터 (오른손 어깨 위치 계산용)
    const rightDirX = -lungeDirZ;
    const rightDirZ = lungeDirX;

    // 1) 오른손 주먹(Right Fist) 모델 생성 (피니셔 진입 시 1회 씬에 부착)
    if (active.rookFistHolder === undefined) {
      active.rookFistHolder = createRookFist(active.attackerColor === 'w');
      this.scene.add(active.rookFistHolder);
    }
    const fist = active.rookFistHolder;

    const shoulderR = attackerUnit?.bones['shoulder.R'];
    const elbowR = attackerUnit?.bones['elbow.R'];

    if (attackerUnit !== undefined) {
      let bodyLunge = 0;
      let bodyTiltY = 0;
      let bodyTiltZ = 0;

      // 주먹 기본 어깨 위치
      const shoulderX = clampedX + rightDirX * 0.32;
      const shoulderZ = clampedZ + rightDirZ * 0.32;
      const fistBaseY = 0.52;
      const punchRotY = Math.atan2(lungeDirX, lungeDirZ);

      if (finisherT <= windupEnd) {
        // [와인드업] 룩 본체 우측 뒤로 비틀기 + 주먹 뒤로 당기며 장전
        const wT = easeOutQuad(clamp01(finisherT / windupSec));
        bodyTiltY = -0.42 * wT;
        bodyTiltZ = 0.12 * wT;

        fist.position.set(
          shoulderX - lungeDirX * (0.35 * wT),
          fistBaseY + 0.22 * wT,
          shoulderZ - lungeDirZ * (0.35 * wT)
        );
        fist.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), punchRotY - 0.4 * wT);
        fist.scale.setScalar(1.0);

        if (shoulderR !== undefined) {
          shoulderR.rotation.x = THREE.MathUtils.lerp(0, -1.8, wT);
          shoulderR.rotation.y = THREE.MathUtils.lerp(0, -0.6, wT);
          shoulderR.rotation.z = THREE.MathUtils.lerp(0, 0.4, wT);
        }
        if (elbowR !== undefined) elbowR.rotation.x = THREE.MathUtils.lerp(0, -1.2, wT);
      } else if (finisherT <= strikeEnd) {
        // [스트라이크] 전방 폭발적 런지 및 오른손 주먹 직격 강타
        const sT = easeInQuad(clamp01((finisherT - windupEnd) / strikeSec));
        bodyLunge = 0.32 * sT;
        bodyTiltY = THREE.MathUtils.lerp(-0.42, 0.35, sT);
        bodyTiltZ = THREE.MathUtils.lerp(0.12, -0.15, sT);

        const targetX = defX - lungeDirX * 0.05;
        const targetZ = defZ - lungeDirZ * 0.05;
        fist.position.set(
          THREE.MathUtils.lerp(shoulderX - lungeDirX * 0.35, targetX, sT),
          THREE.MathUtils.lerp(fistBaseY + 0.22, 0.45, sT),
          THREE.MathUtils.lerp(shoulderZ - lungeDirZ * 0.35, targetZ, sT)
        );
        fist.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), punchRotY);
        fist.scale.setScalar(1.0 + 0.2 * sT);

        if (shoulderR !== undefined) {
          shoulderR.rotation.x = THREE.MathUtils.lerp(-1.8, 1.4, sT);
          shoulderR.rotation.y = THREE.MathUtils.lerp(-0.6, 0.3, sT);
          shoulderR.rotation.z = THREE.MathUtils.lerp(0.4, -0.2, sT);
        }
        if (elbowR !== undefined) elbowR.rotation.x = THREE.MathUtils.lerp(-1.2, 0.2, sT);
      } else {
        // [릴랙스] 타격 후 본체 원복 및 주먹 소멸
        const rT = easeOutQuad(clamp01((finisherT - strikeEnd) / (ROOK_SHATTER_RELAX_SEC * pacingScale)));
        bodyLunge = 0.32 * (1 - 0.7 * rT);
        bodyTiltY = THREE.MathUtils.lerp(0.35, 0, rT);
        bodyTiltZ = THREE.MathUtils.lerp(-0.15, 0, rT);

        fist.scale.setScalar(Math.max(0.001, 1.2 * (1 - rT)));

        if (shoulderR !== undefined) {
          shoulderR.rotation.x = THREE.MathUtils.lerp(1.4, 0.1, rT);
          shoulderR.rotation.y = THREE.MathUtils.lerp(0.3, 0, rT);
          shoulderR.rotation.z = THREE.MathUtils.lerp(-0.2, 0, rT);
        }
        if (elbowR !== undefined) elbowR.rotation.x = THREE.MathUtils.lerp(0.2, 0, rT);
      }

      attackerUnit.root.position.set(
        clampedX + lungeDirX * bodyLunge,
        0,
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
      const head = defenderUnit.bones['head'];
      if (head !== undefined) {
        const holder = detachSubtree(head, this.scene);
        active.shatterFragments.push({
          holder,
          origin: holder.position.clone(),
          driftDir: new THREE.Vector3(lungeDirX * 0.8 + 0.4, 0, lungeDirZ * 0.8 + 0.3).normalize(),
          rotSpeed: [10, 8],
        });
      }

      const bodyOrigin = defenderUnit.root.position.clone();
      const fragmentCount = 8;
      for (let i = 0; i < fragmentCount; i++) {
        const angle = (i / fragmentCount) * Math.PI * 2 + (i % 2 === 0 ? 0.2 : -0.2);
        const clone = defenderUnit.root.clone(true);
        const fragScale = 0.3 + (i % 3) * 0.08;
        clone.scale.setScalar(fragScale);
        this.scene.add(clone);

        const driftSpeed = 1.6 + (i % 4) * 0.3;
        active.shatterFragments.push({
          holder: clone,
          origin: bodyOrigin,
          driftDir: new THREE.Vector3(Math.cos(angle) * driftSpeed, 0, Math.sin(angle) * driftSpeed),
          rotSpeed: [(i % 2 === 0 ? 1 : -1) * (10 + i * 2), (i % 3 === 0 ? 1 : -1) * (8 + i * 2)],
        });
      }
    }

    const shatterT = finisherT - strikeEnd;
    this.updateShatterFragments(active.shatterFragments, shatterT, 1.6, 3.8);

    // 원본 중심체 — 타격 직후 즉시 으스러져 가루가 되며 빠르게 축소 및 소멸
    const gravity = 3.8;
    defenderUnit.root.position.set(
      defX + lungeDirX * shatterT * 0.3,
      Math.max(0, shatterT * 0.5 - 0.5 * gravity * shatterT * shatterT),
      defZ + lungeDirZ * shatterT * 0.3
    );
    defenderUnit.root.rotation.x = shatterT * 12;
    defenderUnit.root.rotation.z = -shatterT * 10;

    const shrinkStart = strikeEnd;
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
      const chest = defenderUnit.bones['chest'];
      if (chest !== undefined) {
        const holder = detachSubtree(chest, this.scene);
        active.shatterFragments.push({
          holder,
          origin: holder.position.clone(),
          driftDir: new THREE.Vector3(active.toppleAxis.x, 0, active.toppleAxis.z),
          rotSpeed: [7, 4.5],
        });
      }
    }

    const shatterT = finisherT - strikeEnd;
    this.updateShatterFragments(active.shatterFragments, shatterT, 1.1, 2.6);

    // 하체(hips/다리/드레스, 원본 유닛) — 상체와 반대 대각 방향으로 흩어진다.
    const [defX, defZ] = active.defenderWorld;
    const driftX = active.toppleAxis.x;
    const driftZ = active.toppleAxis.z;
    const gravity = 2.6;
    defenderUnit.root.position.set(defX - driftX * shatterT * 1.1 * 0.7, Math.max(0, shatterT * 0.5 - 0.5 * gravity * shatterT * shatterT), defZ - driftZ * shatterT * 1.1 * 0.7);
    defenderUnit.root.rotation.x = -shatterT * 5;
    defenderUnit.root.rotation.z = shatterT * 3;

    // 모든 조각(상체 파편 + 원본 하체) 다 서서히 작아지며 사라진다(사용자 요청 §씬 퀄리티 — 갑자기
    // 팝업하듯 사라짐 완화).
    const shrinkStart = Math.max(strikeEnd, active.totalDuration - active.approachDuration - SHRINK_SEC * pacingScale);
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

    this.playThudOnce(active);
    if (active.shatterFragments.length === 0) {
      defenderUnit.mixer.stopAllAction();
      const head = defenderUnit.bones['head'];
      if (head !== undefined) {
        const holder = detachSubtree(head, this.scene);
        active.shatterFragments.push({ holder, origin: holder.position.clone(), driftDir: new THREE.Vector3(0.65, 0, 0.75).normalize(), rotSpeed: [6, 3] });
      }
      // 머리를 뗀 뒤(=이제 헤드리스인) 몸통을 두 번 복제 — 지오메트리/재질은 캐시 공유라 저비용.
      const bodyOrigin = defenderUnit.root.position.clone();
      const bodyAngles: readonly number[] = [(-2 * Math.PI) / 3, (2 * Math.PI) / 3];
      const bodyRotSpeeds: readonly (readonly [number, number])[] = [
        [-5, 4],
        [4, -6],
      ];
      bodyAngles.forEach((angle, i) => {
        const clone = defenderUnit.root.clone(true);
        this.scene.add(clone);
        active.shatterFragments.push({
          holder: clone,
          origin: bodyOrigin,
          driftDir: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
          rotSpeed: bodyRotSpeeds[i]!,
        });
      });
    }

    const shatterT = finisherT - strikeEnd;
    this.updateShatterFragments(active.shatterFragments, shatterT, 1.2, 2.8);

    // 원본 유닛(하체 이하 마지막 네 번째 조각) — 나머지 세 조각과 다른 방향으로.
    const [defX, defZ] = active.defenderWorld;
    const gravity = 2.8;
    defenderUnit.root.position.set(defX - shatterT * 1.2 * 0.6, Math.max(0, shatterT * 0.5 - 0.5 * gravity * shatterT * shatterT), defZ - shatterT * 1.2 * 0.5);
    defenderUnit.root.rotation.x = shatterT * 5;
    defenderUnit.root.rotation.z = -shatterT * 4;

    const shrinkStart = Math.max(strikeEnd, active.totalDuration - active.approachDuration - SHRINK_SEC * pacingScale);
    this.applyShatterShrink(active, defenderUnit, finisherT, shrinkStart);
  }

  /** Queen/King 공용 — 파쇄 파편들을 원점(origin)에서 driftDir 방향으로 포물선 궤적 + 텀블링시킨다. */
  private updateShatterFragments(fragments: readonly ShatterFragment[], shatterT: number, speed: number, gravity: number): void {
    for (const frag of fragments) {
      frag.holder.position.set(
        frag.origin.x + frag.driftDir.x * shatterT * speed,
        Math.max(0.05, frag.origin.y + shatterT * 0.9 - 0.5 * gravity * shatterT * shatterT),
        frag.origin.z + frag.driftDir.z * shatterT * speed
      );
      frag.holder.rotation.x = shatterT * frag.rotSpeed[0];
      frag.holder.rotation.z = shatterT * frag.rotSpeed[1];
    }
  }

  /** Queen/King 공용 — 원본 유닛과 모든 파쇄 파편을 함께 서서히 축소시켜 사라지게 한다. */
  private applyShatterShrink(active: ActiveCombat, defenderUnit: UnitInstance, finisherT: number, shrinkStart: number): void {
    if (finisherT <= shrinkStart) return;
    const totalRel = active.totalDuration - active.approachDuration;
    const shrinkT = clamp01((finisherT - shrinkStart) / Math.max(0.001, totalRel - shrinkStart));
    const scale = 1 - easeInQuad(shrinkT) * 0.92;
    defenderUnit.root.scale.setScalar(scale);
    for (const frag of active.shatterFragments) frag.holder.scale.setScalar(scale);
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
    this.soundRegistry.play(FINISHER_SFX_CUE[active.attackerType]);
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
  private spawnLightningBolt(top: THREE.Vector3, bottom: THREE.Vector3): void {
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
    const glowMat = new THREE.MeshBasicMaterial({ color: '#B47FFF', transparent: true, opacity: 0.5 });
    const group = new THREE.Group();
    group.add(buildBoltMesh(0.034, glowMat));
    group.add(buildBoltMesh(0.015, coreMat));

    // 착지 지점 임팩트 플래시 — 확 밝아졌다 넓게 퍼지며 사라지는 링.
    const flashMat = new THREE.MeshBasicMaterial({ color: '#EAD9FF', transparent: true, opacity: 0.9, side: THREE.DoubleSide });
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
      } else {
        const fadeT = clamp01((elapsed - flickerEndSec) / (lifetimeSec - flickerEndSec));
        coreMat.opacity = 1 - fadeT;
        glowMat.opacity = 0.5 * (1 - fadeT);
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
    for (const frag of shatterFragments) this.scene.remove(frag.holder);

    // 룩의 오른손 주먹(Right Fist) 오브젝트 정리
    if (this.active?.rookFistHolder !== undefined) {
      this.scene.remove(this.active.rookFistHolder);
      this.active.rookFistHolder.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      this.active.rookFistHolder = undefined;
    }

    // 공격자 회전 및 본 자세 복원
    const attackerUnit = this.unitBoard.getUnitAt(attackerSquare);
    if (attackerUnit !== undefined) {
      attackerUnit.root.rotation.set(0, 0, 0);
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
