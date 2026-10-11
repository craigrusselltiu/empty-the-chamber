import * as THREE from 'three';
import { Pipeline, CHAR_LAYER } from '../render/pipeline';
import { hide } from '../render/ps1';
import { Sheet, loadSheet } from '../render/sprite';
import { CharModel, loadModel } from '../render/model';
import { Town } from '../world/town';
import { Lighting } from '../world/lighting';
import { FlowField } from '../world/flowfield';
import { Enemies } from './enemies';
import { Projectiles, Pickups } from './projectiles';
import { Fx } from './fx';

// Everything that outlives a single run.
export class World {
  scene = new THREE.Scene();
  town: Town;
  light: Lighting;
  ff: FlowField;
  enemies = new Enemies();
  proj = new Projectiles();
  pick = new Pickups();
  fx = new Fx();
  sheets: Record<string, Sheet> = {};
  models: Record<string, CharModel> = {};

  constructor(public pl: Pipeline) {
    this.scene.background = new THREE.Color();
    this.town = new Town(1);
    this.town.update(this.town.start.x, this.town.start.z, true);
    this.scene.add(this.town.group, this.enemies.group, this.proj.mesh, this.pick.mesh, this.fx.group);
    // projectiles, pickups and effects are pixel art like the characters
    for (const o of [this.proj.mesh, this.pick.mesh, this.fx.group]) o.traverse((c) => c.layers.set(CHAR_LAYER));
    this.light = new Lighting(this.scene, this.town.lanterns);
    this.ff = new FlowField(this.town);
  }

  async load() {
    const [rust, reno, rustM, renoM] = await Promise.all([loadSheet('rust'), loadSheet('reno'), loadModel('rust'), loadModel('reno')]);
    this.sheets.rust = rust;
    this.sheets.reno = reno;
    this.models.rust = new CharModel(rustM);
    this.models.reno = new CharModel(renoM);
  }

  // A new procedural town for a run.
  newTown(seed: number) {
    this.scene.remove(this.town.group);
    this.town.dispose();
    this.town = new Town(seed);
    this.town.update(this.town.start.x, this.town.start.z, true);
    this.scene.add(this.town.group);
    this.light.setLanterns(this.town.lanterns);
    this.ff = new FlowField(this.town);
  }

  reset() {
    hide.value.set(0, 0, 0, 0);
    this.enemies.reset();
    this.proj.reset();
    this.pick.reset();
    this.fx.clear();
    this.town.resetBreakables();
    this.light.flashes.length = 0;
  }

  // Shared per-frame lighting/material updates.
  updateLighting(t01: number, px: number, pz: number, dt: number, time: number) {
    // stream the world around the player
    if (this.town.update(px, pz)) this.light.setLanterns(this.town.lanterns);
    const l = this.light;
    l.update(t01, px, pz, dt, time, this.scene.background as THREE.Color);
    this.town.glowMat.color.setRGB(1, 0.55, 0.22).multiplyScalar(l.glow);
    this.town.lampMat.color.setRGB(2.6, 1.3, 0.45).multiplyScalar(0.5 + l.lamp * 0.5);
    this.pl.shadowTint.set(l.tint.r, l.tint.g, l.tint.b);
  }
}
