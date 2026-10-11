// Coplanar-overlap check (z-fighting / flicker) for the generated world.
// Paste into the browser console on a `?debug` page (the dev server). For each seed it builds the 3x3
// cells around the start and reports every pair of same-facing triangles that lie in the same plane
// (within 2 mm) and overlap with positive area. Plants are skipped (they may cross freely).
// Expect: { coplanarOverlaps: {} }.
(async (seeds = [1, 2, 3, 5, 7, 11, 23, 42, 77, 101]) => {
  const THREE = await import('/empty-the-chamber/node_modules/.vite/deps/three.js');
  const report = {};
  let totalTris = 0;
  for (const seed of seeds) {
    world.newTown(seed);
    const town = world.town;
    const kit = town.kit;
    const keyOf = new Map(Object.entries(kit.mats).map(([k, m]) => [m, k]));
    keyOf.set(kit.roadMat, 'road');
    keyOf.set(kit.plazaMat, 'plaza');
    keyOf.set(kit.barrelMat, 'barrel');
    keyOf.set(kit.crateMat, 'crate');
    const tris = [];
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const addMesh = (mesh, mat) => {
      const tag = keyOf.get(mesh.material) ?? (mesh.material.map ? 'sign/poster' : 'other');
      if (tag === 'plant') return;
      const pos = mesh.geometry.attributes.position;
      const idx = mesh.geometry.index;
      const n = idx ? idx.count : pos.count;
      for (let t = 0; t < n; t += 3) {
        for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k).applyMatrix4(mat);
        const nn = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));
        const area = nn.length() / 2;
        if (area < 1e-5) continue;
        nn.normalize();
        if (nn.y < -0.7) continue; // undersides are never seen
        const c = v[0].clone().add(v[1]).add(v[2]).divideScalar(3);
        tris.push({ n: nn, d: nn.dot(v[0]), p: v.map((x) => x.clone()), c, tag, area });
      }
    };
    const m4 = new THREE.Matrix4();
    for (const ch of town.chunks.values()) {
      ch.group.updateMatrixWorld(true);
      ch.group.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.isInstancedMesh) return addMesh(o, o.matrixWorld);
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m4);
          if (m4.elements[0] !== 0 || m4.elements[5] !== 0) addMesh(o, m4.clone().premultiply(o.matrixWorld));
        }
      });
    }
    totalTris += tris.length;
    const buckets = new Map();
    const key = (t, dd) => `${Math.round(t.n.x * 20)},${Math.round(t.n.y * 20)},${Math.round(t.n.z * 20)},${dd}`;
    tris.forEach((t, i) => {
      const k = key(t, Math.round(t.d * 10));
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i);
    });
    const proj = (t, n) => {
      const a = Math.abs(n.x) > Math.abs(n.y) ? (Math.abs(n.x) > Math.abs(n.z) ? 0 : 2) : Math.abs(n.y) > Math.abs(n.z) ? 1 : 2;
      const ax = [[1, 2], [0, 2], [0, 1]][a];
      const pts = t.p.map((q) => [q.getComponent(ax[0]), q.getComponent(ax[1])]);
      const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
      const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
      return pts.map(([x, y]) => [cx + (x - cx) * 0.98, cy + (y - cy) * 0.98]); // shared edges don't count
    };
    const overlap = (A, B) => {
      for (const P of [A, B])
        for (let i = 0; i < 3; i++) {
          const [x0, y0] = P[i];
          const [x1, y1] = P[(i + 1) % 3];
          const nx = -(y1 - y0);
          const ny = x1 - x0;
          let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
          for (const [x, y] of A) (a0 = Math.min(a0, x * nx + y * ny)), (a1 = Math.max(a1, x * nx + y * ny));
          for (const [x, y] of B) (b0 = Math.min(b0, x * nx + y * ny)), (b1 = Math.max(b1, x * nx + y * ny));
          if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return false;
        }
      return true;
    };
    const seen = new Set();
    for (const [k, list] of buckets) {
      const [nx, ny, nz, dd] = k.split(',').map(Number);
      const near = [...list];
      for (const o of [-1, 1]) near.push(...(buckets.get(`${nx},${ny},${nz},${dd + o}`) ?? []));
      for (let i = 0; i < near.length; i++)
        for (let j = i + 1; j < near.length; j++) {
          let A = tris[near[i]];
          let B = tris[near[j]];
          if (A.area < B.area) [A, B] = [B, A];
          if (A.n.dot(B.n) < 0.995) continue;
          // distance from the smaller triangle's centre to the bigger one's plane (precise far from the origin)
          if (Math.abs(A.n.dot(B.c.clone().sub(A.p[0]))) > 0.002) continue;
          if (!overlap(proj(A, A.n), proj(B, A.n))) continue;
          const id = Math.min(near[i], near[j]) + '-' + Math.max(near[i], near[j]);
          if (seen.has(id)) continue;
          seen.add(id);
          const tag = [A.tag, B.tag].sort().join(' + ');
          (report[tag] ??= []).push({ seed, at: A.c.toArray().map((x) => +x.toFixed(2)) });
        }
    }
  }
  return { seeds: seeds.length, totalTris, coplanarOverlaps: report };
})();
