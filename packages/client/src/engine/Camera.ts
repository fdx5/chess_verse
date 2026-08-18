import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** 기본 궤도 카메라 (D5-5 §기본 궤도 카메라 수치 그대로). */
export class OrbitCameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  constructor(domElement: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 10, 9);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.15;
    this.controls.minDistance = 6.0;
    this.controls.maxDistance = 14.0;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.update();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** damping 정착까지 매 프레임 호출 필요. 실제로 카메라가 움직였는지 여부를 반환(RenderScheduler dirty 판정용). */
  update(): boolean {
    return this.controls.update();
  }

  dispose(): void {
    this.controls.dispose();
  }
}
