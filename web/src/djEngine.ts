import { Deck, loadYouTubeApi, type DeckId } from './decks.ts';
import { analyzeLyrics, fadeLength, incomingStart, outgoingMixPoint } from './cuePoints.ts';
import { bpmDistance } from './music.ts';
import { orderSet } from './ordering.ts';
import { PRESETS, type MixStyle, type TransitionType } from './styles.ts';
import { availableSfx, playSfx, SFX_LEAD_MS, type SfxName } from './sfx.ts';
import { setPrefs } from './trackPrefs.ts';
import { videoFor, type DJTrack } from './types.ts';

export type Phase = 'idle' | 'loading' | 'playing' | 'mixing' | 'paused';

export interface Plan {
  toIndex: number;
  type: TransitionType;
  sfx: SfxName | null;
  fadeMs: number;
  /** Outgoing song time at which the change starts. */
  mixOutMs: number;
  /** Incoming song time it starts from. */
  startMs: number;
  sfxFired: boolean;
}

export interface Snapshot {
  tracks: DJTrack[];
  phase: Phase;
  index: number;
  active: DeckId;
  plan: Plan | null;
  style: MixStyle;
  masterVolume: number;
  message: string | null;
}

const other = (d: DeckId): DeckId => (d === 'A' ? 'B' : 'A');
const TICK_MS = 50;

export class DJEngine {
  private snap: Snapshot = {
    tracks: [],
    phase: 'idle',
    index: -1,
    active: 'A',
    plan: null,
    style: PRESETS[0],
    masterVolume: 0.9,
    message: null,
  };
  private listeners = new Set<() => void>();
  decks: Record<DeckId, Deck> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private fade: { startedAt: number } | null = null;
  /** Which track is buffered on the idle deck, and the promise for that load. */
  private preloaded: { index: number; startMs: number; ready: Promise<void> } | null = null;
  private currentStartMs = 0;
  private sfxPool: SfxName[] = ['riser', 'horn', 'rewind'];

  // ---- store plumbing (for useSyncExternalStore) ----
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;
  private set(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  get tracks() {
    return this.snap.tracks;
  }
  private get activeDeck() {
    return this.decks![this.snap.active];
  }
  private get idleDeck() {
    return this.decks![other(this.snap.active)];
  }

  async attachDecks(hostA: HTMLElement, hostB: HTMLElement) {
    if (this.decks) return;
    await loadYouTubeApi();
    this.decks = { A: new Deck('A', hostA), B: new Deck('B', hostB) };
    for (const d of Object.values(this.decks)) {
      d.onError = (code) => this.handleDeckError(d.id, code);
      d.onEnded = () => {
        if (d.id !== this.snap.active || this.snap.phase !== 'playing') return;
        if (this.snap.plan) this.mixNow();
        else this.set({ phase: 'idle', message: 'End of the set.' });
      };
    }
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
    void availableSfx().then((p) => (this.sfxPool = p));
  }

  // ---- track list ----
  setTracks(tracks: DJTrack[]) {
    const currentId = this.tracks[this.snap.index]?.id;
    const index = currentId ? tracks.findIndex((t) => t.id === currentId) : -1;
    this.set({ tracks, index: index >= 0 ? index : this.snap.index });
    if (this.isLive()) this.replan();
  }

  updateTrack(id: string, patch: Partial<DJTrack>) {
    const tracks = this.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t));
    this.set({ tracks });
    if (!this.isLive()) return;
    // Only replan when the change touches the current song, the next one, or something in between
    // (e.g. a track that just got its YouTube match and is now the next playable one).
    const i = tracks.findIndex((t) => t.id === id);
    const to = this.snap.plan?.toIndex ?? Infinity;
    if (i >= this.snap.index && i <= to) this.replan();
  }

  moveTrack(from: number, to: number) {
    const tracks = this.tracks.slice();
    const [t] = tracks.splice(from, 1);
    tracks.splice(to, 0, t);
    this.setTracks(tracks);
  }

  /** Re-order everything after the current track (or the whole set before starting). */
  autoOrder() {
    const keep = this.isLive() ? this.snap.index : 0;
    const head = this.tracks.slice(0, keep);
    const tail = orderSet(this.tracks.slice(keep), this.snap.style.energyCurve);
    this.setTracks([...head, ...tail]);
  }

  setStyle(style: MixStyle) {
    this.set({ style });
    if (this.isLive()) this.replan();
  }

  setMasterVolume(v: number) {
    this.set({ masterVolume: v });
    if (this.snap.phase === 'playing') this.activeDeck.setVolume(v);
  }

  /** Nudge song/video alignment for a track; moves lyrics and cue points together. */
  nudgeOffset(id: string, deltaMs: number) {
    const t = this.tracks.find((x) => x.id === id);
    if (!t) return;
    const offsetAdjustMs = t.offsetAdjustMs + deltaMs;
    setPrefs(id, { offsetAdjustMs });
    for (const d of Object.values(this.decks ?? {})) {
      if (d.videoId && d.videoId === videoFor(t)?.videoId) d.setOffset(d.offsetMs + deltaMs);
    }
    const tracks = this.tracks.map((x) => (x.id === id ? { ...x, offsetAdjustMs } : x));
    this.set({ tracks });
  }

  /** Use a different YouTube video for a track: next search result, or a pasted id. */
  changeVideo(id: string, opts: { next?: true; reset?: true; customVideoId?: string }) {
    const t = this.tracks.find((x) => x.id === id);
    if (!t) return;
    const patch: Partial<DJTrack> = opts.customVideoId
      ? { customVideoId: opts.customVideoId, status: 'ready', errors: [] }
      : opts.reset
        ? { customVideoId: undefined, status: t.candidates.length ? 'ready' : 'error' }
        : { customVideoId: undefined, videoIdx: (t.videoIdx + 1) % Math.max(1, t.candidates.length) };
    setPrefs(id, { customVideoId: patch.customVideoId, videoIdx: patch.videoIdx ?? t.videoIdx });
    this.updateTrack(id, patch);
    if (this.tracks[this.snap.index]?.id === id && this.isLive()) this.jumpTo(this.snap.index);
  }

  // ---- transport ----
  private isLive() {
    return this.snap.phase === 'playing' || this.snap.phase === 'mixing' || this.snap.phase === 'paused';
  }

  private playable(i: number) {
    const t = this.tracks[i];
    return !!t && t.status === 'ready' && !!videoFor(t);
  }

  private nextPlayable(from: number) {
    for (let i = from + 1; i < this.tracks.length; i++) if (this.playable(i)) return i;
    return -1;
  }

  /** Start the set at `index`, from the top of that song. */
  async start(index = 0) {
    if (!this.decks) return;
    if (!this.playable(index)) index = this.nextPlayable(index);
    if (index < 0) return this.set({ message: 'No playable tracks yet - waiting for YouTube matches.' });
    this.fade = null;
    this.preloaded = null;
    this.decks.A.stop();
    this.decks.B.stop();
    this.set({ phase: 'loading', index, active: 'A', plan: null, message: null });
    const v = videoFor(this.tracks[index])!;
    await this.decks.A.load(v.videoId, v.offsetMs, 0);
    this.currentStartMs = 0;
    this.decks.A.setVolume(this.snap.masterVolume);
    this.decks.A.play();
    this.set({ phase: 'playing' });
    this.replan();
  }

  pause() {
    if (this.snap.phase === 'mixing') this.finishMix();
    if (this.snap.phase !== 'playing') return;
    this.activeDeck.pause();
    this.set({ phase: 'paused' });
  }

  resume() {
    if (this.snap.phase !== 'paused') return;
    this.activeDeck.play();
    this.set({ phase: 'playing' });
  }

  /** Start the planned transition right now. */
  mixNow() {
    const { plan, phase } = this.snap;
    if (phase !== 'playing' || !plan) return;
    const t = this.activeDeck.songTimeMs();
    const lead = plan.type === 'sfx' && plan.sfx ? SFX_LEAD_MS[plan.sfx] : 0;
    this.set({ plan: { ...plan, mixOutMs: t + lead } });
  }

  /** Quick blend straight to a specific track. */
  jumpTo(index: number) {
    if (!this.isLive()) return void this.start(index);
    if (!this.playable(index)) return;
    if (this.snap.phase === 'mixing') this.finishMix();
    if (this.snap.phase === 'paused') this.resume();
    this.buildPlan(index, 'blend', 1500);
    this.mixNow();
  }

  stopAll() {
    this.fade = null;
    this.preloaded = null;
    this.decks?.A.stop();
    this.decks?.B.stop();
    this.set({ phase: 'idle', plan: null, index: -1 });
  }

  // ---- planning ----
  private pickTransition(cur: DJTrack, next: DJTrack): TransitionType {
    const w = { ...this.snap.style.weights };
    if (!this.snap.style.sfxEnabled) w.sfx = 0;
    // Big tempo jumps sound bad as long blends; DJs cut or cover them with an effect.
    if (cur.bpm && next.bpm && bpmDistance(cur.bpm, next.bpm) > 0.08) w.blend *= 0.2;
    const total = w.blend + w.cut + w.sfx;
    if (total <= 0) return 'blend';
    let r = Math.random() * total;
    for (const type of ['blend', 'cut', 'sfx'] as const) if ((r -= w[type]) < 0) return type;
    return 'blend';
  }

  private replan() {
    if (this.snap.phase === 'mixing' || this.snap.phase === 'loading') return;
    const toIndex = this.nextPlayable(this.snap.index);
    if (toIndex < 0) return this.set({ plan: null });
    const keep = this.snap.plan?.toIndex === toIndex ? this.snap.plan.type : undefined;
    this.buildPlan(toIndex, keep ?? this.pickTransition(this.tracks[this.snap.index], this.tracks[toIndex]));
  }

  private buildPlan(toIndex: number, type: TransitionType, fadeOverride?: number) {
    const cur = this.tracks[this.snap.index];
    const next = this.tracks[toIndex];
    const style = this.snap.style;
    const fadeMs = fadeOverride ?? fadeLength(style, type, cur.bpm);
    const startMs = incomingStart(analyzeLyrics(next.lyrics, next.durationMs), type, fadeMs);
    const mixOutMs = outgoingMixPoint(
      analyzeLyrics(cur.lyrics, cur.durationMs),
      cur.durationMs,
      this.currentStartMs,
      style,
      fadeMs,
    );
    // Keep an already-chosen (or already-fired) effect when replanning the same change.
    const prev = this.snap.plan;
    const same = prev && prev.toIndex === toIndex && prev.type === type;
    const sfx = type !== 'sfx' ? null : same ? prev.sfx : this.sfxPool[Math.floor(Math.random() * this.sfxPool.length)];
    const sfxFired = same ? prev.sfxFired : false;
    this.set({ plan: { toIndex, type, sfx, fadeMs, mixOutMs, startMs, sfxFired } });
    this.preloadNext();
  }

  private preloadNext() {
    const plan = this.snap.plan;
    if (!plan || !this.decks) return;
    const p = this.preloaded;
    if (p && p.index === plan.toIndex && p.startMs === plan.startMs) return;
    const v = videoFor(this.tracks[plan.toIndex])!;
    this.preloaded = {
      index: plan.toIndex,
      startMs: plan.startMs,
      ready: this.idleDeck.load(v.videoId, v.offsetMs, plan.startMs),
    };
  }

  // ---- the clock ----
  private tick() {
    const { phase, plan } = this.snap;
    if (phase === 'playing' && plan) {
      const t = this.activeDeck.songTimeMs();
      if (plan.type === 'sfx' && plan.sfx && !plan.sfxFired && t >= plan.mixOutMs - SFX_LEAD_MS[plan.sfx]) {
        playSfx(plan.sfx, this.snap.masterVolume * 0.7);
        this.set({ plan: { ...plan, sfxFired: true } });
      }
      if (t >= plan.mixOutMs) void this.beginMix();
    } else if (phase === 'mixing' && this.fade && plan) {
      const p = Math.min(1, (performance.now() - this.fade.startedAt) / plan.fadeMs);
      this.applyFade(p);
      if (p >= 1) this.finishMix();
    }
  }

  private async beginMix() {
    const plan = this.snap.plan!;
    this.set({ phase: 'mixing' });
    this.preloadNext();
    const pre = this.preloaded!;
    await pre.ready;
    if (this.snap.phase !== 'mixing') return;
    if (this.preloaded !== pre) {
      // The incoming video failed while buffering; replan (next candidate or next track) and retry.
      this.set({ phase: 'playing' });
      this.replan();
      return;
    }
    this.idleDeck.setVolume(0);
    this.idleDeck.play();
    this.fade = { startedAt: performance.now() };
    if (plan.type !== 'blend') this.applyFade(0);
  }

  /** Equal-power crossfade: perceived loudness stays level through the change. */
  private applyFade(p: number) {
    const v = this.snap.masterVolume;
    this.activeDeck.setVolume(Math.cos((p * Math.PI) / 2) * v);
    this.idleDeck.setVolume(Math.sin((p * Math.PI) / 2) * v);
  }

  private finishMix() {
    const plan = this.snap.plan;
    if (!plan) return;
    if (!this.fade) {
      // Paused/skipped before the incoming deck started.
      this.idleDeck.play();
    }
    this.applyFade(1);
    this.activeDeck.pause();
    this.fade = null;
    this.preloaded = null;
    this.currentStartMs = plan.startMs;
    this.set({ phase: 'playing', active: other(this.snap.active), index: plan.toIndex, plan: null });
    this.replan();
  }

  private handleDeckError(deck: DeckId, code: number) {
    const isIdle = deck !== this.snap.active;
    const index = isIdle ? this.preloaded?.index ?? this.snap.plan?.toIndex : this.snap.index;
    if (index == null) return;
    const t = this.tracks[index];
    if (!t) return; // the set changed (e.g. a new playlist) while this video was loading
    console.warn(`Deck ${deck}: YouTube error ${code} on "${t.title}"`);
    const hasMore = !t.customVideoId && t.videoIdx + 1 < t.candidates.length;
    this.preloaded = isIdle ? null : this.preloaded;
    this.updateTrack(
      t.id,
      hasMore
        ? { videoIdx: t.videoIdx + 1 }
        : { status: 'error', errors: [...t.errors, `YouTube error ${code}: video can't be embedded`] },
    );
    if (!isIdle && this.snap.phase !== 'idle') {
      // The playing song died - get out fast.
      const next = hasMore ? index : this.nextPlayable(index);
      if (next >= 0) void this.start(next);
      else this.stopAll();
    }
  }

  // ---- read-outs for the UI ----
  deckTime(d: DeckId) {
    const deck = this.decks?.[d];
    return deck ? { songMs: deck.songTimeMs(), volume: deck.volume } : { songMs: 0, volume: 0 };
  }

  /** The track whose lyrics to show: the incoming one once a mix passes its midpoint. */
  lyricFocus(): { index: number; deck: DeckId; upcoming: number | null } {
    const { phase, plan, active, index } = this.snap;
    if (!this.decks) return { index, deck: active, upcoming: null };
    if (phase === 'mixing' && plan && this.fade) {
      const p = (performance.now() - this.fade.startedAt) / plan.fadeMs;
      if (p >= 0.5) return { index: plan.toIndex, deck: other(active), upcoming: null };
      return { index, deck: active, upcoming: plan.toIndex };
    }
    const soon = plan && phase === 'playing' && plan.mixOutMs - this.activeDeck.songTimeMs() < 8000;
    return { index, deck: active, upcoming: soon ? plan.toIndex : null };
  }
}

export const engine = new DJEngine();
