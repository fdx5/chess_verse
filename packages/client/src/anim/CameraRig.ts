import * as THREE from 'three';
import type { OrbitCameraRig } from '../engine/Camera';
import type { CameraShotDef } from './AnimationRegistry';

const TRANSITION_OUT_SECONDS = 0.4;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

interface CameraSnapshot {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

/**
 * D5-5 §시네마틱 카메라 리그 — `CameraShotDef.curve`(Catmull-Rom 제어점)를 방어자 월드 위치 기준
 * 오프셋으로 해석해 카메라를 이동시키고, 연출 종료 시 원래 궤도 카메라 상태로 보간 복귀한다.
 * `CombatDirector`가 아니라 이 파일이 카메라 수학을 전담해 D9 Sprint 6 산출물 경계를 지킨다.
 */
export class CameraRig {
  private snapshot: CameraSnapshot | null = null;
  private restoreElapsed = 0;
  private restoreFrom: CameraSnapshot | null = null;
  private shakeStrength = 0;
  private shakeElapsed = 0;

  constructor(private readonly orbit: OrbitCameraRig) {}

  begin(): void {
    this.snapshot = { position: this.orbit.camera.position.clone(), target: this.orbit.controls.target.clone(), fov: this.orbit.camera.fov };
    this.orbit.controls.enabled = false;
  }

  /** t는 0~1 정규화 씬 진행률. curve 제어점(로컬 오프셋)을 Catmull-Rom으로 보간해 subject 기준 위치를 만든다. */
  update(t: number, shot: CameraShotDef, subjectWorld: THREE.Vector3): void {
    if (shot.curve.length === 0) return;
    const points = shot.curve.map((p) => new THREE.Vector3(p.position[0], p.position[1], p.position[2]));
    const offset =
      points.length === 1
        ? points[0]!.clone()
        : new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5).getPoint(THREE.MathUtils.clamp(t, 0, 1));

    this.orbit.camera.position.copy(subjectWorld).add(offset);
    if (this.shakeStrength > 0) {
      const envelope = Math.max(0, 1 - this.shakeElapsed / 0.28);
      const frequency = this.shakeElapsed * 72;
      this.orbit.camera.position.x += Math.sin(frequency) * this.shakeStrength * envelope;
      this.orbit.camera.position.y += Math.sin(frequency * 1.71) * this.shakeStrength * 0.55 * envelope;
      this.orbit.camera.position.z += Math.cos(frequency * 1.23) * this.shakeStrength * 0.7 * envelope;
      this.shakeElapsed += 1 / 60;
      if (envelope <= 0) this.shakeStrength = 0;
    }
    this.orbit.camera.lookAt(subjectWorld);
    this.orbit.camera.fov = this.lensMmToFov(shot.lensMm);
    this.orbit.camera.updateProjectionMatrix();
  }

  kick(strength: number): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
    this.shakeElapsed = 0;
  }

  /** D5-5 §전환 OUT: 0.4s easeOutCubic으로 연출 시작 직전 궤도 카메라 상태로 복귀. */
  beginRestore(): void {
    this.restoreFrom = { position: this.orbit.camera.position.clone(), target: this.orbit.controls.target.clone(), fov: this.orbit.camera.fov };
    this.restoreElapsed = 0;
  }

  /** 반환값 true면 복귀가 끝났다(더 이상 호출 불필요). */
  updateRestore(dtSeconds: number): boolean {
    if (this.snapshot === null || this.restoreFrom === null) return true;
    this.restoreElapsed += dtSeconds;
    const t = Math.min(1, this.restoreElapsed / TRANSITION_OUT_SECONDS);
    const e = easeOutCubic(t);
    this.orbit.camera.position.lerpVectors(this.restoreFrom.position, this.snapshot.position, e);
    this.orbit.controls.target.lerpVectors(this.restoreFrom.target, this.snapshot.target, e);
    this.orbit.camera.lookAt(this.orbit.controls.target);
    // D5-5 카메라 리그가 연출 중 바꾼 FOV(§update())도 함께 복원해야 한다 — 안 그러면 OrbitControls의
    // 줌(거리)은 정상 작동해도 화각이 망원렌즈 상태로 고정돼 "아무리 스크롤해도 확대된 채" 보인다.
    this.orbit.camera.fov = THREE.MathUtils.lerp(this.restoreFrom.fov, this.snapshot.fov, e);
    this.orbit.camera.updateProjectionMatrix();
    if (t >= 1) {
      this.orbit.controls.enabled = true;
      this.orbit.controls.update();
      this.snapshot = null;
      this.restoreFrom = null;
      return true;
    }
    return false;
  }

  private lensMmToFov(lensMm: number): number {
    // 35mm 환산 수직 FOV 근사: FOV = 2 * atan(24 / (2 * lensMm)) (36x24 풀프레임 센서 세로 기준 단순화)
    return THREE.MathUtils.radToDeg(2 * Math.atan(24 / (2 * lensMm)));
  }
}
