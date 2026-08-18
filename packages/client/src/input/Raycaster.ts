import * as THREE from 'three';
import { squareOf, type Square } from '@battle-chess/chess-core';

const BOARD_HALF = 4.0;
const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hitPoint = new THREE.Vector3();

/** D7 §데스크톱 조작 — 레이캐스트 대상을 보드 평면 하나로 제한해 비용을 최소화한다(개별 유닛 메시 대상 X). */
export function pickSquare(clientX: number, clientY: number, canvas: HTMLCanvasElement, camera: THREE.Camera): Square | null {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.ray.intersectPlane(boardPlane, hitPoint);
  if (hit === null) return null;

  const file = Math.floor(hitPoint.x + BOARD_HALF);
  const rank = Math.floor(hitPoint.z + BOARD_HALF);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return squareOf(file, rank);
}
