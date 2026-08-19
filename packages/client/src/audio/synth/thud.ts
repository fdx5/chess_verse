/**
 * D8 §절차적 합성 — 낮은 사인 스윕(90→32Hz) + 저역 통과 노이즈로 무언가 쓰러져 바닥에 닿는
 * "쿵" 소리를 만든다. `sfx.impact.dull`(무기 타격, 밴드패스+120→55Hz, 0.18s)보다 더 낮고
 * 길게(0.38s) 감쇠시켜 "타격"과 "넘어짐"을 청각적으로 구분한다.
 */
export function playKnockdownThud(context: AudioContext, destination: AudioNode): void {
  const now = context.currentTime;
  const duration = 0.38;

  const noiseBuffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;

  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(220, now);
  lowpass.Q.value = 0.7;

  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.45, now + 0.01);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  const body = context.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(90, now);
  body.frequency.exponentialRampToValueAtTime(32, now + 0.3);
  const bodyGain = context.createGain();
  bodyGain.gain.setValueAtTime(0.0001, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.8, now + 0.012);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.connect(lowpass).connect(noiseGain).connect(destination);
  body.connect(bodyGain).connect(destination);

  noise.start(now);
  noise.stop(now + duration);
  body.start(now);
  body.stop(now + duration);
}
