/** D8 §절차적 합성 — 저역 필터링된 노이즈 버스트로 발소리를 만든다. */
export function playFootstep(context: AudioContext, destination: AudioNode, material: 'leather' | 'stone' | 'metal' = 'leather'): void {
  const now = context.currentTime;
  const duration = material === 'stone' ? 0.14 : 0.08;
  const cutoff = material === 'stone' ? 400 : material === 'metal' ? 900 : 600;

  const noiseBuffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;

  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = cutoff;

  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.4, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.connect(lowpass).connect(gain).connect(destination);
  noise.start(now);
  noise.stop(now + duration);
}
