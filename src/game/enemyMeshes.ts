import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Procedural low-poly enemy models, flat-shaded with vertex colours. Each faces +z with feet at y = 0.
type Rgb = [number, number, number];
const parts: THREE.BufferGeometry[] = [];

function put(g: THREE.BufferGeometry, c: Rgb, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.deleteAttribute('uv');
  ng.applyMatrix4(
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)),
  );
  const n = ng.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(c, i * 3);
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  parts.push(ng);
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r: number, h: number, s = 4) => new THREE.ConeGeometry(r, h, s);

function done() {
  const g = mergeGeometries(parts.splice(0), false)!;
  g.computeVertexNormals();
  return g;
}

function quadruped(body: Rgb, dark: Rgb, len: number, h: number, w: number) {
  put(box(w, h * 0.45, len), body, 0, h * 0.75, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) put(box(w * 0.25, h * 0.55, w * 0.25), dark, sx * w * 0.3, h * 0.28, sz * len * 0.35);
}

function humanoid(shirt: Rgb, pants: Rgb, skin: Rgb, hat: Rgb, s = 1) {
  for (const sx of [-1, 1]) put(box(0.2 * s, 0.6 * s, 0.22 * s), pants, sx * 0.13 * s, 0.3 * s, 0);
  put(box(0.55 * s, 0.6 * s, 0.32 * s), shirt, 0, 0.9 * s, 0);
  for (const sx of [-1, 1]) put(box(0.15 * s, 0.55 * s, 0.15 * s), shirt, sx * 0.35 * s, 0.9 * s, 0.02 * s, 0, 0, sx * 0.15);
  put(box(0.38 * s, 0.36 * s, 0.36 * s), skin, 0, 1.38 * s, 0.02 * s);
  put(box(0.18 * s, 0.14 * s, 0.18 * s), skin, 0, 1.33 * s, 0.24 * s); // snout
  put(cyl(0.42 * s, 0.42 * s, 0.05 * s, 8), hat, 0, 1.58 * s, 0);
  put(cyl(0.2 * s, 0.24 * s, 0.25 * s, 6), hat, 0, 1.72 * s, 0);
}

const builders: Record<string, () => THREE.BufferGeometry> = {
  coyote() {
    const fur: Rgb = [0.78, 0.55, 0.32];
    const dark: Rgb = [0.45, 0.3, 0.18];
    quadruped(fur, dark, 1.0, 0.75, 0.38);
    put(box(0.32, 0.3, 0.35), fur, 0, 0.82, 0.62);
    put(box(0.16, 0.14, 0.25), dark, 0, 0.76, 0.86);
    for (const sx of [-1, 1]) put(cone(0.08, 0.22), dark, sx * 0.1, 1.06, 0.58);
    put(box(0.14, 0.14, 0.5), fur, 0, 0.75, -0.65, -0.6);
    put(box(0.04, 0.04, 0.04), [2, 1.2, 0.3], 0.1, 0.88, 0.8);
    put(box(0.04, 0.04, 0.04), [2, 1.2, 0.3], -0.1, 0.88, 0.8);
    return done();
  },
  bandit() {
    humanoid([0.55, 0.22, 0.15], [0.25, 0.22, 0.28], [0.5, 0.38, 0.28], [0.18, 0.12, 0.08]);
    put(box(0.4, 0.14, 0.38), [0.75, 0.12, 0.1], 0, 1.27, 0.03); // bandana
    return done();
  },
  gunman() {
    humanoid([0.22, 0.28, 0.35], [0.18, 0.16, 0.2], [0.45, 0.35, 0.3], [0.1, 0.08, 0.08]);
    put(box(0.6, 0.55, 0.36), [0.2, 0.24, 0.3], 0, 0.55, -0.02); // long coat
    put(box(0.1, 0.12, 0.45), [0.15, 0.14, 0.14], 0.35, 0.95, 0.35); // rifle
    return done();
  },
  snake() {
    const g: Rgb = [0.55, 0.5, 0.25];
    const d: Rgb = [0.35, 0.28, 0.14];
    put(cyl(0.45, 0.5, 0.18, 8), d, 0, 0.09, -0.1);
    put(cyl(0.32, 0.38, 0.18, 8), g, 0, 0.27, -0.1);
    put(cyl(0.18, 0.22, 0.45, 6), g, 0, 0.55, 0.05, 0.4);
    put(box(0.26, 0.16, 0.34), d, 0, 0.78, 0.22);
    put(box(0.05, 0.05, 0.05), [2.5, 0.4, 0.2], 0.08, 0.84, 0.36);
    put(box(0.05, 0.05, 0.05), [2.5, 0.4, 0.2], -0.08, 0.84, 0.36);
    put(cone(0.08, 0.35), [0.85, 0.75, 0.5], 0, 0.45, -0.6, -1.2);
    return done();
  },
  vulture() {
    const b: Rgb = [0.18, 0.14, 0.16];
    put(box(0.45, 0.4, 0.8), b, 0, 0, 0);
    for (const sx of [-1, 1]) put(box(1.3, 0.06, 0.55), [0.24, 0.18, 0.2], sx * 0.8, 0.1, -0.05, 0, 0, sx * 0.25);
    put(cyl(0.08, 0.1, 0.35, 5), [0.85, 0.5, 0.45], 0, 0.2, 0.45, 0.9);
    put(box(0.18, 0.16, 0.22), [0.85, 0.5, 0.45], 0, 0.3, 0.6);
    put(cone(0.06, 0.18), [0.9, 0.8, 0.4], 0, 0.27, 0.78, Math.PI / 2);
    put(box(0.3, 0.05, 0.3), b, 0, 0, -0.5);
    return done();
  },
  tumbleweed() {
    const c: Rgb = [0.72, 0.58, 0.36];
    put(new THREE.IcosahedronGeometry(0.55, 0), c, 0, 0, 0);
    put(new THREE.IcosahedronGeometry(0.5, 0), [0.6, 0.47, 0.28], 0, 0, 0, 0.7, 0.4, 0.2);
    for (let i = 0; i < 4; i++) put(box(1.2, 0.05, 0.05), [0.5, 0.38, 0.22], 0, 0, 0, i, i * 1.3, i * 0.7);
    return done();
  },
  mule() {
    const f: Rgb = [0.5, 0.44, 0.4];
    const d: Rgb = [0.3, 0.26, 0.24];
    quadruped(f, d, 1.7, 1.25, 0.65);
    put(box(0.38, 0.6, 0.38), f, 0, 1.45, 0.9, 0.5);
    put(box(0.32, 0.32, 0.5), f, 0, 1.6, 1.15);
    for (const sx of [-1, 1]) put(box(0.08, 0.4, 0.12), d, sx * 0.12, 1.95, 1.0, 0, 0, sx * 0.2);
    for (const sx of [-1, 1]) put(box(0.35, 0.55, 0.8), [0.6, 0.45, 0.28], sx * 0.48, 1.15, -0.1);
    put(box(0.7, 0.45, 0.6), [0.75, 0.68, 0.55], 0, 1.4, -0.2);
    put(cyl(0.2, 0.2, 0.9, 6), [0.55, 0.35, 0.2], 0, 1.75, -0.2, 0, 0, Math.PI / 2);
    return done();
  },
  golem() {
    const c: Rgb = [0.7, 0.55, 0.32];
    const d: Rgb = [0.5, 0.38, 0.22];
    put(new THREE.IcosahedronGeometry(1.1, 0), c, 0, 1.6, 0);
    put(new THREE.IcosahedronGeometry(0.6, 0), d, 0, 2.85, 0.1);
    for (const sx of [-1, 1]) {
      put(new THREE.IcosahedronGeometry(0.55, 0), d, sx * 1.25, 1.7, 0.2);
      put(new THREE.IcosahedronGeometry(0.45, 0), c, sx * 1.4, 0.9, 0.35);
      put(new THREE.IcosahedronGeometry(0.5, 0), d, sx * 0.5, 0.45, 0);
    }
    for (let i = 0; i < 6; i++) put(box(2.6, 0.08, 0.08), [0.45, 0.33, 0.2], 0, 1.6, 0, i * 0.8, i * 1.1, i * 0.5);
    put(box(0.1, 0.1, 0.05), [3, 1.5, 0.3], 0.18, 2.95, 0.66);
    put(box(0.1, 0.1, 0.05), [3, 1.5, 0.3], -0.18, 2.95, 0.66);
    return done();
  },
  devil() {
    const c: Rgb = [0.85, 0.7, 0.5];
    for (let i = 0; i < 6; i++) {
      const r = 0.25 + i * 0.28;
      put(cyl(r + 0.14, r, 0.5, 7), i % 2 ? c : [0.72, 0.58, 0.4], Math.sin(i) * 0.15, 0.25 + i * 0.5, Math.cos(i) * 0.15, 0, i * 0.5);
    }
    put(box(0.15, 0.15, 0.05), [3, 1, 0.4], 0.25, 2.2, 0.95);
    put(box(0.15, 0.15, 0.05), [3, 1, 0.4], -0.25, 2.2, 0.95);
    return done();
  },
  dan() {
    humanoid([0.6, 0.15, 0.1], [0.2, 0.17, 0.15], [0.55, 0.4, 0.3], [0.12, 0.08, 0.05], 2.1);
    put(box(1.3, 1.1, 0.75), [0.5, 0.12, 0.08], 0, 1.2, -0.05); // duster
    put(box(1.4, 0.15, 0.8), [0.85, 0.65, 0.25], 0, 1.35, 0); // belt
    for (const sx of [-1, 1]) put(box(0.12, 0.15, 0.5), [0.2, 0.2, 0.22], sx * 0.75, 1.7, 0.45);
    put(box(0.3, 0.18, 0.08), [0.9, 0.8, 0.5], 0.25, 2.2, 0.38); // gold star
    return done();
  },
  rider() {
    const h: Rgb = [0.12, 0.1, 0.12];
    quadruped(h, [0.08, 0.06, 0.08], 1.9, 1.4, 0.6);
    put(box(0.36, 0.7, 0.4), h, 0, 1.7, 1.05, 0.5);
    put(box(0.3, 0.3, 0.55), h, 0, 1.95, 1.3);
    put(box(0.06, 0.06, 0.06), [4, 0.3, 0.2], 0.12, 2.0, 1.58);
    put(box(0.06, 0.06, 0.06), [4, 0.3, 0.2], -0.12, 2.0, 1.58);
    put(box(0.55, 0.7, 0.4), [0.2, 0.16, 0.18], 0, 1.95, -0.1);
    put(box(0.36, 0.36, 0.36), [0.22, 0.18, 0.2], 0, 2.5, -0.08);
    put(box(0.12, 0.12, 0.05), [4, 0.4, 0.2], 0.08, 2.55, 0.12); // the iron eye
    put(cyl(0.42, 0.42, 0.05, 8), [0.08, 0.06, 0.06], 0, 2.72, -0.08);
    put(cyl(0.2, 0.24, 0.25, 6), [0.08, 0.06, 0.06], 0, 2.86, -0.08);
    return done();
  },
};

export function buildEnemyMesh(id: string) {
  return builders[id]();
}
