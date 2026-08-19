import type { AudioGraph, AudioBusName } from './AudioGraph';
import { playSample, type SampleHandle } from './SamplePlayer';

type SynthFn = (context: AudioContext, destination: AudioNode) => void;

/** 사용자가 지정한 mp3 샘플을 재생하는 큐로 등록한다(`/sound/*.mp3`, `packages/client/public/sound/`). */
function sampleCue(fileName: string): SynthFn {
  return (ctx, dest) => playSample(ctx, dest, `/sound/${fileName}`);
}

// 사용자 요청 — 절차적으로 합성하던 기존 효과음(타격/디졸브/반짝임/스팅어/발소리)은 전부 제거하고
// 이번에 받은 mp3 샘플로 교체했다. 36개 전투씬 데이터 파일이 여전히 `sfx.impact.dull` 등 옛 큐 ID를
// 참조하므로(D9 Sprint 6 산출물, 이번 작업 범위 밖) 큐 자체는 남겨두되 무음 처리해 "unknown cue" 경고
// 없이 조용히 사라지게 한다 — 실제로 들리는 소리는 CombatDirector가 공격자 타입별로 트는
// `sfx.combat.*` 큐(아래)뿐이다.
const SILENCED: SynthFn = () => {};

const CUES: Record<string, { bus: AudioBusName; synth: SynthFn }> = {
  'sfx.impact.dull': { bus: 'sfx', synth: SILENCED },
  'sfx.generic.dissolve': { bus: 'sfx', synth: SILENCED },
  'sfx.shimmer': { bus: 'sfx', synth: SILENCED },
  'sfx.ui.checkmate_stinger': { bus: 'ui', synth: SILENCED },
  'sfx.knockdown.thud': { bus: 'sfx', synth: SILENCED },
  // 사용자 요청 §게임 내 사운드 — 실제 mp3 샘플. 기물별 전투 연출 사운드는 CombatDirector가
  // 공격자 타입에 맞춰 이 큐들을 선택해 재생한다.
  'sfx.ui.button': { bus: 'ui', synth: sampleCue('button.mp3') },
  'sfx.ui.game_start': { bus: 'ui', synth: sampleCue('game_start.mp3') },
  'sfx.move.walk': { bus: 'sfx', synth: sampleCue('walk.mp3') },
  'sfx.combat.pawn': { bus: 'sfx', synth: sampleCue('spear.mp3') },
  'sfx.combat.knight': { bus: 'sfx', synth: sampleCue('knight.mp3') },
  'sfx.combat.bishop': { bus: 'sfx', synth: sampleCue('lightning.mp3') },
  'sfx.combat.rook': { bus: 'sfx', synth: sampleCue('rook.mp3') },
  'sfx.combat.queen': { bus: 'sfx', synth: sampleCue('lightning.mp3') },
  'sfx.combat.king': { bus: 'sfx', synth: sampleCue('king.mp3') },
  'sfx.result.win': { bus: 'ui', synth: sampleCue('win.mp3') },
  'sfx.result.lose': { bus: 'ui', synth: sampleCue('lose.mp3') },
};

/** D8 §사운드 큐 시트를 데이터 주도로 등록·재생한다(D4 UnitProvider와 동일 철학 — 나중에 샘플 파일로 교체 가능한 어댑터). */
export class SoundRegistry {
  private walkHandle: SampleHandle | null = null;

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

  /**
   * 사용자 요청 §이동 사운드 — 기물이 움직이기 시작할 때 재생하고, `stopWalk()`로 애니메이션이
   * 끝나는 순간 즉시 멈춘다(walk.mp3 원본은 수 초짜리라 그대로 두면 짧은 이동 뒤에도 계속 들렸다).
   */
  playWalk(): void {
    this.walkHandle?.stop();
    this.walkHandle = playSample(this.graph.context, this.graph.getBus('sfx'), '/sound/walk.mp3');
  }

  stopWalk(): void {
    this.walkHandle?.stop();
    this.walkHandle = null;
  }
}
