import * as THREE from 'three';
import type { Run } from './run';
import { ENEMIES } from '../data/enemies';
import { MAX } from './enemies';
import { P } from './projectiles';
import { sfx } from '../audio';

const SHOTS = 6; // Deadeye: one per chamber

export const HANDS = ['HIGH CARD', 'PAIR', 'TWO PAIR', 'THREE OF A KIND', 'STRAIGHT', 'FLUSH', 'FULL HOUSE', 'FOUR OF A KIND', 'STRAIGHT FLUSH', 'ROYAL FLUSH'];

// Card = 0..51: rank = c % 13 (0 = 2 ... 12 = ace), suit = c / 13.
export function rank5(cards: number[]) {
  const r = cards.map((c) => c % 13).sort((a, b) => b - a);
  const flush = cards.every((c) => Math.floor(c / 13) === Math.floor(cards[0] / 13));
  const uniq = [...new Set(r)];
  let straight = uniq.length === 5 && r[0] - r[4] === 4;
  if (uniq.length === 5 && r[0] === 12 && r[1] === 3) straight = true; // A-2-3-4-5
  const counts = Object.values(r.reduce<Record<number, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {})).sort((a, b) => b - a);
  if (straight && flush) return r[0] === 12 && r[4] === 8 ? 9 : 8;
  if (counts[0] === 4) return 7;
  if (counts[0] === 3 && counts[1] === 2) return 6;
  if (flush) return 5;
  if (straight) return 4;
  if (counts[0] === 3) return 3;
  if (counts[0] === 2 && counts[1] === 2) return 2;
  if (counts[0] === 2) return 1;
  return 0;
}

// Best 5 of 7.
function best5(seven: number[]) {
  let best = -1;
  let hand: number[] = [];
  for (let a = 0; a < 7; a++)
    for (let b = a + 1; b < 7; b++) {
      const h = seven.filter((_, i) => i !== a && i !== b);
      const v = rank5(h);
      if (v > best) (best = v), (hand = h);
    }
  return { rank: best, hand };
}

const WHITE = new THREE.Color(1, 1, 1);
const GOLD = new THREE.Color(1, 0.8, 0.3);

export class Ult {
  run: Run;
  active = false;
  invuln = false;
  t = 0;
  targets: number[] = []; // enemy indices (Deadeye)
  targetUids: number[] = [];
  shotsFired = 0;
  cards: { c: number; x: number; z: number }[] = [];
  handRank = -1;
  private stage = 0;

  constructor(run: Run) {
    this.run = run;
  }

  get ready() {
    return this.run.ult >= this.run.ch.ultCharge;
  }

  tryStart() {
    const run = this.run;
    if (this.active || !this.ready || run.dead) return;
    if (run.ch.ult === 'deadeye') {
      const e = run.w.enemies;
      const p = run.player;
      const cands: number[] = [];
      for (let i = 0; i < MAX; i++) {
        if (!e.alive[i] || ENEMIES[e.type[i]].behaviour === 'posse') continue;
        if ((e.x[i] - p.x) ** 2 + (e.z[i] - p.z) ** 2 < 15 * 15) cands.push(i);
      }
      if (!cands.length) return;
      cands.sort((a, b) => (ENEMIES[e.type[b]].boss ? 1e9 : 0) + e.hp[b] - ((ENEMIES[e.type[a]].boss ? 1e9 : 0) + e.hp[a]));
      // six shots: the six toughest, cycling through them when there are fewer
      this.targets = Array.from({ length: SHOTS }, (_, k) => cands[k % Math.min(SHOTS, cands.length)]);
      this.targetUids = this.targets.map((i) => e.uid[i]);
      run.timeScale = 0.12;
    } else {
      const deck = Array.from({ length: 52 }, (_, i) => i);
      for (let i = 51; i > 0; i--) {
        const j = run.rng.int(i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      const { rank, hand } = best5(deck.slice(0, 7));
      this.handRank = rank;
      const p = run.player;
      this.cards = hand.map((c, k) => {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        return { c, x: p.x + Math.cos(a) * 3.4, z: p.z + Math.sin(a) * 3.4 };
      });
      run.timeScale = 0.25;
      run.player.sprite.play('attack', true);
    }
    run.ult = 0;
    this.active = true;
    this.invuln = true;
    this.t = 0;
    this.stage = 0;
    this.shotsFired = 0;
    sfx.ult();
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    if (this.run.ch.ult === 'deadeye') this.deadeye();
    else this.shuffle();
  }

  private end() {
    this.active = false;
    this.run.timeScale = 1;
    this.run.iframes = Math.max(this.run.iframes, 0.6);
    this.invuln = false;
  }

  private scale() {
    return 1 + this.run.time / 180;
  }

  private deadeye() {
    const run = this.run;
    const e = run.w.enemies;
    const p = run.player;
    while (this.shotsFired < this.targets.length && this.t >= 0.4 + this.shotsFired * 0.2) {
      const k = this.shotsFired++;
      let i = this.targets[k];
      if (!e.alive[i] || e.uid[i] !== this.targetUids[k]) {
        // already dead: the toughest one still standing nearby takes the shot
        i = -1;
        for (let j = 0; j < MAX; j++) {
          if (!e.alive[j] || ENEMIES[e.type[j]].behaviour === 'posse') continue;
          if ((e.x[j] - p.x) ** 2 + (e.z[j] - p.z) ** 2 > 15 * 15) continue;
          if (i < 0 || e.hp[j] > e.hp[i]) i = j;
        }
        if (i < 0) continue;
      }
      const dx = e.x[i] - p.x;
      const dz = e.z[i] - p.z;
      const d = Math.hypot(dx, dz) || 1;
      const ux = dx / d;
      const uz = dz / d;
      p.faceWorld(ux, uz, run.w.pl);
      p.sprite.play('shoot', true);
      // pierce everything on the line
      const ids: number[] = [];
      for (let s = 0; s < 24; s += 1.0) {
        const n = e.query(p.x + ux * s, p.z + uz * s, 0.6);
        for (let h = 0; h < n; h++) if (!ids.includes(e.hits[h])) ids.push(e.hits[h]);
      }
      if (!ids.includes(i)) ids.push(i);
      const dmg = 7.4 * this.scale();
      for (const j of ids) {
        if (!e.alive[j]) continue;
        run.hitEnemy(j, j === i ? dmg * 2 : dmg, 2 /* crit */, -1, ux * 10, uz * 10);
      }
      run.w.fx.beam(p.x, 1.2, p.z, p.x + ux * 24, 1.2, p.z + uz * 24, 0.35, 0.4, 0xffe0a0);
      run.w.light.flash(p.x, 1.4, p.z, GOLD, 60, 0.3);
      run.w.pl.shake = 0.8;
      sfx.finalShot();
    }
    if (this.t >= 0.4 + SHOTS * 0.2 + 0.15) {
      run.w.pl.flash = 1;
      run.w.pl.flashColor.copy(WHITE);
      this.end();
    }
  }

  private shuffle() {
    const run = this.run;
    if (this.stage === 0) {
      if (Math.floor(this.t * 12) !== Math.floor((this.t - 0.016) * 12) && this.t < 0.6) sfx.card();
      if (this.t >= 1.0) {
        this.stage = 1;
        run.banner_(HANDS[this.handRank], '', 1.4);
        sfx.chest();
      }
      return;
    }
    if (this.stage === 1 && this.t >= 1.35) {
      this.stage = 2;
      this.payout();
    }
    if (this.t >= 1.7) {
      this.cards = [];
      this.end();
    }
  }

  private payout() {
    const run = this.run;
    const s = this.scale();
    const r = this.handRank;
    const radius = [2.5, 3, 3, 3.5, 3, 4.5, 4.5, 5.5, 6, 6][r];
    const dmg = [2.1, 3.2, 3.2, 4.2, 4.2, 5.8, 6.3, 10.5, 13.7, 21][r] * s;
    const col = [0xa0a0ff, 0xc080ff, 0xc080ff, 0xff80c0, 0x80ffd0, 0xffd04a, 0xff9060, 0xff4040, 0xffffff, 0xffffff][r];
    for (const c of this.cards) run.explode(c.x, c.z, radius / run.stats.area, dmg, 0, -1, col);
    if (r === 2) for (const c of this.cards) run.delayed.push({ t: 0.3, x: c.x, z: c.z, r: radius / run.stats.area, dmg });
    const e = run.w.enemies;
    const p = run.player;
    if (r === 3 || r >= 8) {
      const n = e.query(p.x, p.z, r >= 8 ? 16 : 7);
      for (let k = 0; k < n; k++) {
        const i = e.hits[k];
        if (r >= 8) e.stun[i] = 3;
        else e.slow[i] = 3;
      }
    }
    if (r === 4) {
      for (const c of this.cards)
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          run.w.proj.add(2, c.x, c.z, Math.cos(a) * 18, Math.sin(a) * 18, 0.7, 30 * s, 3, 0.3, 0, -1);
        }
    }
    if (r === 5) for (let k = 0; k < 18; k++) run.w.pick.add(P.COIN, p.x + run.rng.range(-4, 4), p.z + run.rng.range(-4, 4), 2);
    if (r === 6) {
      run.hp = Math.min(run.stats.maxHp, run.hp + run.stats.maxHp * 0.4);
      run.w.fx.num(p.x, 2.4, p.z, 'HEALED', '#70ff70', 1.5, 1);
    }
    if (r === 9) {
      const n = e.query(p.x, p.z, 18);
      const ids = Array.from(e.hits.subarray(0, n));
      for (const i of ids) {
        if (!e.alive[i]) continue;
        const def = ENEMIES[e.type[i]];
        if (def.behaviour === 'posse') continue;
        if (def.boss) run.hitEnemy(i, 500 * s, 0, -1);
        else run.kill(i, 0, -1);
      }
      run.w.pl.flash = 1;
      run.w.pl.flashColor.copy(GOLD);
    }
    run.w.pl.shake = 1;
  }
}
