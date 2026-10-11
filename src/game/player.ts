import * as THREE from 'three';
import { Billboard, Sheet } from '../render/sprite';
import { CharModel } from '../render/model';
import { Pipeline } from '../render/pipeline';
import { Town } from '../world/town';
import { collide } from '../world/collide';

const tmp = new THREE.Vector3();

// Shared view toggle: pixel-art sprite sheets or the 3D model they were rendered from.
export const look = { model: true };

export class Player {
  x = 0;
  z = 0;
  vx = 0;
  vz = 0;
  r = 0.4;
  moving = false;
  runTime = 0;
  // last non-zero facing in screen space and world space
  fsx = 0;
  fsy = -1;
  fwx = 0;
  fwz = 1;
  sprite: Billboard;
  model: CharModel;
  // facing for the 3D model (world space, follows movement and aim)
  lx = 0;
  lz = 1;
  private yaw = 0;
  shadow: THREE.Mesh;
  hasStop: boolean;
  hasHit: boolean;
  flash = 0;
  knockX = 0;
  knockZ = 0;

  constructor(sheet: Sheet, model: CharModel, outline: THREE.Color, size: number) {
    this.sprite = new Billboard(sheet, outline);
    this.sprite.mesh.scale.setScalar(size);
    this.model = model;
    model.root.scale.setScalar(0.85 * size); // sheets were rendered at 17 px per unit, the game draws 20
    this.hasStop = !!sheet.stop;
    this.hasHit = !!sheet.hit;
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.set(size, 0.8 * size, 1);
  }

  // mx/my: screen-space input. speed in units/s.
  update(dt: number, mx: number, my: number, speed: number, pl: Pipeline, town: Town) {
    const wx = pl.camRight.x * mx + pl.camFwdGround.x * my;
    const wz = pl.camRight.z * mx + pl.camFwdGround.z * my;
    const tvx = wx * speed;
    const tvz = wz * speed;
    const acc = Math.min(1, dt * 18);
    this.vx += (tvx - this.vx) * acc;
    this.vz += (tvz - this.vz) * acc;
    let nx = this.x + (this.vx + this.knockX) * dt;
    let nz = this.z + (this.vz + this.knockZ) * dt;
    const k = Math.exp(-dt * 10);
    this.knockX *= k;
    this.knockZ *= k;
    const c = collide(town, nx, nz, this.r);
    this.x = c.x;
    this.z = c.z;

    const s = this.sprite;
    const inputOn = mx * mx + my * my > 0.01;
    if (inputOn) {
      this.fsx = mx;
      this.fsy = my * 0.5; // ground-plane up is foreshortened on screen
      const l = Math.hypot(wx, wz) || 1;
      this.fwx = this.lx = wx / l;
      this.fwz = this.lz = wz / l;
      this.runTime += dt;
      if (s.oneShot === 'stop') s.oneShot = null;
      s.play('run');
      s.speed = Math.max(0.6, Math.hypot(this.vx, this.vz) / 5);
    } else {
      if (this.moving && this.runTime > 0.2 && this.hasStop && !s.oneShot) s.play('stop', true);
      this.runTime = 0;
      s.play('idle');
      s.speed = 1;
    }
    this.moving = inputOn;
    s.dir = Billboard.dirFromScreen(this.fsx, this.fsy);
    s.update(dt);
    this.flash = Math.max(0, this.flash - dt * 6);
  }

  // Face a ground direction at once (no turn), e.g. toward the intro camera.
  faceNow(dx: number, dz: number, pl: Pipeline) {
    this.faceWorld(dx, dz, pl);
    this.yaw = Math.atan2(this.lx, this.lz);
  }

  // Face a world direction without moving (shooting never turns the player; it keeps facing where it moves).
  faceWorld(dx: number, dz: number, pl: Pipeline) {
    const sx = dx * pl.camRight.x + dz * pl.camRight.z;
    const sy = (dx * pl.camFwdGround.x + dz * pl.camFwdGround.z) * 0.5;
    this.sprite.dir = Billboard.dirFromScreen(sx, sy);
    const l = Math.hypot(dx, dz) || 1;
    this.lx = dx / l;
    this.lz = dz / l;
  }

  sync(pl: Pipeline, tint: THREE.Color, blink: boolean, dt: number) {
    const m = this.sprite.mesh;
    tmp.set(this.x, 0, this.z);
    if (!pl.cine) pl.snap(tmp); // the snap grid only matches the gameplay camera
    m.visible = !look.model;
    const md = this.model;
    md.root.visible = look.model && !blink;
    if (look.model) {
      md.root.position.copy(tmp);
      let da = Math.atan2(this.lx, this.lz) - this.yaw;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      this.yaw += da * Math.min(1, dt * 16);
      md.root.rotation.y = this.yaw - Math.PI / 2; // the models face +x
      md.pose(this.sprite.current, this.sprite.elapsed());
      md.shade(this.flash);
    }
    this.sprite.mat.uniforms.uAlpha.value = blink ? 0.5 : 1;
    m.position.copy(tmp).addScaledVector(pl.viewBack, 1.2);
    m.quaternion.copy(pl.camera.quaternion);
    this.sprite.mat.uniforms.uTint.value.copy(tint);
    this.sprite.mat.uniforms.uFlash.value = this.flash;
    this.shadow.position.set(this.x, 0.12, this.z);
  }
}
