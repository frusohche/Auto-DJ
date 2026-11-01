import { useEffect, useRef } from 'react';

// A rotary mixer knob: drag up/down (Shift for fine), scroll, or use the arrow keys.
// Double-click returns it to its default, like the centre detent on a real EQ knob.

const SWEEP = 135;

function polar(deg: number, r = 15) {
  const rad = (deg * Math.PI) / 180;
  return `${20 + r * Math.sin(rad)} ${20 - r * Math.cos(rad)}`;
}

function arc(a0: number, a1: number) {
  const [from, to] = a0 <= a1 ? [a0, a1] : [a1, a0];
  return `M ${polar(from)} A 15 15 0 ${to - from > 180 ? 1 : 0} 1 ${polar(to)}`;
}

export function Knob({
  label,
  value,
  min,
  max,
  def,
  onChange,
  format,
  danger = false,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  def: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  /** Show the knob in the red "kill" state. */
  danger?: boolean;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; v: number } | null>(null);
  const range = max - min;
  const step = range / 100;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const latest = useRef({ value, onChange, disabled });
  latest.current = { value, onChange, disabled };

  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      const l = latest.current;
      if (l.disabled) return;
      e.preventDefault();
      l.onChange(Math.min(max, Math.max(min, l.value - Math.sign(e.deltaY) * step * 2)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [min, max, step]);

  const angle = (v: number) => -SWEEP + ((v - min) / range) * SWEEP * 2;
  const a = angle(value);
  const a0 = angle(def);

  return (
    <div className={`knob ${danger ? 'danger' : ''} ${disabled ? 'disabled' : ''}`}>
      <div
        ref={ref}
        className="knob-dial"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        aria-valuetext={format(value)}
        aria-disabled={disabled}
        title={`${label}: ${format(value)} (double-click to reset)`}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, v: value };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          onChange(clamp(d.v + ((d.y - e.clientY) / (e.shiftKey ? 600 : 150)) * range));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => !disabled && onChange(def)}
        onKeyDown={(e) => {
          if (disabled) return;
          const s = e.shiftKey ? step * 10 : step * 2;
          const next =
            e.key === 'ArrowUp' || e.key === 'ArrowRight'
              ? value + s
              : e.key === 'ArrowDown' || e.key === 'ArrowLeft'
                ? value - s
                : e.key === 'Home'
                  ? min
                  : e.key === 'End'
                    ? max
                    : e.key === 'Enter' || e.key === ' '
                      ? def
                      : null;
          if (next == null) return;
          e.preventDefault();
          onChange(clamp(next));
        }}
      >
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path className="knob-track" d={arc(-SWEEP, SWEEP)} />
          {Math.abs(a - a0) > 0.5 && <path className="knob-fill" d={arc(a0, a)} />}
          <circle className="knob-cap" cx="20" cy="20" r="10.5" />
          <line className="knob-pointer" x1="20" y1="20" x2={20 + 9 * Math.sin((a * Math.PI) / 180)} y2={20 - 9 * Math.cos((a * Math.PI) / 180)} />
        </svg>
      </div>
      <div className="knob-label">{label}</div>
      <div className="knob-value">{format(value)}</div>
    </div>
  );
}
