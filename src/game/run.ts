import * as THREE from 'three';
import { World } from './world';
import { Player } from './player';
import { Rng } from '../rng';
import { CharDef } from '../data/characters';
import { ENEMIES, enemyIndex } from '../data/enemies';
import { EVENTS, MIX, RUN_LENGTH, MAX_ENEMIES, hpScale, dmgScale, spawnRate } from '../data/waves';
import { WeaponDef, weaponById, MAX_WEAPON_LEVEL } from '../data/weapons';
import { computeStats, Stats } from './stats';
import { K, F, P, PMAX, QMAX } from './projectiles';
import { MAX } from './enemies';
import { Breakable, inBox } from '../world/town';
import { collide } from '../world/collide';
import { sfx } from '../audio';
import { input } from '../input';
import { rank } from '../save';
import { tickWeapons } from './weapons';
import { Ult } from './ult';

export interface WeaponState {
  def: WeaponDef;
  level: number;
  evolved: boolean;
  ammo: number;
  reloadT: number;
  reloadMax: number;
  cdT: number;
  t: number;
}

interface Zone {
  x: number;
  z: number;
  r: number;
  life: number;
  dps: number;
  tick: number;
}

interface Delayed {
  t: number;
  x: number;
  z: number;
  r: number;
  dmg: number;
}

const ORANGE = new THREE.Color(1, 0.55, 0.2);
const WHITE = new THREE.Color(1, 0.95, 0.85);
const tmpC = new THREE.Color();

export const xpNeed = (lv: number) => (lv < 20 ? 5 + (lv - 1) * 10 : 195 + (lv - 20) * 14);

export class Run {
  w: World;
  ch: CharDef;
  rng: Rng;
  seed: number;
  player: Player;
  time = 0;
  timeScale = 1;
  hp: number;
  iframes = 0;
  xp = 0;
  level = 1;
  xpNext = xpNeed(1);
  gold = 0;
  kills = 0;
  nightKills = 0;
  casings = 0;
  ult = 0;
  stats!: Stats;
  weapons: WeaponState[] = [];
  artifacts = new Map<string, number>();
  banished = new Set<string>();
  rerolls: number;
  skips = 3;
  banishes: number;
  revives: number;
  pendingLevels = 0;
  chests: string[][] = []; // results waiting to be shown
  dead = false;
  survived = false;
  bonusHp = 0;
  outlawT = 0;
  outlawStacks = 0;
  zones: Zone[] = [];
  delayed: Delayed[] = [];
  wind = { x: 0, z: 0, t: 0, warn: 0 };
  bossIdx = -1;
  bossT = 4;
  bossMove = 0;
  banner = { text: '', sub: '', t: 0 };
  ultFx: Ult;
  private evIdx = 0;
  private spawnAcc = 0;
  private ffT = 0;
  private recycleT = 1;
  private posseT = 0;

  constructor(w: World, ch: CharDef, seed: number) {
    this.w = w;
    this.ch = ch;
    this.seed = seed;
    this.rng = new Rng(seed);
    w.reset();
    this.player = new Player(w.sheets[ch.id], w.models[ch.id], new THREE.Color(...ch.outline), ch.size ?? 1);
    this.player.x = w.town.start.x; // start on the first crossing
    this.player.z = w.town.start.z;
    w.scene.add(this.player.sprite.mesh, this.player.model.root, this.player.shadow);
    this.rerolls = 3 + rank('fortune');
    this.banishes = 3 + rank('slate');
    this.revives = rank('second_wind');
    this.addWeapon(ch.weapon);
    this.artifacts.set(ch.artifact, 1);
    this.recompute();
    this.hp = this.stats.maxHp;
    this.ultFx = new Ult(this);
    w.ff.build(this.player.x, this.player.z);
  }

  dispose() {
    this.w.scene.remove(this.player.sprite.mesh, this.player.model.root, this.player.shadow);
  }

  get elapsed01() {
    return Math.min(1, this.time / RUN_LENGTH);
  }

  recompute() {
    const old = this.stats?.maxHp ?? 0;
    this.stats = computeStats(this.ch, this.artifacts, this.bonusHp);
    if (old && this.stats.maxHp > old) this.hp += this.stats.maxHp - old;
    this.hp = Math.min(this.hp ?? this.stats.maxHp, this.stats.maxHp);
    for (const w of this.weapons) w.ammo = Math.min(w.ammo, this.chamber(w));
  }

  chamber(w: WeaponState) {
    return w.def.chamber > 0 ? w.def.chamber + this.stats.chamberAdd : 0;
  }

  addWeapon(id: string) {
    const def = weaponById(id);
    const w: WeaponState = { def, level: 1, evolved: false, ammo: 0, reloadT: 0, reloadMax: 1, cdT: 0.3, t: 0 };
    this.weapons.push(w);
    w.ammo = def.chamber > 0 ? def.chamber + (this.stats?.chamberAdd ?? 0) : 0;
  }

  art(id: string) {
    return this.artifacts.get(id) ?? 0;
  }

  trait(t: string) {
    return this.stats.traits[t] ?? 0;
  }

  banner_(text: string, sub = '', t = 2.5) {
    this.banner.text = text;
    this.banner.sub = sub;
    this.banner.t = t;
  }

  // ---- targeting ----------------------------------------------------------

  nearest(x: number, z: number, range: number, skipUid = 0) {
    const e = this.w.enemies;
    let best = -1;
    let bd = range * range;
    for (let i = 0; i < MAX; i++) {
      if (!e.alive[i] || e.uid[i] === skipUid || ENEMIES[e.type[i]].behaviour === 'posse') continue;
      const d = (e.x[i] - x) ** 2 + (e.z[i] - z) ** 2;
      if (d < bd) (bd = d), (best = i);
    }
    return best;
  }

  toughest(x: number, z: number, range: number) {
    const e = this.w.enemies;
    let best = -1;
    let bh = 0;
    const r2 = range * range;
    for (let i = 0; i < MAX; i++) {
      if (!e.alive[i] || ENEMIES[e.type[i]].behaviour === 'posse') continue;
      if ((e.x[i] - x) ** 2 + (e.z[i] - z) ** 2 > r2) continue;
      if (e.hp[i] > bh) (bh = e.hp[i]), (best = i);
    }
    return best;
  }

  randomNear(x: number, z: number, range: number) {
    const n = this.w.enemies.query(x, z, range);
    if (!n) return -1;
    const i = this.w.enemies.hits[this.rng.int(n)];
    return ENEMIES[this.w.enemies.type[i]].behaviour === 'posse' ? -1 : i;
  }

  // ---- damage -------------------------------------------------------------

  // Returns true if the enemy died.
  hitEnemy(i: number, base: number, flags: number, weapon: number, kbx = 0, kbz = 0) {
    const e = this.w.enemies;
    const def = ENEMIES[e.type[i]];
    if (def.behaviour === 'posse') return false;
    const s = this.stats;
    let d = base * s.dmg * (1 + Math.min(0.2, this.outlawStacks * 0.02));
    if (this.trait('Dead Man Walking') >= 3 && this.hp < this.stats.maxHp * 0.3) d *= 2;
    let crit = (flags & F.CRIT) !== 0 || this.rng.chance(s.crit);
    if (flags & F.FINAL && this.art('dead_mans_hand')) {
      crit = true;
      e.vuln[i] = Math.max(e.vuln[i], 1.5 * this.art('dead_mans_hand'));
    }
    if (crit) d *= s.critMul;
    if (flags & F.FINAL && (def.elite || def.boss)) d *= 1 + this.art('silver_bullet');
    if (e.vuln[i] > 0) d *= 1.5;
    if (flags & F.FINAL && this.trait('Sniper') >= 3 && !def.elite && !def.boss) d = Math.max(d, e.hp[i]);
    e.hp[i] -= d;
    e.flash[i] = 1;
    const m = 1 / def.mass;
    e.kx[i] += kbx * m;
    e.kz[i] += kbz * m;
    if (flags & F.POISON || s.poisonDps > 0) {
      const dps = (flags & F.EVO ? 0.53 : 0) + s.poisonDps + (flags & F.POISON ? 0.16 : 0);
      if (dps > 0) {
        e.poison[i] = Math.max(e.poison[i], dps);
        e.poisonT[i] = 3;
      }
    }
    // keep numbers readable in a crowd: drop plain hits when the screen is busy
    const big = flags & F.FINAL;
    if (big || crit || this.w.fx.nums.length < 60)
      this.w.fx.num(e.x[i], 1.6 + def.r, e.z[i], Math.max(1, Math.round(d)) + (crit ? '!' : ''), big ? '#ffa040' : crit ? '#ffe060' : '#ffffff', big && d >= 2 ? 1.5 : 1, big ? 0.9 : 0.6);
    sfx.hit();
    if (e.hp[i] <= 0) {
      this.kill(i, flags, weapon);
      return true;
    }
    return false;
  }

  kill(i: number, flags: number, weapon: number) {
    const e = this.w.enemies;
    const def = ENEMIES[e.type[i]];
    const x = e.x[i];
    const z = e.z[i];
    const pk = this.w.pick;
    const r = this.rng;
    // drops
    const xp = def.xp * (e.size[i] < 1 ? 0.5 : 1);
    if (xp > 0) pk.add(xp >= 25 ? P.XP25 : xp >= 5 ? P.XP5 : P.XP1, x, z, Math.max(1, xp));
    if (def.gold) {
      const n = Math.min(12, Math.ceil(def.gold / 5));
      for (let k = 0; k < n; k++) pk.add(P.COIN, x + r.range(-1, 1), z + r.range(-1, 1), def.gold / n);
    } else if (r.chance(0.015 * (1 + this.stats.luck))) pk.add(P.COIN, x + 0.3, z, 1);
    if (def.elite || def.boss) pk.add(P.CHEST, x, z, def.boss ? 3 : 1);
    if (def.boss) {
      this.banner_('DUSTY DAN FALLS', 'The trail goes quiet. For now.');
      this.bossIdx = -1;
      this.w.pl.flash = 0.8;
      this.w.pl.flashColor.setRGB(1, 0.85, 0.6);
    }
    // splitters
    const typ = e.type[i];
    const size = e.size[i];
    const hpm = hpScale(this.time);
    // fx
    tmpC.setRGB(0.8, 0.62, 0.42);
    this.w.fx.burst(x, 0.6, z, def.elite || def.boss ? 30 : 6, def.elite ? 8 : 4, 0.5, def.elite ? 0.3 : 0.16, tmpC.r, tmpC.g, tmpC.b, () => r.next(), -6);
    // poison spread (Sidewinder Fangs)
    const poisoned = e.poison[i] > 0 && e.poisonT[i] > 0;
    e.remove(i);
    if (def.behaviour === 'split' && size >= 1) {
      for (let k = 0; k < 2; k++) e.spawn(typ, x + r.range(-0.6, 0.6), z + r.range(-0.6, 0.6), hpm * 0.6, 0.6);
    }
    if (def.id === 'golem') {
      const tw = enemyIndex.tumbleweed;
      for (let k = 0; k < 6; k++) e.spawn(tw, x + Math.cos(k) * 1.5, z + Math.sin(k) * 1.5, hpm, 1);
    }
    if (poisoned && this.weapons.some((w) => w.def.id === 'bowie_knives' && w.evolved)) {
      const n = e.query(x, z, 2.5);
      for (let k = 0; k < n; k++) {
        const j = e.hits[k];
        e.poison[j] = Math.max(e.poison[j], 12);
        e.poisonT[j] = 3;
      }
      this.w.fx.ring(x, z, 0.3, 2.5, 0.4, 0x60ff40);
    }
    // bookkeeping
    this.kills++;
    if (this.time >= 600) this.nightKills++;
    this.ult = Math.min(this.ch.ultCharge, this.ult + Math.max(0.5, def.xp * 0.6) + this.stats.ultPerKill * 0.5);
    if (this.trait('Outlaw') >= 2) {
      this.outlawStacks = Math.min(10, this.outlawStacks + 1);
      this.outlawT = 4;
    }
    if (this.trait('Undertaker') >= 2 && this.kills % 50 === 0 && this.bonusHp < 50) {
      this.bonusHp++;
      this.recompute();
    }
    if (flags & F.FINAL && weapon >= 0 && this.art('kill_confirmed') && r.chance(this.art('kill_confirmed') / 3)) {
      const w = this.weapons[weapon];
      if (w && w.reloadT > 0) {
        w.reloadT = 0;
        w.ammo = this.chamber(w);
        this.w.fx.num(this.player.x, 2.6, this.player.z, 'RELOADED', '#9ad0ff', 1, 0.7);
        sfx.reload();
      }
    }
  }

  explode(x: number, z: number, r: number, dmg: number, flags = 0, weapon = -1, color: THREE.Color | number = 0xffa040) {
    const e = this.w.enemies;
    const rr = r * this.stats.area;
    const n = e.query(x, z, rr);
    const ids = Array.from(e.hits.subarray(0, n));
    for (const i of ids) {
      if (!e.alive[i]) continue;
      const dx = e.x[i] - x;
      const dz = e.z[i] - z;
      const d = Math.hypot(dx, dz) || 1;
      this.hitEnemy(i, dmg, flags, weapon, (dx / d) * 10, (dz / d) * 10);
    }
    this.smashIn(x, z, rr);
    const fx = this.w.fx;
    fx.ring(x, z, 0.3, rr, 0.35, color);
    fx.burst(x, 0.5, z, 18, rr * 4, 0.5, 0.22, 3.5, 1.6, 0.4, () => this.rng.next(), -8);
    fx.burst(x, 0.3, z, 10, rr * 2, 0.9, 0.35, 0.4, 0.35, 0.32, () => this.rng.next(), 2);
    this.w.light.flash(x, 1.2, z, ORANGE, 30, 0.35);
    this.w.pl.shake = Math.max(this.w.pl.shake, 0.4);
    sfx.boom();
    if (this.trait('Sapper') >= 3) this.zones.push({ x, z, r: rr * 0.6, life: 2, dps: 0.42, tick: 0 });
  }

  smashIn(x: number, z: number, r: number) {
    for (const b of this.w.town.breaksIn(x, z, r, hitBreaks)) this.smash(b);
  }

  smash(b: Breakable) {
    this.w.town.smash(b);
    const r = this.rng;
    this.w.fx.burst(b.x, 0.6, b.z, 12, 5, 0.7, 0.18, 0.7, 0.45, 0.25, () => r.next());
    const k = r.next();
    if (k < 1 / 6) {
      const item = r.next();
      this.w.pick.add(item < 0.4 ? P.JERKY : item < 0.65 ? P.SACK : item < 0.8 ? P.LASSO : P.BOMB, b.x, b.z, 1);
    } else if (k < 0.35) this.w.pick.add(P.COIN, b.x, b.z, 1);
  }

  dmgLog: Record<string, number> = {};

  hurt(d: number, sx: number, sz: number, src = 'bullet') {
    if (this.iframes > 0 || this.ultFx.invuln || this.dead) return;
    d = Math.max(1, d - this.stats.armor - (this.trait('Dead Man Walking') >= 2 ? 1 : 0));
    this.hp -= d;
    this.dmgLog[src] = (this.dmgLog[src] ?? 0) + d;
    this.iframes = 0.55;
    this.ult = Math.min(this.ch.ultCharge, this.ult + d * 0.25);
    const p = this.player;
    p.flash = 1;
    const dx = p.x - sx;
    const dz = p.z - sz;
    const l = Math.hypot(dx, dz) || 1;
    if (p.hasHit) {
      if (p.sprite.oneShot !== 'shoot') p.sprite.play('hit', true);
    } else {
      p.knockX += (dx / l) * 9;
      p.knockZ += (dz / l) * 9;
    }
    this.w.pl.shake = Math.max(this.w.pl.shake, 0.5);
    sfx.hurt();
    if (this.hp <= 0) {
      if (this.revives > 0) {
        this.revives--;
        this.hp = this.stats.maxHp * 0.5;
        this.iframes = 2;
        this.banner_('SECOND WIND', '', 1.5);
        this.explode(p.x, p.z, 5, 10.5);
      } else {
        this.hp = 0;
        this.dead = true;
      }
    }
  }

  // ---- spawning -----------------------------------------------------------

  private ringPoint(r0: number, r1: number) {
    const p = this.player;
    for (let k = 0; k < 8; k++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = this.rng.range(r0, r1);
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (this.w.ff.blocked[this.w.ff.cell(x, z)]) continue;
      return [x, z];
    }
    return null;
  }

  private spawnMix() {
    let mix = MIX[0][1];
    for (const [t, m] of MIX) if (this.time >= t) mix = m;
    let total = 0;
    for (const k in mix) total += mix[k];
    let pick = this.rng.next() * total;
    for (const k in mix) {
      pick -= mix[k];
      if (pick <= 0) return k;
    }
    return 'coyote';
  }

  // Spawns one enemy (or a pack) and returns how many it spawned.
  private spawnOne() {
    const id = this.spawnMix();
    const pt = this.ringPoint(17, 21);
    if (!pt) return 1;
    const t = enemyIndex[id];
    const hpm = hpScale(this.time);
    const pack = ENEMIES[t].behaviour === 'swarm' ? 2 + this.rng.int(2) : 1;
    for (let k = 0; k < pack; k++) this.w.enemies.spawn(t, pt[0] + this.rng.range(-1, 1), pt[1] + this.rng.range(-1, 1), hpm);
    return pack;
  }

  private event(ev: (typeof EVENTS)[number]) {
    const e = this.w.enemies;
    const hpm = hpScale(this.time);
    if (ev.kind === 'rush') {
      // a stampede comes from one side, in a 120 degree arc
      const t = enemyIndex[ev.enemy];
      const base = this.rng.next() * Math.PI * 2;
      for (let k = 0; k < ev.n; k++) {
        const a = base + (k / ev.n - 0.5) * (Math.PI * 2) / 3;
        const rr = 17 + (k % 3) * 1.5;
        const x = this.player.x + Math.cos(a) * rr;
        const z = this.player.z + Math.sin(a) * rr;
        if (!this.w.ff.blocked[this.w.ff.cell(x, z)]) e.spawn(t, x, z, hpm);
      }
      this.banner_('STAMPEDE!', '', 1.5);
      sfx.warn();
    } else if (ev.kind === 'elite' || ev.kind === 'boss') {
      const pt = this.ringPoint(14, 17);
      if (!pt) return;
      const t = enemyIndex[ev.enemy];
      const idx = e.spawn(t, pt[0], pt[1], ev.kind === 'boss' ? 1 + this.time / 600 : hpm * 0.6);
      if (ev.kind === 'boss') {
        this.bossIdx = idx;
        this.banner_(ENEMIES[t].name, 'The Outlaw of the Dusty Trail', 3);
      } else this.banner_(ENEMIES[t].name.toUpperCase(), 'Elite', 2);
      sfx.warn();
    } else {
      this.survived = true;
      this.banner_("IRON EYE'S POSSE RIDES IN", 'You survived. Now run.', 4);
      this.spawnPosse(8);
      sfx.warn();
    }
  }

  private spawnPosse(n: number) {
    const t = enemyIndex.posse;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + this.rng.next();
      this.w.enemies.spawn(t, this.player.x + Math.cos(a) * 20, this.player.z + Math.sin(a) * 20, 1);
    }
  }

  // ---- main step ----------------------------------------------------------

  update(realDt: number) {
    this.ultFx.update(realDt);
    const dt = realDt * this.timeScale;
    this.time += dt;
    const w = this.w;
    const p = this.player;
    const e = w.enemies;
    const s = this.stats;

    if (input.ult) {
      input.ult = false;
      this.ultFx.tryStart();
    }

    // player
    this.iframes = Math.max(0, this.iframes - dt);
    this.hp = Math.min(s.maxHp, this.hp + s.regen * dt);
    this.outlawT -= dt;
    if (this.outlawT <= 0) this.outlawStacks = 0;
    const lock = this.ultFx.active ? 0 : 1;
    p.update(dt, input.mx * lock, input.my * lock, s.speed, w.pl, w.town);
    if (this.wind.warn > 0) {
      this.wind.warn -= dt;
    } else if (this.wind.t > 0) {
      this.wind.t -= dt;
      const c = collide(w.town, p.x + this.wind.x * dt, p.z + this.wind.z * dt, p.r);
      p.x = c.x;
      p.z = c.z;
      if (this.rng.chance(0.6)) {
        const a = this.rng.range(-10, 10);
        w.fx.particle(p.x - this.wind.x * 3 + a * this.wind.z * 0.1 * 10, 0.3 + this.rng.next(), p.z - this.wind.z * 3 + a * this.wind.x, this.wind.x * 6, 0, this.wind.z * 6, 1.2, 0.12, 0.9, 0.75, 0.55, 0);
      }
    }

    // flow field and enemies
    this.ffT -= dt;
    if (this.ffT <= 0) {
      this.ffT = 0.25;
      w.ff.build(p.x, p.z);
    }
    e.rebuildHash();
    e.move(dt, p.x, p.z, w.ff, w.town, this.time);
    e.rebuildHash();
    this.enemyActions(dt);

    // contact damage
    const n = e.query(p.x, p.z, p.r);
    for (let k = 0; k < n; k++) {
      const i = e.hits[k];
      const def = ENEMIES[e.type[i]];
      if (def.behaviour === 'fly' && e.y[i] > 2.2) continue;
      this.hurt(def.dmg * dmgScale(this.time), e.x[i], e.z[i], def.id);
      if (this.trait('Sheriff') >= 3 && e.alive[i]) this.hitEnemy(i, (def.dmg * 0.5) / 19, 0, -1); // contact damage is on the player's HP scale
    }

    tickWeapons(this, dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateStatus(dt);

    // spawning
    if (!this.ultFx.active) {
      this.spawnAcc += spawnRate(this.time) * dt;
      while (this.spawnAcc >= 1) this.spawnAcc -= e.count < MAX_ENEMIES - 40 ? this.spawnOne() : 1;
    }
    while (this.evIdx < EVENTS.length && EVENTS[this.evIdx].t <= this.time) this.event(EVENTS[this.evIdx++]);
    if (this.survived) {
      this.posseT -= dt;
      if (this.posseT <= 0) {
        this.posseT = 6;
        this.spawnPosse(4);
      }
    }
    // recycle stragglers left far behind
    this.recycleT -= dt;
    if (this.recycleT <= 0) {
      this.recycleT = 1;
      for (let i = 0; i < MAX; i++) {
        if (!e.alive[i]) continue;
        const def = ENEMIES[e.type[i]];
        if (def.boss || def.elite) continue;
        if ((e.x[i] - p.x) ** 2 + (e.z[i] - p.z) ** 2 < 32 * 32) continue;
        const pt = this.ringPoint(17, 21);
        if (pt) (e.x[i] = pt[0]), (e.z[i] = pt[1]);
      }
    }

    // levels
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpNeed(this.level);
      this.pendingLevels++;
      w.fx.ring(p.x, p.z, 0.5, 4, 0.5, 0xffd04a);
      w.fx.burst(p.x, 1, p.z, 24, 6, 0.8, 0.12, 3, 2.4, 0.6, () => this.rng.next(), -4);
      w.light.flash(p.x, 2, p.z, ORANGE, 25, 0.5);
      w.pl.flash = Math.max(w.pl.flash, 0.25);
      w.pl.flashColor.setRGB(1, 0.85, 0.5);
    }
    if (this.banner.t > 0) this.banner.t -= realDt;
    w.fx.update(dt);
    w.pl.shake = Math.max(0, w.pl.shake - realDt * 2.5);
    w.pl.flash = Math.max(0, w.pl.flash - realDt * 2);
  }

  private enemyActions(dt: number) {
    const e = this.w.enemies;
    const p = this.player;
    const pr = this.w.proj;
    for (let i = 0; i < MAX; i++) {
      if (!e.alive[i]) continue;
      const def = ENEMIES[e.type[i]];
      if (def.behaviour === 'ranged') {
        e.shootT[i] -= dt;
        const dx = p.x - e.x[i];
        const dz = p.z - e.z[i];
        const d = Math.hypot(dx, dz);
        if (e.shootT[i] <= 0 && d < 11 && e.stun[i] <= 0) {
          e.shootT[i] = 2.8;
          pr.add(K.EBULLET, e.x[i], e.z[i], (dx / d) * 6.5, (dz / d) * 6.5, 3, def.dmg * dmgScale(this.time), 0, 0.3);
          this.w.light.flash(e.x[i], 1.2, e.z[i], ORANGE, 8, 0.1);
        }
      } else if (def.behaviour === 'devil') {
        const dx = e.x[i] - p.x;
        const dz = e.z[i] - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 7 && d > 0.5) {
          const c = collide(this.w.town, p.x + (dx / d) * 1.7 * dt, p.z + (dz / d) * 1.7 * dt, p.r);
          p.x = c.x;
          p.z = c.z;
        }
        if (this.rng.chance(0.5)) {
          const a = this.rng.next() * 6.28;
          this.w.fx.particle(e.x[i] + Math.cos(a) * 1.4, this.rng.range(0.2, 3), e.z[i] + Math.sin(a) * 1.4, -Math.sin(a) * 5, 1, Math.cos(a) * 5, 0.6, 0.14, 0.9, 0.75, 0.55, 0);
        }
      } else if (def.boss && i === this.bossIdx) {
        this.bossAI(i, dt);
      }
      if (e.poisonT[i] > 0 && this.rng.chance(0.08)) {
        this.w.fx.particle(e.x[i], 1.2, e.z[i], 0, 1.5, 0, 0.5, 0.12, 0.4, 2.2, 0.3, 0);
      }
    }
  }

  private bossAI(i: number, dt: number) {
    const e = this.w.enemies;
    this.bossT -= dt;
    if (this.bossT > 0) return;
    this.bossT = 3.4;
    const move = this.bossMove++ % 3;
    if (move === 0) {
      const off = this.rng.next();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + off;
        this.w.proj.add(K.EBULLET, e.x[i], e.z[i], Math.cos(a) * 6, Math.sin(a) * 6, 4, 14, 0, 0.35);
      }
      this.w.light.flash(e.x[i], 2, e.z[i], ORANGE, 25, 0.3);
      sfx.pellet();
    } else if (move === 1) {
      const v = enemyIndex.vulture;
      for (let k = 0; k < 3; k++) e.spawn(v, e.x[i] + this.rng.range(-2, 2), e.z[i] + this.rng.range(-2, 2), hpScale(this.time));
      this.w.fx.num(e.x[i], 4, e.z[i], 'CIRCLE, BOYS!', '#ffb070', 1, 1.2);
    } else {
      const dir = this.rng.int(4);
      this.wind.x = [1, -1, 0, 0][dir] * 3.6;
      this.wind.z = [0, 0, 1, -1][dir] * 3.6;
      this.wind.warn = 0.9;
      this.wind.t = 2.6;
      this.banner_('GRAVITY SHIFT!', '', 1.4);
      sfx.warn();
    }
  }

  private updateProjectiles(dt: number) {
    const pr = this.w.proj;
    const e = this.w.enemies;
    const p = this.player;
    const town = this.w.town;
    for (let i = 0; i < PMAX; i++) {
      if (!pr.alive[i]) continue;
      pr.life[i] -= dt;
      const kind = pr.kind[i];
      if (kind === K.DYNAMITE) {
        if (pr.y[i] > 0.15) {
          pr.vy[i] -= 22 * dt;
          pr.x[i] += pr.vx[i] * dt;
          pr.z[i] += pr.vz[i] * dt;
          pr.y[i] += pr.vy[i] * dt;
          if (pr.y[i] <= 0.15) (pr.y[i] = 0.15), (pr.vx[i] = pr.vz[i] = 0);
        } else if (this.rng.chance(0.5)) this.w.fx.particle(pr.x[i], 0.45, pr.z[i], 0, 2, 0, 0.25, 0.08, 4, 2.5, 0.5, 0);
        if (pr.life[i] <= 0) {
          pr.alive[i] = 0;
          this.explode(pr.x[i], pr.z[i], pr.area[i], pr.dmg[i], pr.flags[i], pr.weapon[i]);
          if (pr.flags[i] & F.EVO) {
            for (let k = 0; k < 3; k++) {
              const a = this.rng.next() * 6.28;
              this.delayed.push({ t: 0.25 + k * 0.1, x: pr.x[i] + Math.cos(a) * 2.2, z: pr.z[i] + Math.sin(a) * 2.2, r: pr.area[i] * 0.7, dmg: pr.dmg[i] * 0.6 });
            }
          }
        }
        continue;
      }
      if (pr.life[i] <= 0) {
        pr.alive[i] = 0;
        continue;
      }
      pr.x[i] += pr.vx[i] * dt;
      pr.z[i] += pr.vz[i] * dt;
      const x = pr.x[i];
      const z = pr.z[i];
      // walls
      const near = town.at(x, z);
      let wall = false;
      for (const b of near.boxes)
        if (inBox(b, x, z)) {
          wall = true;
          break;
        }
      if (wall) {
        pr.alive[i] = 0;
        this.w.fx.burst(x, 1, z, 3, 3, 0.25, 0.08, 3, 2.2, 1, () => this.rng.next());
        continue;
      }
      if (pr.enemy[i]) {
        if ((x - p.x) ** 2 + (z - p.z) ** 2 < (pr.r[i] + p.r) ** 2) {
          pr.alive[i] = 0;
          this.hurt(pr.dmg[i], x, z);
        }
        continue;
      }
      // breakables
      for (const br of near.breaks) {
        if (br.alive && (br.x - x) ** 2 + (br.z - z) ** 2 < (br.r + pr.r[i]) ** 2) {
          this.smash(br);
          break;
        }
      }
      // enemies
      const n = e.query(x, z, pr.r[i]);
      for (let k = 0; k < n; k++) {
        const j = e.hits[k];
        if (!e.alive[j] || e.uid[j] === pr.lastHit[i]) continue;
        const def = ENEMIES[e.type[j]];
        if (def.behaviour === 'posse') continue;
        const sp = Math.hypot(pr.vx[i], pr.vz[i]) || 1;
        this.hitEnemy(j, pr.dmg[i], pr.flags[i], pr.weapon[i], (pr.vx[i] / sp) * 4, (pr.vz[i] / sp) * 4);
        pr.lastHit[i] = e.uid[j];
        this.w.fx.burst(x, 1, z, 2, 3, 0.2, 0.07, 3, 2.4, 1.2, () => this.rng.next());
        if (pr.kind[i] === K.CHIP && pr.flags[i] & F.EVO) this.explode(x, z, 1.6, pr.dmg[i] * 0.6, 0, pr.weapon[i], 0xc080ff); // House Always Wins
        if (pr.flags[i] & F.FIRE && this.zones.length < 30) this.zones.push({ x, z, r: 1.1, life: 1.6, dps: 0.53, tick: 0 });
        if (pr.bounce[i] > 0) {
          const t = this.nearest(x, z, 7, e.uid[j]);
          if (t >= 0) {
            pr.bounce[i]--;
            const dx = e.x[t] - x;
            const dz = e.z[t] - z;
            const d = Math.hypot(dx, dz) || 1;
            pr.vx[i] = (dx / d) * sp;
            pr.vz[i] = (dz / d) * sp;
            pr.life[i] = Math.max(pr.life[i], 0.6);
            break;
          }
        }
        if (pr.pierce[i] > 0) pr.pierce[i]--;
        else pr.alive[i] = 0;
        break;
      }
    }
  }

  private updatePickups(dt: number) {
    const pk = this.w.pick;
    const p = this.player;
    const mag = this.stats.magnet;
    const e = this.w.enemies;
    for (let i = 0; i < QMAX; i++) {
      if (!pk.alive[i]) continue;
      pk.age[i] += dt;
      const k = pk.kind[i];
      let dx = p.x - pk.x[i];
      let dz = p.z - pk.z[i];
      const d = Math.hypot(dx, dz);
      if (k !== P.CHEST && (pk.mag[i] || d < mag)) {
        pk.mag[i] = 1;
        pk.sp[i] = Math.min(25, pk.sp[i] + dt * 30);
        const step = Math.min(d, pk.sp[i] * dt);
        pk.x[i] += (dx / (d || 1)) * step;
        pk.z[i] += (dz / (d || 1)) * step;
      } else if (this.wind.t > 0 && this.wind.warn <= 0) {
        pk.x[i] += this.wind.x * dt;
        pk.z[i] += this.wind.z * dt;
      }
      if (d < 0.6 + (k === P.CHEST ? 0.4 : 0)) {
        pk.remove(i);
        this.collect(k, pk.val[i], pk.x[i], pk.z[i]);
      }
    }
    void e;
  }

  private collect(k: number, val: number, x: number, z: number) {
    const p = this.player;
    const fx = this.w.fx;
    if (k <= P.XP25) {
      this.xp += val;
      this.casings++;
      sfx.casing();
    } else if (k === P.COIN || k === P.SACK) {
      const g = (k === P.SACK ? 12 : val) * this.stats.gold;
      this.gold += g;
      sfx.coin();
      if (g >= 2) fx.num(x, 1.5, z, `+${Math.round(g)}`, '#ffd04a', 1, 0.6);
      if (this.trait('Prospector') >= 3) {
        const t = this.nearest(p.x, p.z, 7);
        if (t >= 0) {
          const en = this.w.enemies;
          fx.beam(p.x, 1, p.z, en.x[t], 1, en.z[t], 0.12, 0.15, 0xffe080);
          this.hitEnemy(t, 10, 0, -1);
        }
      }
    } else if (k === P.JERKY) {
      const h = 25 * (this.trait('Saloon Keeper') >= 2 ? 2 : 1);
      this.hp = Math.min(this.stats.maxHp, this.hp + h);
      fx.num(p.x, 2.2, p.z, `+${h}`, '#70ff70', 1, 0.8);
      sfx.coin();
    } else if (k === P.LASSO) {
      const pk = this.w.pick;
      for (let i = 0; i < QMAX; i++) if (pk.alive[i] && pk.kind[i] <= P.COIN) pk.mag[i] = 1;
      this.banner_('YEEHAW!', 'All casings roped in', 1.2);
      sfx.lasso();
    } else if (k === P.BOMB) {
      const e = this.w.enemies;
      const n = e.query(p.x, p.z, 14);
      const ids = Array.from(e.hits.subarray(0, n));
      for (const i of ids) if (e.alive[i] && !ENEMIES[e.type[i]].boss) this.hitEnemy(i, 60 * hpScale(this.time), 0, -1);
      this.w.pl.flash = 0.7;
      this.w.pl.flashColor.setRGB(1, 0.7, 0.4);
      this.w.pl.shake = 1;
      sfx.boom();
    } else if (k === P.CHEST) {
      this.openChest(val);
    }
  }

  openChest(n: number) {
    const res: string[] = [];
    // evolution first
    for (const w of this.weapons) {
      if (!w.evolved && w.level >= MAX_WEAPON_LEVEL && this.artifacts.has(w.def.evolveWith)) {
        w.evolved = true;
        res.push(`EVOLVED: ${w.def.evoName}`);
        res.push(w.def.evoDesc);
        break;
      }
    }
    if (!res.length) {
      let count = n;
      if (this.rng.chance(0.25 + this.stats.luck)) count++;
      if (this.rng.chance(0.08 + this.stats.luck / 2)) count += 2;
      for (let k = 0; k < count; k++) {
        const opts: (() => string)[] = [];
        for (const w of this.weapons)
          if (w.level < MAX_WEAPON_LEVEL)
            opts.push(() => {
              w.level++;
              return `${w.def.name} LV ${w.level}`;
            });
        for (const [id, lv] of this.artifacts)
          if (lv < 3)
            opts.push(() => {
              this.artifacts.set(id, lv + 1);
              this.recompute();
              return `${id.replace(/_/g, ' ').toUpperCase()} LV ${lv + 1}`;
            });
        if (!opts.length) {
          this.gold += 30;
          res.push('+30 GOLD');
          continue;
        }
        res.push(this.rng.pick(opts)());
      }
    }
    this.chests.push(res);
    sfx.chest();
  }

  private updateStatus(dt: number) {
    const e = this.w.enemies;
    // poison
    for (let i = 0; i < MAX; i++) {
      if (!e.alive[i] || e.poisonT[i] <= 0) continue;
      e.poisonT[i] -= dt;
      e.hp[i] -= e.poison[i] * dt;
      if (e.hp[i] <= 0) this.kill(i, 0, -1);
    }
    // fire zones
    for (let z = this.zones.length - 1; z >= 0; z--) {
      const zn = this.zones[z];
      zn.life -= dt;
      zn.tick -= dt;
      if (this.rng.chance(0.5)) {
        const a = this.rng.next() * 6.28;
        const r = this.rng.next() * zn.r;
        this.w.fx.particle(zn.x + Math.cos(a) * r, 0.2, zn.z + Math.sin(a) * r, 0, 2.5, 0, 0.4, 0.16, 4, 1.6, 0.3, 0);
      }
      if (zn.tick <= 0) {
        zn.tick = 0.4;
        const n = e.query(zn.x, zn.z, zn.r);
        const ids = Array.from(e.hits.subarray(0, n));
        for (const i of ids) if (e.alive[i]) this.hitEnemy(i, zn.dps * 0.4, 0, -1);
      }
      if (zn.life <= 0) this.zones.splice(z, 1);
    }
    for (let d = this.delayed.length - 1; d >= 0; d--) {
      const de = this.delayed[d];
      de.t -= dt;
      if (de.t <= 0) {
        this.delayed.splice(d, 1);
        this.explode(de.x, de.z, de.r, de.dmg);
      }
    }
  }

  // ---- rendering ----------------------------------------------------------

  sync(realDt: number) {
    const w = this.w;
    const p = this.player;
    w.pl.setTarget(p.x, p.z, this.time);
    w.updateLighting(this.elapsed01, p.x, p.z, realDt, this.time);
    const tint = w.light.sample(p.x, 1, p.z, tmpC);
    // warm rim keeps the player readable as night falls
    tint.r = Math.max(tint.r, 0.75);
    tint.g = Math.max(tint.g, 0.62);
    tint.b = Math.max(tint.b, 0.55);
    p.sync(w.pl, tint, this.iframes > 0 && !this.ultFx.active && Math.floor(this.time * 20) % 2 === 0, realDt);
    w.town.updateHide(p.x, p.z, realDt, w.pl.viewBack);
    w.enemies.render(this.time);
    w.proj.render();
    w.pick.render(this.time);
  }
}

const hitBreaks: Breakable[] = [];

export { WHITE };
