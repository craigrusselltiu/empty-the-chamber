import { Town } from './town';

const out = { x: 0, z: 0, hit: false };

// Push a circle out of solid boxes, round props and live breakables. Returns a shared object.
export function collide(town: Town, x: number, z: number, r: number, props = true) {
  out.hit = false;
  const near = town.at(x, z);
  for (const b of near.boxes) {
    if (x + r <= b.x0 || x - r >= b.x1 || z + r <= b.z0 || z - r >= b.z1) continue;
    // into the box's frame
    const dx = x - b.cx;
    const dz = z - b.cz;
    let lx = dx * b.c - dz * b.s;
    let lz = dx * b.s + dz * b.c;
    const qx = Math.max(-b.hx, Math.min(lx, b.hx));
    const qz = Math.max(-b.hz, Math.min(lz, b.hz));
    const ex = lx - qx;
    const ez = lz - qz;
    const d2 = ex * ex + ez * ez;
    if (d2 >= r * r) continue;
    out.hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      lx = qx + (ex / d) * r;
      lz = qz + (ez / d) * r;
    } else {
      // centre inside the box: push out along the shallowest axis
      const px = b.hx - Math.abs(lx);
      const pz = b.hz - Math.abs(lz);
      if (px < pz) lx = Math.sign(lx || 1) * (b.hx + r);
      else lz = Math.sign(lz || 1) * (b.hz + r);
    }
    x = b.cx + lx * b.c + lz * b.s;
    z = b.cz - lx * b.s + lz * b.c;
  }
  if (props) {
    for (const c of near.circles) {
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
    for (const c of near.breaks) {
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
  out.x = x;
  out.z = z;
  return out;
}
