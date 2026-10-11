import * as THREE from 'three';
import { ENEMIES } from '../data/enemies';
import { buildEnemyMesh } from './enemyMeshes';
import { ps1 } from '../render/ps1';
import { CHAR_LAYER } from '../render/pipeline';
import { Town } from '../world/town';
import { collide } from '../world/collide';
import { FlowField } from '../world/flowfield';

export const MAX = 640;
const CELL = 2;
const GN = 64; // spatial hash cells per side; the grid wraps, so it covers an endless world
const wrap = (c: number) => ((c % GN) + GN) % GN;

// Struct-of-arrays enemy pool with a spatial hash and instanced rendering per type.
export class Enemies {
  type = new Int16Array(MAX);
  alive = new Uint8Array(MAX);
  x = new Float32Array(MAX);
  z = new Float32Array(MAX);
  y = new Float32Array(MAX);
  kx = new Float32Array(MAX);
  kz = new Float32Array(MAX);
  dx = new Float32Array(MAX); // current move direction
  dz = new Float32Array(MAX);
  face = new Float32Array(MAX);
  hp = new Float32Array(MAX);
  maxHp = new Float32Array(MAX);
  flash = new Float32Array(MAX);
  stun = new Float32Array(MAX);
  slow = new Float32Array(MAX);
  poison = new Float32Array(MAX); // dps
  poisonT = new Float32Array(MAX);
  vuln = new Float32Array(MAX);
  state = new Uint8Array(MAX);
  stateT = new Float32Array(MAX);
  shootT = new Float32Array(MAX);
  phase = new Float32Array(MAX);
  size = new Float32Array(MAX);
  roll = new Float32Array(MAX);
  uid = new Uint32Array(MAX);
  count = 0;
  private free: number[] = [];
  private nextUid = 1;

  head = new Int32Array(GN * GN);
  next = new Int32Array(MAX);
  hits = new Int32Array(MAX); // shared query buffer

  group = new THREE.Group();
  meshes: THREE.InstancedMesh[] = [];
  private flashAttr: THREE.InstancedBufferAttribute[] = [];
  private shadows: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor() {
    for (let i = MAX - 1; i >= 0; i--) this.free.push(i);
    const mat = ps1(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { flash: true });
    for (const def of ENEMIES) {
      const cap = def.boss ? 2 : def.elite ? 8 : def.id === 'posse' ? 40 : MAX;
      const im = new THREE.InstancedMesh(buildEnemyMesh(def.mesh), mat, cap);
      const fa = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      im.geometry.setAttribute('aFlash', fa);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = def.elite || def.boss || false;
      im.layers.set(CHAR_LAYER);
      this.meshes.push(im);
      this.flashAttr.push(fa);
      this.group.add(im);
    }
    const sg = new THREE.CircleGeometry(1, 10);
    sg.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false }), MAX);
    this.shadows.frustumCulled = false;
    this.shadows.count = 0;
    this.group.add(this.shadows);
  }

  reset() {
    this.alive.fill(0);
    this.free.length = 0;
    for (let i = MAX - 1; i >= 0; i--) this.free.push(i);
    this.count = 0;
  }

  spawn(type: number, x: number, z: number, hpMul: number, size = 1) {
    const i = this.free.pop();
    if (i === undefined) return -1;
    const d = ENEMIES[type];
    this.type[i] = type;
    this.alive[i] = 1;
    this.x[i] = x;
    this.z[i] = z;
    this.y[i] = d.behaviour === 'fly' ? 1.8 : 0;
    this.kx[i] = this.kz[i] = 0;
    this.dx[i] = this.dz[i] = 0;
    this.maxHp[i] = this.hp[i] = d.hp * hpMul * size * size;
    this.flash[i] = 0;
    this.stun[i] = this.slow[i] = this.poison[i] = this.poisonT[i] = this.vuln[i] = 0;
    this.state[i] = 0;
    this.stateT[i] = 0;
    this.shootT[i] = 1 + ((this.nextUid * 0.618) % 1) * 2;
    this.phase[i] = (i * 2.399) % (Math.PI * 2);
    this.size[i] = size;
    this.roll[i] = 0;
    this.uid[i] = this.nextUid++;
    this.count++;
    return i;
  }

  remove(i: number) {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.free.push(i);
    this.count--;
  }

  radius(i: number) {
    return ENEMIES[this.type[i]].r * this.size[i];
  }

  rebuildHash() {
    this.head.fill(-1);
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i]) continue;
      const c = this.cellOf(this.x[i], this.z[i]);
      this.next[i] = this.head[c];
      this.head[c] = i;
    }
  }

  private cellOf(x: number, z: number) {
    return wrap(Math.floor(z / CELL)) * GN + wrap(Math.floor(x / CELL));
  }

  // Fill `hits` with enemies whose body overlaps the circle. Returns the count.
  query(x: number, z: number, r: number) {
    let n = 0;
    const reach = r + 1.6;
    const x0 = Math.floor((x - reach) / CELL);
    const x1 = Math.min(x0 + GN - 1, Math.floor((x + reach) / CELL));
    const z0 = Math.floor((z - reach) / CELL);
    const z1 = Math.min(z0 + GN - 1, Math.floor((z + reach) / CELL));
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        for (let i = this.head[wrap(cz) * GN + wrap(cx)]; i !== -1; i = this.next[i]) {
          const rr = r + this.radius(i);
          const ddx = this.x[i] - x;
          const ddz = this.z[i] - z;
          if (ddx * ddx + ddz * ddz < rr * rr) this.hits[n++] = i;
        }
      }
    return n;
  }

  // Movement and separation. Behaviour-specific actions (shooting, boss attacks) are handled by the run.
  move(dt: number, px: number, pz: number, ff: FlowField, town: Town, time: number) {
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i]) continue;
      const d = ENEMIES[this.type[i]];
      const b = d.behaviour;
      this.flash[i] = Math.max(0, this.flash[i] - dt * 8);
      this.vuln[i] = Math.max(0, this.vuln[i] - dt);
      this.slow[i] = Math.max(0, this.slow[i] - dt);
      let toX = px - this.x[i];
      let toZ = pz - this.z[i];
      const dist = Math.hypot(toX, toZ) || 1;
      toX /= dist;
      toZ /= dist;
      let mx = toX;
      let mz = toZ;
      const free = b === 'fly' || b === 'posse';
      if (!free && dist > 3.5) {
        const c = ff.cell(this.x[i], this.z[i]);
        if (ff.dirX[c] !== 0 || ff.dirZ[c] !== 0) {
          mx = ff.dirX[c];
          mz = ff.dirZ[c];
        }
      }
      let speed = d.speed * (this.slow[i] > 0 ? 0.5 : 1);
      if (b === 'swarm') {
        const w = Math.sin(time * 3 + this.phase[i]) * 0.45;
        mx += -mz * w;
        mz += mx * w;
      } else if (b === 'ranged') {
        if (dist < 6) (mx = -toX), (mz = -toZ), (speed *= 0.7);
        else if (dist < 9) {
          const s = this.phase[i] > Math.PI ? 1 : -1;
          mx = -toZ * s;
          mz = toX * s;
          speed *= 0.6;
        }
      } else if (b === 'charge') {
        this.stateT[i] -= dt;
        if (this.state[i] === 0 && dist < 5 && this.stateT[i] <= 0) {
          this.state[i] = 1;
          this.stateT[i] = 0.6;
        } else if (this.state[i] === 1) {
          speed = 0;
          this.flash[i] = Math.max(this.flash[i], Math.sin(time * 40) > 0 ? 0.4 : 0);
          if (this.stateT[i] <= 0) {
            this.state[i] = 2;
            this.stateT[i] = 0.35;
            this.dx[i] = toX;
            this.dz[i] = toZ;
          }
        } else if (this.state[i] === 2) {
          mx = this.dx[i];
          mz = this.dz[i];
          speed = 13;
          if (this.stateT[i] <= 0) {
            this.state[i] = 0;
            this.stateT[i] = 1.5;
          }
        }
      } else if (b === 'devil') {
        const w = Math.sin(time * 1.7 + this.phase[i]) * 1.2;
        mx += -toZ * w;
        mz += toX * w;
      } else if (b === 'fly') {
        this.y[i] = 1.8 + Math.sin(time * 2 + this.phase[i]) * 0.3;
      }
      if (this.stun[i] > 0) {
        this.stun[i] -= dt;
        speed = 0;
      }
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml;
      mz /= ml;
      if (this.state[i] !== 2) {
        this.dx[i] = mx;
        this.dz[i] = mz;
      }
      // separation from neighbours in the same and adjacent cells
      let sx = 0;
      let sz = 0;
      if (!free) {
        const ri = this.radius(i);
        const cx = Math.floor(this.x[i] / CELL);
        const cz = Math.floor(this.z[i] / CELL);
        for (let oz = -1; oz <= 1; oz++)
          for (let ox = -1; ox <= 1; ox++) {
            for (let j = this.head[wrap(cz + oz) * GN + wrap(cx + ox)]; j !== -1; j = this.next[j]) {
              if (j === i) continue;
              const ddx = this.x[i] - this.x[j];
              const ddz = this.z[i] - this.z[j];
              const rr = ri + this.radius(j);
              const d2 = ddx * ddx + ddz * ddz;
              if (d2 >= rr * rr || d2 < 1e-6) continue;
              const dd = Math.sqrt(d2);
              const push = ((rr - dd) / dd) * (ENEMIES[this.type[j]].mass / (d.mass + ENEMIES[this.type[j]].mass));
              sx += ddx * push;
              sz += ddz * push;
            }
          }
      }
      const k = Math.exp(-dt * 8);
      let nx = this.x[i] + (mx * speed + this.kx[i]) * dt + sx * Math.min(1, dt * 12);
      let nz = this.z[i] + (mz * speed + this.kz[i]) * dt + sz * Math.min(1, dt * 12);
      this.kx[i] *= k;
      this.kz[i] *= k;
      if (!free) {
        const c = collide(town, nx, nz, this.radius(i), false);
        nx = c.x;
        nz = c.z;
      }
      this.x[i] = nx;
      this.z[i] = nz;
      const target = Math.atan2(b === 'ranged' && dist < 11 ? toX : mx, b === 'ranged' && dist < 11 ? toZ : mz);
      let da = target - this.face[i];
      da = Math.atan2(Math.sin(da), Math.cos(da));
      this.face[i] += da * Math.min(1, dt * 10);
      if (b === 'split') this.roll[i] += speed * dt * 2;
      if (b === 'devil') this.roll[i] += dt * 9;
    }
  }

  render(time: number) {
    for (const im of this.meshes) im.count = 0;
    let ns = 0;
    for (let i = 0; i < MAX; i++) {
      if (!this.alive[i]) continue;
      const t = this.type[i];
      const d = ENEMIES[t];
      const im = this.meshes[t];
      const n = im.count;
      if (n >= im.instanceMatrix.count) continue;
      const s = d.scale * this.size[i];
      let y = this.y[i];
      let sy = s;
      if (d.behaviour === 'split') {
        y += 0.55 * s;
        this.e.set(this.roll[i], this.face[i], 0, 'YXZ');
      } else if (d.behaviour === 'devil') {
        this.e.set(0, this.roll[i], 0);
      } else {
        const bob = Math.abs(Math.sin(time * 9 + this.phase[i]));
        y += bob * 0.08 * s;
        sy = s * (1 - bob * 0.05);
        this.e.set(this.state[i] === 1 ? -0.2 : 0, this.face[i], 0);
      }
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(this.x[i], y, this.z[i]), this.q, this.s.set(s, sy, s));
      im.setMatrixAt(n, this.m);
      this.flashAttr[t].setX(n, Math.min(1, this.flash[i]) + (this.vuln[i] > 0 ? 0.12 : 0));
      im.count = n + 1;
      const r = d.r * this.size[i] * 1.1;
      this.m.compose(this.v.set(this.x[i], 0.12, this.z[i]), this.q.identity(), this.s.set(r, 1, r * 0.85));
      this.shadows.setMatrixAt(ns++, this.m);
    }
    for (let t = 0; t < this.meshes.length; t++) {
      this.meshes[t].instanceMatrix.needsUpdate = true;
      this.flashAttr[t].needsUpdate = true;
    }
    this.shadows.count = ns;
    this.shadows.instanceMatrix.needsUpdate = true;
  }
}
