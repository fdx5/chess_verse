/** 유튜브 IFrame Player API 최소 타입 — 공식 `@types/youtube` 미설치라 필요한 부분만 로컬 선언한다. */
interface YTPlayerInstance {
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(videoId: string): void;
  destroy(): void;
}

interface YTPlayerOptions {
  height: string;
  width: string;
  videoId: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: () => void;
    onStateChange?: (event: { data: number }) => void;
  };
}

interface YTNamespace {
  Player: new (elementId: string, options: YTPlayerOptions) => YTPlayerInstance;
}

const YT_STATE_ENDED = 0;

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: YTNamespace;
  }
}

const PLAYLIST_VIDEO_IDS = ['Kib-dS_R2Uo', '4YMpGYZgmWQ', '0ZPPQCjq92Y', '5Gnd5baAv2c'] as const;

function trackIdAt(index: number): string {
  return PLAYLIST_VIDEO_IDS[index % PLAYLIST_VIDEO_IDS.length] ?? PLAYLIST_VIDEO_IDS[0];
}

let apiLoadPromise: Promise<YTNamespace> | null = null;

/** 유튜브 IFrame API 스크립트를 1회만 로드한다(여러 컴포넌트가 동시에 요청해도 안전). */
function loadYoutubeIframeApi(): Promise<YTNamespace> {
  apiLoadPromise ??= new Promise((resolve) => {
    if (window.YT !== undefined) {
      resolve(window.YT);
      return;
    }
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      if (window.YT !== undefined) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return apiLoadPromise;
}

/**
 * 시작화면/인게임 공용 BGM — 사용자가 지정한 유튜브 2곡을 순서대로 무한 반복 재생한다.
 * 공식 IFrame Player API로 임베드해 재생만 하며(다운로드/추출 없음), 자동재생은 하지 않고
 * 반드시 버튼 클릭(사용자 제스처)에서만 시작한다.
 */
export class YoutubeBgmPlayer {
  private readonly mountEl: HTMLDivElement;
  private player: YTPlayerInstance | null = null;
  private playerReady: Promise<YTPlayerInstance> | null = null;
  private playing = false;
  private trackIndex = 0;
  private readonly listeners = new Set<(playing: boolean) => void>();

  constructor(container: HTMLElement) {
    // 사용자 요청 — 좌측 하단에 보이던 유튜브 썸네일/플레이어 박스를 화면 밖으로 옮겨 안 보이게 한다.
    // `display:none`은 일부 브라우저에서 백그라운드 재생이 막히는 사례가 있어, 대신 뷰포트 밖(-9999px)으로
    // 밀어내는 방식을 쓴다 — 크기는 그대로 유지해 재생기 자체는 정상 동작한다.
    const wrapper = document.createElement('div');
    wrapper.style.cssText = ['position:fixed', 'left:-9999px', 'top:-9999px', 'width:160px', 'height:90px', 'pointer-events:none'].join(';');
    this.mountEl = document.createElement('div');
    this.mountEl.id = `bcr-bgm-player-${Math.random().toString(36).slice(2, 8)}`;
    wrapper.appendChild(this.mountEl);
    container.appendChild(wrapper);
  }

  /** 재생 상태가 바뀔 때마다 호출된다(시작화면/인게임 버튼이 같은 상태를 함께 반영하도록). */
  onStateChange(listener: (playing: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isPlaying(): boolean {
    return this.playing;
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.playing);
  }

  private async ensurePlayer(): Promise<YTPlayerInstance> {
    if (this.player !== null) return this.player;
    this.playerReady ??= loadYoutubeIframeApi().then(
      (YTApi) =>
        new Promise<YTPlayerInstance>((resolve) => {
          const player = new YTApi.Player(this.mountEl.id, {
            height: '90',
            width: '160',
            videoId: trackIdAt(this.trackIndex),
            playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0 },
            events: {
              onReady: () => {
                this.player = player;
                resolve(player);
              },
              onStateChange: (ev) => {
                if (ev.data !== YT_STATE_ENDED) return;
                this.trackIndex += 1;
                player.loadVideoById(trackIdAt(this.trackIndex));
                player.playVideo();
              },
            },
          });
        })
    );
    return this.playerReady;
  }

  /** 이미 재생 중이면 아무것도 하지 않는다 — 대국 시작처럼 "켜져 있기만 하면 되는" 지점에서 쓴다.
   * 반드시 사용자 클릭(예: 시작 버튼)에서 이어지는 호출 체인 안에서만 호출한다(자동재생 정책 대응). */
  async play(): Promise<void> {
    const player = await this.ensurePlayer();
    if (this.playing) return;
    player.playVideo();
    this.playing = true;
    this.notify();
  }

  /** 반드시 버튼 클릭 핸들러 안에서만 호출한다(브라우저 자동재생 정책 대응). */
  async toggle(): Promise<void> {
    const player = await this.ensurePlayer();
    if (this.playing) {
      player.pauseVideo();
      this.playing = false;
    } else {
      player.playVideo();
      this.playing = true;
    }
    this.notify();
  }
}
