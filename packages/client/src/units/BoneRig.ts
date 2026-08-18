import * as THREE from 'three';

/** 절차적 파츠를 THREE.Bone 계층에 바인딩하는 범용 유틸(01 프롬프트 §1.3). 본은 자신의 파츠 메시를 직접
 * 자식으로 소유하는 강체(rigid) 계층이다 — 사유는 `docs/DEVIATIONS.md` [스프린트 3] 항목 참조. */

export function makeBone(name: string, position: [number, number, number]): THREE.Bone {
  const bone = new THREE.Bone();
  bone.name = name;
  bone.position.set(position[0], position[1], position[2]);
  return bone;
}

export function attachPart(
  bone: THREE.Bone,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  localPosition: [number, number, number] = [0, 0, 0]
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(localPosition[0], localPosition[1], localPosition[2]);
  bone.add(mesh);
  return mesh;
}

export function collectBones(root: THREE.Object3D): Record<string, THREE.Bone> {
  const bones: Record<string, THREE.Bone> = {};
  root.traverse((obj) => {
    if (obj instanceof THREE.Bone) bones[obj.name] = obj;
  });
  return bones;
}
