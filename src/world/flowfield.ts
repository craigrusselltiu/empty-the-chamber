import { Town, BOUND } from './town';

// BFS flow field on a 1-unit grid toward the player, so the horde routes around buildings.
const N = BOUND * 2;
const SIZE = N * N;
const INF = 0xffff;
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];

export class FlowField {
  blocked = new Uint8Array(SIZE);
  dist = new Uint16Array(SIZE);
  dirX = new Float32Array(SIZE);
  dirZ = new Float32Array(SIZE);
  private queue = new Int32Array(SIZE);

  constructor(town: Town) {
    for (const b of town.boxes) {
      for (let z = Math.floor(b.z0 + BOUND - 0.3); z <= Math.floor(b.z1 + BOUND + 0.3); z++)
        for (let x = Math.floor(b.x0 + BOUND - 0.3); x <= Math.floor(b.x1 + BOUND + 0.3); x++)
          if (x >= 0 && z >= 0 && x < N && z < N) this.blocked[z * N + x] = 1;
    }
    for (const c of town.circles) {
      if (c.r < 0.6) continue;
      const cx = Math.floor(c.x + BOUND);
      const cz = Math.floor(c.z + BOUND);
      if (cx >= 0 && cz >= 0 && cx < N && cz < N) this.blocked[cz * N + cx] = 1;
    }
  }

  cell(x: number, z: number) {
    const cx = Math.min(N - 1, Math.max(0, Math.floor(x + BOUND)));
    const cz = Math.min(N - 1, Math.max(0, Math.floor(z + BOUND)));
    return cz * N + cx;
  }

  build(px: number, pz: number) {
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
