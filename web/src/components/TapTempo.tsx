import { useRef, useState } from 'react';

/** Tap along to the beat; reports the BPM after 4+ taps. */
export function TapTempo({ onBpm, current }: { onBpm: (bpm: number) => void; current: number | null }) {
  const taps = useRef<number[]>([]);
  const [live, setLive] = useState<number | null>(null);

  const tap = () => {
    const now = performance.now();
    const t = taps.current;
    if (t.length && now - t[t.length - 1] > 2000) t.length = 0; // a pause starts a new count
    t.push(now);
    if (t.length > 12) t.shift();
    if (t.length >= 4) {
      const gaps = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
      const median = gaps[Math.floor(gaps.length / 2)];
      const bpm = 60000 / median;
      setLive(Math.round(bpm));
      onBpm(bpm);
    } else setLive(null);
  };

  return (
    <button className="tap" onPointerDown={tap} title="Tap along to the beat 4+ times to set this song's BPM">
      {live ?? (current ? Math.round(current) : '—')} BPM · tap
    </button>
  );
}
