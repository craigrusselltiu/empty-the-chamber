import { Town, inBox } from './town';

// BFS flow field toward the player on a 1-unit grid that moves with them, so the horde routes
// around buildings. Cells outside the grid map to one extra open cell with no direction.
const N = 96;
const SIZE = N * N;
const INF = 0xffff;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

export class FlowField {
  blocked = new Uint8Array(SIZE + 1);
  dist = new Uint16Array(SIZE + 1);
  dirX = new Float32Array(SIZE + 1);
  dirZ = new Float32Array(SIZE + 1);
  private queue = new Int32Array(SIZE);
  private ox = 0; // world position of cell (0, 0)
  private oz = 0;

  constructor(private town: Town) {}

  cell(x: number, z: number) {
    const cx = Math.floor(x - this.ox);
    const cz = Math.floor(z - this.oz);
    return cx < 0 || cz < 0 || cx >= N || cz >= N ? SIZE : cz * N + cx;
  }

  private rasterize() {
    const { blocked, ox, oz } = this;
    blocked.fill(0);
    for (const ch of this.town.chunks.values()) {
      for (const b of ch.boxes) {
        const x0 = Math.max(0, Math.floor(b.x0 - ox - 0.3));
        const x1 = Math.min(N - 1, Math.floor(b.x1 - ox + 0.3));
        const z0 = Math.max(0, Math.floor(b.z0 - oz - 0.3));
        const z1 = Math.min(N - 1, Math.floor(b.z1 - oz + 0.3));
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) if (inBox(b, ox + x + 0.5, oz + z + 0.5, 0.8)) blocked[z * N + x] = 1;
      }
      for (const c of ch.circles) {
        if (c.r < 0.6) continue;
        const i = this.cell(c.x, c.z);
        if (i < SIZE) blocked[i] = 1;
      }
    }
  }

  build(px: number, pz: number) {
    this.ox = Math.round(px) - N / 2;
    this.oz = Math.round(pz) - N / 2;
    this.rasterize();
    const { dist, blocked, queue, dirX, dirZ } = this;
    dist.fill(INF);
    const start = this.cell(px, pz);
    let head = 0;
    let tail = 0;
    dist[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const c = queue[head++];
      const cx = c % N;
      const cz = (c / N) | 0;
      const d = dist[c] + 1;
      for (let k = 0; k < 4; k++) {
        const nx = cx + DX[k];
        const nz = cz + DZ[k];
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const n = nz * N + nx;
        if (blocked[n] || dist[n] <= d) continue;
        dist[n] = d;
        queue[tail++] = n;
      }
    }
    // steepest descent over 8 neighbours (diagonals only when both sides are open)
    for (let c = 0; c < SIZE; c++) {
      dirX[c] = 0;
      dirZ[c] = 0;
      if (dist[c] === INF || dist[c] === 0) continue;
      const cx = c % N;
      const cz = (c / N) | 0;
      let best = dist[c];
      let bx = 0;
      let bz = 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k];
        const nz = cz + DZ[k];
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const n = nz * N + nx;
        if (k >= 4 && (blocked[cz * N + nx] || blocked[nz * N + cx])) continue;
        const v = dist[n] + (k >= 4 ? 0.4 : 0);
        if (v < best) {
          best = v;
          bx = DX[k];
          bz = DZ[k];
        }
      }
      const l = Math.hypot(bx, bz) || 1;
      dirX[c] = bx / l;
      dirZ[c] = bz / l;
    }
  }
}
