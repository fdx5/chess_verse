import type { AudioGraph, AudioBusName } from './AudioGraph';
import { playFootstep } from './synth/footstep';
import { playImpactDull } from './synth/impact';
import { playShimmer, playGenericDissolve } from './synth/shimmer';
import { playStinger } from './synth/stinger';
import { playKnockdownThud } from './synth/thud';

type SynthFn = (context: AudioContext, destination: AudioNode) => void;

const CUES: Record<string, { bus: AudioBusName; synth: SynthFn }> = {
  'sfx.impact.dull': { bus: 'sfx', synth: playImpactDull },
  'sfx.generic.dissolve': { bus: 'sfx', synth: playGenericDissolve },
  'sfx.footstep.leather': { bus: 'sfx', synth: (ctx, dest) => playFootstep(ctx, dest, 'leather') },
  'sfx.footstep.stone': { bus: 'sfx', synth: (ctx, dest) => playFootstep(ctx, dest, 'stone') },
  'sfx.footstep.metal': { bus: 'sfx', synth: (ctx, dest) => playFootstep(ctx, dest, 'metal') },
  'sfx.shimmer': { bus: 'sfx', synth: playShimmer },
  'sfx.ui.checkmate_stinger': { bus: 'ui', synth: playStinger },
  'sfx.knockdown.thud': { bus: 'sfx', synth: playKnockdownThud },
};

/** D8 §사운드 큐 시트를 데이터 주도로 등록·재생한다(D4 UnitProvider와 동일 철학 — 나중에 샘플 파일로 교체 가능한 어댑터). */
export class SoundRegistry {
  constructor(private readonly graph: AudioGraph) {}

  play(cueId: string): void {
    const entry = CUES[cueId];
    if (entry === undefined) {
      console.warn(`[SoundRegistry] unknown cue id: ${cueId}`);
      return;
    }
    entry.synth(this.graph.context, this.graph.getBus(entry.bus));
  }

  has(cueId: string): boolean {
    return cueId in CUES;
  }
}
