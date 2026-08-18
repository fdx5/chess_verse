import * as THREE from 'three';
import type { AnimClipDef, TrackDef } from './dsl';

const INTERPOLATION_MAP: Record<TrackDef['interpolation'], THREE.InterpolationModes> = {
  linear: THREE.InterpolateLinear,
  step: THREE.InterpolateDiscrete,
  cubic: THREE.InterpolateSmooth,
};

function eulerTriplesToQuaternionValues(values: number[]): number[] {
  const out: number[] = [];
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  for (let i = 0; i < values.length; i += 3) {
    const x = values[i] ?? 0;
    const y = values[i + 1] ?? 0;
    const z = values[i + 2] ?? 0;
    euler.set(x, y, z, 'XYZ');
    quat.setFromEuler(euler);
    out.push(quat.x, quat.y, quat.z, quat.w);
  }
  return out;
}

function compileTrack(def: TrackDef): THREE.KeyframeTrack {
  const interpolation = INTERPOLATION_MAP[def.interpolation];
  const dotIndex = def.target.lastIndexOf('.');
  const nodeName = def.target.slice(0, dotIndex);
  const channel = def.target.slice(dotIndex + 1);

  switch (channel) {
    case 'rotation': {
      const track = new THREE.QuaternionKeyframeTrack(
        `${nodeName}.quaternion`,
        def.times,
        eulerTriplesToQuaternionValues(def.values)
      );
      track.setInterpolation(interpolation);
      return track;
    }
    case 'quaternion': {
      const track = new THREE.QuaternionKeyframeTrack(def.target, def.times, def.values);
      track.setInterpolation(interpolation);
      return track;
    }
    case 'position':
    case 'scale': {
      const track = new THREE.VectorKeyframeTrack(def.target, def.times, def.values);
      track.setInterpolation(interpolation);
      return track;
    }
    default: {
      throw new Error(`unsupported animation channel: ${channel}`);
    }
  }
}

/** D5-1 §AnimClipCompiler — TrackDef[]를 순회해 THREE.KeyframeTrack으로 컴파일한다. */
export function compileClip(def: AnimClipDef): THREE.AnimationClip {
  const tracks = def.tracks.map(compileTrack);
  const clip = new THREE.AnimationClip(def.id, def.duration, tracks);
  clip.resetDuration();
  return clip;
}
