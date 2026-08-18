import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** D4 §8.3 BoardTheme 스키마 (테마 데이터 자체는 Sprint 3+에서 별도 레지스트리로 확장). */
export interface BoardTheme {
  id: string;
  name: string;
  tile: { light: string; dark: string; roughness: number; metalness: number };
  frame: { albedo: string; roughness: number; metalness: number };
  ambientLight: { color: string; intensity: number };
  directionalLight: { color: string; intensity: number; position: [number, number, number] };
  skybox: { type: 'gradient'; topColor: string; bottomColor: string };
}

/** D4 §8.3 — Castle Hall (기본 테마). */
export const CASTLE_HALL_THEME: BoardTheme = {
  id: 'castle-hall',
  name: 'Castle Hall',
  tile: { light: '#E8DCC0', dark: '#8B5A3C', roughness: 0.5, metalness: 0.05 },
  frame: { albedo: '#6B4A2F', roughness: 0.6, metalness: 0.1 },
  ambientLight: { color: '#FFF4E0', intensity: 0.45 },
  directionalLight: { color: '#FFEBC7', intensity: 1.2, position: [5, 8, 3] },
  skybox: { type: 'gradient', topColor: '#3A2E1F', bottomColor: '#1A140D' },
};

const BOARD_SIZE = 8;
const TILE_SIZE = 1.0;
const TILE_THICKNESS = 0.08;
const FRAME_WIDTH = 0.4;

function buildCheckerboard(theme: BoardTheme): THREE.Group {
  const group = new THREE.Group();
  group.name = 'checkerboard';

  const lightGeoms: THREE.BufferGeometry[] = [];
  const darkGeoms: THREE.BufferGeometry[] = [];
  const half = BOARD_SIZE / 2;

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const geom = new THREE.BoxGeometry(TILE_SIZE, TILE_THICKNESS, TILE_SIZE);
      const x = col - half + TILE_SIZE / 2;
      const z = row - half + TILE_SIZE / 2;
      geom.translate(x, -TILE_THICKNESS / 2, z);
      if ((row + col) % 2 === 0) lightGeoms.push(geom);
      else darkGeoms.push(geom);
    }
  }

  const lightMat = new THREE.MeshStandardMaterial({
    color: theme.tile.light,
    roughness: theme.tile.roughness,
    metalness: theme.tile.metalness,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: theme.tile.dark,
    roughness: theme.tile.roughness,
    metalness: theme.tile.metalness,
  });

  const lightMerged = mergeGeometries(lightGeoms);
  const darkMerged = mergeGeometries(darkGeoms);
  if (lightMerged === null || darkMerged === null) {
    throw new Error('checkerboard geometry merge failed');
  }
  const lightMesh = new THREE.Mesh(lightMerged, lightMat);
  const darkMesh = new THREE.Mesh(darkMerged, darkMat);
  lightMesh.name = 'tiles.light';
  darkMesh.name = 'tiles.dark';
  group.add(lightMesh, darkMesh);

  for (const g of lightGeoms) g.dispose();
  for (const g of darkGeoms) g.dispose();

  return group;
}

/** D4 §8.2 — 보드 외곽 0.4 유닛 폭 프레임 (Sprint 2는 4개 박스로 단순화, 모따기는 후속 스프린트). */
function buildFrame(theme: BoardTheme): THREE.Mesh {
  const half = BOARD_SIZE / 2;
  const outer = half + FRAME_WIDTH;
  const shape = new THREE.Shape();
  shape.moveTo(-outer, -outer);
  shape.lineTo(outer, -outer);
  shape.lineTo(outer, outer);
  shape.lineTo(-outer, outer);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-half, -half);
  hole.lineTo(half, -half);
  hole.lineTo(half, half);
  hole.lineTo(-half, half);
  hole.closePath();
  shape.holes.push(hole);

  const geom = new THREE.ExtrudeGeometry(shape, { depth: TILE_THICKNESS, bevelEnabled: false });
  geom.rotateX(Math.PI / 2);
  geom.translate(0, -TILE_THICKNESS, 0);

  const mat = new THREE.MeshStandardMaterial({
    color: theme.frame.albedo,
    roughness: theme.frame.roughness,
    metalness: theme.frame.metalness,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'frame';
  return mesh;
}

/** 값싼 그라디언트 스카이 — 뒤집힌 구체에 y기반 정점 컬러(D4 §8.3 skybox.type='gradient'). */
function buildGradientSky(topColor: string, bottomColor: string): THREE.Mesh {
  const geom = new THREE.SphereGeometry(50, 16, 16);
  const top = new THREE.Color(topColor);
  const bottom = new THREE.Color(bottomColor);
  const position = geom.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    const t = THREE.MathUtils.clamp((y + 50) / 100, 0, 1);
    const c = bottom.clone().lerp(top, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'sky';
  return mesh;
}

export function buildLighting(theme: BoardTheme): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lighting';

  const ambient = new THREE.AmbientLight(theme.ambientLight.color, theme.ambientLight.intensity);
  const directional = new THREE.DirectionalLight(theme.directionalLight.color, theme.directionalLight.intensity);
  directional.position.set(...theme.directionalLight.position);
  directional.name = 'sun';

  // 품질 개선(사용자 피드백): 유닛 재질(clearcoat 등)이 살도록 반대편에서 낮은 강도의 필 라이트를 추가.
  // castShadow=false로 D9 그림자 예산(단일 방향광 콘택트 섀도우)을 건드리지 않는다.
  const [sx, sy, sz] = theme.directionalLight.position;
  const fill = new THREE.DirectionalLight(theme.ambientLight.color, theme.directionalLight.intensity * 0.22);
  fill.position.set(-sx, sy * 0.6, -sz);
  fill.castShadow = false;
  fill.name = 'fill';

  group.add(ambient, directional, fill);
  return group;
}

export function buildScene(theme: BoardTheme = CASTLE_HALL_THEME): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(buildGradientSky(theme.skybox.topColor, theme.skybox.bottomColor));
  scene.add(buildCheckerboard(theme));
  scene.add(buildFrame(theme));
  scene.add(buildLighting(theme));
  return scene;
}
