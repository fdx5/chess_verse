import * as THREE from 'three';

/**
 * 사용자 요청 §기물별 전투 연출 — Queen의 "반으로 쪼개짐" 연출에서 재사용하는 범용 유틸.
 * 본(하위 트리 전체)을 현재 월드 트랜스폼을 그대로 유지한 채 별도의 최상위 Object3D로 분리한다.
 * 분리된 메시들은 캐시된 지오메트리/재질을 그대로 참조하므로(복제 아님) 별도 dispose 없이
 * `scene.remove(holder)`만으로 정리하면 된다.
 */
export function detachSubtree(bone: THREE.Object3D, scene: THREE.Scene): THREE.Group {
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  bone.getWorldPosition(worldPos);
  bone.getWorldQuaternion(worldQuat);
  bone.getWorldScale(worldScale);

  const holder = new THREE.Group();
  holder.position.copy(worldPos);
  holder.quaternion.copy(worldQuat);
  holder.scale.copy(worldScale);
  scene.add(holder);

  bone.parent?.remove(bone);
  holder.add(bone);
  bone.position.set(0, 0, 0);
  bone.quaternion.identity();
  bone.scale.set(1, 1, 1);

  return holder;
}
