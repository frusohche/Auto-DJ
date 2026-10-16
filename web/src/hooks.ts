import { useEffect, useState, useSyncExternalStore } from 'react';
import { engine } from './djEngine.ts';

export const useEngine = () => useSyncExternalStore(engine.subscribe, engine.getSnapshot);

/** Re-render every animation frame while `active` (for clocks, meters and lyrics). */
export function useFrame(active = true) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const loop = () => {
      setN((n) => (n + 1) % 1e6);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}

export function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
