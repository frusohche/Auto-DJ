// Two YouTube IFrame players used as DJ decks. YouTube's terms require visible players
// of at least 200x200, so they are shown in the deck panels rather than hidden.

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

export function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  apiPromise ??= new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return apiPromise;
}

export type DeckId = 'A' | 'B';

export class Deck {
  player!: YT.Player;
  videoId: string | null = null;
  /** Video time minus song time (ms). */
  offsetMs = 0;
  volume = 0;
  onError?: (code: number) => void;
  onEnded?: () => void;

  private readyPromise: Promise<void>;
  private preload: { resolve: () => void; seekSec: number } | null = null;

  constructor(public id: DeckId, host: HTMLElement) {
    const el = document.createElement('div');
    host.appendChild(el);
    this.readyPromise = new Promise((resolve) => {
      this.player = new YT.Player(el, {
        width: '356',
        height: '200',
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3, origin: location.origin },
        events: {
          onReady: () => resolve(),
          onError: (e) => {
            this.finishPreload();
            this.onError?.(e.data);
          },
          onStateChange: (e) => this.handleState(e.data),
        },
      });
    });
  }

  private handleState(state: YT.PlayerState) {
    if (state === YT.PlayerState.PLAYING && this.preload) {
      this.player.pauseVideo();
      this.player.seekTo(this.preload.seekSec, true);
      this.finishPreload();
    }
    if (state === YT.PlayerState.ENDED) this.onEnded?.();
  }

  private finishPreload() {
    const p = this.preload;
    this.preload = null;
    p?.resolve();
  }

  /** Load and buffer a video, paused and silent at `songMs`. */
  async load(videoId: string, offsetMs: number, songMs: number): Promise<void> {
    await this.readyPromise;
    this.finishPreload();
    this.videoId = videoId;
    this.offsetMs = offsetMs;
    this.setVolume(0);
    const seekSec = Math.max(0, (songMs + offsetMs) / 1000);
    await new Promise<void>((resolve) => {
      this.preload = { resolve, seekSec };
      this.player.loadVideoById({ videoId, startSeconds: seekSec });
      setTimeout(() => this.preload?.resolve === resolve && this.finishPreload(), 10_000);
    });
  }

  play() {
    this.player.playVideo();
  }

  pause() {
    this.player.pauseVideo();
  }

  stop() {
    this.finishPreload();
    this.player?.stopVideo?.();
    this.videoId = null;
  }

  seekSong(ms: number) {
    this.player.seekTo(Math.max(0, (ms + this.offsetMs) / 1000), true);
  }

  songTimeMs(): number {
    return (this.player?.getCurrentTime?.() ?? 0) * 1000 - this.offsetMs;
  }

  /** Shift the song/video alignment without a jump in the audio. */
  setOffset(ms: number) {
    this.offsetMs = ms;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.player?.setVolume?.(Math.round(this.volume * 100));
  }

  isPlaying() {
    return this.player?.getPlayerState?.() === YT.PlayerState.PLAYING;
  }
}
