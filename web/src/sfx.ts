// DJ sound effects, synthesised with Web Audio so nothing copyrighted is bundled.
// Drop your own recorded DJ tag at web/public/sfx/tag.mp3 and it joins the rotation.

export type SfxName = 'riser' | 'horn' | 'rewind' | 'tag';

/** How long before the cut each effect should start, so its peak lands on the change. */
export const SFX_LEAD_MS: Record<SfxName, number> = { riser: 2000, horn: 150, rewind: 800, tag: 1200 };

let ctx: AudioContext | null = null;
let tagBuffer: AudioBuffer | null | undefined;

function ac(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Shared AudioContext for SFX and bridges. */
export const audioContext = ac;

function noise(c: AudioContext, seconds: number): AudioBufferSourceNode {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function riser(c: AudioContext, out: GainNode) {
  const t = c.currentTime;
  const src = noise(c, 2.2);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 6;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(9000, t + 2);
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(1, t + 1.95);
  g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
  src.connect(bp).connect(g).connect(out);
  src.start(t);
}

function horn(c: AudioContext, out: GainNode) {
  const t0 = c.currentTime;
  const blasts: [number, number][] = [
    [0, 0.12],
    [0.16, 0.12],
    [0.32, 0.12],
    [0.48, 0.55],
  ];
  for (const [start, len] of blasts) {
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0 + start);
    g.gain.linearRampToValueAtTime(0.25, t0 + start + 0.01);
    g.gain.setValueAtTime(0.25, t0 + start + len - 0.03);
    g.gain.linearRampToValueAtTime(0, t0 + start + len);
    g.connect(out);
    for (const f of [440, 554, 659]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.94, t0 + start);
      o.frequency.linearRampToValueAtTime(f, t0 + start + 0.05);
      o.connect(g);
      o.start(t0 + start);
      o.stop(t0 + start + len);
    }
  }
}

function rewind(c: AudioContext, out: GainNode) {
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.8);
  const lfo = c.createOscillator();
  lfo.frequency.setValueAtTime(18, t);
  lfo.frequency.linearRampToValueAtTime(4, t + 0.8);
  const lfoGain = c.createGain();
  lfoGain.gain.value = 300;
  lfo.connect(lfoGain).connect(o.frequency);
  const g = c.createGain();
  g.gain.setValueAtTime(0.35, t);
  g.gain.linearRampToValueAtTime(0, t + 0.85);
  o.connect(g).connect(out);
  o.start(t);
  lfo.start(t);
  o.stop(t + 0.9);
  lfo.stop(t + 0.9);
}

async function loadTag(): Promise<AudioBuffer | null> {
  if (tagBuffer !== undefined) return tagBuffer;
  try {
    const res = await fetch('/sfx/tag.mp3');
    const type = res.headers.get('content-type') ?? '';
    tagBuffer = res.ok && type.startsWith('audio') ? await ac().decodeAudioData(await res.arrayBuffer()) : null;
  } catch {
    tagBuffer = null;
  }
  return tagBuffer;
}

export async function availableSfx(): Promise<SfxName[]> {
  return (await loadTag()) ? ['riser', 'horn', 'rewind', 'tag'] : ['riser', 'horn', 'rewind'];
}

export function playSfx(name: SfxName, volume = 0.6) {
  const c = ac();
  const out = c.createGain();
  out.gain.value = volume;
  out.connect(c.destination);
  if (name === 'riser') riser(c, out);
  else if (name === 'horn') horn(c, out);
  else if (name === 'rewind') rewind(c, out);
  else if (tagBuffer) {
    const src = c.createBufferSource();
    src.buffer = tagBuffer;
    src.connect(out);
    src.start();
  }
}

/** Call from a click handler so the browser lets audio start later. */
export function unlockAudio() {
  ac();
  void loadTag();
}
