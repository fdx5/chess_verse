/** D5-1 §키프레임 DSL — THREE.AnimationClip을 직접 구성하는 대신 이 얇은 빌더를 통해 선언한다. */

export type TrackChannel = 'position' | 'rotation' | 'quaternion' | 'scale';
export type TrackTarget = `${string}.${TrackChannel}`;
export type Interpolation = 'linear' | 'step' | 'cubic';

export interface TrackDef {
  target: TrackTarget;
  times: number[];
  values: number[];
  interpolation: Interpolation;
}

export interface AnimClipDef {
  id: string;
  duration: number;
  loop: boolean;
  tracks: TrackDef[];
}

export function clip(id: string, duration: number, loop: boolean, tracks: TrackDef[]): AnimClipDef {
  return { id, duration, loop, tracks };
}

export function track(
  target: TrackTarget,
  times: number[],
  values: number[],
  interpolation: Interpolation = 'linear'
): TrackDef {
  return { target, times, values, interpolation };
}
