import * as THREE from 'three';

// Particles, shockwave rings, beams and floating text. All pooled.
const MAXP = 1600;
const MAXR = 24;
const MAXB = 10;
const MAXN = 160;

export interface FloatText {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  life: number;
  max: number;
  scale: number;
  vy: number;
}

export class Fx {
  group = new THREE.Group();
  private pm: THREE.InstancedMesh;
  private px = new Float32Array(MAXP);
  private py = new Float32Array(MAXP);
  private pz = new Float32Array(MAXP);
  private pvx = new Float32Array(MAXP);
  private pvy = new Float32Array(MAXP);
  private pvz = new Float32Array(MAXP);
  private plife = new Float32Array(MAXP);
  private pmax = new Float32Array(MAXP);
  private psize = new Float32Array(MAXP);
  private pgrav = new Float32Array(MAXP);
  private pcol = new Float32Array(MAXP * 3);
  private pn = 0; // ring-buffer cursor
  private rings: { mesh: THREE.Mesh; life: number; max: number; r0: number; r1: number }[] = [];
  private beams: { mesh: THREE.Mesh; life: number; max: number; w: number }[] = [];
  nums: FloatText[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor() {
    const pg = new THREE.BoxGeometry(1, 1, 1);
    this.pm = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ fog: false }), MAXP);
    this.pm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 3), 3);
    this.pm.frustumCulled = false;
    this.pm.count = 0;
    this.group.add(this.pm);
    const rg = new THREE.RingGeometry(0.85, 1, 32);
    rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < MAXR; i++) {
      const mesh = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, life: 0, max: 1, r0: 0, r1: 1 });
    }
    const bg = new THREE.BoxGeometry(1, 1, 1);
    bg.translate(0, 0, 0.5);
    for (let i = 0; i < MAXB; i++) {
      const mesh = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      mesh.visible = false;
      this.group.add(mesh);
      this.beams.push({ mesh, life: 0, max: 1, w: 0.2 });
    }
  }

  particle(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, r: number, g: number, b: number, grav = -12) {
    const i = this.pn;
    this.pn = (this.pn + 1) % MAXP;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.pvx[i] = vx;
    this.pvy[i] = vy;
    this.pvz[i] = vz;
    this.plife[i] = life;
    this.pmax[i] = life;
    this.psize[i] = size;
    this.pgrav[i] = grav;
    this.pcol[i * 3] = r;
    this.pcol[i * 3 + 1] = g;
    this.pcol[i * 3 + 2] = b;
  }

  burst(x: number, y: number, z: number, n: number, speed: number, life: number, size: number, r: number, g: number, b: number, rnd: () => number, grav = -12) {
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2;
      const s = speed * (0.4 + rnd() * 0.6);
      this.particle(x, y, z, Math.cos(a) * s, rnd() * speed * 0.8, Math.sin(a) * s, life * (0.6 + rnd() * 0.4), size * (0.6 + rnd() * 0.6), r, g, b, grav);
    }
  }

  ring(x: number, z: number, r0: number, r1: number, life: number, color: THREE.Color | number) {
    let best = this.rings[0];
    for (const r of this.rings) if (r.life <= 0 || r.life < best.life) best = r;
    best.life = best.max = life;
    best.r0 = r0;
    best.r1 = r1;
    best.mesh.position.set(x, 0.14, z);
    (best.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    best.mesh.visible = true;
  }

  beam(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, life: number, color: THREE.Color | number) {
    let best = this.beams[0];
    for (const b of this.beams) if (b.life <= 0 || b.life < best.life) best = b;
    best.life = best.max = life;
    best.w = w;
    const m = best.mesh;
    m.position.set(x0, y0, z0);
    m.lookAt(x1, y1, z1);
    m.scale.set(w, w, Math.hypot(x1 - x0, y1 - y0, z1 - z0));
    (m.material as THREE.MeshBasicMaterial).color.set(color);
    m.visible = true;
  }

  num(x: number, y: number, z: number, text: string, color: string, scale = 1, life = 0.7) {
    if (this.nums.length >= MAXN) this.nums.shift();
    this.nums.push({ x, y, z, text, color, life, max: life, scale, vy: 2.2 });
  }

  update(dt: number) {
    let n = 0;
    const im = this.pm;
    const col = im.instanceColor!.array as Float32Array;
    for (let i = 0; i < MAXP; i++) {
      if (this.plife[i] <= 0) continue;
      this.plife[i] -= dt;
      if (this.plife[i] <= 0) continue;
      this.pvy[i] += this.pgrav[i] * dt;
      this.px[i] += this.pvx[i] * dt;
      this.py[i] += this.pvy[i] * dt;
      this.pz[i] += this.pvz[i] * dt;
      if (this.py[i] < 0.05) {
        this.py[i] = 0.05;
        this.pvy[i] *= -0.3;
        this.pvx[i] *= 0.7;
        this.pvz[i] *= 0.7;
      }
      const k = this.plife[i] / this.pmax[i];
      const s = this.psize[i] * (0.4 + 0.6 * k);
      this.m.compose(this.v.set(this.px[i], this.py[i], this.pz[i]), this.q, this.s.set(s, s, s));
      im.setMatrixAt(n, this.m);
      col[n * 3] = this.pcol[i * 3];
      col[n * 3 + 1] = this.pcol[i * 3 + 1];
      col[n * 3 + 2] = this.pcol[i * 3 + 2];
      n++;
    }
    im.count = n;
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor!.needsUpdate = true;

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      const k = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
      r.mesh.scale.set(rad, 1, rad);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    }
    for (const b of this.beams) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        continue;
      }
      const k = b.life / b.max;
      b.mesh.scale.x = b.mesh.scale.y = b.w * k;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = k;
    }
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const t = this.nums[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-dt * 4);
      if (t.life <= 0) this.nums.splice(i, 1);
    }
  }

  clear() {
    this.plife.fill(0);
    for (const r of this.rings) (r.life = 0), (r.mesh.visible = false);
    for (const b of this.beams) (b.life = 0), (b.mesh.visible = false);
    this.nums.length = 0;
    this.pm.count = 0;
  }
}
