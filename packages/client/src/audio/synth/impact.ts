/** D8 §절차적 합성 — 노이즈+짧은 사인 임팩트, 밴드패스로 "둔탁함(dull)"을 만든다. */
export function playImpactDull(context: AudioContext, destination: AudioNode): void {
  const now = context.currentTime;
  const duration = 0.18;

  const noiseBuffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;

  const bandpass = context.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(280, now);
  bandpass.Q.value = 0.9;

  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.6, now + 0.008);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  const thump = context.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(120, now);
  thump.frequency.exponentialRampToValueAtTime(55, now + 0.12);
  const thumpGain = context.createGain();
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.5, now + 0.006);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  noise.connect(bandpass).connect(noiseGain).connect(destination);
  thump.connect(thumpGain).connect(destination);

  noise.start(now);
  noise.stop(now + duration);
  thump.start(now);
  thump.stop(now + 0.16);
}
