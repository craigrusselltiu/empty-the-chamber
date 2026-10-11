import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../rng';
import { T, signTexture, wantedTexture } from '../render/textures';
import { ps1, hide } from '../render/ps1';
import { PITCH } from '../render/pipeline';

// Stage 1, The Dusty Trail: an endless desert of trail towns, generated from the run's seed.
// See Town (the streamer) and Chunk (one generated cell) below.

const ROAD = 4.5; // street half-width
const SET = ROAD + 5.5; // street centre to building front (room for porches, rails and troughs)

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

type Wall = 'siding' | 'grey' | 'paint' | 'barn' | 'stone';
type Key = Wall | 'boards' | 'post' | 'trim' | 'iron' | 'shingles' | 'tin' | 'rock' | 'hay' | 'water' | 'glow' | 'lamp' | 'cactus' | 'plant';

const UV_TILE = 1.6; // world units per texture repeat (32 px textures -> 20 texels per unit)

const COL = {
  wood: [1, 1, 1],
  trim: [0.75, 0.75, 0.75],
  weathered: [0.82, 0.8, 0.78],
  green: [0.35, 0.5, 0.28],
} as const;
type Rgb = readonly [number, number, number];

// Unit shapes for the fast plant path, as flat triangle lists.
const ICO = new THREE.IcosahedronGeometry(1, 0).attributes.position.array as Float32Array; // already non-indexed
const CUBE = new THREE.BoxGeometry(1, 1, 1).toNonIndexed().attributes.position.array as Float32Array;

class Builder {
  parts = new Map<Key, THREE.BufferGeometry[]>();
  m = new THREE.Matrix4();
  stack: THREE.Matrix4[] = [];
  // plants: thousands of tiny pieces, written straight into one vertex list (world space)
  plantPos: number[] = [];
  plantCol: number[] = [];
  bid = 0; // building id stamped on everything added (0: not part of a building)

  plantTri(a: number[], b: number[], c: number[], col: Rgb) {
    this.plantPos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) this.plantCol.push(col[0], col[1], col[2]);
  }
  plantShape(shape: Float32Array, m: THREE.Matrix4, col: Rgb) {
    const e = m.elements;
    for (let i = 0; i < shape.length; i += 3) {
      const x = shape[i];
      const y = shape[i + 1];
      const z = shape[i + 2];
      this.plantPos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      this.plantCol.push(col[0], col[1], col[2]);
    }
  }

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
    g.setAttribute('aBld', new THREE.BufferAttribute(new Float32Array(n).fill(this.bid), 1));
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

  // Hollow cylinder (outer wall, rim, inner wall), flat shaded, bottom at y.
  tube(key: Key, rOut: number, rIn: number, h: number, seg: number, x: number, y: number, z: number, color: Rgb) {
    const prof = [new THREE.Vector2(rOut, 0), new THREE.Vector2(rOut, h), new THREE.Vector2(rIn, h), new THREE.Vector2(rIn, 0)];
    const g = new THREE.LatheGeometry(prof, seg).toNonIndexed();
    g.computeVertexNormals();
    const pos = g.attributes.position;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      uv.setXY(i, (uv.getX(i) * Math.PI * 2 * rOut) / UV_TILE, (pos.getY(i) + rOut - r) / UV_TILE);
    }
    this.add(key, g, new THREE.Matrix4().makeTranslation(x, y, z), color);
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

interface BuildingType {
  sign: string;
  w: number;
  d: number;
  floors: 1 | 2;
  wall?: Wall;
  roof?: 'gable' | 'flat';
  porch?: boolean;
  wanted?: boolean;
  steeple?: boolean;
}
interface BuildingSpec extends BuildingType {
  x: number; // front-centre
  z: number;
  rot: number; // local +z (the facade) faces (sin rot, cos rot)
}

const TYPES: BuildingType[] = [
  { sign: 'SALOON', w: 12, d: 11, floors: 2, porch: true, roof: 'gable' },
  { sign: 'BANK', w: 9, d: 9, floors: 1, wall: 'stone', roof: 'flat' },
  { sign: 'HOTEL', w: 11, d: 10, floors: 2, porch: true, wall: 'barn', roof: 'gable' },
  { sign: 'LIVERY', w: 11, d: 12, floors: 1, wall: 'barn', roof: 'gable' },
  { sign: 'GENERAL STORE', w: 11, d: 10, floors: 1, porch: true, wall: 'paint', roof: 'gable' },
  { sign: 'ASSAY OFFICE', w: 9, d: 8, floors: 1, porch: true, wall: 'grey', roof: 'flat' },
  { sign: 'UNDERTAKER', w: 9, d: 9, floors: 1, wall: 'grey', roof: 'gable' },
  { sign: "SHERIFF'S OFFICE", w: 11, d: 10, floors: 1, porch: true, wanted: true, roof: 'gable' },
  { sign: 'JAIL', w: 8, d: 8, floors: 1, wall: 'stone', roof: 'flat' },
  { sign: 'TELEGRAPH', w: 8, d: 8, floors: 1, porch: true, wall: 'paint', roof: 'gable' },
  { sign: 'CHAPEL', w: 9, d: 12, floors: 1, wall: 'paint', roof: 'gable', steeple: true },
  { sign: 'BLACKSMITH', w: 10, d: 8, floors: 1, wall: 'grey', roof: 'gable' },
  { sign: 'BARBER', w: 8, d: 8, floors: 1, wall: 'barn', roof: 'flat' },
];
const OUTPOSTS: BuildingType[] = [
  { sign: 'TRADING POST', w: 10, d: 9, floors: 1, porch: true, wall: 'grey', roof: 'gable' },
  { sign: 'WAY STATION', w: 9, d: 8, floors: 1, porch: true, roof: 'flat' },
  { sign: 'CANTINA', w: 9, d: 9, floors: 1, wall: 'stone', roof: 'flat' },
  { sign: 'STABLES', w: 11, d: 10, floors: 1, wall: 'barn', roof: 'gable' },
];

// The world is endless: a grid of CHUNK-sized cells, each built on demand from (seed, k, j).
// Every cell has a junction near its centre; curved roads join neighbouring junctions.
// Junctions on two or more roads usually grow a town, lone roads an outpost, the rest is desert.
// Everything a cell places stays inside the cell, so cells never overlap each other.
export const CHUNK = 128;
const HALF = CHUNK / 2;
const JIT = 14; // junction jitter
const BULGE = 18; // road curve control offset
const SAMPLES = 64; // points per road
const TOWN_R = 54; // how far from the junction a town reaches
const CAM_X = Math.SQRT1_2; // ground direction toward the camera
const CAM_Z = Math.SQRT1_2;
const BUCKET = 16; // collider grid cell

export interface Box {
  x0: number; // bounds
  z0: number;
  x1: number;
  z1: number;
  cx: number; // oriented box: centre, half extents, rotation
  cz: number;
  hx: number;
  hz: number;
  c: number;
  s: number;
}
export interface Circle {
  x: number;
  z: number;
  r: number;
}
export interface Breakable {
  x: number;
  z: number;
  r: number;
  kind: 0 | 1; // barrel, crate
  alive: boolean;
  mesh: THREE.InstancedMesh;
  idx: number;
  m: THREE.Matrix4;
}
interface Occluder {
  id: number;
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  c: number;
  s: number;
  top: number;
}
interface Bucket {
  boxes: Box[];
  circles: Circle[];
  breaks: Breakable[];
}

// Where plants grow: a smooth 0..1 field over the world. The ground shader uses the same formula
// (VEG_GLSL) to green and darken the sand where it is high, so plants and ground patches line up.
export function veg(x: number, z: number, ph: number) {
  return (
    0.5 +
    0.22 * Math.sin(x * 0.045 + 1.7 * Math.sin(z * 0.032 + ph)) +
    0.2 * Math.sin(z * 0.05 + 1.4 * Math.sin(x * 0.037 - ph)) +
    0.08 * Math.sin((x + z) * 0.17 + ph * 3.0)
  );
}
const VEG_GLSL = `
float veg(vec2 p, float ph) {
  return 0.5
    + 0.22 * sin(p.x * 0.045 + 1.7 * sin(p.y * 0.032 + ph))
    + 0.2 * sin(p.y * 0.05 + 1.4 * sin(p.x * 0.037 - ph))
    + 0.08 * sin((p.x + p.y) * 0.17 + ph * 3.0);
}`;

function hash(seed: number, a: number, b: number, c: number) {
  let x = (seed ^ Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c, 0x5bd1e995)) | 0;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// A road between two junctions: SAMPLES + 1 points along a cubic curve, with arc length.
class Road {
  x = new Float32Array(SAMPLES + 1);
  z = new Float32Array(SAMPLES + 1);
  len = new Float32Array(SAMPLES + 1);
  constructor(ax: number, az: number, bx: number, bz: number, o1: number, o2: number, public y: number) {
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz);
    const px = -dz / l;
    const pz = dx / l;
    const c1x = ax + dx / 3 + px * o1;
    const c1z = az + dz / 3 + pz * o1;
    const c2x = ax + (2 * dx) / 3 + px * o2;
    const c2z = az + (2 * dz) / 3 + pz * o2;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const u = 1 - t;
      this.x[i] = u * u * u * ax + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * bx;
      this.z[i] = u * u * u * az + 3 * u * u * t * c1z + 3 * u * t * t * c2z + t * t * t * bz;
      if (i) this.len[i] = this.len[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    }
  }
  get total() {
    return this.len[SAMPLES];
  }
  // Point and unit tangent at arc length s (from the start, or from the end walking back).
  at(s: number, fromEnd: boolean, out: { x: number; z: number; tx: number; tz: number }) {
    const L = this.total;
    s = Math.max(0, Math.min(L, fromEnd ? L - s : s));
    let i = 0;
    while (i < SAMPLES - 1 && this.len[i + 1] < s) i++;
    const k = (s - this.len[i]) / (this.len[i + 1] - this.len[i] || 1);
    const tx = this.x[i + 1] - this.x[i];
    const tz = this.z[i + 1] - this.z[i];
    const tl = Math.hypot(tx, tz) || 1;
    out.x = this.x[i] + tx * k;
    out.z = this.z[i] + tz * k;
    out.tx = ((fromEnd ? -tx : tx) / tl);
    out.tz = ((fromEnd ? -tz : tz) / tl);
    return out;
  }
  dist(x: number, z: number) {
    let best = Infinity;
    for (let i = 0; i < SAMPLES; i++) {
      const ax = this.x[i];
      const az = this.z[i];
      const bx = this.x[i + 1] - ax;
      const bz = this.z[i + 1] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1)));
      const d = (x - ax - bx * t) ** 2 + (z - az - bz * t) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }
}

// Shared materials and geometry for every chunk.
class Kit {
  mats: Record<Key, THREE.Material>;
  glowMat: THREE.MeshBasicMaterial;
  lampMat: THREE.MeshBasicMaterial;
  roadMat = new THREE.MeshLambertMaterial({ map: T.road });
  plazaMat = new THREE.MeshLambertMaterial({ map: T.plaza });
  barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.0, 8).translate(0, 0.5, 0);
  crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9).translate(0, 0.45, 0);
  barrelMat = ps1(new THREE.MeshLambertMaterial({ map: T.barrel }), { cut: true });
  crateMat = ps1(new THREE.MeshLambertMaterial({ map: T.crate }), { cut: true });
  constructor() {
    this.glowMat = ps1(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 0.6, 0.25) }), { cut: true });
    this.lampMat = ps1(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(4, 2.2, 0.8) }), { cut: true });
    const lit = (map: THREE.Texture, extra: THREE.MeshLambertMaterialParameters = {}) =>
      ps1(new THREE.MeshLambertMaterial({ map, vertexColors: true, ...extra }), { cut: true });
    this.mats = {
      siding: lit(T.siding),
      grey: lit(T.grey),
      paint: lit(T.paint),
      barn: lit(T.barn),
      stone: lit(T.stone),
      boards: lit(T.boards),
      post: lit(T.post),
      trim: lit(T.trim),
      iron: lit(T.iron),
      shingles: lit(T.shingles),
      tin: lit(T.tin),
      rock: lit(T.rock),
      hay: lit(T.hay),
      water: lit(T.water),
      cactus: lit(T.ribs, { flatShading: true }),
      plant: lit(T.speckle, { flatShading: true, side: THREE.DoubleSide }),
      glow: this.glowMat,
      lamp: this.lampMat,
    };
  }
}

const pt = { x: 0, z: 0, tx: 0, tz: 0 };

class Chunk {
  group = new THREE.Group();
  boxes: Box[] = [];
  circles: Circle[] = [];
  lanterns: THREE.Vector3[] = [];
  breakables: Breakable[] = [];
  bldgs: Occluder[] = [];
  private noPlants: { x0: number; z0: number; x1: number; z1: number }[] = []; // thin things plants must not grow through
  private b = new Builder();
  private rng: Rng;
  private x0: number;
  private z0: number;
  private roads: Road[] = [];
  private owned: THREE.Texture[] = [];
  private ownedMats: THREE.Material[] = [];
  private nodeX: number;
  private nodeZ: number;

  constructor(private town: Town, private kit: Kit, public k: number, public j: number) {
    this.rng = new Rng(Math.floor(hash(town.seed, k, j, 9) * 2 ** 31));
    this.x0 = k * CHUNK - HALF;
    this.z0 = j * CHUNK - HALF;
    [this.nodeX, this.nodeZ] = town.node(k, j);
  }

  // Generation in steps of a few milliseconds each; the streamer runs one step per frame.
  *build() {
    const { town, k, j } = this;
    // incident roads, each walked away from this junction
    const legs: { road: Road; fromEnd: boolean }[] = [];
    const add = (road: Road | null, fromEnd: boolean) => {
      if (!road) return;
      this.roads.push(road);
      legs.push({ road, fromEnd });
    };
    add(town.road(k, j, 'h'), false);
    add(town.road(k - 1, j, 'h'), true);
    add(town.road(k, j, 'v'), false);
    add(town.road(k, j - 1, 'v'), true);
    this.ribbons();
    const r = this.rng;
    const isTown = legs.length >= 2 && ((k === 0 && j === 0) || r.next() < 0.65);
    if (isTown) yield* this.townAround(legs);
    else if (legs.length) this.outpost(legs);
    yield;
    this.desert(isTown ? TOWN_R + 4 : legs.length ? 30 : 0);
    yield;
    yield* this.plants(isTown ? TOWN_R : legs.length ? 26 : 0, town.phase);
    yield* this.finish();
  }

  // ---- placement checks ----------------------------------------------------

  private inCell(x0: number, z0: number, x1: number, z1: number) {
    return x0 > this.x0 + 3 && x1 < this.x0 + CHUNK - 3 && z0 > this.z0 + 3 && z1 < this.z0 + CHUNK - 3;
  }
  private roadDist(x: number, z: number) {
    let d = Infinity;
    for (const rd of this.roads) d = Math.min(d, rd.dist(x, z));
    return d;
  }
  // True when a rect (plus padding) is inside the cell, off the roads and clear of everything solid so far.
  private fits(x0: number, z0: number, x1: number, z1: number, pad: number, roadPad = 0.5) {
    if (!this.inCell(x0, z0, x1, z1)) return false;
    for (const b of this.boxes) if (x0 - pad < b.x1 && x1 + pad > b.x0 && z0 - pad < b.z1 && z1 + pad > b.z0) return false;
    // building and mesa footprints, porches included
    const r: Occluder = { id: 0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, c: 1, s: 0, top: 0 };
    for (const o of this.bldgs) if (obbOverlap(r, o, pad)) return false;
    for (const c of [...this.circles, ...this.breakables]) if (x0 - pad < c.x + c.r && x1 + pad > c.x - c.r && z0 - pad < c.z + c.r && z1 + pad > c.z - c.r) return false;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const rr = Math.hypot(x1 - x0, z1 - z0) / 2;
    return this.roadDist(cx, cz) > ROAD + roadPad + rr;
  }
  private free(x: number, z: number, r: number, roadPad = 0.5) {
    return this.fits(x - r, z - r, x + r, z + r, 0.6, roadPad);
  }

  // ---- roads ---------------------------------------------------------------

  // Road ribbons: each segment belongs to the cell its midpoint is in, so neighbours join seamlessly.
  private ribbons() {
    for (const rd of this.roads) {
      const pos: number[] = [];
      const uv: number[] = [];
      const side = (i: number) => {
        const a = Math.max(0, i - 1);
        const b = Math.min(SAMPLES, i + 1);
        const tx = rd.x[b] - rd.x[a];
        const tz = rd.z[b] - rd.z[a];
        const l = Math.hypot(tx, tz) || 1;
        return [-tz / l, tx / l];
      };
      for (let i = 0; i < SAMPLES; i++) {
        const mx = (rd.x[i] + rd.x[i + 1]) / 2;
        const mz = (rd.z[i] + rd.z[i + 1]) / 2;
        if (mx < this.x0 || mx >= this.x0 + CHUNK || mz < this.z0 || mz >= this.z0 + CHUNK) continue;
        const [ax, az] = side(i);
        const [bx, bz] = side(i + 1);
        const p = (n: number, nx: number, nz: number, s: number) => [rd.x[n] + nx * ROAD * s, rd.y, rd.z[n] + nz * ROAD * s];
        const a0 = p(i, ax, az, -1);
        const a1 = p(i, ax, az, 1);
        const b0 = p(i + 1, bx, bz, -1);
        const b1 = p(i + 1, bx, bz, 1);
        pos.push(...a0, ...a1, ...b0, ...a1, ...b1, ...b0);
        const u = 1; // the road texture spans the road's width once and 32 units of its length
        const va = rd.len[i] / 32;
        const vb = rd.len[i + 1] / 32;
        uv.push(0, va, u, va, 0, vb, u, va, u, vb, 0, vb);
      }
      if (!pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      this.ground(g);
    }
    // a packed-earth square where roads meet
    if (this.roads.length >= 2) {
      const g = new THREE.CircleGeometry(ROAD + 1.5, 16).rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 3.2, p.getZ(i) / 3.2);
      g.translate(this.nodeX, 0.1, this.nodeZ);
      this.ground(g, this.kit.plazaMat);
    }
  }
  // Ground layers skip vertex snapping (it would make them z-fight) and sit at distinct heights.
  private ground(g: THREE.BufferGeometry, mat: THREE.Material = this.kit.roadMat) {
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  // ---- layout --------------------------------------------------------------

  // Try to put a building with its facade on the road at arc length s of a leg.
  private tryBuilding(t: BuildingType, leg: { road: Road; fromEnd: boolean }, s: number, otherSide: boolean) {
    const r = this.rng;
    leg.road.at(s, leg.fromEnd, pt);
    let nx = -pt.tz;
    let nz = pt.tx;
    // the side whose facades face the camera, unless asked for the other one
    if ((nx * CAM_X + nz * CAM_Z > 0) !== otherSide) (nx = -nx), (nz = -nz);
    const x = pt.x + nx * SET;
    const z = pt.z + nz * SET;
    const rot = Math.atan2(-nx, -nz) + r.range(-0.14, 0.14);
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    const front = t.porch ? 3 : 0.6;
    // footprint corners in world space
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const lx of [-t.w / 2, t.w / 2])
      for (const lz of [-t.d, front]) {
        const wx = x + lx * c + lz * sn;
        const wz = z - lx * sn + lz * c;
        x0 = Math.min(x0, wx);
        x1 = Math.max(x1, wx);
        z0 = Math.min(z0, wz);
        z1 = Math.max(z1, wz);
        if (this.roadDist(wx, wz) < ROAD + 1) return null;
      }
    if (!this.inCell(x0, z0, x1, z1)) return null;
    // the whole footprint (porch included) against every other building and mesa, 1.5 apart
    const fp: Occluder = { id: 0, cx: 0, cz: 0, hx: t.w / 2 + 0.5, hz: (front + t.d + 0.5) / 2, c, s: sn, top: 0 };
    const lz = (front - t.d - 0.5) / 2; // footprint centre, in the building's frame
    fp.cx = x + lz * sn;
    fp.cz = z + lz * c;
    for (const o of this.bldgs) if (obbOverlap(fp, o, 1.5)) return null;
    for (const br of this.breakables) if (inBox(fp as unknown as Box, br.x, br.z, br.r + 0.5)) return null;
    for (const b of this.boxes) if (x0 - 1.5 < b.x1 && x1 + 1.5 > b.x0 && z0 - 1.5 < b.z1 && z1 + 1.5 > b.z0) return null;
    for (const cc of this.circles) if (Math.hypot(cc.x - (x0 + x1) / 2, cc.z - (z0 + z1) / 2) < cc.r + Math.hypot(x1 - x0, z1 - z0) / 2) return null;
    const spec: BuildingSpec = { ...t, x, z, rot };
    this.building(spec);
    this.frontDressing(spec);
    return spec;
  }

  private *townAround(legs: { road: Road; fromEnd: boolean }[]) {
    const r = this.rng;
    const types = TYPES.slice();
    for (let i = types.length - 1; i > 0; i--) {
      const q = r.int(i + 1);
      [types[i], types[q]] = [types[q], types[i]];
    }
    types.unshift(...types.splice(types.findIndex((t) => t.sign === 'SALOON'), 1));
    // walk out along each road, filling the camera side first, then a few on the far side
    for (const otherSide of [false, true]) {
      for (const leg of legs) {
        let s = ROAD + 5 + r.range(0, 4);
        while (types.length && s < TOWN_R) {
          const t = types[0];
          if (otherSide && r.chance(0.5)) {
            s += t.w + 4;
            continue;
          }
          if (this.tryBuilding(t, leg, s + t.w / 2, otherSide)) {
            types.shift();
            s += t.w + r.range(3, 7);
            yield;
          } else s += 3;
        }
      }
    }
    this.lampPosts(legs, TOWN_R + 6);
    yield;
    this.townProps();
  }

  private outpost(legs: { road: Road; fromEnd: boolean }[]) {
    const r = this.rng;
    const types = OUTPOSTS.slice();
    let n = 1 + r.int(2);
    for (let k = 0; k < 20 && n > 0; k++) {
      const leg = legs[r.int(legs.length)];
      const t = types[r.int(types.length)];
      if (this.tryBuilding(t, leg, r.range(8, 34), r.chance(0.25))) n--;
    }
    this.lampPosts(legs, 26);
    for (let n2 = 0, k = 0; n2 < 1 && k < 30; k++) {
      const x = this.nodeX + r.range(-26, 26);
      const z = this.nodeZ + r.range(-26, 26);
      if (!this.free(x, z, 2.5, 2)) continue;
      this.wagon(x, z, r.range(-3, 3), r.chance(0.6));
      n2++;
    }
  }

  // Lamp posts on the camera side of every road near the junction.
  private lampPosts(legs: { road: Road; fromEnd: boolean }[], reach: number) {
    const r = this.rng;
    const b = this.b;
    for (const leg of legs) {
      for (let s = 6 + r.range(0, 4); s < reach; s += r.range(11, 15)) {
        leg.road.at(s, leg.fromEnd, pt);
        let nx = -pt.tz;
        let nz = pt.tx;
        if (nx * CAM_X + nz * CAM_Z < 0) (nx = -nx), (nz = -nz);
        const x = pt.x + nx * (ROAD + 0.7);
        const z = pt.z + nz * (ROAD + 0.7);
        // the post and its arm, clear of anything solid (but allowed beside the road)
        if (!this.fits(x - 1, z - 1, x + 1, z + 1, 0.2, -2.5)) continue;
        b.push(x, z, Math.atan2(nx, nz) + Math.PI / 2);
        this.lantern(0, 3.0, 0, true);
        b.pop();
      }
    }
  }

  // Hitching rails, troughs, barrels and crates in front of a building.
  private frontDressing(f: BuildingSpec) {
    const b = this.b;
    const r = this.rng;
    const off = f.porch ? 4.2 : 1.8;
    b.push(f.x, f.z, f.rot);
    const k = r.next();
    if (k < 0.35) this.hitch(-f.w / 4, off, 0);
    else if (k < 0.6) this.trough(f.w / 4, off, 0);
    b.pop();
    const m = new THREE.Matrix4().makeRotationY(f.rot).setPosition(f.x, 0, f.z);
    const v = new THREE.Vector3();
    for (const side of [-1, 1]) {
      if (r.chance(0.35)) continue;
      const n = 1 + r.int(3);
      for (let i = 0; i < n; i++) {
        v.set(side * (f.w / 2 + 1.2 + (i % 2) * 1.1), 0, 0.6 - Math.floor(i / 2) * 1.1).applyMatrix4(m);
        if (!this.inCell(v.x - 1, v.z - 1, v.x + 1, v.z + 1)) continue;
        if (r.chance(0.5)) this.barrel(v.x, v.z);
        else this.crate(v.x, v.z);
      }
    }
  }

  // The well, wagons, a water tower, a corral, stone walls and loose clutter around a town.
  private townProps() {
    const b = this.b;
    const r = this.rng;
    const around = (reach: number) => [this.nodeX + r.range(-reach, reach), this.nodeZ + r.range(-reach, reach)];
    for (let k = 0; k < 60; k++) {
      const [fx, fz] = around(34);
      const x = Math.round(fx);
      const z = Math.round(fz);
      if (!this.fits(x - 2, z - 2, x + 9, z + 2.5, 1.5, 1.5)) continue;
      b.tube('stone', 1.35, 1.0, 1.0, 10, x, 0, z, [1, 1, 1]);
      b.cyl('water', 1.0, 1.0, 0.04, 10, x, 0.45, z, [0.7, 0.7, 0.7]);
      for (const sx of [-1, 1]) b.box('post', 0.2, 2.47, 0.2, x + sx * 1.1, 1.735, z, COL.wood);
      b.box('shingles', 3.0, 0.15, 1.8, x, 3.0, z, [0.9, 0.85, 0.8]);
      this.circles.push({ x, z, r: 1.5 });
      for (let i = 0; i < 4; i++) b.box('hay', 1.2, 0.8, 0.9, x + 4.6 + i * 1.3, 0.4, z + 1.5, COL.wood);
      this.solid(x + 3.9, z + 1, x + 9.9, z + 2);
      break;
    }
    for (let n = 0, k = 0; n < 3 && k < 60; k++) {
      const [x, z] = around(TOWN_R);
      if (!this.free(x, z, 2.5, 1.5)) continue;
      this.wagon(x, z, r.range(-3, 3), r.chance(0.6));
      n++;
    }
    for (let k = 0; k < 40; k++) {
      const [x, z] = around(TOWN_R);
      if (!this.free(x, z, 2.5, 6)) continue;
      for (const sx of [-1.2, 1.2])
        for (const sz of [-1.2, 1.2]) b.box('post', 0.25, 6, 0.25, x + sx, 3, z + sz, COL.weathered);
      b.cyl('boards', 2.0, 2.0, 2.8, 10, x, 7.4, z, COL.weathered);
      b.cyl('shingles', 0, 2.3, 1.2, 10, x, 9.4, z, [0.9, 0.85, 0.8]);
      this.circles.push({ x, z, r: 1.7 });
      break;
    }
    for (let k = 0; k < 40; k++) {
      const w = r.range(14, 20);
      const d = r.range(9, 12);
      const [x, z] = around(TOWN_R - 10);
      const rot = r.range(-0.5, 0.5);
      // fit test on the rotated pen's bounds
      const ex = (Math.abs(Math.cos(rot)) * w + Math.abs(Math.sin(rot)) * d) / 2;
      const ez = (Math.abs(Math.sin(rot)) * w + Math.abs(Math.cos(rot)) * d) / 2;
      if (!this.fits(x - ex, z - ez, x + ex, z + ez, 2, 1.5)) continue;
      b.push(x, z, rot);
      // corners are shared: each corner post is built once
      this.fence(-w / 2, -d / 2, w / 2, -d / 2);
      this.fence(w / 2, -d / 2, w / 2, d / 2, true);
      this.fence(-w / 2, d / 2, w / 2, d / 2, false, true);
      this.fence(-w / 2, -d / 2, -w / 2, 0, true);
      b.pop();
      break;
    }
    for (let n = 0, k = 0; n < 14 && k < 120; k++) {
      const [x, z] = around(TOWN_R);
      if (!this.free(x, z, 1.4, 1.5)) continue;
      const c = 1 + r.int(3);
      for (let i = 0; i < c; i++) {
        const ox = x + (i % 2) * 1.1 + r.range(-0.04, 0.04);
        const oz = z + Math.floor(i / 2) * 1.1 + r.range(-0.04, 0.04);
        if (r.chance(0.5)) this.barrel(ox, oz);
        else this.crate(ox, oz);
      }
      n++;
    }
  }

  // Cacti, rocks, dead trees, the odd stone wall and mesas, away from roads and the settlement.
  private desert(keepOut: number) {
    const r = this.rng;
    const away = (x: number, z: number) => keepOut === 0 || Math.hypot(x - this.nodeX, z - this.nodeZ) > keepOut;
    const b = this.b;
    const mesas = 1 + r.int(3);
    for (let n = 0, k = 0; n < mesas && k < 30; k++) {
      const x = this.x0 + r.range(12, CHUNK - 12);
      const z = this.z0 + r.range(12, CHUNK - 12);
      const w = r.range(7, 13);
      if (!away(x, z) || !this.fits(x - w, z - w, x + w, z + w, 3, 6)) continue;
      // a mesa: an eroded talus, steep banded walls and a flat cap, each tier irregular and turned
      const rot = r.range(0, Math.PI);
      const h = r.range(4, 9);
      const ex = r.range(0.75, 1.0); // a little elongated
      b.push(x, z, rot);
      b.bid = this.town.nextId++; // dissolves like a building when it hides the player
      const R = w * 0.55;
      const tiers: [number, number, number, number, Rgb][] = [
        // bottom radius, top radius, base height, tier height, colour
        [1.18, 0.95, 0, 0.22, [0.98, 0.86, 0.74]],
        [0.95, 0.84, 0.2, 0.5, [1.04, 0.9, 0.8]],
        [0.84, 0.78, 0.68, 0.32, [0.92, 0.8, 0.72]],
      ];
      for (const [rb, rt, y0, th, c] of tiers) this.crag(R * rb, R * rt, y0 * h, th * h + 0.06, ex, r.range(-0.25, 0.25), c);
      if (r.chance(0.5)) {
        // a lower butte leaning on one side
        const bx = R * r.range(0.7, 1.0) * (r.chance(0.5) ? 1 : -1);
        b.push(bx, r.range(-1.5, 1.5), r.range(0, Math.PI));
        this.crag(R * 0.55, R * 0.4, 0, h * r.range(0.35, 0.55), 1, 0, [0.96, 0.84, 0.74]);
        this.solid(-R * 0.45, -R * 0.45, R * 0.45, R * 0.45);
        b.pop();
      }
      this.solid(-R * 1.1, -R * 1.1 * ex, R * 1.1, R * 1.1 * ex);
      this.occluder(-R * 2.1, -R * 1.25 - 1.5, R * 2.1, R * 1.25 + 1.5, h * 1.08);
      b.bid = 0;
      b.pop();
      n++;
    }
    const walls = r.int(3);
    for (let n = 0, k = 0; n < walls && k < 30; k++) {
      const x = this.x0 + r.range(10, CHUNK - 10);
      const z = this.z0 + r.range(10, CHUNK - 10);
      const len = r.range(8, 16);
      const a = r.range(0, Math.PI);
      const x1 = x + Math.cos(a) * len;
      const z1 = z + Math.sin(a) * len;
      if (!away(x, z) || !this.fits(Math.min(x, x1) - 0.5, Math.min(z, z1) - 0.5, Math.max(x, x1) + 0.5, Math.max(z, z1) + 0.5, 3, 2)) continue;
      this.stoneWall(x, z, x1, z1);
      n++;
    }
    let placed = 0;
    for (let i = 0; i < 260 && placed < 70; i++) {
      const x = this.x0 + r.range(3, CHUNK - 3);
      const z = this.z0 + r.range(3, CHUNK - 3);
      if (!away(x, z) || !this.free(x, z, 1.6, 2)) continue;
      const k = r.next();
      if (k < 0.4) this.cactus(x, z, r.range(0.7, 1.3));
      else if (k < 0.8) this.rock(x, z, r.range(0.5, 1.6));
      else if (k < 0.9) this.deadTree(x, z);
      else this.rock(x, z, r.range(0.25, 0.45), false);
      placed++;
    }
  }

  private spin(key: Key, g: THREE.BufferGeometry, x: number, y: number, z: number, ry: number, c: Rgb) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i)) / UV_TILE, pos.getY(i) / UV_TILE);
    this.b.add(key, g, new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z), c);
  }

  // Something that can hide the player (a local rect up to `top`), under the builder's current id.
  private occluder(lx0: number, lz0: number, lx1: number, lz1: number, top: number) {
    const e = this.b.m.elements;
    const p = new THREE.Vector3((lx0 + lx1) / 2, 0, (lz0 + lz1) / 2).applyMatrix4(this.b.m);
    this.bldgs.push({ id: this.b.bid, cx: p.x, cz: p.z, hx: (lx1 - lx0) / 2, hz: (lz1 - lz0) / 2, c: e[0], s: e[8], top });
  }

  // A solid rect in the builder's local frame, stored as an oriented box.
  private solid(lx0: number, lz0: number, lx1: number, lz1: number) {
    const e = this.b.m.elements;
    const c = e[0];
    const s = e[8];
    const p = new THREE.Vector3((lx0 + lx1) / 2, 0, (lz0 + lz1) / 2).applyMatrix4(this.b.m);
    const hx = Math.abs(lx1 - lx0) / 2;
    const hz = Math.abs(lz1 - lz0) / 2;
    const ex = Math.abs(c) * hx + Math.abs(s) * hz;
    const ez = Math.abs(s) * hx + Math.abs(c) * hz;
    this.boxes.push({ x0: p.x - ex, z0: p.z - ez, x1: p.x + ex, z1: p.z + ez, cx: p.x, cz: p.z, hx, hz, c, s });
  }

  // A lantern, hung from a lamp post's arm (post), from a roof or beam above (hangTo, a height),
  // or from a bracket on the wall behind it (wallZ). Every part touches the next and no faces are flush.
  private lantern(lx: number, ly: number, lz: number, post = false, hangTo = 0, wallZ?: number) {
    const b = this.b;
    const iron: Rgb = COL.wood;
    if (post) {
      const top = ly + 0.75;
      b.box('stone', 0.38, 0.3, 0.38, lx, 0.15, lz, [0.8, 0.78, 0.75]); // footing
      this.spin('iron', new THREE.CylinderGeometry(0.065, 0.1, top - 0.3, 6), lx, 0.3 + (top - 0.3) / 2, lz, 0, iron); // tapered shaft
      b.box('iron', 0.17, 0.07, 0.17, lx, top + 0.035, lz, iron); // cap
      b.box('iron', 0.7, 0.07, 0.07, lx + 0.3, top - 0.06, lz, iron); // arm, just under the cap
      // a diagonal brace from the shaft up to the arm
      const bx0 = lx + 0.06;
      const by0 = top - 0.5;
      const bx1 = lx + 0.42;
      const by1 = top - 0.09;
      b.box('trim', Math.hypot(bx1 - bx0, by1 - by0), 0.045, 0.045, (bx0 + bx1) / 2, (by0 + by1) / 2, lz, iron, 0, 0, Math.atan2(by1 - by0, bx1 - bx0));
      const c = new THREE.Vector3(lx, 0, lz).applyMatrix4(b.m);
      this.circles.push({ x: c.x, z: c.z, r: 0.25 });
      lx += 0.55;
      hangTo = top - 0.095;
    }
    // the lantern: glass, four corner bars, a base plate, a pyramid cap and a ring on top
    b.box('lamp', 0.22, 0.34, 0.22, lx, ly, lz, [1, 1, 1]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('iron', 0.04, 0.36, 0.04, lx + sx * 0.12, ly, lz + sz * 0.12, iron);
    b.box('iron', 0.3, 0.05, 0.3, lx, ly - 0.19, lz, iron);
    this.spin('iron', new THREE.CylinderGeometry(0.03, 0.23, 0.15, 4), lx, ly + 0.235, lz, Math.PI / 4, iron);
    b.box('iron', 0.06, 0.05, 0.06, lx, ly + 0.335, lz, iron);
    if (hangTo > ly + 0.36) b.box('iron', 0.035, hangTo - ly - 0.36, 0.035, lx, (hangTo + ly + 0.36) / 2, lz, iron);
    if (wallZ !== undefined) {
      const len = lz - wallZ;
      b.box('iron', 0.14, 0.22, 0.03, lx, ly + 0.38, wallZ + 0.015, iron); // wall plate
      b.box('iron', 0.045, 0.045, len - 0.01, lx, ly + 0.44, wallZ + 0.01 + (len - 0.01) / 2, iron); // arm
      b.box('iron', 0.03, 0.08, 0.03, lx, ly + 0.395, lz, iron); // drop to the ring
    }
    const p = new THREE.Vector3(lx, ly, lz).applyMatrix4(b.m);
    this.lanterns.push(p);
  }

  // A lit opening on a wall whose face is at lz: the pane sits on the wall, a four-bar frame
  // around it and the cross bars on the pane. glow tints the pane (doors are dimmer).
  // door: no cross bars and no bottom bar (it would sit on the ground)
  private window(lx: number, ly: number, lz: number, w = 1.0, h = 1.3, door = false, glow: Rgb = [1, 1, 1]) {
    const b = this.b;
    const f = 0.15;
    b.box('glow', w, h, 0.04, lx, ly, lz + 0.02, glow);
    for (const sy of door ? [1] : [-1, 1]) b.box('trim', w + f * 2, f, 0.12, lx, ly + sy * (h / 2 + f / 2), lz + 0.06, COL.trim);
    for (const sx of [-1, 1]) b.box('trim', f, h, 0.12, lx + sx * (w / 2 + f / 2), ly, lz + 0.06, COL.trim);
    if (door) return;
    b.box('trim', 0.08, h, 0.05, lx, ly, lz + 0.065, COL.trim);
    const half = (w - 0.08) / 2;
    for (const sx of [-1, 1]) b.box('trim', half, 0.08, 0.05, lx + sx * (0.04 + half / 2), ly, lz + 0.065, COL.trim);
  }

  private stamp(g: THREE.BufferGeometry) {
    g.setAttribute('aBld', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(this.b.bid), 1));
    return g;
  }

  private sign(text: string, lx: number, ly: number, lz: number, w: number) {
    const tex = signTexture(text);
    const h = w * (24 / 128);
    const m = ps1(new THREE.MeshLambertMaterial({ map: tex }), { cut: true });
    this.owned.push(tex);
    this.ownedMats.push(m);
    const mesh = new THREE.Mesh(this.stamp(new THREE.PlaneGeometry(w, h)), m);
    const p = new THREE.Vector3(lx, ly, lz).applyMatrix4(this.b.m);
    mesh.position.copy(p);
    mesh.rotation.y = Math.atan2(this.b.m.elements[8], this.b.m.elements[10]);
    this.group.add(mesh);
    // board behind the sign
    this.b.box('trim', w + 0.2, h + 0.2, 0.1, lx, ly, lz - 0.09, COL.trim); // face 0.04 behind the sign
  }

  private poster(lx: number, ly: number, lz: number) {
    const m = ps1(new THREE.MeshLambertMaterial({ map: wantedTexture() }), { cut: true });
    this.owned.push(m.map!);
    this.ownedMats.push(m);
    const mesh = new THREE.Mesh(this.stamp(new THREE.PlaneGeometry(0.9, 1.2)), m);
    mesh.position.copy(new THREE.Vector3(lx, ly, lz).applyMatrix4(this.b.m));
    mesh.rotation.y = Math.atan2(this.b.m.elements[8], this.b.m.elements[10]);
    mesh.rotation.z = (this.rng.next() - 0.5) * 0.12;
    this.group.add(mesh);
  }

  private building(s: BuildingSpec) {
    const b = this.b;
    const rot = s.rot;
    b.push(s.x, s.z, rot);
    b.bid = this.town.nextId++;
    const { w, d } = s;
    const wallKey = s.wall ?? 'siding';
    const k = this.rng.range(0.9, 1.04); // no two buildings quite the same shade
    const tint: Rgb = [k, k, k];
    const h1 = 4;
    const h = s.floors === 2 ? 7.6 : h1;
    const cz = -d / 2;

    // body
    b.box(wallKey, w, h, d, 0, h / 2, cz, tint);
    b.box('trim', w + 0.1, 0.3, d + 0.1, 0, 0.15, cz, COL.trim);
    // corner posts
    for (const sx of [-1, 1]) for (const sz of [0, -d]) b.box('post', 0.3, h - 0.03, 0.3, sx * (w / 2), (h - 0.03) / 2, sz, COL.wood);
    this.solid(-w / 2 - 0.15, -d - 0.15, w / 2 + 0.15, 0.15);

    // roof
    const roofTint: Rgb = [0.9, 0.85, 0.8];
    if (s.roof === 'gable') {
      const rh = w * 0.32;
      const slope = Math.hypot(w / 2 + 0.5, rh);
      const ang = Math.atan2(rh, w / 2 + 0.5);
      // overhangs the back; at the front it stops at the false front (only the chapel's gable is open)
      const front = s.steeple ? 0.4 : 0;
      const len = d + 0.4 + front;
      for (const sx of [-1, 1]) {
        // the right half is 2 cm shorter at each end, so the halves' end faces never share a plane
        b.box('shingles', slope, 0.2, sx > 0 ? len - 0.04 : len, (sx * (w / 2 + 0.5)) / 2, h + rh / 2, -d - 0.4 + len / 2, roofTint, 0, 0, sx * -ang);
      }
            const gz = s.steeple ? 0.01 : -0.03;
      b.tri(wallKey, [-w / 2, h, gz], [w / 2, h, gz], [0, h + rh, gz], tint);
      b.tri(wallKey, [w / 2, h, -d - 0.01], [-w / 2, h, -d - 0.01], [0, h + rh, -d - 0.01], tint);
    } else {
      b.box('tin', w + 0.3, 0.3, d + 0.35, 0, h + 0.15, -d / 2 - 0.025, COL.wood);
    }

    // false front for one-storey buildings (or the facade above the balcony)
    const ffTop = s.floors === 2 ? h + 1.4 : h + 2.4;
    if (!s.steeple) {
      if (wallKey === 'stone') b.box('boards', w + 0.4, ffTop, 0.3, 0, ffTop / 2, 0.15, [0.75, 0.72, 0.7]);
      else b.box(wallKey, w + 0.4, ffTop, 0.3, 0, ffTop / 2, 0.15, tint);
      b.box('trim', w + 0.7, 0.25, 0.5, 0, ffTop + 0.1, 0.15, COL.trim);
    }

    // door and windows on the facade
    const fz = s.steeple ? 0 : 0.3; // the facade's surface: the false front, or the wall itself
    this.window(0, 1.15, fz, 1.2, 2.3, true, [0.45, 0.35, 0.3]); // door
    if (s.sign === 'SALOON') {
      for (const sx of [-0.32, 0.32]) b.box('boards', 0.55, 1.0, 0.06, sx, 1.4, fz + 0.07, COL.weathered);
    }
    const wx = w / 2 - 1.8;
    for (const sx of [-wx, wx]) this.window(sx, 2.1, fz);
    if (s.floors === 2) for (const sx of [-wx, 0, wx]) this.window(sx, 5.6, fz);
    // side windows
    const side = Math.cos(rot) - Math.sin(rot) > 0 ? 1 : -1; // the side wall the camera sees
    for (let zz = -2.5; zz > -d + 1.5; zz -= 3.5) {
      b.push((side * w) / 2, zz, (side * Math.PI) / 2);
      this.window(0, 2.1, 0);
      if (s.floors === 2) this.window(0, 5.6, 0);
      b.pop();
    }

    // sign
    if (s.steeple) this.sign(s.sign, 0, h - 0.55, fz + 0.1, 4);
    else this.sign(s.sign, 0, s.floors === 2 ? h + 0.4 : h + 1.2, fz + 0.1, Math.min(w - 1.5, 9));

    // porch / balcony
    if (s.porch) {
      const pd = 2.6;
      b.box('boards', w + 0.38, 0.35, pd + 0.1, 0, 0.175, 0.2 + (pd + 0.1) / 2, COL.weathered);
      const postH = s.floors === 2 ? h1 : 3.4;
      const posts = s.floors === 2 ? [-w / 2, -w / 6, w / 6, w / 2] : [-w / 2, w / 2];
      for (const px of posts) b.box('post', 0.25, postH, 0.25, px, postH / 2, pd + 0.1, COL.wood);
      if (s.floors === 2) {
        b.box('boards', w + 0.6, 0.3, pd, 0, h1 + 0.15, 0.3 + pd / 2, COL.weathered);
        b.box('trim', w + 0.6, 0.12, 0.12, 0, h1 + 1.2, pd + 0.2, COL.trim);
        for (let px = -w / 2; px <= w / 2 + 0.01; px += 0.6) b.box('trim', 0.08, 0.9, 0.08, px, h1 + 0.75, pd + 0.2, COL.trim);
        for (const sx of [-1, 1]) b.box('trim', 0.1, 0.1, pd - 0.15, sx * (w / 2 + 0.24), h1 + 1.2, 0.3 + (pd - 0.15) / 2, COL.trim);
      } else {
        b.box('shingles', w + 0.36, 0.15, pd + 0.3, 0, postH + 0.15, 0.3 + (pd + 0.3) / 2, roofTint, 0.18);
      }
      this.lantern(-w / 2 + 0.6, 2.7, pd + 0.1, false, s.floors === 2 ? h1 : postH);
      this.lantern(w / 2 - 0.6, 2.7, pd + 0.1, false, s.floors === 2 ? h1 : postH);
      // a bench and a barrel on the porch
      b.box('boards', 2.2, 0.15, 0.6, -wx, 0.85, 1.3, COL.weathered);
      for (const sx of [-1, 1]) b.box('trim', 0.12, 0.5, 0.5, -wx + sx * 0.9, 0.6, 1.3, COL.trim);
    } else {
      this.lantern(-1.3, 2.7, fz + 0.25, false, 0, fz);
      this.lantern(1.3, 2.7, fz + 0.25, false, 0, fz);
    }

    if (s.wanted) {
      this.poster(-wx - 1.3, 2.0, fz + 0.05);
      this.poster(wx + 1.3, 2.2, fz + 0.05);
      this.poster(wx - 1.2, 2.9, fz + 0.05);
    }

    if (s.steeple) {
      const sh = h + w * 0.32;
      b.box(wallKey, 3, 3.5, 3, 0, sh + 0.6, -1.8, tint);
      b.box('trim', 1, 1.2, 3.1, 0, sh + 1.4, -1.8, COL.trim);
      b.cyl('shingles', 0, 2.3, 3.5, 4, 0, sh + 4.1, -1.8, [0.9, 0.85, 0.8]);
      b.box('trim', 0.15, 1.4, 0.15, 0, sh + 6.5, -1.8, COL.trim);
      b.box('trim', 0.9, 0.12, 0.11, 0, sh + 6.7, -1.8, COL.trim);
    }
    // what can hide the player: footprint (porch included) and top
    const top = s.steeple ? h + w * 0.32 + 7 : Math.max(ffTop + 0.3, s.roof === 'gable' ? h + w * 0.32 : h + 1);
    this.occluder(-w / 2 - 0.5, -d - 0.5, w / 2 + 0.5, s.porch ? 3.2 : 0.7, top);
    b.bid = 0;
    b.pop();
  }

  // One tier of rock: a tapered prism with uneven sides, squashed by `ex` and turned by `spinY`.
  private crag(rb: number, rt: number, y0: number, h: number, ex: number, spinY: number, c: Rgb) {
    const seg = 9;
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1).toNonIndexed();
    const pos = g.attributes.position as THREE.BufferAttribute;
    const bump = Array.from({ length: seg }, () => this.rng.range(0.82, 1.12));
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      const k = bump[Math.round(((Math.atan2(px, pz) / (Math.PI * 2)) * seg + seg) % seg) % seg];
      pos.setXYZ(i, px * k, pos.getY(i), pz * k * ex);
    }
    g.computeVertexNormals();
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i)) / UV_TILE, pos.getY(i) / UV_TILE);
    this.b.add('rock', g, new THREE.Matrix4().makeRotationY(spinY).setPosition(0, y0 + h / 2, 0), c);
  }

  // Barrels and crates go only where they touch nothing: other breakables, anything solid, round props.
  private roomFor(x: number, z: number, r: number) {
    for (const b of this.breakables) if ((b.x - x) ** 2 + (b.z - z) ** 2 < (b.r + r + 0.06) ** 2) return false;
    for (const b of this.boxes) if (inBox(b, x, z, r + 0.05)) return false;
    for (const c of this.circles) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + r + 0.05) ** 2) return false;
    for (const o of this.bldgs) if (inBox(o as unknown as Box, x, z, r)) return false; // porches
    return true;
  }
  private barrel(x: number, z: number) {
    if (this.roomFor(x, z, 0.45)) this.breakables.push({ x, z, r: 0.45, kind: 0, alive: true } as Breakable);
  }
  private crate(x: number, z: number) {
    if (this.roomFor(x, z, 0.5)) this.breakables.push({ x, z, r: 0.5, kind: 1, alive: true } as Breakable);
  }

  private wagon(x: number, z: number, rot: number, covered: boolean) {
    const b = this.b;
    b.push(x, z, rot);
    b.box('grey', 2.0, 0.7, 3.6, 0, 1.1, 0, COL.wood);
    b.box('trim', 1.8, 0.15, 3.4, 0, 0.75, 0, COL.trim);
    for (const sx of [-1.05, 1.05])
      for (const sz of [-1.2, 1.2]) b.cyl('trim', 0.55, 0.55, 0.12, 8, sx, 0.55, sz, COL.trim, 0, Math.PI / 2);
    b.box('trim', 0.12, 0.12, 2.0, 0, 0.6, 2.7, COL.trim, 0.3);
    if (covered) {
      b.cyl('plant', 1.1, 1.1, 3.2, 7, 0, 1.45, 0, [0.9, 0.84, 0.72], Math.PI / 2); // canvas
    } else {
      b.box('boards', 0.8, 0.8, 0.8, 0.4, 1.8, -0.8, COL.weathered);
      b.box('boards', 0.7, 0.6, 0.7, -0.4, 1.7, 0.6, COL.wood);
    }
    this.solid(-1.2, -1.9, 1.2, 1.9);
    b.pop();
  }

  private trough(x: number, z: number, rot: number) {
    const b = this.b;
    b.push(x, z, rot);
    // open box: floor, two long sides, two ends, water a little below the rim
    b.box('grey', 2.6, 0.12, 0.9, 0, 0.06, 0, COL.wood);
    for (const s of [-1, 1]) {
      b.box('grey', 2.6, 0.58, 0.1, 0, 0.41, s * 0.4, COL.wood);
      b.box('grey', 0.1, 0.58, 0.7, s * 1.25, 0.41, 0, COL.wood);
    }
    b.box('water', 2.4, 0.04, 0.7, 0, 0.52, 0, COL.wood);
    this.solid(-1.3, -0.45, 1.3, 0.45);
    b.pop();
  }

  private hitch(x: number, z: number, rot: number, len = 3) {
    const b = this.b;
    b.push(x, z, rot);
    for (const sx of [-len / 2, len / 2]) b.box('post', 0.2, 1.1, 0.2, sx, 0.55, 0, COL.weathered);
    b.box('post', 0.15, len + 0.3, 0.15, 0, 1.0, 0, COL.weathered, 0, 0, Math.PI / 2); // laid down so the grain runs along it
    this.solid(-len / 2 - 0.15, -0.12, len / 2 + 0.15, 0.12);
    b.pop();
  }

  private fence(x0: number, z0: number, x1: number, z1: number, skipStart = false, skipEnd = false) {
    const b = this.b;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    b.push((x0 + x1) / 2, (z0 + z1) / 2, rot);
    const n = Math.max(1, Math.round(len / 2));
    for (let i = skipStart ? 1 : 0; i <= (skipEnd ? n - 1 : n); i++) b.box('post', 0.2, 1.2, 0.2, -len / 2 + (len * i) / n, 0.6, 0, COL.weathered);
    for (const y of [0.9, 0.45]) b.box('post', 0.15, len, 0.1, 0, y, 0, COL.weathered, 0, 0, Math.PI / 2);
    const a0 = new THREE.Vector3(-len / 2, 0, 0).applyMatrix4(b.m);
    const a1 = new THREE.Vector3(len / 2, 0, 0).applyMatrix4(b.m);
    this.noPlants.push({ x0: Math.min(a0.x, a1.x) - 0.4, z0: Math.min(a0.z, a1.z) - 0.4, x1: Math.max(a0.x, a1.x) + 0.4, z1: Math.max(a0.z, a1.z) + 0.4 });
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
    b.cyl('post', 0.12, 0.25, 4, 5, x, 2, z, [0.6, 0.55, 0.5]);
    b.cyl('post', 0.06, 0.12, 2, 4, x + 0.6, 3.4, z, [0.6, 0.55, 0.5], 0, -0.8);
    b.cyl('post', 0.05, 0.1, 1.6, 4, x - 0.5, 3.0, z + 0.2, [0.6, 0.55, 0.5], 0.3, 0.9);
    this.circles.push({ x, z, r: 0.3 });
  }


  // ---- ground cover ----------------------------------------------------------

  // Scrub, grass, flowers and small succulents, thick where the vegetation field is high and sparse
  // in bare sand and in settlements. Decoration only: nothing here blocks movement.
  private *plants(settled: number, ph: number) {
    const r = this.rng;
    const clear = (x: number, z: number) => {
      for (const b of this.boxes) if (inBox(b, x, z, 0.9)) return false;
      for (const b of this.noPlants) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return false;
      for (const c of this.circles) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + 0.9) ** 2) return false;
      for (const c of this.breakables) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + 0.9) ** 2) return false;
      return this.roadDist(x, z) > ROAD + 0.4;
    };
    for (let i = 0; i < 2200; i++) {
      if (i % 550 === 549) yield;
      const x = this.x0 + r.range(1, CHUNK - 1);
      const z = this.z0 + r.range(1, CHUNK - 1);
      const v = veg(x, z, ph);
      const lush = Math.max(0, Math.min(1, (v - 0.4) / 0.35));
      let chance = 0.08 + 0.7 * lush;
      if (settled && Math.hypot(x - this.nodeX, z - this.nodeZ) < settled) chance *= 0.3;
      if (!r.chance(chance) || !clear(x, z)) continue;
      const k = r.next();
      if (lush > 0.4) {
        if (k < 0.4) {
          // a patch of grass, several tufts together
          const n = 2 + r.int(4);
          for (let t = 0; t < n; t++) this.grass(x + r.range(-1, 1), z + r.range(-1, 1), r.range(0.9, 1.5), lush);
        } else if (k < 0.62) this.bush(x, z, r.range(0.9, 1.8));
        else if (k < 0.74) this.flowers(x, z);
        else if (k < 0.84) this.pear(x, z, r.range(0.8, 1.2));
        else if (k < 0.92) this.yucca(x, z, r.range(0.8, 1.2));
        else this.agave(x, z, r.range(0.7, 1.1));
      } else {
        if (k < 0.45) this.grass(x, z, r.range(0.7, 1.1), lush);
        else if (k < 0.62) this.pebbles(x, z);
        else if (k < 0.74) this.bush(x, z, r.range(0.5, 0.9));
        else if (k < 0.86) this.agave(x, z, r.range(0.6, 0.9));
        else if (k < 0.97) this.barrelCactus(x, z);
        else this.skull(x, z);
      }
    }
  }

  private cube(x: number, y: number, z: number, w: number, h: number, d: number, c: Rgb) {
    this.b.plantShape(CUBE, new THREE.Matrix4().makeScale(w, h, d).setPosition(x, y, z), c);
  }

  private tint(c: Rgb, k: number): Rgb {
    return [c[0] * k, c[1] * k, c[2] * k];
  }

  private blob(x: number, y: number, z: number, rad: number, sx: number, sy: number, sz: number, yaw: number, c: Rgb) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw),
      new THREE.Vector3(sx, sy, sz),
    );
    this.b.plantShape(ICO, m.scale(new THREE.Vector3(rad, rad, rad)), c);
  }

  // A thin blade or leaf from a base point out to a tip.
  private blade(x: number, z: number, a: number, len: number, lift: number, width: number, c: Rgb) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const out = len * Math.cos(lift);
    this.b.plantTri([x - sa * width, 0.02, z + ca * width], [x + sa * width, 0.02, z - ca * width], [x + ca * out, len * Math.sin(lift), z + sa * out], c);
  }

  // Sagebrush or creosote: a clump of squashed balls.
  private bush(x: number, z: number, s: number) {
    const r = this.rng;
    const c: Rgb = r.chance(0.5) ? [0.47, 0.56, 0.34] : [0.36, 0.44, 0.24];
    const n = 3 + r.int(3);
    for (let i = 0; i < n; i++) {
      const rad = 0.32 * s * r.range(0.7, 1.1);
      this.blob(x + r.range(-0.35, 0.35) * s, rad * 0.6, z + r.range(-0.35, 0.35) * s, rad, 1, 0.75, 1, r.next() * 6, this.tint(c, r.range(0.85, 1.12)));
    }
  }

  // A tuft of grass: dry tan in bare sand, greener where it is lush.
  private grass(x: number, z: number, s: number, lush: number) {
    const r = this.rng;
    const dry: Rgb = [0.86, 0.72, 0.44];
    const green: Rgb = [0.55, 0.62, 0.32];
    const c: Rgb = [dry[0] + (green[0] - dry[0]) * lush, dry[1] + (green[1] - dry[1]) * lush, dry[2] + (green[2] - dry[2]) * lush];
    const n = 8 + r.int(7);
    for (let i = 0; i < n; i++) {
      const a = r.next() * Math.PI * 2;
      this.blade(x + Math.cos(a) * 0.1, z + Math.sin(a) * 0.1, a, r.range(0.45, 0.95) * s, r.range(0.85, 1.35), 0.07, this.tint(c, r.range(0.85, 1.1)));
    }
  }

  // Wildflowers: a few coloured heads on short stems.
  private flowers(x: number, z: number) {
    const r = this.rng;
    const heads: Rgb[] = [[1, 0.82, 0.25], [1, 0.55, 0.2], [0.72, 0.45, 0.88], [1, 0.96, 0.9], [1, 0.5, 0.66]];
    const c = heads[r.int(heads.length)];
    const n = 4 + r.int(6);
    for (let i = 0; i < n; i++) {
      const fx = x + r.range(-0.5, 0.5);
      const fz = z + r.range(-0.5, 0.5);
      const h = r.range(0.2, 0.42);
      this.blade(fx, fz, r.next() * 6, h, 1.45, 0.02, [0.45, 0.55, 0.3]);
      this.cube(fx, h, fz, 0.1, 0.07, 0.1, c);
    }
  }

  // Prickly pear: flat oval pads stacked off each other.
  private pear(x: number, z: number, s: number) {
    const r = this.rng;
    const c: Rgb = [0.38, 0.55, 0.3];
    let px = x;
    let py = 0.25 * s;
    let pz = z;
    const n = 3 + r.int(4);
    for (let i = 0; i < n; i++) {
      const yaw = r.next() * Math.PI;
      this.blob(px, py, pz, 0.26 * s, 1, 1.25, 0.32, yaw, this.tint(c, r.range(0.9, 1.1)));
      if (r.chance(0.3)) this.cube(px, py + 0.32 * s, pz, 0.07, 0.07, 0.07, [1, 0.45, 0.6]);
      px += r.range(-0.25, 0.25) * s;
      pz += r.range(-0.25, 0.25) * s;
      py = r.chance(0.5) ? py + 0.28 * s : 0.25 * s;
    }
  }

  // Yucca: a short trunk under a ball of spiky leaves, sometimes a flower stalk.
  private yucca(x: number, z: number, s: number) {
    const r = this.rng;
    const th = r.range(0.3, 0.9) * s;
    this.b.cyl('plant', 0.07 * s, 0.1 * s, th, 5, x, th / 2, z, [0.45, 0.38, 0.28]);
    const n = 12 + r.int(5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
      const len = r.range(0.45, 0.7) * s;
      const lift = r.range(0.4, 1.3);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const out = len * Math.cos(lift);
      const w = 0.05 * s;
      this.b.plantTri([x - sa * w, th, z + ca * w], [x + sa * w, th, z - ca * w], [x + ca * out, th + len * Math.sin(lift), z + sa * out], [0.32, 0.46, 0.28]);
    }
    if (r.chance(0.35)) {
      const sh = r.range(0.8, 1.3) * s;
      this.b.cyl('plant', 0.03, 0.04, sh, 4, x, th + sh / 2, z, [0.5, 0.45, 0.3]);
      for (let i = 0; i < 4; i++) this.cube(x, th + sh - i * 0.12, z, 0.12, 0.1, 0.12, [1, 0.96, 0.85]);
    }
  }

  // Agave: a low rosette of broad blue-green leaves.
  private agave(x: number, z: number, s: number) {
    const r = this.rng;
    const n = 8 + r.int(4);
    const c: Rgb = [0.45, 0.6, 0.52];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r.range(-0.15, 0.15);
      this.blade(x, z, a, r.range(0.4, 0.65) * s, r.range(0.5, 1.0), 0.1 * s, this.tint(c, r.range(0.85, 1.1)));
    }
  }

  private barrelCactus(x: number, z: number) {
    const r = this.rng;
    const s = r.range(0.7, 1.1);
    this.b.cyl('cactus', 0.22 * s, 0.26 * s, 0.4 * s, 8, x, 0.2 * s, z, [0.38, 0.52, 0.3]);
    if (r.chance(0.6)) this.cube(x, 0.43 * s, z, 0.14, 0.06, 0.14, r.chance(0.5) ? [1, 0.75, 0.2] : [1, 0.45, 0.55]);
  }

  private pebbles(x: number, z: number) {
    const r = this.rng;
    const n = 2 + r.int(4);
    for (let i = 0; i < n; i++) this.rock(x + r.range(-0.6, 0.6), z + r.range(-0.6, 0.6), r.range(0.12, 0.25), false);
  }

  // A sun-bleached cow skull.
  private skull(x: number, z: number) {
    const b = this.b;
    b.push(x, z, this.rng.next() * Math.PI * 2);
    const bone: Rgb = [1.05, 1.0, 0.9];
    b.box('plant', 0.32, 0.18, 0.42, 0, 0.09, 0, bone);
    b.box('plant', 0.22, 0.14, 0.26, 0, 0.07, 0.3, bone);
    for (const sx of [-1, 1]) b.cyl('plant', 0.02, 0.05, 0.4, 4, sx * 0.3, 0.2, -0.1, bone, 0, sx * 1.1);
    b.pop();
  }

  private *finish() {
    const kit = this.kit;
    if (this.b.plantPos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.b.plantPos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.b.plantCol, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(plantUvs(this.b.plantPos), 2));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, kit.mats.plant);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    for (const [key, geos] of this.b.parts) {
      yield;
      const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, kit.mats[key]);
      for (const g of geos) g.dispose();
      const lit = key !== 'glow' && key !== 'lamp';
      mesh.castShadow = lit;
      mesh.receiveShadow = lit;
      this.group.add(mesh);
    }
    // breakables: instanced barrels and crates
    const nb = this.breakables.filter((x) => x.kind === 0).length;
    const barrels = new THREE.InstancedMesh(kit.barrelGeo, kit.barrelMat, Math.max(1, nb));
    const crates = new THREE.InstancedMesh(kit.crateGeo, kit.crateMat, Math.max(1, this.breakables.length - nb));
    barrels.count = nb;
    crates.count = this.breakables.length - nb;
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    let ib = 0;
    let ic = 0;
    this.breakables.forEach((br) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, br.kind ? this.rng.range(-0.12, 0.12) : 0);
      br.m = new THREE.Matrix4().compose(new THREE.Vector3(br.x, 0, br.z), q, one);
      br.mesh = br.kind ? crates : barrels;
      br.idx = br.kind ? ic++ : ib++;
      br.mesh.setMatrixAt(br.idx, br.m);
    });
    barrels.frustumCulled = crates.frustumCulled = false;
    for (const im of [barrels, crates]) {
      im.castShadow = im.receiveShadow = true;
      this.group.add(im);
    }
  }

  smash(br: Breakable) {
    br.alive = false;
    br.mesh.setMatrixAt(br.idx, ZERO);
    br.mesh.instanceMatrix.needsUpdate = true;
  }

  reset() {
    for (const br of this.breakables) {
      br.alive = true;
      br.mesh.setMatrixAt(br.idx, br.m);
      br.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.geometry !== this.kit.barrelGeo && mesh.geometry !== this.kit.crateGeo) mesh.geometry.dispose();
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).dispose();
    });
    for (const t of this.owned) t.dispose();
    for (const m of this.ownedMats) m.dispose();
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// UVs for the plant vertex list: each triangle projected onto the plane it faces most.
function plantUvs(p: number[]) {
  const uv = new Float32Array((p.length / 3) * 2);
  for (let t = 0; t < p.length; t += 9) {
    const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2];
    const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2];
    const nx = Math.abs(uy * vz - uz * vy);
    const ny = Math.abs(uz * vx - ux * vz);
    const nz = Math.abs(ux * vy - uy * vx);
    const [a, b] = ny >= nx && ny >= nz ? [0, 2] : nx >= nz ? [2, 1] : [0, 1];
    for (let k = 0; k < 3; k++) {
      uv[(t / 3 + k) * 2] = p[t + k * 3 + a] / UV_TILE;
      uv[(t / 3 + k) * 2 + 1] = p[t + k * 3 + b] / UV_TILE;
    }
  }
  return uv;
}

// The streaming world: keeps the cells around the player built, and answers collision queries
// from a grid of collider buckets.
export class Town {
  group = new THREE.Group();
  lanterns: THREE.Vector3[] = [];
  start: { x: number; z: number };
  glowMat: THREE.MeshBasicMaterial;
  lampMat: THREE.MeshBasicMaterial;
  chunks = new Map<string, Chunk>();
  private kit = new Kit();
  private roads = new Map<string, Road | null>();
  private buckets = new Map<number, Bucket>();
  private dirt: THREE.Mesh;
  private static EMPTY: Bucket = { boxes: [], circles: [], breaks: [] };
  private pending: { c: Chunk; it: Generator } | null = null;
  nextId = 1; // building ids (0 means none)
  phase: number; // offsets the vegetation field per seed

  constructor(public seed: number) {
    this.phase = (seed % 1000) * 0.0137;
    this.glowMat = this.kit.glowMat;
    this.lampMat = this.kit.lampMat;
    const [x, z] = this.node(0, 0);
    this.start = { x, z };
    // one big dirt plane that follows the player in whole texture repeats
    const t = T.dirt.clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(400 / 3.2, 400 / 3.2);
    const mat = new THREE.MeshLambertMaterial({ map: t });
    // large-scale colour: greener, darker earth where plants grow, pale sand between, plus a slow mottle
    const ph = this.phase;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uPhase = { value: ph };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGround;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGround;\nuniform float uPhase;' + VEG_GLSL)
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float lush = smoothstep(0.4, 0.8, veg(vGround, uPhase));
          diffuseColor.rgb *= mix(vec3(1.05, 1.0, 0.94), vec3(0.72, 0.78, 0.5), lush);
          diffuseColor.rgb *= 0.95 + 0.06 * sin(vGround.x * 0.21 + sin(vGround.y * 0.17) * 2.0);`,
        );
    };
    mat.customProgramCacheKey = () => 'ground';
    this.dirt = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), mat);
    this.dirt.receiveShadow = true;
    this.group.add(this.dirt);
  }

  node(k: number, j: number): [number, number] {
    return [k * CHUNK + (hash(this.seed, k, j, 1) * 2 - 1) * JIT, j * CHUNK + (hash(this.seed, k, j, 2) * 2 - 1) * JIT];
  }

  // The road from junction (k, j) east ('h') or south ('v'), or null. Main street (j = 0) always runs.
  road(k: number, j: number, dir: 'h' | 'v') {
    const key = `${k},${j},${dir}`;
    let rd = this.roads.get(key);
    if (rd !== undefined) return rd;
    const s = this.seed;
    const on = dir === 'h' ? j === 0 || hash(s, k, j, 3) < 0.45 : (k === 0 && (j === 0 || j === -1)) || hash(s, k, j, 4) < 0.45;
    rd = null;
    if (on) {
      const [ax, az] = this.node(k, j);
      const [bx, bz] = dir === 'h' ? this.node(k + 1, j) : this.node(k, j + 1);
      const o = dir === 'h' ? 5 : 7;
      // roads meeting at a junction alternate heights, so their overlapping ends never share a plane
      const y = dir === 'h' ? 0.03 + (((k % 2) + 2) % 2) * 0.012 : 0.06 + (((j % 2) + 2) % 2) * 0.012;
      rd = new Road(ax, az, bx, bz, (hash(s, k, j, o) * 2 - 1) * BULGE, (hash(s, k, j, o + 1) * 2 - 1) * BULGE, y);
    }
    this.roads.set(key, rd);
    return rd;
  }

  // Build the 3x3 cells around (x, z) (one per call unless `all`), drop far ones. Returns true on change.
  update(x: number, z: number, all = false) {
    const pk = Math.round(x / CHUNK);
    const pj = Math.round(z / CHUNK);
    let changed = false;
    for (const [key, c] of this.chunks) {
      if (Math.abs(c.k - pk) <= 2 && Math.abs(c.j - pj) <= 2) continue;
      this.group.remove(c.group);
      c.dispose();
      this.chunks.delete(key);
      changed = true;
    }
    // a cell being built that is no longer wanted is dropped
    const p = this.pending;
    if (p && (Math.abs(p.c.k - pk) > 1 || Math.abs(p.c.j - pj) > 1)) {
      p.c.dispose();
      this.pending = null;
    }
    // build the nearest missing cell, one step per call (all of them at once when `all`)
    for (;;) {
      if (!this.pending) {
        let best: Chunk | null = null;
        for (let ring = 0; ring <= 1 && !best; ring++)
          for (let dj = -ring; dj <= ring && !best; dj++)
            for (let dk = -ring; dk <= ring && !best; dk++) {
              if (Math.max(Math.abs(dk), Math.abs(dj)) !== ring || this.chunks.has(`${pk + dk},${pj + dj}`)) continue;
              best = new Chunk(this, this.kit, pk + dk, pj + dj);
            }
        if (!best) break;
        this.pending = { c: best, it: best.build() };
      }
      const cur = this.pending!;
      if (cur.it.next().done) {
        this.chunks.set(`${cur.c.k},${cur.c.j}`, cur.c);
        this.group.add(cur.c.group);
        this.pending = null;
        changed = true;
      }
      if (!all) break;
    }
    if (changed) this.reindex();
    this.dirt.position.set(Math.round(x / 3.2) * 3.2, 0, Math.round(z / 3.2) * 3.2);
    return changed;
  }

  private reindex() {
    this.buckets.clear();
    this.lanterns = [];
    const put = (x0: number, z0: number, x1: number, z1: number, f: (b: Bucket) => void) => {
      for (let bz = Math.floor((z0 - 2) / BUCKET); bz <= Math.floor((z1 + 2) / BUCKET); bz++)
        for (let bx = Math.floor((x0 - 2) / BUCKET); bx <= Math.floor((x1 + 2) / BUCKET); bx++) {
          const key = bx * 65536 + bz;
          let b = this.buckets.get(key);
          if (!b) this.buckets.set(key, (b = { boxes: [], circles: [], breaks: [] }));
          f(b);
        }
    };
    for (const c of this.chunks.values()) {
      for (const b of c.boxes) put(b.x0, b.z0, b.x1, b.z1, (k) => k.boxes.push(b));
      for (const ci of c.circles) put(ci.x - ci.r, ci.z - ci.r, ci.x + ci.r, ci.z + ci.r, (k) => k.circles.push(ci));
      for (const br of c.breakables) put(br.x - br.r, br.z - br.r, br.x + br.r, br.z + br.r, (k) => k.breaks.push(br));
      this.lanterns.push(...c.lanterns);
    }
  }

  // Colliders near a point (anything within 2 units of it).
  at(x: number, z: number) {
    return this.buckets.get(Math.floor(x / BUCKET) * 65536 + Math.floor(z / BUCKET)) ?? Town.EMPTY;
  }

  // Live breakables overlapping a circle.
  breaksIn(x: number, z: number, r: number, out: Breakable[]) {
    out.length = 0;
    for (let bz = Math.floor((z - r) / BUCKET); bz <= Math.floor((z + r) / BUCKET); bz++)
      for (let bx = Math.floor((x - r) / BUCKET); bx <= Math.floor((x + r) / BUCKET); bx++) {
        const b = this.buckets.get(bx * 65536 + bz);
        if (!b) continue;
        for (const br of b.breaks)
          if (br.alive && !out.includes(br) && (br.x - x) ** 2 + (br.z - z) ** 2 < (r + br.r) ** 2) out.push(br);
      }
    return out;
  }

  smash(br: Breakable) {
    for (const c of this.chunks.values()) if (c.breakables.includes(br)) c.smash(br);
  }

  // The building between the player and the camera, if any: a ray from the player's feet toward the
  // camera (ground direction dx, dz; `rise` height per unit of ground), against each building's
  // footprint and height. The nearest hit wins.
  // y0 and reach default to a ray from the feet, out to where it clears any roof.
  occluder(px: number, pz: number, dx = CAM_X, dz = CAM_Z, rise = Math.tan(PITCH), y0 = 0.3, reach = Math.min(90, 14 / Math.max(rise, 0.05))) {
    let best = 0;
    let bestT = Infinity;
    for (const ch of this.chunks.values())
      for (const o of ch.bldgs) {
        if (Math.abs(o.cx - px) > reach + 12 || Math.abs(o.cz - pz) > reach + 12) continue;
        // ray in the box frame
        const rx = px - o.cx;
        const rz = pz - o.cz;
        const ox = rx * o.c - rz * o.s;
        const oz = rx * o.s + rz * o.c;
        const vx = dx * o.c - dz * o.s;
        const vz = dx * o.s + dz * o.c;
        let t0 = 0;
        let t1 = reach;
        for (const [p, v, h] of [[ox, vx, o.hx], [oz, vz, o.hz]]) {
          if (Math.abs(v) < 1e-6) {
            if (Math.abs(p) > h) t0 = Infinity;
            continue;
          }
          const a = (-h - p) / v;
          const b = (h - p) / v;
          t0 = Math.max(t0, Math.min(a, b));
          t1 = Math.min(t1, Math.max(a, b));
        }
        if (t0 > t1) continue;
        // the ray enters the footprint at t0; it is hidden if it is still below the top there
        if (y0 + t0 * rise < o.top && t0 < bestT) {
          best = o.id;
          bestT = t0;
        }
      }
    return best;
  }

  // Fade the occluding building out; the previous one (if any) fades back in.
  // view: unit vector toward the camera in use.
  updateHide(px: number, pz: number, dt: number, view: THREE.Vector3) {
    const g = Math.hypot(view.x, view.z) || 1;
    const want = this.occluder(px, pz, view.x / g, view.z / g, view.y / g);
    const h = hide.value; // (current id, fade, previous id, fade)
    if (want !== h.x) {
      const resume = want !== 0 && want === h.z ? h.w : 0;
      if (h.x !== 0) {
        h.z = h.x;
        h.w = h.y;
      }
      h.x = want;
      h.y = resume;
    }
    const step = dt * 5;
    if (h.x !== 0) h.y = Math.min(1, h.y + step);
    h.w = Math.max(0, h.w - step);
  }

  resetBreakables() {
    for (const c of this.chunks.values()) c.reset();
  }

  dispose() {
    for (const c of this.chunks.values()) c.dispose();
    this.pending?.c.dispose();
    this.chunks.clear();
  }
}

// Two oriented footprints overlap (with a gap of `pad` required between them): separating axis test.
function obbOverlap(a: Occluder, b: Occluder, pad: number) {
  const dx = b.cx - a.cx;
  const dz = b.cz - a.cz;
  // each box's local x axis is (c, -s) and z axis (s, c) in world space
  const axes = [
    [a.c, -a.s],
    [a.s, a.c],
    [b.c, -b.s],
    [b.s, b.c],
  ];
  for (const [ux, uz] of axes) {
    const ra = a.hx * Math.abs(a.c * ux - a.s * uz) + a.hz * Math.abs(a.s * ux + a.c * uz);
    const rb = b.hx * Math.abs(b.c * ux - b.s * uz) + b.hz * Math.abs(b.s * ux + b.c * uz);
    if (Math.abs(dx * ux + dz * uz) > ra + rb + pad) return false;
  }
  return true;
}

// Point inside an oriented box (with padding).
export function inBox(b: Box, x: number, z: number, pad = 0) {
  const dx = x - b.cx;
  const dz = z - b.cz;
  return Math.abs(dx * b.c - dz * b.s) < b.hx + pad && Math.abs(dx * b.s + dz * b.c) < b.hz + pad;
}
