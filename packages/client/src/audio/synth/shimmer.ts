/** D8 §절차적 합성 — 느린 어택의 밝은 배음으로 "신성한 광원" 느낌을 낸다. 방어자 소멸/마법 큐에 사용. */
export function playShimmer(context: AudioContext, destination: AudioNode): void {
  const now = context.currentTime;
  const duration = 0.9;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 600;

  const partials = [880, 1320, 1760];
  for (const freq of partials) {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(highpass);
    osc.start(now);
    osc.stop(now + duration);
  }
  highpass.connect(gain).connect(destination);
}

export function playGenericDissolve(context: AudioContext, destination: AudioNode): void {
  playShimmer(context, destination);
}
