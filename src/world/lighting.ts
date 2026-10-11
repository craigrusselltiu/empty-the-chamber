import * as THREE from 'three';

// Dusk-to-midnight cycle plus a fixed pool of point lights (count never changes, so no shader recompiles).
const N_LANTERN = 8;
const N_DYNAMIC = 4;

interface Key {
  t: number;
  sun: number[];
  sunI: number;
  elev: number; // degrees
  azim: number; // degrees
  sky: number[];
  gnd: number[];
  hemiI: number;
  fog: number[];
  lamp: number; // lantern intensity scale
  glow: number; // window glow
  tint: number[]; // post shadow tint
}

// Golden hour -> dusk -> moonlit midnight. Kept bright enough to read.
const KEYS: Key[] = [
  { t: 0, sun: [1, 0.78, 0.52], sunI: 3.2, elev: 28, azim: 200, sky: [1, 0.82, 0.62], gnd: [0.55, 0.38, 0.28], hemiI: 1.3, fog: [0.92, 0.7, 0.5], lamp: 0.5, glow: 0.35, tint: [0.03, 0.0, 0.05] },
  { t: 0.35, sun: [1, 0.6, 0.35], sunI: 2.6, elev: 16, azim: 215, sky: [0.95, 0.66, 0.52], gnd: [0.5, 0.32, 0.28], hemiI: 1.1, fog: [0.85, 0.55, 0.42], lamp: 1.0, glow: 0.8, tint: [0.05, 0.0, 0.07] },
  { t: 0.6, sun: [1, 0.42, 0.28], sunI: 1.5, elev: 6, azim: 228, sky: [0.62, 0.45, 0.6], gnd: [0.35, 0.24, 0.3], hemiI: 0.95, fog: [0.5, 0.33, 0.42], lamp: 1.6, glow: 1.4, tint: [0.06, 0.0, 0.09] },
  { t: 0.8, sun: [0.5, 0.62, 1.1], sunI: 1.1, elev: 30, azim: 60, sky: [0.38, 0.44, 0.8], gnd: [0.2, 0.2, 0.36], hemiI: 0.9, fog: [0.2, 0.2, 0.36], lamp: 1.5, glow: 1.3, tint: [0.02, 0.03, 0.12] },
  { t: 1, sun: [0.48, 0.62, 1.15], sunI: 1.2, elev: 42, azim: 40, sky: [0.32, 0.4, 0.82], gnd: [0.16, 0.17, 0.34], hemiI: 0.85, fog: [0.12, 0.13, 0.28], lamp: 1.6, glow: 1.4, tint: [0.0, 0.03, 0.12] },
];

function lerpArr(a: number[], b: number[], k: number, out: THREE.Color) {
  out.setRGB(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
  return out;
}

export interface Flash {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
  intensity: number;
  life: number;
  max: number;
}

export class Lighting {
  hemi = new THREE.HemisphereLight();
  sun = new THREE.DirectionalLight();
  pool: THREE.PointLight[] = [];
  fog = new THREE.Fog(0, 82, 135);
  lamp = 1;
  glow = 1;
  flashes: Flash[] = [];
  private lanterns: THREE.Vector3[];
  private sortT = 0;
  private nearest: number[] = [];
  private tmp = new THREE.Color();
  tint = new THREE.Color();

  constructor(scene: THREE.Scene, lanterns: THREE.Vector3[]) {
    this.lanterns = lanterns;
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = this.fog;
    const s = this.sun.shadow;
    s.mapSize.set(1024, 1024);
    s.camera.left = s.camera.bottom = -24;
    s.camera.right = s.camera.top = 24;
    s.camera.near = 1;
    s.camera.far = 120;
    s.bias = -0.0015;
    this.sun.castShadow = true;
    for (let i = 0; i < N_LANTERN + N_DYNAMIC; i++) {
      const l = new THREE.PointLight(0xffa050, 0, 14, 2);
      this.pool.push(l);
      scene.add(l);
    }
  }

  flash(x: number, y: number, z: number, color: THREE.Color, intensity: number, life: number) {
    if (this.flashes.length >= 16) this.flashes.shift();
    this.flashes.push({ x, y, z, color, intensity, life, max: life });
  }

  update(t01: number, px: number, pz: number, dt: number, time: number, bg: THREE.Color) {
    let i = 0;
    while (i < KEYS.length - 2 && t01 > KEYS[i + 1].t) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const k = Math.min(1, Math.max(0, (t01 - a.t) / (b.t - a.t)));
    const L = (x: number, y: number) => x + (y - x) * k;

    lerpArr(a.sun, b.sun, k, this.sun.color);
    this.sun.intensity = L(a.sunI, b.sunI);
    lerpArr(a.sky, b.sky, k, this.hemi.color);
    lerpArr(a.gnd, b.gnd, k, this.hemi.groundColor);
    this.hemi.intensity = L(a.hemiI, b.hemiI);
    lerpArr(a.fog, b.fog, k, this.fog.color);
    bg.copy(this.fog.color);
    lerpArr(a.tint, b.tint, k, this.tint);
    this.lamp = L(a.lamp, b.lamp);
    this.glow = L(a.glow, b.glow);

    // sun/moon direction; the sun -> moon swap happens while the sun is near the horizon
    const elev = (L(a.elev, b.elev) * Math.PI) / 180;
    const az = (L(a.azim, b.azim) * Math.PI) / 180;
    const sx = Math.round(px);
    const sz = Math.round(pz);
    this.sun.position.set(sx + Math.cos(az) * Math.cos(elev) * 60, Math.sin(elev) * 60, sz + Math.sin(az) * Math.cos(elev) * 60);
    this.sun.target.position.set(sx, 0, sz);
    this.sun.target.updateMatrixWorld();

    // nearest lanterns, re-sorted a few times a second
    this.sortT -= dt;
    if (this.sortT <= 0) {
      this.sortT = 0.2;
      const d = this.lanterns.map((p, idx) => [(p.x - px) ** 2 + (p.z - pz) ** 2, idx]);
      d.sort((u, v) => u[0] - v[0]);
      this.nearest = d.slice(0, N_LANTERN).map((x) => x[1]);
    }
    for (let j = 0; j < N_LANTERN; j++) {
      const l = this.pool[j];
      const idx = this.nearest[j];
      if (idx === undefined) {
        l.intensity = 0;
        continue;
      }
      const p = this.lanterns[idx];
      l.position.set(p.x, p.y + 0.2, p.z);
      l.color.setRGB(1, 0.6, 0.28);
      const flick = 1 + Math.sin(time * 13 + idx * 7.1) * 0.05 + Math.sin(time * 31 + idx * 3.3) * 0.04;
      l.intensity = 10 * this.lamp * flick;
      l.distance = 10;
    }

    // dynamic flashes: the brightest few get the lights
    for (let j = this.flashes.length - 1; j >= 0; j--) {
      const f = this.flashes[j];
      f.life -= dt;
      if (f.life <= 0) this.flashes.splice(j, 1);
    }
    const fl = this.flashes;
    for (let j = 0; j < N_DYNAMIC; j++) {
      const l = this.pool[N_LANTERN + j];
      const f = fl[fl.length - 1 - j];
      if (!f) {
        l.intensity = 0;
        continue;
      }
      l.position.set(f.x, f.y, f.z);
      l.color.copy(f.color);
      l.intensity = f.intensity * (f.life / f.max);
      l.distance = 14;
    }
  }

  // Approximate light reaching a point, for tinting sprites.
  sample(x: number, y: number, z: number, out: THREE.Color) {
    out.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 0.75);
    out.add(this.tmp.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.22));
    for (const l of this.pool) {
      if (l.intensity <= 0) continue;
      const d2 = (l.position.x - x) ** 2 + (l.position.y - y) ** 2 + (l.position.z - z) ** 2;
      const att = Math.max(0, 1 - Math.sqrt(d2) / l.distance);
      out.add(this.tmp.copy(l.color).multiplyScalar((l.intensity / (1 + d2)) * att * att * 0.6));
    }
    return out;
  }
}
