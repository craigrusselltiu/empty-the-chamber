import * as THREE from 'three';
import { Pipeline, H, view } from './render/pipeline';
import { cutout } from './render/ps1';
import { World } from './game/world';
import { Run } from './game/run';
import { drawHud } from './game/hud';
import { makeOffers, applyOffer, Offer } from './game/levelup';
import { initInput, input, pollInput } from './input';
import { charById } from './data/characters';
import { RENO_GOLD, SURVIVE_BONUS } from './data/meta';
import { save, store } from './save';
import { sfx, setMuted } from './audio';
import * as menus from './ui/menus';

const stage = document.getElementById('stage')!;
const glCanvas = document.getElementById('gl') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLCanvasElement;
const g = hud.getContext('2d')!;
const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const touch = matchMedia('(pointer: coarse)').matches;
const simSpeed = debug ? Number(params.get('speed') ?? 1) : 1; // ?debug&speed=8 for fast playtests

const pl = new Pipeline(glCanvas);
function fit() {
  pl.resize(innerWidth / innerHeight);
  if (hud.width !== view.w) hud.width = view.w;
  g.imageSmoothingEnabled = false;
  stage.style.fontSize = `${Math.max(10, Math.min(18, innerHeight / 36))}px`;
}
addEventListener('resize', fit);
fit();
initInput(stage);
setMuted(save.mute);

const world = new World(pl);
await world.load();

type State = 'title' | 'run' | 'menu';
let state: State = 'title';
let run: Run | null = null;
let paused = false; // a menu overlay is open during a run
let deathT = 0;
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
let titleT = 0;
const sp = { x: 0, y: 0 };
const pv = new THREE.Vector3();

function toTitle() {
  state = 'title';
  run?.dispose();
  run = null;
  world.reset();
  g.clearRect(0, 0, view.w, H);
  menus.titleScreen(
    () => menus.selectScreen(startRun, toTitle),
    () => menus.shopScreen(toTitle),
  );
}

function startRun(id: string) {
  const seed = params.has('seed') ? parseInt(params.get('seed')!) : Math.floor(Math.random() * 1e9);
  run = new Run(world, charById(id), seed);
  state = 'run';
  paused = false;
  deathT = 0;
  acc = 0;
  renoTold = false;
  menus.clearUi();
  if (debug) Object.assign(window as any, { run, input });
}

function resume() {
  paused = false;
  menus.clearUi();
  last = performance.now();
}

function showLevelUp() {
  const r = run!;
  paused = true;
  sfx.levelUp();
  let offers = makeOffers(r);
  const done = () => {
    r.pendingLevels--;
    resume();
  };
  const h = {
    pick: (o: Offer) => {
      applyOffer(r, o);
      done();
    },
    reroll: () => {
      r.rerolls--;
      offers = makeOffers(r);
      menus.levelUpScreen(r, offers, h);
    },
    skip: () => {
      r.skips--;
      r.gold += 5;
      done();
    },
    banish: (o: Offer) => {
      r.banishes--;
      r.banished.add(o.id);
      offers = makeOffers(r);
      menus.levelUpScreen(r, offers, h);
    },
  };
  menus.levelUpScreen(r, offers, h);
}

function endRun() {
  const r = run!;
  const earned = Math.floor(r.gold) + (r.survived ? SURVIVE_BONUS : 0);
  save.gold += earned;
  save.stats.runs++;
  save.stats.kills += r.kills;
  save.stats.totalGold += earned;
  save.stats.bestTime = Math.max(save.stats.bestTime, r.time);
  if (r.survived) save.stats.wins++;
  const unlocks: string[] = [];
  if (r.gold >= RENO_GOLD && !save.unlocked.includes('reno')) {
    save.unlocked.push('reno');
    unlocks.push('"SLICK" RENO UNLOCKED - he heard you were holding.');
  }
  store(save);
  paused = true;
  state = 'menu';
  menus.resultsScreen(r, earned, unlocks, toTitle);
}

let renoTold = false;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  if (debug) (window as any).world = world;
  last = now;
  pollInput();

  // menu navigation (keys only reach menus while one is open)
  if (state !== 'run' || paused) for (const code of input.pressed) menus.menuKey(code);

  if (state === 'title' || !run) {
    // slow pan along the main street behind the menu
    titleT += dt;
    const x = Math.sin(titleT * 0.05) * 20 + 10;
    pl.setTarget(x, 0, titleT);
    world.updateLighting(0.45, x, 0, dt, titleT);
    cutout.value.z = -1;
    pl.render(world.scene, 0.9);
  } else {
    const r = run;
    if (state === 'run' && !paused) {
      if (input.pause) {
        paused = true;
        menus.pauseScreen(r, resume, () => {
          r.dead = true;
          endRun();
        });
      } else {
        acc += dt * simSpeed;
        while (acc >= STEP) {
          acc -= STEP;
          r.update(STEP);
          if (r.dead) break;
        }
        if (!renoTold && r.gold >= RENO_GOLD && !save.unlocked.includes('reno')) {
          renoTold = true;
          r.banner_('RENO WANTS IN', 'Finish the run to unlock him', 2.5);
        }
        if (r.dead) {
          deathT += dt;
          r.timeScale = 0.25;
          if (deathT > 1.2) endRun();
        } else if (r.chests.length) {
          paused = true;
          menus.chestScreen(r.chests.shift()!, resume);
        } else if (r.pendingLevels > 0) showLevelUp();
      }
    } else input.ult = false;
    r.sync(dt);
    // x-ray cutout around the player
    const p = r.player;
    pl.toScreen(p.x, 0.9, p.z, sp);
    pv.set(p.x, 0.9, p.z).applyMatrix4(pl.camera.matrixWorldInverse);
    cutout.value.set(sp.x, H - sp.y, -pv.z, 30);
    pl.render(world.scene, 0.9);
    drawHud(g, r, touch);
  }

  input.pressed.length = 0;
  input.pause = false;
  if (state !== 'run') input.ult = false;
  requestAnimationFrame(frame);
}

// touch: tap the ULT button
stage.addEventListener('touchstart', (e) => {
  if (state !== 'run' || paused) return;
  const rect = stage.getBoundingClientRect();
  for (const t of Array.from(e.changedTouches)) {
    const x = ((t.clientX - rect.left) / rect.width) * view.w;
    const y = ((t.clientY - rect.top) / rect.height) * H;
    if (Math.hypot(x - (view.w - 30), y - (H - 34)) < 22) input.ult = true;
  }
});

toTitle();
requestAnimationFrame(frame);
