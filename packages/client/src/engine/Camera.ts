import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** 기본 궤도 카메라 (D5-5 §기본 궤도 카메라 수치 그대로). */
export class OrbitCameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  constructor(domElement: HTMLElement) {
    // 사용자 요청 — 360도 배경(벽화)이 화면에 거의 안 잡히던 원인: OrbitControls는 카메라가 항상
    // 지면(target)을 바라보게 만들어, 카메라를 아무리 "높게" 띄워도 시선이 그만큼 더 아래로 꺾여
    // 오히려 바닥 방향만 더 넓게 잡히고 수평선(벽면·벽화가 있는 높이)은 프레임 위쪽 바깥으로 밀려나
    // 있었다. FOV를 넓히고(45→58) 기본 시점을 수평에 더 가깝게 낮춰서 프레임 상단이 수평선 근처까지
    // 닿게 했다 — 이게 "카메라를 높이 든다"보다 실제로 벽화를 더 많이 보여주는 방향이다.
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 100);
    // 사용자 요청 — 기본 시점을 백진영 뒤쪽(-Z)에 둬서 백이 흑을 바라보는 방향으로 시작한다.
    // squareToWorld()가 rank 0(백 시작 랭크)을 -Z, rank 7(흑 시작 랭크)을 +Z에 배치하므로,
    // 카메라를 +Z가 아닌 -Z에 두면 항상 백이 화면 앞쪽(카메라 쪽)에 서게 되어 매 대전 시작마다
    // 수동으로 궤도 회전시킬 필요가 없다.
    this.camera.position.set(0, 6, -10);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.target.set(0, 0, 0);
    // maxPolarAngle을 크게 열어(0.95→1.3) 사용자가 원하면 훨씬 더 수평에 가까운 각도까지 내려서
    // 벽면을 넓게 볼 수 있게 한다. 90°(=수평)에 너무 가까우면 카메라가 바닥 높이까지 내려가
    // 지오메트리를 뚫고 지나갈 수 있어 74° 선에서 제한.
    this.controls.minPolarAngle = 0.2;
    this.controls.maxPolarAngle = 1.45;
    // 사용자 요청 §카메라 줌인 확대폭 대폭 상향 — 유닛 얼굴/상반신까지 초근접(Close-up) 확대 가능 (6.0 -> 1.2)
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 22.0;
    this.controls.enablePan = true;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // D9 Sprint 10 §터치 — 한 손가락 회전/두 손가락 확대·이동(THREE.js 기본값과 동일하지만 의도를 명시).
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
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
