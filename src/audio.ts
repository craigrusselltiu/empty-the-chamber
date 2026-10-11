// Tiny WebAudio synth for SFX. No assets.
let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;
let muted = false;
const lastPlayed: Record<string, number> = {};

function init() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

addEventListener('pointerdown', init, { once: true });
addEventListener('keydown', init, { once: true });

export function setMuted(m: boolean) {
  muted = m;
  if (ctx) master.gain.value = m ? 0 : 0.5;
}

function noise(t: number, dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'lowpass') {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5, dur + 0.05);
}

function tone(t: number, dur: number, f0: number, f1: number, vol: number, type: OscillatorType = 'square') {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// Throttle per sound so 500 enemies don't make 500 sounds.
function ok(name: string, gap: number) {
  if (!ctx || muted) return false;
  const now = ctx.currentTime;
  if ((lastPlayed[name] ?? -1) > now - gap) return false;
  lastPlayed[name] = now;
  return true;
}

export const sfx = {
  shot() {
    if (!ok('shot', 0.04)) return;
    const t = ctx!.currentTime;
    noise(t, 0.12, 2400, 0.7, 0.35);
    tone(t, 0.08, 180, 60, 0.25, 'triangle');
  },
  finalShot() {
    if (!ok('final', 0.05)) return;
    const t = ctx!.currentTime;
    noise(t, 0.5, 1600, 0.5, 0.9);
    tone(t, 0.35, 120, 35, 0.8, 'sine');
    noise(t + 0.06, 0.6, 600, 1, 0.3);
  },
  chip() {
    if (!ok('chip', 0.04)) return;
    const t = ctx!.currentTime;
    tone(t, 0.05, 1800, 2400, 0.12, 'square');
  },
  pellet() {
    if (!ok('pellet', 0.06)) return;
    const t = ctx!.currentTime;
    noise(t, 0.25, 1200, 0.5, 0.6);
    tone(t, 0.15, 140, 40, 0.4, 'triangle');
  },
  rifle() {
    if (!ok('rifle', 0.05)) return;
    const t = ctx!.currentTime;
    noise(t, 0.6, 2800, 0.4, 0.7);
    tone(t, 0.3, 200, 40, 0.5, 'sawtooth');
  },
  knife() {
    if (!ok('knife', 0.05)) return;
    noise(ctx!.currentTime, 0.08, 5000, 2, 0.12, 'highpass');
  },
  lasso() {
    if (!ok('lasso', 0.2)) return;
    noise(ctx!.currentTime, 0.4, 700, 6, 0.2, 'bandpass');
  },
  boom() {
    if (!ok('boom', 0.06)) return;
    const t = ctx!.currentTime;
    noise(t, 0.8, 500, 0.4, 0.9);
    tone(t, 0.5, 90, 25, 0.7, 'sine');
  },
  hit() {
    if (!ok('hit', 0.03)) return;
    tone(ctx!.currentTime, 0.04, 400, 200, 0.06, 'square');
  },
  hurt() {
    if (!ok('hurt', 0.15)) return;
    const t = ctx!.currentTime;
    tone(t, 0.2, 300, 80, 0.35, 'sawtooth');
    noise(t, 0.15, 800, 1, 0.3);
  },
  reload() {
    if (!ok('reload', 0.1)) return;
    const t = ctx!.currentTime;
    tone(t, 0.03, 2200, 1800, 0.1, 'square');
    tone(t + 0.12, 0.04, 1500, 1200, 0.12, 'square');
  },
  casing() {
    if (!ok('casing', 0.03)) return;
    tone(ctx!.currentTime, 0.05, 2600 + Math.random() * 600, 3000, 0.04, 'triangle');
  },
  coin() {
    if (!ok('coin', 0.05)) return;
    const t = ctx!.currentTime;
    tone(t, 0.06, 1320, 1320, 0.08, 'square');
    tone(t + 0.06, 0.12, 1980, 1980, 0.08, 'square');
  },
  levelUp() {
    if (!ok('lvl', 0.3)) return;
    const t = ctx!.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.08, 0.25, f, f, 0.12, 'square'));
  },
  chest() {
    if (!ok('chest', 0.3)) return;
    const t = ctx!.currentTime;
    [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(t + i * 0.07, 0.3, f, f, 0.1, 'triangle'));
  },
  ult() {
    if (!ok('ult', 0.3)) return;
    const t = ctx!.currentTime;
    tone(t, 0.8, 80, 600, 0.3, 'sawtooth');
    noise(t, 0.8, 300, 2, 0.3, 'bandpass');
  },
  card() {
    if (!ok('card', 0.05)) return;
    noise(ctx!.currentTime, 0.06, 3000, 3, 0.2, 'bandpass');
  },
  bell() {
    if (!ok('bell', 0.1)) return;
    const t = ctx!.currentTime;
    tone(t, 1.0, 880, 870, 0.15, 'sine');
    tone(t, 1.0, 1320, 1310, 0.08, 'sine');
  },
  warn() {
    if (!ok('warn', 0.5)) return;
    const t = ctx!.currentTime;
    tone(t, 0.25, 220, 220, 0.2, 'square');
    tone(t + 0.3, 0.25, 220, 220, 0.2, 'square');
  },
};
