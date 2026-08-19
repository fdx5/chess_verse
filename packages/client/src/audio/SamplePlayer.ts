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

export interface SampleHandle {
  /** 재생 중이면 즉시 멈춘다. 아직 로드/디코딩이 끝나지 않은 상태에서 불러도 안전(로드 완료 즉시 재생을 취소). */
  stop(): void;
}

/**
 * 캐시된(또는 새로 디코딩한) 샘플을 즉시 재생한다. 로드 실패는 콘솔 경고만 남기고 무시한다.
 * 사용자 요청 §이동 사운드 — 기물 애니메이션이 끝나기 전에 멈출 수 있도록 정지 핸들을 반환한다
 * (기존엔 walk.mp3 전체 길이(수 초)가 짧은 이동 애니메이션 뒤에도 계속 재생됐다).
 */
export function playSample(context: AudioContext, destination: AudioNode, url: string): SampleHandle {
  let source: AudioBufferSourceNode | null = null;
  let stopRequested = false;

  loadSample(context, url)
    .then((buffer) => {
      if (stopRequested) return;
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(destination);
      node.start();
      source = node;
    })
    .catch((err: unknown) => {
      console.warn(`[SamplePlayer] failed to play ${url}:`, err);
    });

  return {
    stop(): void {
      stopRequested = true;
      if (source !== null) {
        try {
          source.stop();
        } catch {
          // 이미 끝까지 재생돼 정지된 소스에 stop()을 다시 호출하면 던지는데, 여기선 무시해도 안전하다.
        }
      }
    },
  };
}
