import * as THREE from 'three';
import { PPU, CHAR_LAYER } from './pipeline';

// Pre-rendered pseudo-pixel sheets: 8 rows (E, NE, N, NW, W, SW, S, SE) x N frames of 64x64.
export const ANCHOR_X = 32;
export const ANCHOR_Y = 52;

export interface Anim {
  tex: THREE.Texture;
  frames: number;
  durations: number[];
}
export type Sheet = Record<string, Anim>;

interface SheetJson {
  frameWidth: number;
  frameHeight: number;
  animations: Record<string, { image: string; frames: number; durations: number[] }>;
}

export async function loadSheet(name: string): Promise<Sheet> {
  const base = `${import.meta.env.BASE_URL}sprites/${name}/`;
  const json: SheetJson = await (await fetch(`${base}${name}.json`)).json();
  const loader = new THREE.TextureLoader();
  const out: Sheet = {};
  await Promise.all(
    Object.entries(json.animations).map(async ([k, a]) => {
      const t = await loader.loadAsync(base + a.image);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace;
      out[k] = { tex: t, frames: a.frames, durations: a.durations };
    }),
  );
  return out;
}

const vert = /* glsl */ `
uniform vec4 uFrame; // uv offset xy, uv scale zw
varying vec2 vUv;
void main() {
  vUv = uFrame.xy + uv * uFrame.zw;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const frag = /* glsl */ `
uniform sampler2D map;
uniform vec2 uTexel;
uniform vec3 uTint;
uniform float uFlash;
uniform vec4 uOutline;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.5) {
    if (uOutline.a <= 0.0) discard;
    float n = texture2D(map, vUv + vec2(uTexel.x, 0.0)).a + texture2D(map, vUv - vec2(uTexel.x, 0.0)).a
            + texture2D(map, vUv + vec2(0.0, uTexel.y)).a + texture2D(map, vUv - vec2(0.0, uTexel.y)).a;
    if (n < 0.5) discard;
    gl_FragColor = vec4(uOutline.rgb * uOutline.a, 1.0);
    return;
  }
  if (uAlpha < 1.0) {
    // ordered dissolve, keeps alpha-tested look
    vec2 p = floor(mod(gl_FragCoord.xy, 2.0));
    float b = (p.x + p.y * 2.0 + 0.5) / 4.0;
    if (b > uAlpha) discard;
  }
  vec3 col = c.rgb * uTint;
  gl_FragColor = vec4(mix(col, vec3(4.0), uFlash), 1.0);
}
`;


// Camera-facing quad pivoted at the sprite anchor.
export class Billboard {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  sheet: Sheet;
  anim = 'idle';
  frame = 0;
  t = 0;
  dir = 6; // facing the camera
  speed = 1;
  oneShotSpeed = 1.6; // interrupts play faster so they stay snappy
  oneShot: string | null = null;
  onDone: (() => void) | null = null;

  constructor(sheet: Sheet, outline: THREE.Color | null) {
    this.sheet = sheet;
    const s = 64 / PPU;
    const geo = new THREE.PlaneGeometry(s, s);
    geo.translate(-(ANCHOR_X - 32) / PPU, (ANCHOR_Y - 32) / PPU, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        map: { value: sheet.idle.tex },
        uFrame: { value: new THREE.Vector4() },
        uTexel: { value: new THREE.Vector2() },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uFlash: { value: 0 },
        uOutline: { value: new THREE.Vector4(outline?.r ?? 0, outline?.g ?? 0, outline?.b ?? 0, outline ? 1 : 0) },
        uAlpha: { value: 1 },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(CHAR_LAYER);
    this.setFrame();
  }

  play(anim: string, oneShot = false, onDone: (() => void) | null = null) {
    if (oneShot) {
      this.oneShot = anim;
      this.onDone = onDone;
      this.frame = 0;
      this.t = 0;
      return;
    }
    if (this.anim === anim) return;
    this.anim = anim;
    if (!this.oneShot) {
      this.frame = 0;
      this.t = 0;
    }
  }

  update(dt: number) {
    const name = this.oneShot ?? this.anim;
    const a = this.sheet[name];
    this.t += dt * 1000 * (this.oneShot ? this.oneShotSpeed : this.speed);
    while (this.t >= a.durations[this.frame]) {
      this.t -= a.durations[this.frame];
      this.frame++;
      if (this.frame >= a.frames) {
        if (this.oneShot) {
          this.oneShot = null;
          this.frame = 0;
          const cb = this.onDone;
          this.onDone = null;
          cb?.();
          break;
        }
        this.frame = 0;
      }
    }
    this.setFrame();
  }

  // Current animation name and time into it (ms), for the 3D model to follow.
  get current() {
    return this.oneShot ?? this.anim;
  }
  elapsed() {
    const d = this.sheet[this.current].durations;
    let ms = this.t;
    for (let i = 0; i < this.frame; i++) ms += d[i];
    return ms;
  }

  private setFrame() {
    const a = this.sheet[this.oneShot ?? this.anim];
    const u = this.mat.uniforms;
    u.map.value = a.tex;
    const fw = 1 / a.frames;
    const fh = 1 / 8;
    u.uFrame.value.set(this.frame * fw, 1 - (this.dir + 1) * fh, fw, fh);
    u.uTexel.value.set(fw / 64, fh / 64);
  }

  // Direction row from a screen-space vector (x right, y up).
  static dirFromScreen(sx: number, sy: number) {
    const a = Math.atan2(sy, sx);
    const r = Math.round(a / (Math.PI / 4));
    return ((r % 8) + 8) % 8;
  }
}

