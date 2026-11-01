// A deck that plays the song's audio from our own server through Web Audio, so the DJ board can
// EQ it, filter it, echo it and mute individual instruments. Same surface as the YouTube Deck.
//
//   full mix / 4 stems -> stem gains -> trim -> HI -> MID -> LOW -> low-pass -> high-pass
//     -> dry + echo send (delay with feedback) -> meter -> channel fader -> auto level -> master
//
// It starts on the full mix straight away and swaps to the stems when Demucs has split them.
import { apiFetch } from './api.ts';
import { audioContext } from './sfx.ts';
import type { DeckId, DeckLike } from './decks.ts';
import {
  dbToGain,
  echoDelaySec,
  eqGainDb,
  filterFreqs,
  flatMixer,
  meterLevel,
  STEMS,
  stemGain,
  type MixerState,
  type StemName,
} from './mixer.ts';

export interface StemInfo {
  status: 'off' | 'none' | 'queued' | 'working' | 'ready' | 'error';
  progress: number;
  error?: string;
}

export interface AudioCaps {
  ytdlp: boolean;
  demucs: boolean;
}

export async function audioCaps(): Promise<AudioCaps> {
  try {
    const r = await apiFetch('/api/audio/caps');
    if (r.ok) return (await r.json()) as AudioCaps;
  } catch {
    /* server unreachable or password missing: use YouTube players */
  }
  return { ytdlp: false, demucs: false };
}

/** Audio URLs carry no password: the server sets an httpOnly cookie when the app password is checked. */
const audioUrl = (videoId: string, part: string) => `/api/audio/${videoId}/${part}`;

async function stemCall(videoId: string, method: 'GET' | 'POST'): Promise<StemInfo> {
  try {
    const r = await apiFetch(`/api/audio/${videoId}/stems`, { method });
    return r.ok ? ((await r.json()) as StemInfo) : { status: 'error', progress: 0, error: `HTTP ${r.status}` };
  } catch (e) {
    return { status: 'error', progress: 0, error: (e as Error).message };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let master: { bus: GainNode; analyser: AnalyserNode } | null = null;
function masterBus() {
  if (!master) {
    const c = audioContext();
    const bus = c.createGain();
    const analyser = c.createAnalyser();
    analyser.fftSize = 1024;
    bus.connect(analyser);
    bus.connect(c.destination);
    master = { bus, analyser };
  }
  return master;
}

const scratch = new Float32Array(1024);
function rms(a: AnalyserNode): number {
  a.getFloatTimeDomainData(scratch);
  let sum = 0;
  for (const x of scratch) sum += x * x;
  return Math.sqrt(sum / scratch.length);
}

/** Master output meter, 0..1. */
export const masterLevel = () => (master ? meterLevel(rms(master.analyser)) : 0);

// Safari (and Firefox with autoplay blocked) only let an <audio> element play from a timer once it
// has played inside a click. The auto-mix starts decks from a timer, so on the first click anywhere
// every deck player plays a blip of silence and is allowed to play from then on.
let silentUrl: string | null = null;
function silence(): string {
  if (!silentUrl) {
    const n = 800; // 0.1 s of 8-bit 8 kHz mono
    const v = new DataView(new ArrayBuffer(44 + n));
    const str = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
    str(0, 'RIFF');
    v.setUint32(4, 36 + n, true);
    str(8, 'WAVEfmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true);
    v.setUint32(28, 8000, true);
    v.setUint16(32, 1, true);
    v.setUint16(34, 8, true);
    str(36, 'data');
    v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    silentUrl = URL.createObjectURL(new Blob([v.buffer], { type: 'audio/wav' }));
  }
  return silentUrl;
}
const isSilent = (el: HTMLAudioElement) => silentUrl != null && el.getAttribute('src') === silentUrl;

const locked = new Set<HTMLAudioElement>();
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;
function unlockMedia() {
  audioContext();
  for (const el of locked) {
    if (el.getAttribute('src')) continue; // busy with a song; try again on the next click
    locked.delete(el);
    el.src = silence();
    el.play().then(
      () => {
        if (!isSilent(el)) return;
        el.pause();
        el.removeAttribute('src');
        el.load();
      },
      () => {},
    );
  }
  if (!locked.size) for (const g of GESTURES) document.removeEventListener(g, unlockMedia, true);
}
function needsUnlock(el: HTMLAudioElement) {
  if (!locked.size) for (const g of GESTURES) document.addEventListener(g, unlockMedia, true);
  locked.add(el);
}

/** Resolves true once `el` has seeked to `sec` (after its metadata loads), false on error/timeout. */
function seekWhenReady(el: HTMLAudioElement, sec: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('seeked', onSeeked);
      el.removeEventListener('error', onFail);
      resolve(ok);
    };
    const onMeta = () => (el.currentTime = sec);
    const onSeeked = () => finish(true);
    const onFail = () => finish(false);
    const timer = setTimeout(() => finish(false), timeoutMs);
    el.addEventListener('seeked', onSeeked);
    el.addEventListener('error', onFail);
    if (el.readyState >= HTMLMediaElement.HAVE_METADATA) onMeta();
    else el.addEventListener('loadedmetadata', onMeta);
  });
}

export class AudioDeck implements DeckLike {
  videoId: string | null = null;
  offsetMs = 0;
  volume = 0;
  unlocked = true;
  onError?: (code: number) => void;
  onEnded?: () => void;
  onUnlock?: () => void;
  onStems?: (s: StemInfo) => void;
  mixer: MixerState = flatMixer();
  stemInfo: StemInfo;

  private full: HTMLAudioElement;
  private stemEls = {} as Record<StemName, HTMLAudioElement>;
  private stemGains = {} as Record<StemName, GainNode>;
  private usingStems = false;
  private fullGain: GainNode;
  private stemBus: GainNode;
  private trim: GainNode;
  private hi: BiquadFilterNode;
  private mid: BiquadFilterNode;
  private low: BiquadFilterNode;
  private lp: BiquadFilterNode;
  private hp: BiquadFilterNode;
  private send: GainNode;
  private delay: DelayNode;
  private analyser: AnalyserNode;
  private fader: GainNode;
  private out: GainNode;
  /** Bumped on every load/stop so stale async work can tell it's out of date. */
  private token = 0;
  private bpm: number | null = null;

  constructor(
    readonly id: DeckId,
    private stemsEnabled: boolean,
  ) {
    const c = audioContext();
    const media = () => {
      const a = new Audio();
      a.preload = 'auto';
      needsUnlock(a);
      return a;
    };
    const gain = (v = 1) => {
      const g = c.createGain();
      g.gain.value = v;
      return g;
    };
    const biquad = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    };

    const sum = gain();
    this.fullGain = gain(1);
    this.stemBus = gain(0);
    this.full = media();
    c.createMediaElementSource(this.full).connect(this.fullGain).connect(sum);
    for (const s of STEMS) {
      this.stemEls[s] = media();
      this.stemGains[s] = gain();
      c.createMediaElementSource(this.stemEls[s]).connect(this.stemGains[s]).connect(this.stemBus);
    }
    this.stemBus.connect(sum);

    this.trim = gain();
    this.hi = biquad('highshelf', 3200);
    this.mid = biquad('peaking', 1000);
    this.low = biquad('lowshelf', 250);
    this.lp = biquad('lowpass', 22000, 1);
    this.hp = biquad('highpass', 10, 1);
    const post = gain();
    sum.connect(this.trim).connect(this.hi).connect(this.mid).connect(this.low).connect(this.lp).connect(this.hp).connect(post);

    // Echo is a send: turning it down lets the repeats die away instead of cutting them.
    this.send = gain(0);
    this.delay = c.createDelay(2);
    const feedback = gain(0.45);
    this.hp.connect(this.send).connect(this.delay).connect(post);
    this.delay.connect(feedback).connect(this.delay);

    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 1024;
    this.fader = gain();
    this.out = gain(0);
    post.connect(this.analyser);
    post.connect(this.fader).connect(this.out).connect(masterBus().bus);

    this.full.addEventListener('ended', () => !this.usingStems && !isSilent(this.full) && this.onEnded?.());
    this.stemEls.vocals.addEventListener('ended', () => this.usingStems && this.onEnded?.());
    this.full.addEventListener('error', () => {
      if (this.full.getAttribute('src') && !isSilent(this.full)) this.onError?.(this.full.error?.code ?? 0);
    });
    setInterval(() => this.sync(), 250);

    this.stemInfo = { status: stemsEnabled ? 'none' : 'off', progress: 0 };
    this.applyMixer();
  }

  private get master() {
    return this.usingStems ? this.stemEls.vocals : this.full;
  }

  private get playingEls(): HTMLAudioElement[] {
    return this.usingStems ? STEMS.map((s) => this.stemEls[s]) : [this.full];
  }

  // ---- mixer ----
  setMixer(patch: Partial<MixerState>) {
    this.mixer = { ...this.mixer, ...patch };
    this.applyMixer();
  }

  /** The echo repeats in time with the song. */
  setBpm(bpm: number | null) {
    this.bpm = bpm;
    this.applyMixer();
  }

  private applyMixer() {
    const m = this.mixer;
    const t = audioContext().currentTime;
    const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.012);
    set(this.trim.gain, dbToGain(m.trim));
    set(this.hi.gain, eqGainDb(m.hi));
    set(this.mid.gain, eqGainDb(m.mid));
    set(this.low.gain, eqGainDb(m.low));
    const f = filterFreqs(m.filter);
    set(this.lp.frequency, f.lp);
    set(this.hp.frequency, f.hp);
    set(this.send.gain, m.echo);
    set(this.delay.delayTime, echoDelaySec(this.bpm));
    set(this.fader.gain, m.fader);
    for (const s of STEMS) set(this.stemGains[s].gain, stemGain(m, s));
  }

  /** Channel meter, 0..1 (before the fader, like a DJ mixer's channel level). */
  level(): number {
    return meterLevel(rms(this.analyser));
  }

  // ---- DeckLike ----
  async load(videoId: string, offsetMs: number, songMs: number): Promise<void> {
    const tok = ++this.token;
    for (const el of [this.full, ...STEMS.map((s) => this.stemEls[s])]) el.pause();
    this.useFull();
    this.videoId = videoId;
    this.offsetMs = offsetMs;
    this.setVolume(0);
    this.setStemInfo({ status: this.stemsEnabled ? 'none' : 'off', progress: 0 });
    this.full.src = audioUrl(videoId, 'full');
    // The first request for a song waits for the server to download it.
    const ok = await seekWhenReady(this.full, Math.max(0, (songMs + offsetMs) / 1000), 120_000);
    if (tok !== this.token) return;
    if (!ok) {
      if (!this.full.error) this.onError?.(0); // timed out; real errors were reported by the listener
      return;
    }
    if (this.stemsEnabled) void this.watchStems(tok);
  }

  async prime(): Promise<void> {}

  play() {
    audioContext();
    for (const el of this.playingEls) el.play().catch(() => {});
  }

  pause() {
    for (const el of this.playingEls) el.pause();
  }

  stop() {
    this.token++;
    this.pause();
    this.useFull();
    this.full.removeAttribute('src');
    this.full.load();
    this.videoId = null;
    this.setStemInfo({ status: this.stemsEnabled ? 'none' : 'off', progress: 0 });
  }

  seekSong(ms: number) {
    const sec = Math.max(0, (ms + this.offsetMs) / 1000);
    for (const el of this.playingEls) el.currentTime = sec;
  }

  songTimeMs(): number {
    return this.master.currentTime * 1000 - this.offsetMs;
  }

  setOffset(ms: number) {
    this.offsetMs = ms;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.out.gain.setTargetAtTime(this.volume, audioContext().currentTime, 0.015);
  }

  isPlaying() {
    return !this.master.paused && !this.master.ended;
  }

  // ---- stems ----
  private setStemInfo(s: StemInfo) {
    this.stemInfo = s;
    this.onStems?.(s);
  }

  private useFull() {
    this.usingStems = false;
    for (const s of STEMS) {
      const el = this.stemEls[s];
      el.pause();
      el.playbackRate = 1;
      if (el.getAttribute('src')) {
        el.removeAttribute('src');
        el.load();
      }
    }
    const t = audioContext().currentTime;
    this.fullGain.gain.cancelScheduledValues(t);
    this.stemBus.gain.cancelScheduledValues(t);
    this.fullGain.gain.setValueAtTime(1, t);
    this.stemBus.gain.setValueAtTime(0, t);
  }

  /** Ask the server to split this song, then poll until the stems are ready and switch to them. */
  private async watchStems(tok: number) {
    const id = this.videoId!;
    let info = await stemCall(id, 'POST');
    while (tok === this.token) {
      this.setStemInfo(info);
      if (info.status === 'ready') return void this.switchToStems(tok);
      if (info.status !== 'queued' && info.status !== 'working') return;
      await sleep(2000);
      if (tok !== this.token) return;
      info = await stemCall(id, 'GET');
    }
  }

  /**
   * Swap from the full mix to the stems without a gap: seek the stems a little ahead of the
   * playing mix, wait for the mix to reach that point, start them and crossfade over 100 ms.
   */
  private async switchToStems(tok: number) {
    const id = this.videoId!;
    for (const s of STEMS) this.stemEls[s].src = audioUrl(id, `stem/${s}`);
    for (let attempt = 0; attempt < 5; attempt++) {
      const wasPlaying = this.isPlaying();
      const target = this.full.currentTime + (wasPlaying ? 0.3 + attempt * 0.3 : 0);
      const ok = (await Promise.all(STEMS.map((s) => seekWhenReady(this.stemEls[s], target, 30_000)))).every(Boolean);
      if (tok !== this.token) return;
      if (!ok) break;
      if (!this.isPlaying()) {
        if (wasPlaying || Math.abs(this.full.currentTime - target) > 0.05) continue;
        return this.swapToStems(false);
      }
      if (!wasPlaying) continue;
      const waitMs = (target - this.full.currentTime) * 1000;
      if (waitMs < 10) continue; // the seek took longer than the lead; try again further ahead
      await sleep(waitMs);
      if (tok !== this.token) return;
      if (this.isPlaying()) return this.swapToStems(true);
    }
    if (tok !== this.token) return;
    this.useFull();
    this.setStemInfo({ status: 'error', progress: 0, error: 'Could not load the stems' });
  }

  private swapToStems(playing: boolean) {
    const t = audioContext().currentTime;
    if (playing) {
      for (const s of STEMS) this.stemEls[s].play().catch(() => {});
      this.fullGain.gain.setValueAtTime(1, t);
      this.fullGain.gain.linearRampToValueAtTime(0, t + 0.1);
      this.stemBus.gain.setValueAtTime(0, t);
      this.stemBus.gain.linearRampToValueAtTime(1, t + 0.1);
      const tok = this.token;
      setTimeout(() => tok === this.token && this.usingStems && this.full.pause(), 200);
    } else {
      this.fullGain.gain.setValueAtTime(0, t);
      this.stemBus.gain.setValueAtTime(1, t);
      this.full.pause();
    }
    this.usingStems = true;
  }

  /** Keep the four stem players together: nudge the playback rate for small drift, jump for big. */
  private sync() {
    if (!this.usingStems || this.master.paused) return;
    const ref = this.master.currentTime;
    for (const s of STEMS) {
      if (s === 'vocals') continue;
      const el = this.stemEls[s];
      const drift = el.currentTime - ref;
      if (Math.abs(drift) > 0.3) el.currentTime = ref;
      else el.playbackRate = Math.abs(drift) > 0.02 ? (drift > 0 ? 0.97 : 1.03) : 1;
      if (el.paused && !el.ended) el.play().catch(() => {});
    }
  }
}
