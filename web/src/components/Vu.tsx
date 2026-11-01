/** Vertical LED-style level meter, 0..1. */
export function Vu({ level, label }: { level: number; label: string }) {
  return (
    <div className="vu-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Math.round(level * 100) / 100}>
      <div className="vu-cover" style={{ height: `${(1 - Math.max(0, Math.min(1, level))) * 100}%` }} />
    </div>
  );
}
