import * as THREE from 'three';
import { Rng } from '../rng';

// Low-res procedural pixel-art textures, painted on canvases at startup.
const rng = new Rng(1234);

type Rgb = [number, number, number];

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function tex(c: HTMLCanvasElement, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// The builder's UVs give 32 px per 1.6 units; bigger textures repeat less often at the same density.
function tile(c: HTMLCanvasElement) {
  const t = tex(c);
  t.repeat.set(32 / c.width, 32 / c.height);
  return t;
}

function shade(base: Rgb, k: number) {
  return `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`;
}

// A rect in the base colour scaled by k.
function px(g: CanvasRenderingContext2D, base: Rgb, k: number, x: number, y: number, w = 1, h = 1) {
  g.fillStyle = shade(base, k);
  g.fillRect(x, y, w, h);
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, amt: number, n: number) {
  for (let i = 0; i < n; i++) {
    const v = rng.range(-amt, amt);
    g.fillStyle = v > 0 ? `rgba(255,240,220,${v})` : `rgba(20,10,10,${-v})`;
    g.fillRect(rng.int(w), rng.int(h), 1, 1);
  }
}

// Short grain streaks inside a rect, along x (horiz) or y.
function grain(g: CanvasRenderingContext2D, base: Rgb, x0: number, y0: number, w: number, h: number, n: number, horiz: boolean) {
  for (let i = 0; i < n; i++) {
    const k = rng.chance(0.5) ? rng.range(0.78, 0.9) : rng.range(1.06, 1.14);
    const len = 2 + rng.int(Math.max(1, (horiz ? w : h) / 2));
    if (horiz) px(g, base, k, x0 + rng.int(w), y0 + rng.int(h), len, 1);
    else px(g, base, k, x0 + rng.int(w), y0 + rng.int(h), 1, len);
  }
}

// Lap siding: overlapping horizontal boards with butt joints, nails and knots.
// paint: a painted colour, chipped off to the wood here and there.
function siding(wood: Rgb, paint?: Rgb) {
  const S = 64;
  const { c, g } = canvas(S, S);
  const face = paint ?? wood;
  for (let y = 0; y < S; y += 4) {
    const k = rng.range(0.9, 1.04);
    px(g, face, k, 0, y, S, 4);
    grain(g, face, 0, y + 1, S, 2, paint ? 5 : 12, true);
    px(g, face, k * 1.12, 0, y, S, 1); // lit top edge
    px(g, face, 0.5, 0, y + 3, S, 1); // shadow under the lap
    for (let j = 0; j < 2; j++) {
      const sx = rng.int(S);
      px(g, face, 0.55, sx, y, 1, 3); // butt joint and its nails
      px(g, face, 0.4, sx + 2, y + 1);
      px(g, face, 0.4, sx - 2, y + 1);
    }
    if (rng.chance(0.3)) {
      const kx = rng.int(S - 3);
      px(g, face, 0.66, kx, y + 1, 3, 1);
      px(g, face, 0.8, kx + 1, y + 2);
    }
    if (paint)
      for (let j = 0; j < 3; j++) {
        const cx = rng.int(S - 6);
        const w = 2 + rng.int(6);
        px(g, wood, rng.range(0.8, 1), cx, y + 1, w, 1 + rng.int(2));
      }
  }
  noise(g, S, S, 0.08, 300);
  return tile(c);
}

// Board-and-batten: wide vertical boards, narrow battens over the joints, paint worn through in patches.
function batten(paint: Rgb, wood: Rgb) {
  const S = 64;
  const { c, g } = canvas(S, S);
  for (let x = 0; x < S; x += 8) {
    px(g, paint, rng.range(0.88, 1.04), x, 0, 8, S);
    grain(g, paint, x + 3, 0, 5, S, 8, false);
  }
  for (let i = 0; i < 26; i++) px(g, wood, rng.range(0.85, 1.05), rng.int(S - 4), rng.int(S - 3), 1 + rng.int(4), 2 + rng.int(5));
  for (let x = 0; x < S; x += 8) {
    px(g, paint, 1.15, x, 0, 1, S); // batten
    px(g, paint, 1.05, x + 1, 0, 1, S);
    px(g, paint, 0.5, x + 2, 0, 1, S); // its shadow
    for (let y = rng.int(8); y < S; y += 16) px(g, paint, 0.4, x + 1, y);
  }
  noise(g, S, S, 0.08, 300);
  return tile(c);
}

// Planks running vertically (decks, false fronts, benches, the water tower): uneven widths, nails, end joints.
function boards() {
  const S = 32;
  const base: Rgb = [146, 106, 72];
  const { c, g } = canvas(S, S);
  for (let x = 0; x < S; ) {
    const w = Math.min(S - x, 4 + rng.int(3));
    px(g, base, rng.range(0.78, 1.05), x, 0, w, S);
    grain(g, base, x, 0, w - 1, S, 6, false);
    px(g, base, 0.48, x + w - 1, 0, 1, S);
    px(g, base, 1.12, x, 0, 1, S);
    const end = rng.int(S);
    px(g, base, 0.5, x, end, w - 1, 1);
    px(g, base, 0.35, x + 1, (end + 2) % S);
    px(g, base, 0.35, x + w - 3, (end + S - 2) % S);
    x += w;
  }
  noise(g, S, S, 0.1, 120);
  return tile(c);
}

// A single sawn timber, grain along y, with knots and checks (posts, legs, rails, dead wood).
function timber(base: Rgb) {
  const S = 32;
  const { c, g } = canvas(S, S);
  for (let x = 0; x < S; x++) px(g, base, 0.88 + 0.12 * Math.sin(x * 1.3 + Math.sin(x * 0.4) * 2) + rng.range(-0.04, 0.04), x, 0, 1, S);
  grain(g, base, 0, 0, S, S, 30, false);
  for (let i = 0; i < 2; i++) {
    const kx = rng.int(S - 4);
    const ky = rng.int(S - 6);
    px(g, base, 0.7, kx, ky, 3, 5);
    px(g, base, 0.45, kx + 1, ky + 1, 1, 3);
  }
  for (let i = 0; i < 3; i++) px(g, base, 0.42, rng.int(S), rng.int(S - 8), 1, 4 + rng.int(6)); // checks
  noise(g, S, S, 0.08, 80);
  return tile(c);
}

// Dark trim wood with a tight grain both ways (frames, sills, base boards, wheels).
function trim() {
  const S = 32;
  const base: Rgb = [92, 64, 44];
  const { c, g } = canvas(S, S);
  px(g, base, 1, 0, 0, S, S);
  for (let y = 0; y < S; y++) if (rng.chance(0.4)) px(g, base, rng.range(0.82, 1.15), 0, y, S, 1);
  grain(g, base, 0, 0, S, S, 24, true);
  grain(g, base, 0, 0, S, S, 16, false);
  noise(g, S, S, 0.1, 120);
  return tile(c);
}

// Wrought iron: dark mottled metal with rust and a few bright scuffs.
function iron() {
  const S = 32;
  const base: Rgb = [66, 62, 60];
  const { c, g } = canvas(S, S);
  px(g, base, 1, 0, 0, S, S);
  for (let i = 0; i < 90; i++) px(g, base, rng.range(0.75, 1.2), rng.int(S), rng.int(S), 1 + rng.int(3), 1 + rng.int(2));
  for (let i = 0; i < 26; i++) px(g, [128, 66, 38], rng.range(0.8, 1.1), rng.int(S), rng.int(S), 1 + rng.int(2), 1 + rng.int(3));
  for (let i = 0; i < 12; i++) px(g, base, 1.7, rng.int(S), rng.int(S));
  return tile(c);
}

// Cedar shingles in staggered rows, sun-bleached unevenly, some split.
function shingles() {
  const S = 64;
  const base: Rgb = [126, 96, 74];
  const { c, g } = canvas(S, S);
  px(g, base, 0.35, 0, 0, S, S);
  for (let y = 0; y < S; y += 4) {
    for (let x = -rng.int(6); x < S; ) {
      const w = 4 + rng.int(5);
      const k = rng.range(0.72, 1.08);
      px(g, base, k, x, y, w - 1, 3);
      px(g, base, k * 1.15, x, y, w - 1, 1);
      px(g, base, k * 0.6, x, y + 3, w - 1, 1);
      if (rng.chance(0.3)) px(g, base, k * 0.7, x + 1 + rng.int(Math.max(1, w - 2)), y + 1, 1, 2);
      x += w;
    }
  }
  noise(g, S, S, 0.1, 240);
  return tile(c);
}

// Corrugated tin: ridged sheets with lapped seams and rust running down from the nails.
function tin() {
  const S = 64;
  const base: Rgb = [150, 146, 138];
  const rust: Rgb = [140, 74, 40];
  const { c, g } = canvas(S, S);
  const ridge = [1.18, 1.0, 0.72, 0.9];
  for (let x = 0; x < S; x++) px(g, base, ridge[x % 4], x, 0, 1, S);
  for (const sy of [0, 32]) {
    px(g, base, 0.5, 0, sy + 31, S, 1);
    for (let x = 1; x < S; x += 8) {
      px(g, base, 0.4, x, sy + 29);
      const len = 3 + rng.int(12);
      for (let y = 0; y < len; y++) if (rng.chance(0.8)) px(g, rust, rng.range(0.85, 1.1) - y * 0.01, x, (sy + 30 + y) % S);
    }
  }
  for (let i = 0; i < 18; i++) px(g, rust, rng.range(0.8, 1.1), rng.int(S), rng.int(S), 1 + rng.int(4), 1 + rng.int(3));
  noise(g, S, S, 0.08, 300);
  return tile(c);
}

// Dressed stone in uneven courses, lit from above, with chips and dark mortar.
function stone() {
  const S = 64;
  const col: Rgb = [168, 152, 132];
  const { c, g } = canvas(S, S);
  px(g, [84, 74, 64], 1, 0, 0, S, S);
  // course heights that add up to the tile, so it repeats cleanly
  for (const [y, h] of [[0, 7], [7, 8], [15, 6], [21, 8], [29, 7], [36, 7], [43, 6], [49, 8], [57, 7]]) {
    for (let x = -rng.int(8); x < S; ) {
      const w = 6 + rng.int(8);
      const k = rng.range(0.82, 1.15);
      px(g, col, k, x + 1, y + 1, w - 1, h - 1);
      px(g, col, k * 1.14, x + 1, y + 1, w - 1, 1);
      px(g, col, k * 1.06, x + 1, y + 1, 1, h - 1);
      px(g, col, k * 0.74, x + 1, y + h - 1, w - 1, 1);
      px(g, col, k * 0.8, x + w - 1, y + 1, 1, h - 1);
      for (let i = 0; i < 3; i++) px(g, col, k * rng.range(0.7, 0.9), x + 2 + rng.int(Math.max(1, w - 3)), y + 2 + rng.int(Math.max(1, h - 3)));
      x += w;
    }
  }
  noise(g, S, S, 0.08, 300);
  return tile(c);
}

// Red sandstone in wavy strata, with cracks.
function rock() {
  const S = 64;
  const base: Rgb = [176, 104, 70];
  const { c, g } = canvas(S, S);
  for (let x = 0; x < S; x++)
    for (let y = 0; y < S; y++) {
      const band = Math.sin(((y + Math.sin((x / S) * Math.PI * 2) * 2.5) / S) * Math.PI * 2 * 7);
      px(g, base, 0.9 + 0.1 * Math.max(-1, Math.min(1, band * 3)) + rng.range(-0.03, 0.03), x, y);
    }
  for (let i = 0; i < 5; i++) {
    let x = rng.int(S);
    let y = rng.int(S);
    for (let k = 0; k < 10 + rng.int(14); k++) {
      px(g, base, 0.55, x, y);
      px(g, base, 1.12, (x + 1) % S, y);
      y = (y + 1) % S;
      if (rng.chance(0.4)) x = (x + (rng.chance(0.5) ? 1 : S - 1)) % S;
    }
  }
  noise(g, S, S, 0.12, 400);
  return tile(c);
}

// Neutral textures, coloured by vertex colour: a leafy speckle (plants, bone, canvas) and cactus ribs.
function speckle() {
  const S = 32;
  const base: Rgb = [240, 240, 240];
  const { c, g } = canvas(S, S);
  px(g, base, 1, 0, 0, S, S);
  for (let i = 0; i < 70; i++) px(g, base, rng.range(0.66, 0.8), rng.int(S), rng.int(S), 1 + rng.int(2), 1 + rng.int(2));
  for (let i = 0; i < 40; i++) px(g, base, 1.06, rng.int(S), rng.int(S));
  return tile(c);
}

function ribs() {
  const S = 32;
  const base: Rgb = [240, 240, 240];
  const spine: Rgb = [255, 248, 214];
  const { c, g } = canvas(S, S);
  for (let x = 0; x < S; x++) px(g, base, [1.04, 1.0, 0.86, 0.66][x % 4], x, 0, 1, S);
  for (let x = 1; x < S; x += 4)
    for (let y = rng.int(4); y < S - 1; y += 4 + rng.int(3)) {
      px(g, spine, 1, x, y);
      px(g, spine, 0.85, x + 1, y + 1);
    }
  return tile(c);
}

function hay() {
  const S = 32;
  const base: Rgb = [214, 178, 98];
  const twine: Rgb = [96, 70, 44];
  const { c, g } = canvas(S, S);
  px(g, base, 0.85, 0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const k = rng.chance(0.5) ? rng.range(0.62, 0.82) : rng.range(1.0, 1.15);
    const x = rng.int(S);
    const y = rng.int(S);
    for (let j = 0, n = 2 + rng.int(5); j < n; j++) px(g, base, k, (x + j) % S, (y + (rng.chance(0.25) ? 1 : 0)) % S);
  }
  for (const tx of [7, 23]) {
    px(g, twine, 1, tx, 0, 1, S);
    px(g, twine, 1.4, tx + 1, 0, 1, S);
  }
  return tile(c);
}

function water() {
  const S = 32;
  const base: Rgb = [52, 88, 96];
  const { c, g } = canvas(S, S);
  px(g, base, 1, 0, 0, S, S);
  for (let i = 0; i < 40; i++) px(g, base, rng.range(0.75, 0.9), rng.int(S), rng.int(S), 1 + rng.int(3), 1);
  for (let i = 0; i < 14; i++) {
    const x = rng.int(S - 4);
    const y = rng.int(S - 1);
    px(g, base, 1.6, x, y, 2 + rng.int(3), 1);
    px(g, base, 1.3, x + 1, y + 1, 2, 1);
  }
  return tile(c);
}

// The breakables span each face once (0..1 UVs).
function crate() {
  const S = 32;
  const base: Rgb = [168, 128, 84];
  const fr: Rgb = [128, 94, 62];
  const { c, g } = canvas(S, S);
  for (let y = 0; y < S; y += 8) {
    px(g, base, rng.range(0.85, 1.02), 0, y, S, 8);
    grain(g, base, 0, y, S, 7, 6, true);
    px(g, base, 0.5, 0, y + 7, S, 1);
  }
  // frame and a diagonal brace
  px(g, fr, 1, 0, 0, S, 4);
  px(g, fr, 1, 0, S - 4, S, 4);
  px(g, fr, 1, 0, 0, 4, S);
  px(g, fr, 1, S - 4, 0, 4, S);
  for (let i = 4; i < S - 4; i++) px(g, fr, 1, i - 1, S - 1 - i, 3, 1);
  px(g, fr, 0.5, 4, 4, S - 8, 1);
  px(g, fr, 0.5, 4, 4, 1, S - 8);
  px(g, fr, 1.2, 0, 0, S, 1);
  px(g, fr, 1.2, 0, 0, 1, S);
  for (const [nx, ny] of [[2, 2], [S - 2, 2], [2, S - 2], [S - 2, S - 2]]) px(g, fr, 0.35, nx - 1, ny - 1);
  noise(g, S, S, 0.08, 80);
  return tex(c);
}

function barrel() {
  const W = 64;
  const H = 32;
  const base: Rgb = [150, 104, 66];
  const hoop: Rgb = [70, 64, 60];
  const { c, g } = canvas(W, H);
  for (let x = 0; x < W; x += 8) {
    px(g, base, rng.range(0.82, 1.04), x, 0, 8, H);
    grain(g, base, x, 0, 7, H, 5, false);
    px(g, base, 0.5, x + 7, 0, 1, H);
  }
  for (const y of [3, 14, 26]) {
    px(g, hoop, 1, 0, y, W, 3);
    px(g, hoop, 1.5, 0, y, W, 1);
    for (let x = 2; x < W; x += 8) px(g, [130, 70, 40], 1, x, y + 1);
  }
  noise(g, W, H, 0.08, 120);
  return tex(c);
}

function dirt(base: Rgb) {
  const { c, g } = canvas(64, 64);
  g.fillStyle = shade(base, 1);
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = shade(base, rng.range(0.82, 1.12));
    g.fillRect(rng.int(64), rng.int(64), rng.int(4) + 1, rng.int(2) + 1);
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = shade(base, rng.range(0.55, 0.7));
    g.fillRect(rng.int(64), rng.int(64), 1, 1);
    g.fillStyle = shade(base, 1.25);
    g.fillRect(rng.int(64), rng.int(64), 1, 1);
  }
  return tex(c);
}

// The road surface, once across its full width (180 px = 9 units) and 32 units long: packed dirt
// with one pair of wagon ruts that wander a little and come and go along the way.
function road() {
  const W = 180;
  const L = 640;
  const base: Rgb = [170, 126, 86];
  const { c, g } = canvas(W, L);
  g.fillStyle = shade(base, 1);
  g.fillRect(0, 0, W, L);
  for (let i = 0; i < 7000; i++) {
    g.fillStyle = shade(base, rng.range(0.82, 1.12));
    g.fillRect(rng.int(W), rng.int(L), rng.int(4) + 1, rng.int(2) + 1);
  }
  for (let i = 0; i < 800; i++) {
    g.fillStyle = shade(base, rng.range(0.55, 0.7));
    g.fillRect(rng.int(W), rng.int(L), 1, 1);
    g.fillStyle = shade(base, 1.25);
    g.fillRect(rng.int(W), rng.int(L), 1, 1);
  }
  // worn stretches: on for a while, then gone; starts and ends off so the tile repeats cleanly
  let y = rng.int(60) + 20;
  while (y < L - 60) {
    const len = Math.min(L - 40 - y, 60 + rng.int(160));
    const depth = rng.range(0.72, 0.84);
    for (let k = 0; k < len; k++) {
      const yy = y + k;
      const fade = Math.min(1, k / 24, (len - k) / 24); // ruts fade in and out
      const wander = Math.round(Math.sin((yy / L) * Math.PI * 4) * 3);
      for (const x of [62, 118]) {
        if (rng.chance(0.15)) continue;
        g.fillStyle = shade(base, 1 - (1 - depth) * fade);
        g.fillRect(x + wander + (rng.chance(0.2) ? 1 : 0), yy, 2, 1);
      }
    }
    y += len + 40 + rng.int(140);
  }
  return tex(c);
}

export function signTexture(text: string, w = 128, h = 24, bg = '#6b4a2e', fg = '#f1dfb8') {
  const { c, g } = canvas(w, h);
  g.fillStyle = '#2a1a10';
  g.fillRect(0, 0, w, h);
  g.fillStyle = bg;
  g.fillRect(2, 2, w - 4, h - 4);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 2; y < h - 2; y += 4) g.fillRect(2, y + 3, w - 4, 1);
  g.fillStyle = fg;
  let size = h - 8;
  g.font = `bold ${size}px Georgia, serif`;
  while (g.measureText(text).width > w - 10 && size > 6) g.font = `bold ${--size}px Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 1);
  return tex(c, false);
}

export function wantedTexture() {
  const { c, g } = canvas(24, 32);
  g.fillStyle = '#d9c39a';
  g.fillRect(0, 0, 24, 32);
  g.fillStyle = '#3a2414';
  g.font = 'bold 6px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('WANTED', 12, 7);
  // a red panda face, roughly
  g.fillStyle = '#8a3a1c';
  g.fillRect(7, 10, 10, 9);
  g.fillRect(6, 9, 3, 3);
  g.fillRect(15, 9, 3, 3);
  g.fillStyle = '#f1e2c4';
  g.fillRect(9, 14, 2, 2);
  g.fillRect(13, 14, 2, 2);
  g.fillStyle = '#1a0e08';
  g.fillRect(9, 13, 1, 1);
  g.fillRect(14, 13, 1, 1);
  g.fillRect(11, 17, 2, 1);
  g.font = 'bold 5px Georgia, serif';
  g.fillStyle = '#3a2414';
  g.fillText('DEAD OR', 12, 25);
  g.fillText('ALIVE', 12, 30);
  noise(g, 24, 32, 0.2, 60);
  return tex(c, false);
}

const WOOD: Rgb = [150, 106, 70];
export const T = {
  siding: siding(WOOD), // walls: natural, silvered, whitewashed, red barn
  grey: siding([150, 142, 130]),
  paint: siding(WOOD, [226, 214, 188]),
  barn: batten([156, 64, 46], [138, 128, 116]),
  boards: boards(),
  post: timber([142, 104, 70]),
  trim: trim(),
  iron: iron(),
  shingles: shingles(),
  tin: tin(),
  stone: stone(),
  rock: rock(),
  speckle: speckle(),
  ribs: ribs(),
  hay: hay(),
  water: water(),
  crate: crate(),
  barrel: barrel(),
  dirt: dirt([196, 150, 102]),
  road: road(),
  plaza: dirt([170, 126, 86]),
};
