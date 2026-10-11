import * as THREE from 'three';
import { Pipeline, H, view, YAW, CINE_PITCH, CINE_LIFT, PPU } from './render/pipeline';
import { look } from './game/player';
import { cutBase } from './render/ps1';
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
  const dpr = Math.min(devicePixelRatio, 2, 2160 / innerHeight); // cap the full-res pass at 2160 px tall
  pl.resize(Math.round(innerWidth * dpr), Math.round(innerHeight * dpr));
  // The HUD draws in 270 px units on a 2x canvas, so 1.5x text lands on whole pixels.
  if (hud.width !== view.w * 2) {
    hud.width = view.w * 2;
    hud.height = H * 2;
  }
  g.setTransform(2, 0, 0, 2, 0, 0);
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
  world.newTown(seed);
  run = new Run(world, charById(id), seed);
  state = 'run';
  paused = false;
  deathT = 0;
  acc = 0;
  renoTold = false;
  introT = 0;
  // orbit the close-up to an angle where nothing stands between the camera and the character, and
  // nothing tall stands behind them (within the haze), so the top of the frame is sky
  const st = world.town.start;
  const rise = Math.tan(CINE_PITCH);
  const top = CINE_LIFT + H / 2 / PPU / 3; // height of the frame's top edge at the character (3x zoom)
  const clear = (off: number, back: boolean) => {
    const dx = Math.sin(YAW + off);
    const dz = Math.cos(YAW + off);
    if (world.town.occluder(st.x, st.z, dx, dz, rise)) return false;
    return !back || !world.town.occluder(st.x, st.z, -dx, -dz, -rise, top - 0.5, 60);
  };
  const offs = [0.55, -0.55, 1.1, -1.1, 0, 1.6, -1.6, 2.1, -2.1, 2.6, -2.6, 3.1];
  pl.cineYaw = offs.find((o) => clear(o, true)) ?? offs.find((o) => clear(o, false)) ?? 0.55;
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

// Run intro: a close-up of the player in letterbox, easing out to the gameplay camera.
const INTRO = 2.8;
let introT = -1;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  if (debug) (window as any).world = world;
  last = now;
  pollInput();

  if (input.pressed.includes('KeyV')) look.model = !look.model;
  // menu navigation (keys only reach menus while one is open)
  if (state !== 'run' || paused) for (const code of input.pressed) menus.menuKey(code);

  if (state === 'title' || !run) {
    // slow pan along the main street behind the menu
    titleT += dt;
    const st = world.town.start;
    const x = st.x + Math.sin(titleT * 0.05) * 14;
    const z = st.z + Math.sin(titleT * 0.037) * 8;
    pl.setTarget(x, z, titleT);
    world.updateLighting(0.45, x, z, dt, titleT);
    cutBase.z = -1;
    pl.render(world.scene, 0.9);
  } else {
    const r = run;
    let intro = -1; // 0..1 blend while the intro plays
    if (introT >= 0) {
      introT += dt;
      if (introT > 0.3 && input.pressed.length) introT = INTRO; // any key skips
      const u = Math.min(1, Math.max(0, (introT - 0.6) / (INTRO - 0.6)));
      intro = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
      // the character faces the camera: the sprite's front row, the 3D model turned to the camera's orbit
      const yaw = YAW + pl.cineYaw * (1 - intro);
      r.player.faceNow(Math.sin(yaw), Math.cos(yaw), pl);
      r.player.sprite.dir = 6;
      r.player.sprite.update(dt);
      if (introT >= INTRO) introT = -1;
    }
    pl.cine = intro >= 0 ? 1 - intro : 0;
    if (intro >= 0) input.ult = input.pause = false;
    else if (state === 'run' && !paused) {
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
    // (projected with the camera in use, so it also works during the intro)
    pv.set(p.x, 0.9, p.z).applyMatrix4(pl.camera.matrixWorldInverse);
    const depth = -pv.z;
    pv.set(p.x, 0.9, p.z).project(pl.camera);
    cutBase.set(((pv.x + 1) / 2) * view.w, ((pv.y + 1) / 2) * H, depth, 30 * pl.camera.zoom);
    pl.render(world.scene, 0.9);
    if (intro >= 0) {
      // letterbox bars slide off as the camera pulls back
      g.clearRect(0, 0, view.w, H);
      const bh = Math.round(H * 0.13 * (1 - intro));
      g.fillStyle = '#000';
      g.fillRect(0, 0, view.w, bh);
      g.fillRect(0, H - bh, view.w, bh);
    } else drawHud(g, r, touch);
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
