/** D8 §절차적 합성 — 짧고 또렷한 톤으로 UI 스팅어(체크메이트, 매치 승리 등)를 만든다. */
export function playStinger(context: AudioContext, destination: AudioNode): void {
  const now = context.currentTime;
  const notes = [523.25, 659.25, 783.99];
  const noteDuration = 0.22;

  notes.forEach((freq, i) => {
    const start = now + i * 0.09;
    const osc = context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3000;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.3, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDuration);

    osc.connect(lowpass).connect(gain).connect(destination);
    osc.start(start);
    osc.stop(start + noteDuration);
  });
}
