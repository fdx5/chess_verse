import * as THREE from 'three';

/** WebGLRenderer 래퍼. devicePixelRatio 클램프(D9)와 리사이즈만 책임진다. */
export class GameRenderer {
  readonly webgl: THREE.WebGLRenderer;
  private pixelRatioCap: number;

  constructor(canvas: HTMLCanvasElement, pixelRatioCap: number) {
    this.pixelRatioCap = pixelRatioCap;
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatioCap));
    this.resize();
  }

  setPixelRatioCap(cap: number): void {
    this.pixelRatioCap = cap;
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatioCap));
  }

  resize(): void {
    const canvas = this.webgl.domElement;
    const parent = canvas.parentElement;
    const width = parent !== null ? parent.clientWidth : window.innerWidth;
    const height = parent !== null ? parent.clientHeight : window.innerHeight;
    this.webgl.setSize(width, height, false);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.webgl.render(scene, camera);
  }

  dispose(): void {
    this.webgl.dispose();
  }
}
