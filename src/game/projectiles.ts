import * as THREE from 'three';

// Projectile pool. Collision is resolved by the run; this holds state and renders.
export const PMAX = 1200;

export const K = {
  BULLET: 0,
  FINAL: 1,
  CHIP: 2,
  PELLET: 3,
  RIFLE: 4,
  KNIFE: 5,
  DYNAMITE: 6,
  EBULLET: 7,
  SPARK: 8,
} as const;

export const F = {
  FINAL: 1,
  CRIT: 2,
  POISON: 16,
  FIRE: 32,
  EVO: 64,
} as const;

// [width, height, length, r, g, b]
const LOOK: number[][] = [
  [0.1, 0.1, 0.55, 3.0, 2.4, 1.2],
  [0.2, 0.2, 1.1, 4.0, 1.8, 0.5],
  [0.34, 0.08, 0.34, 2.6, 0.5, 0.4],
  [0.08, 0.08, 0.3, 2.6, 2.0, 1.0],
  [0.12, 0.12, 1.6, 3.2, 2.8, 1.8],
  [0.08, 0.06, 0.6, 2.2, 2.2, 2.4],
  [0.16, 0.16, 0.5, 2.0, 0.35, 0.25],
  [0.28, 0.28, 0.28, 4.0, 0.6, 0.3],
  [0.1, 0.1, 0.1, 3, 2, 1],
];

export class Projectiles {
  alive = new Uint8Array(PMAX);
  kind = new Uint8Array(PMAX);
  enemy = new Uint8Array(PMAX); // 1 = hurts the player
  x = new Float32Array(PMAX);
  y = new Float32Array(PMAX);
  z = new Float32Array(PMAX);
  vx = new Float32Array(PMAX);
  vy = new Float32Array(PMAX);
  vz = new Float32Array(PMAX);
  life = new Float32Array(PMAX);
  dmg = new Float32Array(PMAX);
  pierce = new Int16Array(PMAX);
  bounce = new Int16Array(PMAX);
  r = new Float32Array(PMAX);
  area = new Float32Array(PMAX);
  flags = new Uint8Array(PMAX);
  weapon = new Int8Array(PMAX);
  lastHit = new Uint32Array(PMAX);
  spin = new Float32Array(PMAX);
  private cursor = 0;
  mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), PMAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PMAX * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  reset() {
    this.alive.fill(0);
  }

  add(kind: number, x: number, z: number, vx: number, vz: number, life: number, dmg: number, pierce = 0, r = 0.25, flags = 0, weapon = -1) {
    for (let n = 0; n < PMAX; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % PMAX;
      if (this.alive[i]) continue;
      this.alive[i] = 1;
      this.kind[i] = kind;
      this.enemy[i] = kind === K.EBULLET ? 1 : 0;
      this.x[i] = x;
      this.y[i] = kind === K.EBULLET ? 1.0 : 1.1;
      this.z[i] = z;
      this.vx[i] = vx;
      this.vy[i] = 0;
      this.vz[i] = vz;
      this.life[i] = life;
      this.dmg[i] = dmg;
      this.pierce[i] = pierce;
      this.bounce[i] = 0;
      this.r[i] = r;
      this.area[i] = 0;
      this.flags[i] = flags;
      this.weapon[i] = weapon;
      this.lastHit[i] = 0;
      this.spin[i] = 0;
      return i;
    }
    return -1;
  }

  render() {
    const col = this.mesh.instanceColor!.array as Float32Array;
    let n = 0;
    for (let i = 0; i < PMAX; i++) {
      if (!this.alive[i]) continue;
      const L = LOOK[this.kind[i]];
      const yaw = Math.atan2(this.vx[i], this.vz[i]);
      if (this.kind[i] === K.CHIP || this.kind[i] === K.DYNAMITE) {
        this.spin[i] += 0.4;
        this.e.set(this.spin[i], yaw, 0, 'YXZ');
      } else this.e.set(0, yaw, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(this.x[i], this.y[i], this.z[i]), this.q, this.s.set(L[0], L[1], L[2]));
      this.mesh.setMatrixAt(n, this.m);
      col[n * 3] = L[3];
      col[n * 3 + 1] = L[4];
      col[n * 3 + 2] = L[5];
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

// Pickups: casings (XP), coins, floor items and chests.
export const QMAX = 1500;
export const P = {
  XP1: 0,
  XP5: 1,
  XP25: 2,
  COIN: 3,
  JERKY: 4,
  LASSO: 5,
  BOMB: 6,
  SACK: 7,
  CHEST: 8,
} as const;

const PLOOK: number[][] = [
  // w, h, d, r, g, b
  [0.12, 0.26, 0.12, 2.0, 1.4, 0.5],
  [0.16, 0.36, 0.16, 2.4, 1.6, 0.6],
  [0.24, 0.5, 0.24, 3.4, 2.2, 0.8],
  [0.32, 0.32, 0.06, 3.0, 2.4, 0.4],
  [0.5, 0.18, 0.3, 1.2, 0.45, 0.3],
  [0.5, 0.12, 0.5, 1.6, 1.2, 0.6],
  [0.16, 0.5, 0.16, 2.6, 0.3, 0.25],
  [0.5, 0.45, 0.5, 1.2, 1.0, 0.5],
  [0.9, 0.6, 0.6, 1.8, 1.0, 0.35],
];

export class Pickups {
  alive = new Uint8Array(QMAX);
  kind = new Uint8Array(QMAX);
  x = new Float32Array(QMAX);
  z = new Float32Array(QMAX);
  val = new Float32Array(QMAX);
  mag = new Uint8Array(QMAX);
  sp = new Float32Array(QMAX);
  age = new Float32Array(QMAX);
  count = 0;
  private cursor = 0;
  mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), QMAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(QMAX * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  reset() {
    this.alive.fill(0);
    this.count = 0;
  }

  add(kind: number, x: number, z: number, val: number) {
    if (this.count >= QMAX - 20 && kind <= P.XP25) {
      // pool nearly full: fold the XP into an existing casing
      for (let i = 0; i < QMAX; i++)
        if (this.alive[i] && this.kind[i] <= P.XP25) {
          this.val[i] += val;
          this.kind[i] = P.XP25;
          return;
        }
    }
    for (let n = 0; n < QMAX; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % QMAX;
      if (this.alive[i]) continue;
      this.alive[i] = 1;
      this.kind[i] = kind;
      this.x[i] = x;
      this.z[i] = z;
      this.val[i] = val;
      this.mag[i] = 0;
      this.sp[i] = 0;
      this.age[i] = 0;
      this.count++;
      return;
    }
  }

  remove(i: number) {
    this.alive[i] = 0;
    this.count--;
  }

  render(time: number) {
    const col = this.mesh.instanceColor!.array as Float32Array;
    let n = 0;
    for (let i = 0; i < QMAX; i++) {
      if (!this.alive[i]) continue;
      const k = this.kind[i];
      const L = PLOOK[k];
      const bob = k === P.CHEST ? 0 : 0.25 + Math.sin(time * 4 + i) * 0.08;
      const spin = k === P.CHEST ? 0.6 : time * 3 + i;
      this.e.set(k <= P.XP25 ? 0.5 : 0, spin, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(this.x[i], bob + L[1] / 2, this.z[i]), this.q, this.s.set(L[0], L[1], L[2]));
      this.mesh.setMatrixAt(n, this.m);
      const pulse = k === P.CHEST ? 1 + Math.sin(time * 6) * 0.3 : 1;
      col[n * 3] = L[3] * pulse;
      col[n * 3 + 1] = L[4] * pulse;
      col[n * 3 + 2] = L[5] * pulse;
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}
