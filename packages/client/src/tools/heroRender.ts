/**
 * 개발 전용(빌드 진입점 아님) — 메인 메뉴 배경 이미지를 실제 게임 애셋으로 렌더링한다.
 * `/hero.html?...` 쿼리로 카메라/조명을 조정하고 `save=파일명`으로 저장 서버(:8899)에 전송한다.
 */
import * as THREE from 'three';
import { fromFEN } from '@battle-chess/chess-core';
import type { PieceType } from '@battle-chess/chess-core';
import { buildScene, loadPhoto360Skybox } from '../engine/Scene';
import { GLTFUnitProvider } from '../units/GLTFUnitProvider';
import { ProceduralUnitFactory } from '../units/ProceduralUnitFactory';
import { HybridUnitProvider } from '../units/HybridUnitProvider';
import { UnitBoard } from '../units/UnitBoard';
import { AnimationRegistry } from '../anim/AnimationRegistry';
import { ALL_IDLE_CLIPS } from '../anim/data/movementClips/idle';
import { publicAssetUrl } from '../assets/publicAssetUrl';

const q = new URLSearchParams(window.location.search);
const num = (key: string, fallback: number): number => {
  const raw = q.get(key);
  const parsed = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const WIDTH = num('w', 2048);
const HEIGHT = num('h', 1152);

const canvas = document.getElementById('hero') as HTMLCanvasElement;
canvas.width = WIDTH;
canvas.height = HEIGHT;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = num('exposure', 1.02);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = buildScene();

const camera = new THREE.PerspectiveCamera(num('fov', 34), WIDTH / HEIGHT, 0.05, 200);
camera.position.set(num('cx', 3.4), num('cy', 1.05), num('cz', -7.4));
camera.lookAt(num('tx', -0.4), num('ty', 0.95), num('tz', 1.2));

const registry = new AnimationRegistry();
const IDLE_TYPE: Record<string, PieceType> = {
  'pawn.idle': 'p', 'bishop.idle': 'b', 'knight.idle': 'n',
  'rook.idle': 'r', 'queen.idle': 'q', 'king.idle': 'k',
};
for (const clip of ALL_IDLE_CLIPS) {
  registry.registerClip(clip);
  const type = IDLE_TYPE[clip.id];
  if (type === undefined) throw new Error(`no PieceType for ${clip.id}`);
  registry.bindIdleClip(type, clip.id);
}

const gltf = new GLTFUnitProvider();
const procedural = new ProceduralUnitFactory();
const board = new UnitBoard(scene, new HybridUnitProvider(gltf, procedural), registry, 'ultra');

const ASSETS: readonly { type: PieceType; url: string }[] = [
  { type: 'b', url: publicAssetUrl('/models/bishop.glb') },
  { type: 'n', url: publicAssetUrl('/models/knight.glb') },
  { type: 'p', url: publicAssetUrl('/models/pawn.glb') },
  { type: 'r', url: publicAssetUrl('/models/rook.glb') },
  { type: 'q', url: publicAssetUrl('/models/queen.glb') },
  { type: 'k', url: publicAssetUrl('/models/king.glb') },
];

/** 메뉴 배경용 추가 연출 — 따뜻한 키/림 라이트와 바닥 안개로 깊이감을 준다. */
function addCinematicLights(): void {
  const key = new THREE.SpotLight('#FFD9A0', num('key', 34), 26, Math.PI / 5, 0.55, 1.4);
  key.position.set(num('kx', -5.2), num('ky', 7.2), num('kz', -4.6));
  key.target.position.set(0, 0.6, 0.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight('#8FB8FF', num('rim', 1.5));
  rim.position.set(4.5, 3.4, 8.5);
  scene.add(rim);

  const warmBounce = new THREE.PointLight('#FFB870', num('bounce', 6), 14, 2);
  warmBounce.position.set(2.4, 0.7, -3.2);
  scene.add(warmBounce);

  scene.fog = new THREE.FogExp2('#0C0A12', num('fog', 0.05));
}

/**
 * 사진 배경 대신 쓰는 앰버 그라디언트 백드롭 — 보드 뒤쪽 지평선에서 은은하게 타오르고
 * 위로 갈수록 검게 떨어져, 메뉴 카드가 놓이는 화면 상단이 자연스럽게 어두워진다.
 */
function makeBackdrop(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 576;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  ctx.fillStyle = '#05040A';
  ctx.fillRect(0, 0, c.width, c.height);
  const glow = ctx.createRadialGradient(c.width * 0.5, c.height * 0.78, 20, c.width * 0.5, c.height * 0.78, c.width * 0.62);
  glow.addColorStop(0, '#6B4718');
  glow.addColorStop(0.35, '#31200C');
  glow.addColorStop(0.72, '#120C10');
  glow.addColorStop(1, '#05040A');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, c.width, c.height);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 공중에 떠 있는 미세 먼지 — 텅 빈 상단에 깊이와 밀도를 준다. */
function addDust(count: number): void {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 1] = Math.random() * 3.4 + 0.15;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: '#FFCE96', size: 0.022, sizeAttenuation: true,
    transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  scene.add(new THREE.Points(geometry, material));
}

/** 보드 타일이 배경보다 튀지 않도록 알베도를 어둡게 눌러 준다(메뉴 카드 가독성). */
function dimBoard(factor: number): void {
  for (const name of ['tiles.light', 'tiles.dark']) {
    const mesh = scene.getObjectByName(name);
    if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.material.color.multiplyScalar(factor);
    }
  }
}

async function main(): Promise<void> {
  const env = q.get('env') ?? 'none';
  if (env !== 'none') {
    await loadPhoto360Skybox(scene, publicAssetUrl(`/env/${env}.jpg`));
  } else {
    const sky = scene.getObjectByName('sky');
    if (sky instanceof THREE.Mesh) {
      scene.remove(sky);
      sky.geometry.dispose();
    }
    scene.background = makeBackdrop();
  }
  await Promise.all(ASSETS.flatMap(({ type, url }) => [gltf.preload(type, 'w', url), gltf.preload(type, 'b', url)]));

  board.initFromPosition(fromFEN(q.get('fen') ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
  dimBoard(num('boardDim', 1));
  addCinematicLights();
  addDust(num('dust', 700));
  board.update(num('t', 0.6));

  renderer.render(scene, camera);

  const saveName = q.get('save');
  if (saveName !== null) {
    const mime = saveName.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(mime, num('quality', 0.86));
    await fetch('http://localhost:8899/', { method: 'POST', body: `${saveName}|${dataUrl}` });
  }
  document.title = 'hero ready';
  console.log('[hero] rendered', WIDTH, 'x', HEIGHT, 'saved=', saveName);
}

void main();
