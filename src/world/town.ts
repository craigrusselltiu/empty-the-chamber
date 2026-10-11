import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../rng';
import { T, signTexture, wantedTexture } from '../render/textures';
import { ps1 } from '../render/ps1';

// Stage 1, The Dusty Trail: a trail-stop boomtown on a crossroads.
// Main street runs along x, the cross street along z. Facades face +z or +x so the camera sees them.

export const BOUND = 58; // playable half-size

export interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
export interface Breakable {
  x: number;
  z: number;
  r: number;
  kind: 0 | 1; // barrel, crate
  alive: boolean;
}

type Key = 'planksH' | 'planksV' | 'shingles' | 'stone' | 'rock' | 'trim' | 'glow' | 'lamp' | 'cactus';

const UV_TILE = 1.6; // world units per texture repeat (32 px textures -> 20 texels per unit)

const COL = {
  dark: [0.12, 0.08, 0.06],
  wood: [1, 1, 1],
  weathered: [0.82, 0.8, 0.78],
  red: [1.0, 0.72, 0.62],
  pale: [1.08, 1.02, 0.92],
  iron: [0.25, 0.22, 0.2],
  rope: [0.75, 0.6, 0.4],
  hay: [0.95, 0.78, 0.4],
  water: [0.25, 0.4, 0.45],
  green: [0.35, 0.5, 0.28],
} as const;
type Rgb = readonly [number, number, number];

class Builder {
  parts = new Map<Key, THREE.BufferGeometry[]>();
  m = new THREE.Matrix4();
  stack: THREE.Matrix4[] = [];

  push(x: number, z: number, rotY: number) {
    this.stack.push(this.m.clone());
    this.m.multiply(new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z));
  }
  pop() {
    this.m = this.stack.pop()!;
  }

  add(key: Key, geo: THREE.BufferGeometry, local: THREE.Matrix4, color: Rgb) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(this.m, local));
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set(color, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    let arr = this.parts.get(key);
    if (!arr) this.parts.set(key, (arr = []));
    arr.push(g);
  }

  // Box with UVs in world units so texel density stays constant.
  box(key: Key, w: number, h: number, d: number, x: number, y: number, z: number, color: Rgb = COL.wood, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++)
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, (uv.getX(k) * dims[f][0]) / UV_TILE, (uv.getY(k) * dims[f][1]) / UV_TILE);
      }
    const mat = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z);
    this.add(key, g, mat, color);
  }

  cyl(key: Key, rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, color: Rgb, rx = 0, rz = 0) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * rb) / UV_TILE, (uv.getY(i) * h) / UV_TILE);
    this.add(key, g, new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)).setPosition(x, y, z), color);
  }

  // Flat triangle, UVs projected from local x/y.
  tri(key: Key, a: number[], b: number[], c: number[], color: Rgb) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([a[0] / UV_TILE, a[1] / UV_TILE, b[0] / UV_TILE, b[1] / UV_TILE, c[0] / UV_TILE, c[1] / UV_TILE], 2));
    g.computeVertexNormals();
    this.add(key, g, new THREE.Matrix4(), color);
  }
}

interface BuildingSpec {
  sign: string;
  x: number; // front-centre
  z: number;
  face: 'z' | 'x';
  w: number;
  d: number;
  floors: 1 | 2;
  wall?: 'planksH' | 'stone';
  tint?: Rgb;
  roof?: 'gable' | 'flat';
  porch?: boolean;
  wanted?: boolean;
  steeple?: boolean;
}

const BUILDINGS: BuildingSpec[] = [
  // north side of main street, facing +z
  { sign: 'SALOON', x: 13, z: -6, face: 'z', w: 12, d: 11, floors: 2, porch: true, roof: 'gable' },
  { sign: 'BANK', x: 26, z: -6, face: 'z', w: 9, d: 9, floors: 1, wall: 'stone', roof: 'flat' },
  { sign: 'HOTEL', x: 38, z: -6, face: 'z', w: 11, d: 10, floors: 2, porch: true, tint: COL.red, roof: 'gable' },
  { sign: 'LIVERY', x: 51, z: -6, face: 'z', w: 11, d: 12, floors: 1, tint: COL.red, roof: 'gable' },
  { sign: 'GENERAL STORE', x: -14, z: -6, face: 'z', w: 11, d: 10, floors: 1, porch: true, tint: COL.pale, roof: 'gable' },
  { sign: 'ASSAY OFFICE', x: -26, z: -6, face: 'z', w: 9, d: 8, floors: 1, porch: true, tint: COL.weathered, roof: 'flat' },
  { sign: 'UNDERTAKER', x: -37, z: -6, face: 'z', w: 9, d: 9, floors: 1, tint: COL.weathered, roof: 'gable' },
  // west side of cross street, facing +x
  { sign: "SHERIFF'S OFFICE", x: -6, z: 12, face: 'x', w: 11, d: 10, floors: 1, porch: true, wanted: true, roof: 'gable' },
  { sign: 'JAIL', x: -6, z: 23, face: 'x', w: 8, d: 8, floors: 1, wall: 'stone', roof: 'flat' },
  { sign: 'TELEGRAPH', x: -6, z: 33, face: 'x', w: 8, d: 8, floors: 1, porch: true, tint: COL.pale, roof: 'gable' },
  { sign: 'CHAPEL', x: -6, z: -24, face: 'x', w: 9, d: 12, floors: 1, tint: COL.pale, roof: 'gable', steeple: true },
  // set back on the near side; we see their backs
  { sign: 'BLACKSMITH', x: 26, z: 26, face: 'z', w: 10, d: 8, floors: 1, tint: COL.weathered, roof: 'gable' },
  { sign: 'BARBER', x: 40, z: 22, face: 'z', w: 8, d: 8, floors: 1, tint: COL.red, roof: 'flat' },
];

export class Town {
  group = new THREE.Group();
  boxes: Box[] = []; // solid footprints
  circles: { x: number; z: number; r: number }[] = []; // solid round props
  lanterns: THREE.Vector3[] = [];
  breakables: Breakable[] = [];
  barrelMesh!: THREE.InstancedMesh;
  crateMesh!: THREE.InstancedMesh;
  glowMat!: THREE.MeshBasicMaterial;
  lampMat!: THREE.MeshBasicMaterial;
  private breakMats: THREE.Matrix4[] = [];
  private b = new Builder();
  private rng = new Rng(77);

  constructor() {
    this.ground();
    for (const s of BUILDINGS) this.building(s);
    this.streetDressing();
    this.outskirts();
    this.finish();
  }

  private ground() {
    // Ground layers skip vertex snapping (it would make them z-fight) and sit at distinct heights.
    // The texture's v axis runs along `len`, so road ruts follow the street.
    const mk = (tex: THREE.Texture, width: number, len: number, x: number, z: number, y: number, alongX: boolean) => {
      const t = tex.clone();
      t.needsUpdate = true;
      t.repeat.set(width / 3.2, len / 3.2);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, len), new THREE.MeshLambertMaterial({ map: t }));
      mesh.rotation.set(-Math.PI / 2, 0, alongX ? Math.PI / 2 : 0);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    };
    mk(T.dirt, 220, 220, 0, 0, 0, false);
    mk(T.road, 9, 130, 8, 0, 0.04, true); // main street
    mk(T.road, 9, 100, 0, 0, 0.08, false); // cross street
  }

  private solid(lx0: number, lz0: number, lx1: number, lz1: number) {
    // transform a local rect by the builder's current matrix (rotations are multiples of 90 deg)
    const a = new THREE.Vector3(lx0, 0, lz0).applyMatrix4(this.b.m);
    const c = new THREE.Vector3(lx1, 0, lz1).applyMatrix4(this.b.m);
    this.boxes.push({ x0: Math.min(a.x, c.x), z0: Math.min(a.z, c.z), x1: Math.max(a.x, c.x), z1: Math.max(a.z, c.z) });
  }

  private lantern(lx: number, ly: number, lz: number, post = false) {
    const b = this.b;
    if (post) {
      b.box('trim', 0.18, ly + 0.3, 0.18, lx, (ly + 0.3) / 2, lz, COL.dark);
      b.box('trim', 0.6, 0.1, 0.1, lx + 0.25, ly + 0.55, lz, COL.dark);
      const c = new THREE.Vector3(lx, 0, lz).applyMatrix4(b.m);
      this.circles.push({ x: c.x, z: c.z, r: 0.25 });
      lx += 0.5;
    }
    b.box('trim', 0.34, 0.08, 0.34, lx, ly + 0.26, lz, COL.dark);
    b.box('lamp', 0.24, 0.36, 0.24, lx, ly, lz, [1, 1, 1]);
    b.box('trim', 0.3, 0.06, 0.3, lx, ly - 0.2, lz, COL.dark);
    const p = new THREE.Vector3(lx, ly, lz).applyMatrix4(b.m);
    this.lanterns.push(p);
  }

  private window(lx: number, ly: number, lz: number, w = 1.0, h = 1.3) {
    const b = this.b;
    b.box('trim', w + 0.3, h + 0.3, 0.12, lx, ly, lz, COL.dark);
    b.box('glow', w, h, 0.04, lx, ly, lz + 0.1, [1, 1, 1]);
    b.box('trim', 0.08, h, 0.06, lx, ly, lz + 0.17, COL.dark);
    b.box('trim', w, 0.08, 0.06, lx, ly, lz + 0.17, COL.dark);
  }

  private sign(text: string, lx: number, ly: number, lz: number, w: number) {
    const tex = signTexture(text);
    const h = w * (24 / 128);
    const m = ps1(new THREE.MeshLambertMaterial({ map: tex }), { cut: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    const p = new THREE.Vector3(lx, ly, lz).applyMatrix4(this.b.m);
    mesh.position.copy(p);
    mesh.rotation.y = Math.atan2(this.b.m.elements[8], this.b.m.elements[10]);
    this.group.add(mesh);
    // board behind the sign
    this.b.box('trim', w + 0.2, h + 0.2, 0.1, lx, ly, lz - 0.12, COL.dark);
  }

  private poster(lx: number, ly: number, lz: number) {
    const m = ps1(new THREE.MeshLambertMaterial({ map: wantedTexture() }), { cut: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), m);
    mesh.position.copy(new THREE.Vector3(lx, ly, lz).applyMatrix4(this.b.m));
    mesh.rotation.y = Math.atan2(this.b.m.elements[8], this.b.m.elements[10]);
    mesh.rotation.z = (this.rng.next() - 0.5) * 0.12;
    this.group.add(mesh);
  }

  private building(s: BuildingSpec) {
    const b = this.b;
    const rot = s.face === 'z' ? 0 : Math.PI / 2;
    b.push(s.x, s.z, rot);
    const { w, d } = s;
    const wallKey = s.wall ?? 'planksH';
    const tint = s.tint ?? COL.wood;
    const h1 = 4;
    const h = s.floors === 2 ? 7.6 : h1;
    const cz = -d / 2;

    // body
    b.box(wallKey, w, h, d, 0, h / 2, cz, wallKey === 'stone' ? [1, 1, 1] : tint);
    b.box('trim', w + 0.1, 0.3, d + 0.1, 0, 0.15, cz, COL.dark);
    // corner posts
    for (const sx of [-1, 1]) for (const sz of [0, -d]) b.box('planksV', 0.3, h, 0.3, sx * (w / 2), h / 2, sz, COL.weathered);
    this.solid(-w / 2 - 0.15, -d - 0.15, w / 2 + 0.15, 0.15);

    // roof
    const roofTint: Rgb = [0.9, 0.85, 0.8];
    if (s.roof === 'gable') {
      const rh = w * 0.32;
      const slope = Math.hypot(w / 2 + 0.5, rh);
      const ang = Math.atan2(rh, w / 2 + 0.5);
      for (const sx of [-1, 1]) {
        b.box('shingles', slope, 0.2, d + 0.8, (sx * (w / 2 + 0.5)) / 2, h + rh / 2, cz, roofTint, 0, 0, sx * -ang);
      }
      const gk = wallKey === 'stone' ? 'stone' : 'planksH';
      b.tri(gk, [-w / 2, h, 0.01], [w / 2, h, 0.01], [0, h + rh, 0.01], tint);
      b.tri(gk, [w / 2, h, -d - 0.01], [-w / 2, h, -d - 0.01], [0, h + rh, -d - 0.01], tint);
    } else {
      b.box('trim', w + 0.4, 0.3, d + 0.4, 0, h + 0.15, cz, COL.dark);
      b.box(wallKey, w + 0.2, 0.6, 0.3, 0, h + 0.5, 0, wallKey === 'stone' ? [1, 1, 1] : tint);
    }

    // false front for one-storey buildings (or the facade above the balcony)
    const ffTop = s.floors === 2 ? h + 1.4 : h + 2.4;
    if (!s.steeple) {
      b.box('planksV', w + 0.4, ffTop, 0.3, 0, ffTop / 2, 0.15, wallKey === 'stone' ? [0.75, 0.72, 0.7] : tint);
      b.box('trim', w + 0.7, 0.25, 0.5, 0, ffTop + 0.1, 0.15, COL.dark);
    }

    // door and windows on the facade
    const fz = 0.3;
    b.box('trim', 1.6, 2.6, 0.12, 0, 1.3, fz, COL.dark);
    b.box('glow', 1.2, 2.3, 0.04, 0, 1.2, fz + 0.1, [0.45, 0.35, 0.3]);
    if (s.sign === 'SALOON') {
      for (const sx of [-0.32, 0.32]) b.box('planksV', 0.55, 1.0, 0.08, sx, 1.4, fz + 0.2, COL.weathered);
    }
    const wx = w / 2 - 1.8;
    for (const sx of [-wx, wx]) this.window(sx, 2.1, fz);
    if (s.floors === 2) for (const sx of [-wx, 0, wx]) this.window(sx, 5.6, fz);
    // side windows
    const side = s.face === 'z' ? 1 : -1;
    for (let zz = -2.5; zz > -d + 1.5; zz -= 3.5) {
      b.push((side * w) / 2, zz, (side * Math.PI) / 2);
      this.window(0, 2.1, 0.06);
      if (s.floors === 2) this.window(0, 5.6, 0.06);
      b.pop();
    }

    // sign
    const signY = s.floors === 2 ? h + 0.4 : h + 1.2;
    this.sign(s.sign, 0, signY, 0.4, Math.min(w - 1.5, 9));

    // porch / balcony
    if (s.porch) {
      const pd = 2.6;
      b.box('planksV', w + 0.4, 0.35, pd, 0, 0.17, pd / 2 + 0.3, COL.weathered);
      const postH = s.floors === 2 ? h1 : 3.4;
      const posts = s.floors === 2 ? [-w / 2, -w / 6, w / 6, w / 2] : [-w / 2, w / 2];
      for (const px of posts) b.box('planksV', 0.25, postH, 0.25, px, postH / 2, pd + 0.1, COL.weathered);
      if (s.floors === 2) {
        b.box('planksV', w + 0.6, 0.3, pd + 0.2, 0, h1 + 0.15, pd / 2 + 0.2, COL.weathered);
        b.box('trim', w + 0.6, 0.12, 0.12, 0, h1 + 1.2, pd + 0.2, COL.dark);
        for (let px = -w / 2; px <= w / 2 + 0.01; px += 0.6) b.box('trim', 0.08, 0.9, 0.08, px, h1 + 0.75, pd + 0.2, COL.dark);
        for (const sx of [-1, 1]) {
          b.box('trim', 0.12, 0.12, pd, sx * (w / 2 + 0.25), h1 + 1.2, pd / 2 + 0.2, COL.dark);
        }
      } else {
        b.box('shingles', w + 0.8, 0.15, pd + 0.6, 0, postH + 0.15, pd / 2 + 0.3, roofTint, 0.18);
      }
      this.lantern(-w / 2 + 0.6, 2.7, pd + 0.1);
      this.lantern(w / 2 - 0.6, 2.7, pd + 0.1);
      // a bench and a barrel on the porch
      b.box('planksV', 2.2, 0.15, 0.6, -wx, 0.85, 1.3, COL.weathered);
      for (const sx of [-1, 1]) b.box('trim', 0.12, 0.5, 0.5, -wx + sx * 0.9, 0.6, 1.3, COL.dark);
    } else {
      this.lantern(-1.3, 2.7, 0.55);
      this.lantern(1.3, 2.7, 0.55);
    }

    if (s.wanted) {
      this.poster(-wx - 1.3, 2.0, 0.42);
      this.poster(wx + 1.3, 2.2, 0.42);
      this.poster(wx - 1.2, 2.9, 0.42);
    }

    if (s.steeple) {
      const sh = h + w * 0.32;
      b.box('planksH', 3, 3.5, 3, 0, sh + 0.6, -1.8, tint);
      b.box('trim', 1, 1.2, 3.1, 0, sh + 1.4, -1.8, COL.dark);
      b.cyl('shingles', 0, 2.3, 3.5, 4, 0, sh + 4.1, -1.8, [0.9, 0.85, 0.8]);
      b.box('trim', 0.15, 1.4, 0.15, 0, sh + 6.5, -1.8, COL.dark);
      b.box('trim', 0.9, 0.15, 0.15, 0, sh + 6.7, -1.8, COL.dark);
    }
    b.pop();
  }

  private barrel(x: number, z: number) {
    this.breakables.push({ x, z, r: 0.45, kind: 0, alive: true });
  }
  private crate(x: number, z: number) {
    this.breakables.push({ x, z, r: 0.5, kind: 1, alive: true });
  }

  private wagon(x: number, z: number, rot: number, covered: boolean) {
    const b = this.b;
    b.push(x, z, rot);
    b.box('planksH', 2.0, 0.7, 3.6, 0, 1.1, 0, COL.weathered);
    b.box('trim', 1.8, 0.15, 3.4, 0, 0.75, 0, COL.dark);
    for (const sx of [-1.05, 1.05])
      for (const sz of [-1.2, 1.2]) b.cyl('trim', 0.55, 0.55, 0.12, 8, sx, 0.55, sz, COL.dark, 0, Math.PI / 2);
    b.box('trim', 0.12, 0.12, 2.0, 0, 0.6, 2.7, COL.dark, 0.3);
    if (covered) {
      b.cyl('trim', 1.1, 1.1, 3.2, 7, 0, 1.45, 0, [0.72, 0.64, 0.52], Math.PI / 2);
    } else {
      b.box('planksV', 0.8, 0.8, 0.8, 0.4, 1.8, -0.8, COL.weathered);
      b.box('planksV', 0.7, 0.6, 0.7, -0.4, 1.7, 0.6, COL.wood);
    }
    this.solid(-1.2, -1.9, 1.2, 1.9);
    b.pop();
  }

  private trough(x: number, z: number, rot: number) {
    const b = this.b;
    b.push(x, z, rot);
    b.box('planksH', 2.6, 0.7, 0.9, 0, 0.35, 0, COL.weathered);
    b.box('trim', 2.4, 0.06, 0.7, 0, 0.74, 0, COL.water);
    this.solid(-1.3, -0.45, 1.3, 0.45);
    b.pop();
  }

  private hitch(x: number, z: number, rot: number, len = 3) {
    const b = this.b;
    b.push(x, z, rot);
    for (const sx of [-len / 2, len / 2]) b.box('planksV', 0.2, 1.1, 0.2, sx, 0.55, 0, COL.weathered);
    b.box('planksV', len + 0.3, 0.15, 0.15, 0, 1.0, 0, COL.weathered);
    b.pop();
  }

  private fence(x0: number, z0: number, x1: number, z1: number) {
    const b = this.b;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    b.push((x0 + x1) / 2, (z0 + z1) / 2, rot);
    for (let t = -len / 2; t <= len / 2 + 0.01; t += 2) b.box('planksV', 0.2, 1.2, 0.2, t, 0.6, 0, COL.weathered);
    b.box('planksH', len, 0.15, 0.1, 0, 0.9, 0, COL.weathered);
    b.box('planksH', len, 0.15, 0.1, 0, 0.45, 0, COL.weathered);
    b.pop();
  }

  private stoneWall(x0: number, z0: number, x1: number, z1: number, h = 1.6) {
    const b = this.b;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    b.push((x0 + x1) / 2, (z0 + z1) / 2, rot);
    b.box('stone', len, h, 0.8, 0, h / 2, 0, [1, 1, 1]);
    b.box('stone', len + 0.1, 0.2, 0.95, 0, h + 0.1, 0, [0.85, 0.82, 0.8]);
    this.solid(-len / 2, -0.4, len / 2, 0.4);
    b.pop();
  }

  private cactus(x: number, z: number, s: number) {
    const b = this.b;
    b.cyl('cactus', 0.3 * s, 0.35 * s, 3 * s, 6, x, 1.5 * s, z, COL.green);
    b.cyl('cactus', 0.2 * s, 0.22 * s, 1.2 * s, 6, x + 0.6 * s, 1.8 * s, z, COL.green);
    b.cyl('cactus', 0.2 * s, 0.22 * s, 0.6 * s, 6, x + 0.35 * s, 1.3 * s, z, COL.green, 0, Math.PI / 2);
    b.cyl('cactus', 0.18 * s, 0.2 * s, 1.0 * s, 6, x - 0.55 * s, 2.2 * s, z, COL.green);
    b.cyl('cactus', 0.18 * s, 0.2 * s, 0.5 * s, 6, x - 0.32 * s, 1.75 * s, z, COL.green, 0, Math.PI / 2);
    this.circles.push({ x, z, r: 0.45 * s });
  }

  private rock(x: number, z: number, s: number, solid = true) {
    const g = new THREE.DodecahedronGeometry(s, 0);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) / UV_TILE, p.getY(i) / UV_TILE);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, s * 0.35, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(this.rng.next(), this.rng.next() * 6, 0)),
      new THREE.Vector3(1, 0.7, 1),
    );
    this.b.add('rock', g, m, [0.95, 0.9, 0.85]);
    if (solid) this.circles.push({ x, z, r: s * 0.85 });
  }

  private deadTree(x: number, z: number) {
    const b = this.b;
    b.cyl('trim', 0.12, 0.25, 4, 5, x, 2, z, [0.35, 0.27, 0.2]);
    b.cyl('trim', 0.06, 0.12, 2, 4, x + 0.6, 3.4, z, [0.35, 0.27, 0.2], 0, -0.8);
    b.cyl('trim', 0.05, 0.1, 1.6, 4, x - 0.5, 3.0, z + 0.2, [0.35, 0.27, 0.2], 0.3, 0.9);
    this.circles.push({ x, z, r: 0.3 });
  }

  private streetDressing() {
    const b = this.b;
    const r = this.rng;
    // lamp posts along the streets
    for (const x of [-30, -18, -6, 6, 20, 32, 44]) {
      this.b.push(x, 5.2, 0);
      this.lantern(0, 3.0, 0, true);
      this.b.pop();
    }
    for (const z of [-30, -16, 18, 30]) {
      this.b.push(5.2, z, Math.PI / 2);
      this.lantern(0, 3.0, 0, true);
      this.b.pop();
    }
    // hitching rails and troughs in front of saloon / hotel / store
    this.hitch(10, -1.6, 0);
    this.hitch(36, -2.0, 0);
    this.hitch(-16, -2.0, 0);
    this.trough(17, -2.2, 0);
    this.trough(-2.5, 8, Math.PI / 2);
    // wagons
    this.wagon(28, 3.0, 0.3, true);
    this.wagon(-22, 2.6, -1.4, false);
    this.wagon(9, 16, 0.9, true);
    // plaza (south-east quadrant): well, hay, crates, wagons
    b.cyl('stone', 1.3, 1.4, 1.0, 10, 14, 0.5, 12, [1, 1, 1]);
    b.cyl('trim', 1.05, 1.05, 0.1, 10, 14, 1.06, 12, COL.water);
    for (const sx of [-1, 1]) b.box('planksV', 0.2, 2.4, 0.2, 14 + sx * 1.1, 1.7, 12, COL.weathered);
    b.box('shingles', 3.0, 0.15, 1.8, 14, 3.0, 12, [0.9, 0.85, 0.8]);
    this.circles.push({ x: 14, z: 12, r: 1.5 });
    for (let i = 0; i < 4; i++) {
      const x = 19 + i * 1.3;
      b.box('trim', 1.2, 0.8, 0.9, x, 0.4, 13.5, COL.hay);
    }
    this.solid(18.3, 13, 24.3, 14);
    // water tower behind the hotel
    for (const sx of [-1.2, 1.2])
      for (const sz of [-1.2, 1.2]) b.box('planksV', 0.25, 6, 0.25, 44 + sx, 3, -24 + sz, COL.weathered);
    b.cyl('planksV', 2.0, 2.0, 2.8, 10, 44, 7.4, -24, COL.weathered);
    b.cyl('shingles', 0, 2.3, 1.2, 10, 44, 9.4, -24, [0.9, 0.85, 0.8]);
    this.solid(42.6, -25.4, 45.4, -22.6);
    // corral
    this.fence(30, 32, 50, 32);
    this.fence(50, 32, 50, 44);
    this.fence(30, 44, 50, 44);
    this.fence(30, 32, 30, 38);
    // stone walls
    this.stoneWall(-44, -8, -44, -20);
    this.stoneWall(-44, -20, -30, -20);
    this.stoneWall(-14, 40, 4, 40);
    this.stoneWall(56, -20, 56, -4);
    // barrels and crates near buildings and along the street
    const spots: [number, number][] = [
      [6.8, -5.0], [7.6, -4.6], [19.3, -4.8], [30.8, -5.2], [31.4, -4.4], [44.3, -4.9], [-8.2, -4.6], [-20, -4.8],
      [-31, -4.7], [-4.6, 5.8], [-4.4, 18.6], [-4.7, 27.8], [-4.6, 37.7], [-4.6, -17.5], [6, 6.5], [21, 6.5],
      [12, 19.5], [16.5, 18], [24, 9.5], [34, 9], [46, 8], [-14, 6.2], [-26, 6.6], [-36, 7], [8, -14], [20, -18],
      [-18, -18], [-30, -18.5], [26, 20], [36, 18], [52, 10], [-12, 24], [-14, 32], [2.5, 44], [-2, -44],
    ];
    for (const [x, z] of spots) {
      const n = 1 + r.int(3);
      for (let i = 0; i < n; i++) {
        const ox = x + (i % 2) * 1.0 + r.range(-0.1, 0.1);
        const oz = z + Math.floor(i / 2) * 1.0 + r.range(-0.1, 0.1);
        if (r.chance(0.5)) this.barrel(ox, oz);
        else this.crate(ox, oz);
      }
    }
  }

  private outskirts() {
    const r = this.rng;
    const near = (x: number, z: number, pad: number) =>
      this.boxes.some((bx) => x > bx.x0 - pad && x < bx.x1 + pad && z > bx.z0 - pad && z < bx.z1 + pad) ||
      this.circles.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + pad);
    const town = (x: number, z: number) => x > -46 && x < 58 && z > -34 && z < 46;
    const road = (x: number, z: number) => Math.abs(z) < 6 || Math.abs(x) < 6;
    let placed = 0;
    for (let i = 0; i < 400 && placed < 90; i++) {
      const x = r.range(-BOUND + 2, BOUND - 2);
      const z = r.range(-BOUND + 2, BOUND - 2);
      if (road(x, z) || near(x, z, 3)) continue;
      const inTown = town(x, z);
      if (inTown) continue;
      const k = r.next();
      if (k < 0.4) this.cactus(x, z, r.range(0.7, 1.3));
      else if (k < 0.8) this.rock(x, z, r.range(0.5, 1.6));
      else if (k < 0.9) this.deadTree(x, z);
      else this.rock(x, z, r.range(0.25, 0.45), false);
      placed++;
    }
    // mesa cliffs around the border
    const b = this.b;
    for (let side = 0; side < 4; side++) {
      for (let t = -BOUND - 16; t < BOUND + 16; t += r.range(5, 9)) {
        const out = BOUND + r.range(2.5, 6);
        const w = r.range(6, 11);
        const h = r.range(3, 9) + (side < 2 ? 4 : 0);
        const x = side === 0 ? t : side === 1 ? -out : side === 2 ? t : out;
        const z = side === 0 ? -out : side === 1 ? t : side === 2 ? out : t;
        const near2 = side >= 2; // sides toward the camera stay low
        const hh = near2 ? h * 0.35 : h;
        b.box('rock', side % 2 ? w * 0.8 : w, hh, side % 2 ? w : w * 0.8, x, hh / 2, z, [1, 0.92, 0.85]);
        b.box('rock', w * 0.6, hh * 0.4, w * 0.6, x + r.range(-1, 1), hh + hh * 0.2, z + r.range(-1, 1), [1.05, 0.95, 0.85]);
      }
    }
  }

  private finish() {
    const mats: Record<Key, THREE.Material> = {
      planksH: ps1(new THREE.MeshLambertMaterial({ map: T.planksH, vertexColors: true }), { cut: true }),
      planksV: ps1(new THREE.MeshLambertMaterial({ map: T.planksV, vertexColors: true }), { cut: true }),
      shingles: ps1(new THREE.MeshLambertMaterial({ map: T.shingles, vertexColors: true }), { cut: true }),
      stone: ps1(new THREE.MeshLambertMaterial({ map: T.stone, vertexColors: true }), { cut: true }),
      rock: ps1(new THREE.MeshLambertMaterial({ map: T.rock, vertexColors: true }), { cut: true }),
      cactus: ps1(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { cut: true }),
      trim: ps1(new THREE.MeshLambertMaterial({ vertexColors: true }), { cut: true }),
      glow: (this.glowMat = ps1(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 0.6, 0.25) }), { cut: true })),
      lamp: (this.lampMat = ps1(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(4, 2.2, 0.8) }), { cut: true })),
    };
    for (const [key, geos] of this.b.parts) {
      const merged = mergeGeometries(geos, false)!;
      const mesh = new THREE.Mesh(merged, mats[key]);
      const lit = key !== 'glow' && key !== 'lamp';
      mesh.castShadow = lit;
      mesh.receiveShadow = lit;
      this.group.add(mesh);
    }

    // breakables: instanced barrels and crates
    const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.0, 8);
    barrelGeo.translate(0, 0.5, 0);
    const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    crateGeo.translate(0, 0.45, 0);
    const bm = ps1(new THREE.MeshLambertMaterial({ map: T.planksV, color: new THREE.Color(0.9, 0.75, 0.6) }), { cut: true });
    const cm = ps1(new THREE.MeshLambertMaterial({ map: T.planksV, color: new THREE.Color(1.05, 0.95, 0.8) }), { cut: true });
    const barrels = this.breakables.filter((x) => x.kind === 0);
    const crates = this.breakables.filter((x) => x.kind === 1);
    this.barrelMesh = new THREE.InstancedMesh(barrelGeo, bm, barrels.length);
    this.crateMesh = new THREE.InstancedMesh(crateGeo, cm, crates.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    barrels.forEach((br) => this.breakMats.push(m.compose(new THREE.Vector3(br.x, 0, br.z), q, one).clone()));
    crates.forEach((cr) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rng.range(-0.4, 0.4));
      this.breakMats.push(m.compose(new THREE.Vector3(cr.x, 0, cr.z), q, one).clone());
    });
    for (const im of [this.barrelMesh, this.crateMesh]) {
      im.castShadow = im.receiveShadow = true;
      this.group.add(im);
    }
    // keep instance indices aligned with breakables order per kind
    this.breakables = [...barrels, ...crates];
    this.resetBreakables();
  }

  resetBreakables() {
    this.breakables.forEach((br, i) => {
      br.alive = true;
      const { mesh, idx } = this.breakIndex(i);
      mesh.setMatrixAt(idx, this.breakMats[i]);
    });
    this.barrelMesh.instanceMatrix.needsUpdate = true;
    this.crateMesh.instanceMatrix.needsUpdate = true;
  }

  // Index into the per-kind instanced mesh.
  breakIndex(i: number) {
    const nb = this.barrelMesh.count;
    return i < nb ? { mesh: this.barrelMesh, idx: i } : { mesh: this.crateMesh, idx: i - nb };
  }

  smash(i: number) {
    const br = this.breakables[i];
    br.alive = false;
    const { mesh, idx } = this.breakIndex(i);
    mesh.setMatrixAt(idx, new THREE.Matrix4().makeScale(0, 0, 0));
    mesh.instanceMatrix.needsUpdate = true;
  }
}
