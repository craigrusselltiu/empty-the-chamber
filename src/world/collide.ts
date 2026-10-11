import { Town, BOUND } from './town';

const out = { x: 0, z: 0, hit: false };

// Push a circle out of solid boxes, round props and live breakables. Returns a shared object.
export function collide(town: Town, x: number, z: number, r: number, props = true) {
  out.hit = false;
  for (const b of town.boxes) {
    if (x + r <= b.x0 || x - r >= b.x1 || z + r <= b.z0 || z - r >= b.z1) continue;
    const cx = Math.max(b.x0, Math.min(x, b.x1));
    const cz = Math.max(b.z0, Math.min(z, b.z1));
    let dx = x - cx;
    let dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    out.hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      x = cx + (dx / d) * r;
      z = cz + (dz / d) * r;
    } else {
      // centre inside the box: push out along the shallowest axis
      const l = x - b.x0;
      const rr = b.x1 - x;
      const t = z - b.z0;
      const bb = b.z1 - z;
      const m = Math.min(l, rr, t, bb);
      if (m === l) x = b.x0 - r;
      else if (m === rr) x = b.x1 + r;
      else if (m === t) z = b.z0 - r;
      else z = b.z1 + r;
    }
    dx = dz = 0;
  }
  if (props) {
    for (const c of town.circles) {
      const dx = x - c.x;
      const dz = z - c.z;
      const rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      x = c.x + (dx / d) * rr;
      z = c.z + (dz / d) * rr;
      out.hit = true;
    }
    for (const c of town.breakables) {
      if (!c.alive) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      x = c.x + (dx / d) * rr;
      z = c.z + (dz / d) * rr;
      out.hit = true;
    }
  }
  out.x = Math.max(-BOUND, Math.min(BOUND, x));
  out.z = Math.max(-BOUND, Math.min(BOUND, z));
  return out;
}
