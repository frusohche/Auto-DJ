import { useState } from 'react';
import { engine } from '../djEngine.ts';
import { useEngine } from '../hooks.ts';
import { PRESETS, type EnergyCurve, type MixStyle } from '../styles.ts';
import { playSfx, unlockAudio, type SfxName } from '../sfx.ts';

export function Settings() {
  const { style } = useEngine();
  const [open, setOpen] = useState(false);
  const patch = (p: Partial<MixStyle>) => engine.setStyle({ ...style, ...p, id: 'custom' });

  return (
    <div className="panel settings">
      <div className="settings-head">
        <h2>Mix style</h2>
        <select
          value={PRESETS.some((p) => p.id === style.id) ? style.id : 'custom'}
          onChange={(e) => {
            const p = PRESETS.find((x) => x.id === e.target.value);
            if (p) engine.setStyle(p);
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value="custom" disabled>
            Custom
          </option>
        </select>
        <button className="ghost small" onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Tweak'}
        </button>
      </div>
      <p className="muted small">{style.description}</p>
      {open && (
        <div className="settings-grid">
          <label>
            Blend length <b>{style.fadeBars} bars</b>
            <input type="range" min={2} max={32} step={2} value={style.fadeBars} onChange={(e) => patch({ fadeBars: +e.target.value })} />
          </label>
          <label>
            Min play per song <b>{Math.round(style.minPlayMs / 1000)}s</b>
            <input
              type="range"
              min={20}
              max={300}
              step={5}
              value={style.minPlayMs / 1000}
              onChange={(e) => patch({ minPlayMs: +e.target.value * 1000, maxPlayMs: Math.max(style.maxPlayMs, +e.target.value * 1000) })}
            />
          </label>
          <label>
            Max play per song <b>{Math.round(style.maxPlayMs / 1000)}s</b>
            <input
              type="range"
              min={30}
              max={600}
              step={5}
              value={style.maxPlayMs / 1000}
              onChange={(e) => patch({ maxPlayMs: +e.target.value * 1000, minPlayMs: Math.min(style.minPlayMs, +e.target.value * 1000) })}
            />
          </label>
          {(['blend', 'cut', 'sfx'] as const).map((k) => (
            <label key={k}>
              {k === 'blend' ? 'Blends' : k === 'cut' ? 'Cuts on the drop' : 'SFX transitions'} <b>{Math.round(style.weights[k] * 100)}%</b>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={style.weights[k]}
                onChange={(e) => patch({ weights: { ...style.weights, [k]: +e.target.value } })}
              />
            </label>
          ))}
          <label>
            Energy curve (used by Auto-order)
            <select value={style.energyCurve} onChange={(e) => patch({ energyCurve: e.target.value as EnergyCurve })}>
              <option value="build">Warm-up → peak → cool-down</option>
              <option value="wave">Waves (two peaks)</option>
              <option value="none">None (just smooth key/tempo)</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={style.sfxEnabled} onChange={(e) => patch({ sfxEnabled: e.target.checked })} /> Sound effects
          </label>
          <div className="sfx-test">
            <span className="small muted">Test SFX:</span>
            {(['riser', 'horn', 'rewind', 'tag'] as SfxName[]).map((s) => (
              <button
                key={s}
                className="ghost small"
                onClick={() => {
                  unlockAudio();
                  playSfx(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
