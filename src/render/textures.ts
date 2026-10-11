import * as THREE from 'three';
import { Rng } from '../rng';

// Low-res procedural textures, painted on canvases at startup.
const rng = new Rng(1234);

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

function shade(base: [number, number, number], k: number) {
  return `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k)})`;
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, amt: number, n: number) {
  for (let i = 0; i < n; i++) {
    const v = rng.range(-amt, amt);
    g.fillStyle = v > 0 ? `rgba(255,240,220,${v})` : `rgba(20,10,10,${-v})`;
    g.fillRect(rng.int(w), rng.int(h), 1, 1);
  }
}

// Boards running horizontally (siding).
function planksH() {
  const { c, g } = canvas(32, 32);
  const base: [number, number, number] = [150, 110, 75];
  for (let y = 0; y < 32; y += 4) {
    g.fillStyle = shade(base, rng.range(0.8, 1.05));
    g.fillRect(0, y, 32, 4);
    g.fillStyle = shade(base, 0.5);
    g.fillRect(0, y + 3, 32, 1);
    const seam = rng.int(32);
    g.fillRect(seam, y, 1, 3);
    g.fillStyle = shade(base, 0.95);
    for (let x = 0; x < 32; x += rng.int(6) + 3) g.fillRect(x, y + 1, rng.int(4) + 1, 1);
  }
  noise(g, 32, 32, 0.15, 120);
  return tex(c);
}

// Boards running vertically (false fronts, porches, crates).
function planksV() {
  const { c, g } = canvas(32, 32);
  const base: [number, number, number] = [140, 100, 68];
  for (let x = 0; x < 32; x += 4) {
    g.fillStyle = shade(base, rng.range(0.78, 1.05));
    g.fillRect(x, 0, 4, 32);
    g.fillStyle = shade(base, 0.5);
    g.fillRect(x + 3, 0, 1, 32);
    g.fillStyle = shade(base, 0.92);
    for (let y = 0; y < 32; y += rng.int(6) + 3) g.fillRect(x + 1, y, 1, rng.int(4) + 1);
    g.fillStyle = shade(base, 0.4);
    g.fillRect(x + 1, 2, 1, 1);
    g.fillRect(x + 1, 29, 1, 1);
  }
  noise(g, 32, 32, 0.15, 120);
  return tex(c);
}

function shingles() {
  const { c, g } = canvas(32, 32);
  const base: [number, number, number] = [120, 92, 72];
  for (let y = 0; y < 32; y += 4) {
    const off = (y / 4) % 2 ? 3 : 0;
    for (let x = -off; x < 32; x += 6) {
      g.fillStyle = shade(base, rng.range(0.7, 1.05));
      g.fillRect(x, y, 6, 4);
      g.fillStyle = shade(base, 0.45);
      g.fillRect(x, y + 3, 6, 1);
      g.fillRect(x + 5, y, 1, 4);
    }
  }
  noise(g, 32, 32, 0.12, 100);
  return tex(c);
}

function stone() {
  const { c, g } = canvas(32, 32);
  g.fillStyle = 'rgb(90,80,70)';
  g.fillRect(0, 0, 32, 32);
  for (let y = 0; y < 32; y += 6) {
    let x = -rng.int(6);
    while (x < 32) {
      const w = rng.int(5) + 5;
      const k = rng.range(0.85, 1.2);
      g.fillStyle = `rgb(${Math.round(165 * k)},${Math.round(150 * k)},${Math.round(130 * k)})`;
      g.fillRect(x + 1, y + 1, w - 1, 5);
      g.fillStyle = `rgba(255,240,220,0.18)`;
      g.fillRect(x + 1, y + 1, w - 1, 1);
      x += w;
    }
  }
  noise(g, 32, 32, 0.15, 160);
  return tex(c);
}

function dirt(base: [number, number, number], ruts: boolean) {
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
  if (ruts) {
    for (const x of [14, 18, 44, 48]) {
      for (let y = 0; y < 64; y++) {
        g.fillStyle = shade(base, rng.range(0.7, 0.82));
        g.fillRect(x + (rng.chance(0.2) ? 1 : 0), y, 2, 1);
      }
    }
  }
  return tex(c);
}

function rock() {
  const { c, g } = canvas(32, 32);
  const base: [number, number, number] = [176, 104, 70];
  for (let y = 0; y < 32; y += 2) {
    g.fillStyle = shade(base, 0.85 + 0.2 * Math.sin(y * 0.9) + rng.range(-0.05, 0.05));
    g.fillRect(0, y, 32, 2);
  }
  noise(g, 32, 32, 0.2, 200);
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

export const T = {
  planksH: planksH(),
  planksV: planksV(),
  shingles: shingles(),
  stone: stone(),
  dirt: dirt([196, 150, 102], false),
  road: dirt([170, 126, 86], true),
  rock: rock(),
};
