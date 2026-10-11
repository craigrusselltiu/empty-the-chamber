import * as THREE from 'three';
import type { Run, WeaponState } from './run';
import { K, F } from './projectiles';
import { ENEMIES } from '../data/enemies';
import { sfx } from '../audio';

const FLASH = new THREE.Color(1, 0.7, 0.35);
const FINAL = new THREE.Color(1, 0.5, 0.15);
const MIRROR = new THREE.Color(0.9, 0.95, 1);

// Advance every weapon: cooldowns, chambers, reloads, firing.
export function tickWeapons(run: Run, dt: number) {
  if (run.ultFx.active) return;
  run.weapons.forEach((w, idx) => {
    w.t += dt;
    const size = run.chamber(w);
    if (size > 0) {
      if (w.reloadT > 0) {
        w.reloadT -= dt;
        if (w.reloadT <= 0) {
          w.ammo = size;
          sfx.reload();
        }
        return;
      }
      w.cdT -= dt * run.stats.fireRate;
      if (w.cdT > 0) return;
      const final = w.ammo <= 1 || (w.evolved && w.def.id === 'six_shooter');
      if (!fire(run, w, idx, final)) return;
      w.cdT = w.def.interval;
      w.ammo--;
      if (w.ammo <= 0) startReload(run, w);
    } else {
      w.cdT -= dt;
      if (w.def.id === 'lasso' && w.evolved) {
        lassoTick(run, w, idx, dt);
        return;
      }
      if (w.cdT > 0) return;
      if (fire(run, w, idx, false)) w.cdT = w.def.interval * run.stats.cdMul;
    }
  });
}

function startReload(run: Run, w: WeaponState) {
  let t = w.def.reload * run.stats.reloadMul;
  if (w.def.id === 'buffalo_rifle' && w.level >= 3) t *= 0.85;
  w.reloadT = w.reloadMax = t;
  const p = run.player;
  const hel = run.art('heliograph');
  if (hel) {
    const r = 2.5 + hel;
    const e = run.w.enemies;
    const n = e.query(p.x, p.z, r);
    for (let k = 0; k < n; k++) e.stun[e.hits[k]] = Math.max(e.stun[e.hits[k]], 0.6);
    run.w.fx.ring(p.x, p.z, 0.5, r, 0.3, 0xe0f0ff);
    run.w.light.flash(p.x, 1.5, p.z, MIRROR, 15, 0.2);
  }
  const det = run.art('detonator');
  if (det) {
    const i = run.w.proj.add(K.DYNAMITE, p.x, p.z, 0, 0, 0.9, 0.95 * det, 0, 0.2);
    if (i >= 0) {
      run.w.proj.y[i] = 0.15;
      run.w.proj.area[i] = 2.2;
    }
  }
}

function muzzle(run: Run, dx: number, dz: number, final: boolean) {
  const p = run.player;
  run.w.light.flash(p.x + dx * 0.6, 1.3, p.z + dz * 0.6, final ? FINAL : FLASH, final ? 40 : 10, final ? 0.25 : 0.07);
  if (final) {
    run.w.pl.shake = Math.max(run.w.pl.shake, 0.4);
    run.w.fx.burst(p.x + dx * 0.8, 1.1, p.z + dz * 0.8, 12, 7, 0.3, 0.12, 4, 2.2, 0.6, () => run.rng.next(), 0);
    run.w.fx.ring(p.x, p.z, 0.2, 1.6, 0.25, 0xffa040);
    const s = p.sprite;
    const anim = s.sheet.shoot ? 'shoot' : s.sheet.attack ? 'attack' : null;
    if (anim && !s.oneShot) s.play(anim, true);
    const lc = run.art('last_call');
    if (lc) {
      const r = 2.2 + lc * 0.7;
      run.explode(p.x, p.z, r / run.stats.area, 0.63 * lc, 0, -1, 0xfff0c0);
      sfx.bell();
    } else sfx.finalShot();
  }
}

function aim(run: Run, target: number) {
  const e = run.w.enemies;
  const p = run.player;
  const dx = e.x[target] - p.x;
  const dz = e.z[target] - p.z;
  const d = Math.hypot(dx, dz) || 1;
  return [dx / d, dz / d] as const;
}

function spread(n: number, i: number, step: number) {
  return (i - (n - 1) / 2) * step;
}

function rot(dx: number, dz: number, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [dx * c - dz * s, dx * s + dz * c] as const;
}

// Returns false when there was nothing to shoot at.
function fire(run: Run, w: WeaponState, idx: number, final: boolean): boolean {
  const p = run.player;
  const st = run.stats;
  const L = w.level - 1;
  const d = w.def;
  const pr = run.w.proj;
  const range = d.range * st.range;
  const speed = d.speed * st.projSpeed;
  const count = d.count[L] + st.projAdd;
  const pierce = d.pierce[L] + st.pierceAdd;
  const finalFlags = final ? F.FINAL : 0;
  const dmg = d.dmg[L] * (final ? 2 : 1);

  switch (d.id) {
    case 'six_shooter': {
      const t = run.nearest(p.x, p.z, range);
      if (t < 0) return false;
      const [dx, dz] = aim(run, t);
      for (let k = 0; k < count; k++) {
        const [vx, vz] = rot(dx, dz, spread(count, k, 0.12));
        pr.add(final ? K.FINAL : K.BULLET, p.x + vx * 0.5, p.z + vz * 0.5, vx * speed, vz * speed, range / speed + 0.1, dmg, pierce + (final ? 1 : 0), final ? 0.35 : 0.22, finalFlags, idx);
      }
      muzzle(run, dx, dz, final);
      if (!final) sfx.shot();
      return true;
    }
    case 'poker_chips': {
      const t = run.nearest(p.x, p.z, range);
      if (t < 0) return false;
      const [dx, dz] = aim(run, t);
      for (let k = 0; k < count; k++) {
        const [vx, vz] = rot(dx, dz, spread(count, k, 0.2));
        const i = pr.add(K.CHIP, p.x + vx * 0.5, p.z + vz * 0.5, vx * speed, vz * speed, range / speed + 0.2, dmg, 0, 0.3, finalFlags | (w.evolved ? F.EVO : 0), idx);
        if (i >= 0) pr.bounce[i] = (w.level >= 4 ? 1 : 0) + (run.rng.chance(run.art('rigged_deck') * 0.25) ? 1 : 0);
      }
      muzzle(run, dx, dz, final);
      if (!final) sfx.chip();
      return true;
    }
    case 'scattergun': {
      const t = run.nearest(p.x, p.z, range);
      if (t < 0) return false;
      const [dx, dz] = aim(run, t);
      const arc = 0.7 * d.area[L];
      for (let k = 0; k < count; k++) {
        const a = spread(count, k, arc / Math.max(1, count - 1)) + run.rng.range(-0.05, 0.05);
        const [vx, vz] = rot(dx, dz, a);
        const sp = speed * run.rng.range(0.85, 1.1);
        pr.add(K.PELLET, p.x + vx * 0.5, p.z + vz * 0.5, vx * sp, vz * sp, range / speed, dmg, pierce, 0.25, finalFlags | (w.evolved ? F.FIRE : 0), idx);
      }
      muzzle(run, dx, dz, final);
      run.w.pl.shake = Math.max(run.w.pl.shake, 0.2);
      if (!final) sfx.pellet();
      return true;
    }
    case 'buffalo_rifle': {
      const t = run.toughest(p.x, p.z, range);
      if (t < 0) return false;
      const [dx, dz] = aim(run, t);
      if (w.evolved) {
        // instant beam
        const len = 24;
        const e = run.w.enemies;
        const ids: number[] = [];
        for (let s = 0; s < len; s += 1.2) {
          const n = e.query(p.x + dx * s, p.z + dz * s, 0.7);
          for (let k = 0; k < n; k++) if (!ids.includes(e.hits[k])) ids.push(e.hits[k]);
        }
        for (const i of ids) if (e.alive[i]) run.hitEnemy(i, dmg * 1.4, finalFlags, idx, dx * 6, dz * 6);
        run.w.fx.beam(p.x, 1.1, p.z, p.x + dx * len, 1.1, p.z + dz * len, 0.5, 0.35, 0xfff0b0);
      } else {
        pr.add(K.RIFLE, p.x + dx * 0.5, p.z + dz * 0.5, dx * speed, dz * speed, range / speed + 0.1, dmg, pierce + (final ? 1 : 0), 0.3, finalFlags, idx);
      }
      muzzle(run, dx, dz, final);
      sfx.rifle();
      return true;
    }
    case 'dynamite': {
      let thrown = 0;
      for (let k = 0; k < count; k++) {
        const t = run.randomNear(p.x, p.z, range);
        if (t < 0) break;
        const e = run.w.enemies;
        const T = 0.7;
        const vx = (e.x[t] - p.x) / T;
        const vz = (e.z[t] - p.z) / T;
        const i = pr.add(K.DYNAMITE, p.x, p.z, vx, vz, T + 0.35, dmg, 0, 0.2, w.evolved ? F.EVO : 0, idx);
        if (i >= 0) {
          pr.vy[i] = 22 * T * 0.5;
          pr.area[i] = d.area[L];
          thrown++;
        }
      }
      return thrown > 0;
    }
    case 'bowie_knives': {
      if (!run.w.enemies.count) return false;
      const fx = p.fwx;
      const fz = p.fwz;
      for (let k = 0; k < count; k++) {
        const [vx, vz] = rot(fx, fz, spread(count, k, 0.18));
        const off = (k % 2 ? 1 : -1) * 0.2 * k;
        pr.add(K.KNIFE, p.x + vx * 0.5 - vz * off, p.z + vz * 0.5 + vx * off, vx * speed, vz * speed, range / speed, dmg, pierce, 0.25, (w.evolved ? F.POISON | F.EVO : 0) | (run.stats.poisonDps > 0 ? F.POISON : 0), idx);
      }
      sfx.knife();
      return true;
    }
    case 'lasso': {
      const r = d.area[L] * st.area;
      const e = run.w.enemies;
      const n = e.query(p.x, p.z, r);
      if (!n) return false;
      const ids = Array.from(e.hits.subarray(0, n));
      for (const i of ids) {
        if (!e.alive[i]) continue;
        const dx = e.x[i] - p.x;
        const dz = e.z[i] - p.z;
        const l = Math.hypot(dx, dz) || 1;
        run.hitEnemy(i, dmg, 0, idx, (dx / l) * 14, (dz / l) * 14);
      }
      run.w.fx.ring(p.x, p.z, r * 0.9, r, 0.35, 0xe0c080);
      sfx.lasso();
      return true;
    }
  }
  return false;
}

// Hangman's Noose: a permanent ring that ticks damage and drags enemies in.
function lassoTick(run: Run, w: WeaponState, idx: number, dt: number) {
  const p = run.player;
  const r = w.def.area[w.level - 1] * run.stats.area * 1.2;
  const e = run.w.enemies;
  if (Math.floor(w.t * 6) !== Math.floor((w.t - dt) * 6)) run.w.fx.ring(p.x, p.z, r, r * 1.02, 0.18, 0xe0c080);
  if (w.cdT > 0) return;
  w.cdT = 0.5;
  const n = e.query(p.x, p.z, r);
  const ids = Array.from(e.hits.subarray(0, n));
  for (const i of ids) {
    if (!e.alive[i] || ENEMIES[e.type[i]].behaviour === 'posse') continue;
    const dx = p.x - e.x[i];
    const dz = p.z - e.z[i];
    const l = Math.hypot(dx, dz) || 1;
    e.slow[i] = 0.6;
    run.hitEnemy(i, w.def.dmg[w.level - 1] * 0.6, 0, idx, (dx / l) * 3, (dz / l) * 3);
  }
}
