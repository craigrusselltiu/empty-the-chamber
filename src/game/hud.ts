import type { Run } from './run';
import { H, view } from '../render/pipeline';
import { drawText, textWidth } from '../render/font';
import { ENEMIES } from '../data/enemies';
import { RUN_LENGTH } from '../data/waves';
import { input } from '../input';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = '23456789TJQKA';
const sp = { x: 0, y: 0 };

function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, fg: string, bg = '#1a0e0a') {
  g.fillStyle = '#000';
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  g.fillStyle = fg;
  g.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, k))), h);
}

function clock(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Revolver cylinder: one hole per round, spins while reloading.
function cylinder(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, size: number, ammo: number, reload: number, time: number) {
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(cx, cy, r + 2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#3a3438';
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  const spin = reload > 0 ? (1 - reload) * Math.PI * 4 : 0;
  const hr = Math.max(2, Math.min(4, (r * 2.4) / size));
  for (let k = 0; k < size; k++) {
    const a = -Math.PI / 2 + (k / size) * Math.PI * 2 + spin;
    const x = Math.round(cx + Math.cos(a) * r * 0.62);
    const y = Math.round(cy + Math.sin(a) * r * 0.62);
    const loaded = reload <= 0 && k < ammo;
    const last = loaded && ammo === 1;
    g.fillStyle = last ? (Math.sin(time * 18) > 0 ? '#ff8030' : '#ffd040') : loaded ? '#e0b050' : '#140c0c';
    g.fillRect(x - hr / 2, y - hr / 2, hr, hr);
    if (loaded) {
      g.fillStyle = last ? '#fff0c0' : '#fff0b0';
      g.fillRect(x - hr / 2, y - hr / 2, 1, 1);
    }
  }
  if (reload > 0) {
    g.strokeStyle = '#9ad0ff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, r + 4, -Math.PI / 2, -Math.PI / 2 + (1 - reload) * Math.PI * 2);
    g.stroke();
  }
}

export function drawHud(g: CanvasRenderingContext2D, run: Run, touch: boolean) {
  const W = view.w;
  g.clearRect(0, 0, W, H);
  const w = run.w;
  const p = run.player;
  const time = run.time;

  // floating numbers
  for (const n of w.fx.nums) {
    w.pl.toScreen(n.x, n.y, n.z, sp);
    if (sp.x < -20 || sp.x > W + 20 || sp.y < -20 || sp.y > H + 20) continue;
    g.globalAlpha = Math.min(1, (n.life / n.max) * 2);
    drawText(g, n.text, sp.x, sp.y, n.color, n.scale, 'center');
  }
  g.globalAlpha = 1;

  // player HP under the feet
  w.pl.toScreen(p.x, 0, p.z, sp);
  bar(g, Math.round(sp.x - 12), Math.round(sp.y + 4), 24, 2, run.hp / run.stats.maxHp, '#e04030');

  // Deadeye crosshairs
  const u = run.ultFx;
  if (u.active && run.ch.ult === 'deadeye') {
    const e = w.enemies;
    u.targets.forEach((i, k) => {
      if (!e.alive[i] || e.uid[i] !== u.targetUids[k] || k < u.shotsFired) return;
      w.pl.toScreen(e.x[i], 1, e.z[i], sp);
      const s = 10 + Math.max(0, 0.4 - u.t) * 40;
      g.strokeStyle = '#ff3020';
      g.lineWidth = 1;
      g.strokeRect(Math.round(sp.x - s) + 0.5, Math.round(sp.y - s) + 0.5, s * 2, s * 2);
      g.fillStyle = '#ff3020';
      g.fillRect(Math.round(sp.x) - 6, Math.round(sp.y), 12, 1);
      g.fillRect(Math.round(sp.x), Math.round(sp.y) - 6, 1, 12);
    });
  }
  // False Shuffle cards
  if (u.active && u.cards.length) {
    u.cards.forEach((c, k) => {
      const k2 = Math.min(1, Math.max(0, (u.t - k * 0.1) / 0.4));
      const x = p.x + (c.x - p.x) * k2;
      const z = p.z + (c.z - p.z) * k2;
      w.pl.toScreen(x, 1.4, z, sp);
      const cx = Math.round(sp.x - 8);
      const cy = Math.round(sp.y - 11);
      g.fillStyle = '#000';
      g.fillRect(cx - 1, cy - 1, 18, 24);
      g.fillStyle = u.t > 0.9 ? '#f4ecdc' : '#7a2a3a';
      g.fillRect(cx, cy, 16, 22);
      if (u.t > 0.9) {
        const suit = Math.floor(c.c / 13);
        const col = suit === 1 || suit === 2 ? '#d02020' : '#202020';
        drawText(g, RANKS[c.c % 13], cx + 5, cy + 2, col);
        drawText(g, SUITS[suit], cx + 5, cy + 12, col);
      }
    });
  }

  // top: XP bar, timer, gold
  bar(g, 1, 1, W - 2, 4, run.xp / run.xpNext, '#e0b050');
  drawText(g, clock(Math.max(0, time)), W / 2, 12, run.survived ? '#ff6050' : '#ffffff', 1, 'center');
  drawText(g, `$${Math.floor(run.gold)}`, W - 4, 12, '#ffd04a', 1, 'right');
  // dusk-to-midnight progress
  const dk = Math.min(1, time / RUN_LENGTH);
  g.fillStyle = '#000';
  g.fillRect(W / 2 - 16, 22, 32, 2);
  g.fillStyle = '#c070ff';
  g.fillRect(W / 2 - 16, 22, Math.round(32 * dk), 2);

  // boss bar
  if (run.bossIdx >= 0 && w.enemies.alive[run.bossIdx]) {
    const e = w.enemies;
    const i = run.bossIdx;
    bar(g, W / 2 - 90, 36, 180, 5, e.hp[i] / e.maxHp[i], '#c02818');
    drawText(g, ENEMIES[e.type[i]].name, W / 2, 44, '#ffb070', 1, 'center');
  }

  // weapons: primary cylinder bottom-left, then the rest
  let x = 30;
  const y = H - 36;
  let first = true;
  for (const wp of run.weapons) {
    const size = run.chamber(wp);
    const reload = wp.reloadT > 0 ? wp.reloadT / wp.reloadMax : 0;
    if (size > 0 && first) {
      cylinder(g, x, y, 18, size, wp.ammo, reload, time);
      drawText(g, wp.evolved ? wp.def.evoName : wp.def.name, x - 22, y + 21, wp.evolved ? '#ffd04a' : '#e0d0b0');
      x += 48;
      first = false;
      continue;
    }
    if (size > 0) cylinder(g, x, y + 6, 10, size, wp.ammo, reload, time);
    else {
      g.fillStyle = '#000';
      g.fillRect(x - 10, y - 4, 20, 20);
      g.fillStyle = '#3a3438';
      g.fillRect(x - 9, y - 3, 18, 18);
      const k = Math.max(0, wp.cdT) / (wp.def.interval * run.stats.cdMul);
      g.fillStyle = '#5a4a40';
      g.fillRect(x - 9, y - 3, 18, Math.round(18 * Math.min(1, k)));
      drawText(g, wp.def.name[0], x - 2, y + 3, wp.evolved ? '#ffd04a' : '#fff');
    }
    for (let l = 0; l < 5; l++) {
      g.fillStyle = l < wp.level ? (wp.evolved ? '#ffd04a' : '#e0b050') : '#2a2022';
      g.fillRect(x - 9 + l * 4, y + 19, 3, 2);
    }
    x += 26;
  }

  // ultimate meter bottom-centre
  const uk = run.ult / run.ch.ultCharge;
  const ready = uk >= 1;
  const ux = W / 2 - 50;
  bar(g, ux, H - 12, 100, 5, uk, ready ? (Math.sin(time * 10) > 0 ? '#ffd04a' : '#ff8030') : '#c07030');
  drawText(g, ready ? `${run.ch.ultName} - ${touch ? 'TAP' : 'SPACE'}` : run.ch.ultName, W / 2, H - 22, ready ? '#ffd04a' : '#c8a882', 1, 'center');

  // touch controls
  if (touch) {
    g.globalAlpha = ready ? 0.9 : 0.4;
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(W - 30, H - 34, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = ready ? '#ff8030' : '#5a4a40';
    g.beginPath();
    g.arc(W - 30, H - 34, 16, 0, Math.PI * 2);
    g.fill();
    drawText(g, 'ULT', W - 30, H - 37, '#fff', 1, 'center');
    g.globalAlpha = 1;
    if (input.touchActive) {
      const s = H / innerHeight;
      g.strokeStyle = 'rgba(255,240,220,0.5)';
      g.beginPath();
      g.arc(input.touchOrigin.x * s, input.touchOrigin.y * s, 16, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255,240,220,0.5)';
      g.beginPath();
      g.arc(input.touchPos.x * s, input.touchPos.y * s, 6, 0, Math.PI * 2);
      g.fill();
    }
  }

  // banner
  if (run.banner.t > 0) {
    g.globalAlpha = Math.min(1, run.banner.t * 2);
    const scale = textWidth(run.banner.text, 3) > W - 20 ? 2 : 3;
    drawText(g, run.banner.text, W / 2, H * 0.3, '#ffb45a', scale, 'center');
    if (run.banner.sub) drawText(g, run.banner.sub, W / 2, H * 0.3 + 10 * scale, '#f1dfb8', 1, 'center');
    g.globalAlpha = 1;
  }
  // gravity shift warning arrows
  if (run.wind.warn > 0 || run.wind.t > 0) {
    const ax = run.wind.x;
    const az = run.wind.z;
    const sx = ax * w.pl.camRight.x + az * w.pl.camRight.z;
    const sy = -(ax * w.pl.camFwdGround.x + az * w.pl.camFwdGround.z) * 0.5;
    const l = Math.hypot(sx, sy) || 1;
    for (let k = 0; k < 3; k++) {
      const cx = W / 2 + (sx / l) * (40 + k * 14 + ((time * 60) % 14));
      const cy = H / 2 + (sy / l) * (40 + k * 14 + ((time * 60) % 14));
      g.fillStyle = '#ffd090';
      g.fillRect(Math.round(cx) - 2, Math.round(cy) - 2, 4, 4);
    }
  }
}
