/** D8 §오디오 아키텍처 — master → bus(music/sfx/ui/ambience) 그래프. Web Audio API 직접 제어(HTMLAudioElement 금지). */
export type AudioBusName = 'music' | 'sfx' | 'ui' | 'ambience';

export class AudioGraph {
  readonly context: AudioContext;
  readonly master: GainNode;
  private readonly buses: Record<AudioBusName, GainNode>;
  private resumeBound = false;

  constructor() {
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 1.0;
    this.master.connect(this.context.destination);

    this.buses = {
      music: this.context.createGain(),
      sfx: this.context.createGain(),
      ui: this.context.createGain(),
      ambience: this.context.createGain(),
    };
    this.buses.music.gain.value = 0.7;
    this.buses.sfx.gain.value = 0.9;
    this.buses.ui.gain.value = 0.8;
    this.buses.ambience.gain.value = 0.5;
    for (const bus of Object.values(this.buses)) bus.connect(this.master);
  }

  getBus(name: AudioBusName): GainNode {
    return this.buses[name];
  }

  /** D8 §모바일 제약 — 첫 사용자 제스처에서 resume(). 여러 번 호출해도 안전. */
  bindResumeOnGesture(target: HTMLElement): void {
    if (this.resumeBound) return;
    this.resumeBound = true;
    const resume = (): void => {
      void this.context.resume();
    };
    target.addEventListener('pointerdown', resume, { once: true });
    target.addEventListener('keydown', resume, { once: true });
  }

  /** D8 §모바일 제약 — 백그라운드 전환 시 일시정지. */
  bindVisibilityPause(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.context.suspend();
      else void this.context.resume();
    });
  }
}
