// Computer side of the phone remote: publishes engine state to the room and
// applies commands that phones send back.
import { engine } from '../djEngine.ts';
import { apiFetch } from '../api.ts';
import { camelotLabel } from '../music.ts';
import { describePlan } from '../planLabel.ts';
import { PRESETS } from '../styles.ts';
import { unlockAudio } from '../sfx.ts';
import type { RemoteCommand, RemoteLyrics, RemoteState } from './protocol.ts';

const CODE_KEY = 'autodj.roomCode';

export interface LinkStatus {
  code: string | null;
  connected: boolean;
  remotes: number;
  error: string | null;
}

class RemoteLink {
  status: LinkStatus = { code: null, connected: false, remotes: 0, error: null };
  private listeners = new Set<() => void>();
  private source: EventSource | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: ReturnType<typeof setTimeout> | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getStatus = () => this.status;
  private setStatus(p: Partial<LinkStatus>) {
    this.status = { ...this.status, ...p };
    this.listeners.forEach((fn) => fn());
  }

  /** Create (or rejoin) a room and start publishing. */
  async connect(forceNew = false) {
    if (this.source) return;
    let code = forceNew ? null : localStorage.getItem(CODE_KEY);
    if (!code) {
      try {
        const res = await apiFetch('/api/rooms', { method: 'POST' });
        code = ((await res.json()) as { code: string }).code;
        localStorage.setItem(CODE_KEY, code);
      } catch (e) {
        return this.setStatus({ error: (e as Error).message });
      }
    }
    this.open(code);
  }

  private open(code: string) {
    const src = new EventSource(`/api/rooms/${code}/events?role=player`);
    this.source = src;
    this.setStatus({ code, error: null });
    src.onopen = () => {
      this.setStatus({ connected: true });
      this.publish();
    };
    src.onerror = () => {
      this.setStatus({ connected: false });
      // A 404 (room forgotten after a server restart) closes the stream for good: make a new room.
      if (src.readyState === EventSource.CLOSED) {
        this.disconnect();
        localStorage.removeItem(CODE_KEY);
        void this.connect(true);
      }
    };
    src.addEventListener('remotes', (e) => this.setStatus({ remotes: JSON.parse((e as MessageEvent).data).count }));
    src.addEventListener('command', (e) => this.apply(JSON.parse((e as MessageEvent).data)));
    this.unsubscribe = engine.subscribe(() => this.schedulePublish());
    this.timer = setInterval(() => this.publish(), 1000);
  }

  disconnect() {
    this.source?.close();
    this.source = null;
    this.unsubscribe?.();
    if (this.timer) clearInterval(this.timer);
    this.setStatus({ connected: false, remotes: 0 });
  }

  private schedulePublish() {
    if (this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      this.publish();
    }, 150);
  }

  private publish() {
    const code = this.status.code;
    if (!code || !this.status.connected) return;
    void fetch(`/api/rooms/${code}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildState()),
    }).catch(() => {});
  }

  private apply(c: RemoteCommand) {
    const idx = (id: string) => engine.tracks.findIndex((t) => t.id === id);
    unlockAudio();
    switch (c.type) {
      case 'pause':
        return engine.pause();
      case 'resume':
        return engine.resume();
      case 'mixNow':
        return engine.mixNow();
      case 'start':
        return void engine.start(0);
      case 'stop':
        return engine.stopAll();
      case 'autoOrder':
        return engine.autoOrder();
      case 'jumpTo':
        return idx(c.trackId) >= 0 ? engine.jumpTo(idx(c.trackId)) : undefined;
      case 'move': {
        const from = idx(c.trackId);
        const to = from + c.delta;
        if (from >= 0 && to >= 0 && to < engine.tracks.length) engine.moveTrack(from, to);
        return;
      }
      case 'style': {
        const p = PRESETS.find((x) => x.id === c.id);
        return p ? engine.setStyle(p) : undefined;
      }
      case 'volume':
        return engine.setMasterVolume(Math.max(0, Math.min(1, c.value)));
      case 'bpm':
        return engine.setBpm(c.trackId, c.bpm);
      case 'nudge':
        return engine.nudgeOffset(c.trackId, c.deltaMs);
    }
  }
}

function buildState(): RemoteState {
  const snap = engine.getSnapshot();
  const focus = engine.lyricFocus();
  const focusSongMs = engine.deckTime(focus.deck).songMs;
  const activeMs = engine.deckTime(snap.active).songMs;
  const lyrics: Record<string, RemoteLyrics> = {};
  for (const i of [focus.index, focus.upcoming, snap.plan?.toIndex]) {
    const t = i != null ? snap.tracks[i] : undefined;
    if (t) lyrics[t.id] = { lines: t.lyrics, plain: t.plainLyrics, instrumental: t.instrumental };
  }
  return {
    phase: snap.phase,
    index: snap.index,
    focusIndex: focus.index,
    focusSongMs,
    upcoming: focus.upcoming,
    nextIndex: snap.plan?.toIndex ?? null,
    planLabel: snap.plan ? describePlan(snap.plan, snap.tracks[snap.index], snap.style.fadeBars) : null,
    mixInMs: snap.plan && snap.phase === 'playing' ? snap.plan.mixOutMs - activeMs : null,
    styleId: snap.style.id,
    styles: PRESETS.map((p) => ({ id: p.id, name: p.name })),
    masterVolume: snap.masterVolume,
    tracks: snap.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artists: t.artists,
      image: t.image,
      durationMs: t.durationMs,
      bpm: t.bpm,
      key: camelotLabel(t.camelot),
      ready: t.status === 'ready',
    })),
    lyrics,
  };
}

export const remoteLink = new RemoteLink();
