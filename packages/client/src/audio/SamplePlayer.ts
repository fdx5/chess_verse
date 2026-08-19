/**
 * 사용자 요청 §게임 내 사운드 — 실제 mp3 샘플 재생 어댑터. `AudioGraph`의 기존 철학
 * (HTMLAudioElement 금지, Web Audio API 직접 제어)을 그대로 따라 `fetch` + `decodeAudioData` +
 * `AudioBufferSourceNode`로 재생한다. 디코딩된 `AudioBuffer`는 URL 기준으로 캐시해 같은 효과음을
 * 반복 재생해도 매번 새로 받아오지 않는다.
 */

const bufferCache = new Map<string, Promise<AudioBuffer>>();

function loadSample(context: AudioContext, url: string): Promise<AudioBuffer> {
  let promise = bufferCache.get(url);
  if (promise === undefined) {
    promise = fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => context.decodeAudioData(data));
    bufferCache.set(url, promise);
  }
  return promise;
}

/** 캐시된(또는 새로 디코딩한) 샘플을 즉시 재생한다. 로드 실패는 콘솔 경고만 남기고 무시한다. */
export function playSample(context: AudioContext, destination: AudioNode, url: string): void {
  loadSample(context, url)
    .then((buffer) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      source.start();
    })
    .catch((err: unknown) => {
      console.warn(`[SamplePlayer] failed to play ${url}:`, err);
    });
}
