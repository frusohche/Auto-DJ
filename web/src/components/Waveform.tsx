import { useEffect, useMemo, useRef } from 'react';
import { analyzeLyrics } from '../cuePoints.ts';
import type { DJTrack } from '../types.ts';
import type { WaveData } from '../waveform.ts';

// The deck's waveform, the way DJ software shows it: a zoomed view scrolling past a fixed playhead
// (bass orange, mids yellow, highs white) and a whole-song overview with the chorus sections marked.

const ZOOM_SECONDS = 12;

interface Colors {
  low: string;
  mid: string;
  high: string;
  chorus: string;
  vocal: string;
  bg: string;
  ok: string;
  bad: string;
}

let colors: Colors | null = null;
function palette(): Colors {
  if (!colors) {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    colors = {
      low: v('--accent', '#ff7a1a'),
      mid: v('--accent-2', '#ffc23d'),
      high: v('--text', '#f1eef8'),
      chorus: 'rgba(255, 122, 26, 0.16)',
      vocal: 'rgba(255, 194, 61, 0.07)',
      bg: v('--bg', '#0d0b12'),
      ok: v('--ok', '#3ddc97'),
      bad: v('--bad', '#ff5470'),
    };
  }
  return colors;
}

function fitCanvas(c: HTMLCanvasElement): [CanvasRenderingContext2D, number, number] {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [ctx, w, h];
}

/** One mirrored 3-band bar centred on `mid`: bass widest, highs as the bright core. */
function bar(ctx: CanvasRenderingContext2D, d: WaveData, i: number, x: number, w: number, mid: number, half: number, p: Colors) {
  const layers: [Float32Array, string, number][] = [
    [d.low, p.low, 1],
    [d.mid, p.mid, 0.72],
    [d.high, p.high, 0.45],
  ];
  for (const [band, color, scale] of layers) {
    const hgt = Math.max(0.5, band[i] * half * scale);
    ctx.fillStyle = color;
    ctx.fillRect(x, mid - hgt, w, hgt * 2);
  }
}

type Marker = { at: number; cls: string };

export function Waveform({
  track,
  data,
  songMs,
  offsetMs,
  markers,
  live,
  onSeek,
}: {
  track: DJTrack;
  data: WaveData;
  songMs: number;
  /** Video time minus song time. */
  offsetMs: number;
  markers: Marker[];
  live: boolean;
  onSeek?: (songMs: number) => void;
}) {
  const zoomRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const overCache = useRef<{ key: string; img: HTMLCanvasElement } | null>(null);
  const sec = useMemo(() => analyzeLyrics(track.lyrics, track.durationMs), [track.lyrics, track.durationMs]);
  const toVideo = (ms: number) => (ms + offsetMs) / 1000;
  const posSec = toVideo(songMs);
  const markerColor = (cls: string) => (cls === 'out' ? palette().bad : palette().ok);

  // Zoomed, scrolling view.
  useEffect(() => {
    const c = zoomRef.current;
    if (!c) return;
    const p = palette();
    const [ctx, w, h] = fitCanvas(c);
    const pxPerSec = w / ZOOM_SECONDS;
    const at = (t: number) => w / 2 + (t - posSec) * pxPerSec;
    ctx.clearRect(0, 0, w, h);

    for (const ch of sec.choruses) {
      ctx.fillStyle = p.chorus;
      ctx.fillRect(at(toVideo(ch.startMs)), 0, (toVideo(ch.endMs) - toVideo(ch.startMs)) * pxPerSec, h);
    }

    const step = 2;
    for (let x = 0; x < w; x += step) {
      const t = posSec + (x - w / 2) / pxPerSec;
      if (t < 0 || t >= data.durationSec) continue;
      ctx.globalAlpha = t < posSec ? 0.4 : live ? 1 : 0.8;
      bar(ctx, data, Math.floor(t * data.rate), x, step - 0.5, h / 2, h / 2 - 2, p);
    }
    ctx.globalAlpha = 1;

    for (const m of markers) {
      ctx.fillStyle = markerColor(m.cls);
      ctx.fillRect(at(toVideo(m.at)) - 1, 0, 2, h);
    }
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 8;
    ctx.fillRect(w / 2 - 1, 0, 2, h);
    ctx.shadowBlur = 0;
  });

  // Whole-song overview: drawn once to an offscreen canvas, then the playhead goes on top each frame.
  useEffect(() => {
    const c = overRef.current;
    if (!c) return;
    const p = palette();
    const [ctx, w, h] = fitCanvas(c);
    const dur = data.durationSec;
    const key = `${w}x${h}:${offsetMs}:${sec.choruses.length}`;
    if (overCache.current?.key !== key || !overCache.current) {
      const dpr = window.devicePixelRatio || 1;
      const img = document.createElement('canvas');
      img.width = Math.round(w * dpr);
      img.height = Math.round(h * dpr);
      const o = img.getContext('2d')!;
      o.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (sec.vocalStartMs != null && sec.vocalEndMs != null) {
        o.fillStyle = p.vocal;
        o.fillRect((toVideo(sec.vocalStartMs) / dur) * w, 0, ((toVideo(sec.vocalEndMs) - toVideo(sec.vocalStartMs)) / dur) * w, h);
      }
      for (const ch of sec.choruses) {
        o.fillStyle = p.chorus;
        o.fillRect((toVideo(ch.startMs) / dur) * w, 0, ((toVideo(ch.endMs) - toVideo(ch.startMs)) / dur) * w, h);
      }
      const bins = data.low.length;
      for (let x = 0; x < w; x++) {
        // Loudest bin in this column, so short hits aren't averaged away.
        const i0 = Math.floor((x / w) * bins);
        const i1 = Math.max(i0 + 1, Math.floor(((x + 1) / w) * bins));
        let best = i0;
        for (let i = i0; i < i1 && i < bins; i++) if (data.low[i] + data.mid[i] > data.low[best] + data.mid[best]) best = i;
        bar(o, data, Math.min(best, bins - 1), x, 1, h / 2, h / 2 - 1, p);
      }
      overCache.current = { key, img };
    }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(overCache.current.img, 0, 0, w, h);
    const px = Math.max(0, Math.min(w, (posSec / dur) * w));
    ctx.fillStyle = 'rgba(13, 11, 18, 0.55)';
    ctx.fillRect(0, 0, px, h);
    for (const m of markers) {
      ctx.fillStyle = markerColor(m.cls);
      ctx.fillRect((toVideo(m.at) / dur) * w - 1, 0, 2, h);
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(px - 1, 0, 2, h);
  });

  const seek = (e: React.MouseEvent<HTMLCanvasElement>, zoomed: boolean) => {
    if (!onSeek) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const t = zoomed ? posSec + ((x - r.width / 2) / r.width) * ZOOM_SECONDS : (x / r.width) * data.durationSec;
    onSeek(t * 1000 - offsetMs);
  };

  return (
    <div className={`wave ${onSeek ? 'seekable' : ''}`}>
      <canvas ref={zoomRef} className="wave-zoom" onClick={(e) => seek(e, true)} aria-label="Waveform around the playhead" role="img" />
      <canvas ref={overRef} className="wave-over" onClick={(e) => seek(e, false)} aria-label="Whole-song waveform" role="img" />
    </div>
  );
}
