// Three-band waveforms (bass / mids / highs) for the DJ board, like rekordbox's RGB waveform, so you
// can see the drop, the breakdown and where the beat thins out before you get there.
import { useEffect, useState } from 'react';
import { apiFetch } from './api.ts';

export interface WaveData {
  /** Bins per second. */
  rate: number;
  durationSec: number;
  /** 0..1 per bin, normalised to the loudest bin of the song. */
  low: Float32Array;
  mid: Float32Array;
  high: Float32Array;
}

export const WAVE_RATE = 80;
const LOW_HZ = 250;
const HIGH_HZ = 2500;

/** Split audio into bass / mids / highs with two one-pole low-passes and take each bin's RMS. */
export function computeBands(channels: Float32Array[], sampleRate: number, rate = WAVE_RATE): WaveData {
  const n = channels[0]?.length ?? 0;
  const per = Math.max(1, Math.round(sampleRate / rate));
  const bins = Math.ceil(n / per);
  const low = new Float32Array(bins);
  const mid = new Float32Array(bins);
  const high = new Float32Array(bins);
  const a1 = 1 - Math.exp((-2 * Math.PI * LOW_HZ) / sampleRate);
  const a2 = 1 - Math.exp((-2 * Math.PI * HIGH_HZ) / sampleRate);
  let lp1 = 0;
  let lp2 = 0;
  const k = 1 / channels.length;
  for (let b = 0; b < bins; b++) {
    let sl = 0;
    let sm = 0;
    let sh = 0;
    const end = Math.min(n, (b + 1) * per);
    for (let i = b * per; i < end; i++) {
      let x = 0;
      for (const ch of channels) x += ch[i];
      x *= k;
      lp1 += a1 * (x - lp1);
      lp2 += a2 * (x - lp2);
      const m = lp2 - lp1;
      const h = x - lp2;
      sl += lp1 * lp1;
      sm += m * m;
      sh += h * h;
    }
    const len = Math.max(1, end - b * per);
    low[b] = Math.sqrt(sl / len);
    mid[b] = Math.sqrt(sm / len);
    high[b] = Math.sqrt(sh / len);
  }
  // Normalise each band on its own so quiet highs still show up next to a heavy bassline.
  for (const arr of [low, mid, high]) {
    let max = 0;
    for (const v of arr) if (v > max) max = v;
    if (max > 0) for (let i = 0; i < arr.length; i++) arr[i] /= max;
  }
  return { rate, durationSec: n / sampleRate, low, mid, high };
}

const cache = new Map<string, Promise<WaveData | null>>();
const MAX_CACHED = 8;

/** Download and analyse a video's audio once (the server has usually cached the file already). */
export function loadWaveform(videoId: string): Promise<WaveData | null> {
  let p = cache.get(videoId);
  if (!p) {
    p = (async () => {
      try {
        const res = await apiFetch(`/api/audio/${videoId}/full`);
        if (!res.ok) return null;
        // A low sample rate is plenty for a picture and halves the work and memory.
        const ctx = new OfflineAudioContext(2, 1, 22050);
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        const channels = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
        return computeBands(channels, buf.sampleRate);
      } catch {
        return null;
      }
    })();
    cache.set(videoId, p);
    if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!);
    void p.then((d) => d || cache.delete(videoId)); // retry failures next time
  }
  return p;
}

export function useWaveform(videoId: string | null | undefined): WaveData | null {
  const [data, setData] = useState<WaveData | null>(null);
  useEffect(() => {
    setData(null);
    if (!videoId) return;
    let live = true;
    void loadWaveform(videoId).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [videoId]);
  return data;
}
