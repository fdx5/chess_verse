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
    onError?: () => void;
  };
}

interface YTNamespace {
  Player: new (elementId: string, options: YTPlayerOptions) => YTPlayerInstance;
}

const YT_STATE_ENDED = 0;
const YT_STATE_PLAYING = 1;
const YT_STATE_PAUSED = 2;

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: YTNamespace;
  }
}

const PLAYLIST_VIDEO_IDS = [
  'Kib-dS_R2Uo',
  '4YMpGYZgmWQ',
  '0ZPPQCjq92Y',
  '5Gnd5baAv2c',
  'x2OjPp4h0go',
  '6hGAQdKHrtM',
  '696dpaprIGo',
  'o2Mg4ZJllT0',
] as const;

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
 * 시작화면/인게임 공용 BGM — 사용자가 지정한 유튜브 8곡을 게임마다 섞어 무한 반복 재생한다.
 * 공식 IFrame Player API로 임베드해 재생만 하며(다운로드/추출 없음), 자동재생은 하지 않고
 * 반드시 버튼 클릭(사용자 제스처)에서만 시작한다.
 */
export class YoutubeBgmPlayer {
  private readonly mountEl: HTMLDivElement;
  private player: YTPlayerInstance | null = null;
  private playerReady: Promise<YTPlayerInstance> | null = null;
  private playing = false;
  private trackIndex = 0;
  private playlist: string[] = [...PLAYLIST_VIDEO_IDS];
  private shuffledTrackNeedsLoad = false;
  private readonly listeners = new Set<(playing: boolean) => void>();
  private advancing = false;
  private actualPlaying = false;

  constructor(container: HTMLElement) {
    // iOS 버그 수정 — 뷰포트 밖(-9999px)으로 완전히 밀어내면 iOS Safari/WebKit이 "화면 밖 = 백그라운드"로
    // 취급해 재생 자체를 막거나 중간에 멈추는 사례가 있다. 대신 뷰포트 안에 두되 2×2px로 줄이고
    // opacity:0으로 안 보이게 한다 — 화면에는 안 보이지만 WebKit 기준으로는 여전히 "화면 안"이라 재생이
    // 안정적이다.
    const wrapper = document.createElement('div');
    wrapper.style.cssText = ['position:fixed', 'right:0', 'bottom:0', 'width:2px', 'height:2px', 'opacity:0', 'overflow:hidden', 'pointer-events:none'].join(';');
    this.mountEl = document.createElement('div');
    this.mountEl.id = `bcr-bgm-player-${Math.random().toString(36).slice(2, 8)}`;
    wrapper.appendChild(this.mountEl);
    container.appendChild(wrapper);

    // iOS/WebKit은 비동기로 준비된 iframe에 대한 최초 playVideo()를 사용자 제스처가
    // 끝난 뒤 호출하면 거부한다. 요청 상태와 실제 재생 상태를 따로 기억해 두고,
    // 재생 요청이 아직 반영되지 않았다면 이후의 모든 사용자 제스처에서 동기적으로
    // 다시 시도한다. 게임 시작 버튼의 click이 버블링되는 시점도 여기에 포함된다.
    const retryPendingPlayback = (): void => {
      if (this.playing && !this.actualPlaying && this.player !== null) this.player.playVideo();
    };
    container.addEventListener('click', retryPendingPlayback);
    container.addEventListener('touchend', retryPendingPlayback, { passive: true });

    // iOS 버그 수정 — 유튜브 IFrame API 로드+플레이어 생성은 스크립트 네트워크 왕복을 포함해 수백ms~수초
    // 걸릴 수 있는데, 그 시간 동안 사용자 제스처(클릭) 컨텍스트가 끊겨 iOS Safari가 재생을 거부한다.
    // 그래서 부팅 시점에 미리(자동재생 없이, autoplay:0) 플레이어를 준비해둬서, 실제 클릭 시점엔
    // `playVideo()`만 곧바로 호출하면 되게 한다(제스처 체인이 끊기지 않음).
    void this.ensurePlayer();
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

  private trackIdAt(index: number): string {
    return this.playlist[index % this.playlist.length] ?? PLAYLIST_VIDEO_IDS[0];
  }

  /** 종료/재생 오류 모두 같은 경로로 처리해 플레이리스트가 멈추지 않게 한다. */
  private advanceToNextTrack(player: YTPlayerInstance): void {
    if (!this.playing || this.advancing) return;
    this.advancing = true;
    this.trackIndex = (this.trackIndex + 1) % this.playlist.length;
    // YouTube 상태 변경 콜백 안에서 즉시 다시 로드하면 일부 브라우저에서 명령이 유실된다.
    window.setTimeout(() => {
      player.loadVideoById(this.trackIdAt(this.trackIndex));
      this.advancing = false;
    }, 0);
  }

  /** 새 게임마다 8곡의 순서를 다시 섞고 첫 곡부터 시작한다. */
  shufflePlaylistForNewGame(): void {
    const previous = this.playlist.join(',');
    const shuffled = [...PLAYLIST_VIDEO_IDS];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
    }
    // 극히 드물게 이전과 완전히 같은 순열이면 실제 변화가 생기도록 한 칸 회전한다.
    if (shuffled.join(',') === previous) shuffled.push(shuffled.shift()!);

    this.playlist = shuffled;
    this.trackIndex = 0;
    this.shuffledTrackNeedsLoad = true;
    if (this.player === null) return;
    if (this.playing) {
      this.player.loadVideoById(this.trackIdAt(0));
      this.player.playVideo();
      this.shuffledTrackNeedsLoad = false;
    }
  }

  private async ensurePlayer(): Promise<YTPlayerInstance> {
    if (this.player !== null) return this.player;
    this.playerReady ??= loadYoutubeIframeApi().then(
      (YTApi) =>
        new Promise<YTPlayerInstance>((resolve) => {
          const player = new YTApi.Player(this.mountEl.id, {
            height: '90',
            width: '160',
            videoId: this.trackIdAt(this.trackIndex),
            // playsinline — iOS 버그 수정: 이게 없으면 iOS Safari가 재생을 전체화면으로 강제 전환하려
            // 하거나 인라인(백그라운드) 오디오 재생 자체를 거부한다.
            playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
            events: {
              onReady: () => {
                this.player = player;
                resolve(player);
              },
              onStateChange: (ev) => {
                if (ev.data === YT_STATE_PLAYING) {
                  this.actualPlaying = true;
                  return;
                }
                if (ev.data === YT_STATE_PAUSED) {
                  this.actualPlaying = false;
                  return;
                }
                if (ev.data === YT_STATE_ENDED) {
                  this.actualPlaying = false;
                  this.advanceToNextTrack(player);
                }
              },
              // 비공개/지역 제한 영상이 섞여 있어도 다음 곡으로 자동 복구한다.
              onError: () => this.advanceToNextTrack(player),
            },
          });
        })
    );
    return this.playerReady;
  }

  /** 이미 재생 중이면 아무것도 하지 않는다 — 대국 시작처럼 "켜져 있기만 하면 되는" 지점에서 쓴다.
   * 반드시 사용자 클릭(예: 시작 버튼)에서 이어지는 호출 체인 안에서만 호출한다(자동재생 정책 대응). */
  async play(): Promise<void> {
    if (this.playing) return;
    // await 이전에 의도 상태를 기록해야, iOS에서 플레이어 준비가 늦더라도 다음
    // 사용자 제스처가 재생을 복구할 수 있다.
    this.playing = true;
    this.notify();
    // iOS 버그 수정 — 플레이어가 이미 준비돼 있으면(생성자에서 미리 로드해둔 덕분에 대부분 이 경우다)
    // await 없이 즉시 동기적으로 playVideo()를 호출한다. await를 한 번이라도 거치면(이미 resolve된
    // Promise라도) 마이크로태스크 한 틱이 끼어드는데, iOS Safari는 그 정도로도 "사용자 제스처 체인이
    // 끊겼다"고 판단해 재생을 거부하는 경우가 있다.
    if (this.player !== null) {
      if (this.shuffledTrackNeedsLoad) {
        // loadVideoById는 선택한 곡을 로드하면서 즉시 재생한다. 셔플 직후 cueVideoById→playVideo를
        // 연달아 호출하면 모바일 YouTube 플레이어가 아직 큐잉 중이라 첫 재생 명령을 무시할 수 있다.
        this.player.loadVideoById(this.trackIdAt(this.trackIndex));
        this.shuffledTrackNeedsLoad = false;
      } else {
        this.player.playVideo();
      }
      return;
    }
    const player = await this.ensurePlayer();
    if (this.playing) return;
    if (this.shuffledTrackNeedsLoad) {
      player.loadVideoById(this.trackIdAt(this.trackIndex));
      this.shuffledTrackNeedsLoad = false;
    } else {
      player.playVideo();
    }
  }

  /** 반드시 버튼 클릭 핸들러 안에서만 호출한다(브라우저 자동재생 정책 대응). */
  async toggle(): Promise<void> {
    // iOS 버그 수정 — play()와 동일한 이유로 이미 준비된 플레이어는 await 없이 동기 호출한다.
    if (this.player !== null) {
      if (this.playing) {
        this.player.pauseVideo();
        this.playing = false;
        this.actualPlaying = false;
      } else {
        if (this.shuffledTrackNeedsLoad) {
          this.player.loadVideoById(this.trackIdAt(this.trackIndex));
          this.shuffledTrackNeedsLoad = false;
        } else {
          this.player.playVideo();
        }
        this.playing = true;
      }
      this.notify();
      return;
    }
    const player = await this.ensurePlayer();
    if (this.playing) {
      player.pauseVideo();
      this.playing = false;
      this.actualPlaying = false;
    } else {
      if (this.shuffledTrackNeedsLoad) {
        player.loadVideoById(this.trackIdAt(this.trackIndex));
        this.shuffledTrackNeedsLoad = false;
      } else {
        player.playVideo();
      }
      this.playing = true;
    }
    this.notify();
  }

  /** 현재 곡을 건너뛰고 재생목록의 다음 곡을 즉시 재생한다. */
  async playNext(): Promise<void> {
    this.advancing = false;
    this.trackIndex += 1;
    const videoId = this.trackIdAt(this.trackIndex);
    if (this.player !== null) {
      this.player.loadVideoById(videoId);
      this.player.playVideo();
      this.playing = true;
      this.notify();
      return;
    }
    const player = await this.ensurePlayer();
    player.loadVideoById(videoId);
    player.playVideo();
    this.playing = true;
    this.notify();
  }
}
