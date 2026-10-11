import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ps1 } from './ps1';
import { CHAR_LAYER } from './pipeline';

// The rigged PS1 model a character's sprite sheets were rendered from (exported from its .blend).
// It plays the same named actions as the sheets and follows the sprite's animation clock.
export class CharModel {
  root: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {};
  private cur: THREE.AnimationAction | null = null;
  private mats: { m: THREE.MeshLambertMaterial; base: THREE.Color }[] = [];

  constructor(gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }) {
    this.root = gltf.scene;
    this.root.traverse((o) => {
      o.layers.set(CHAR_LAYER);
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const m = ps1(new THREE.MeshLambertMaterial({ color: src.color }));
      this.mats.push({ m, base: src.color.clone() });
      mesh.material = m;
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const c of gltf.animations) this.actions[c.name] = this.mixer.clipAction(c);
  }

  pose(name: string, ms: number) {
    const a = this.actions[name];
    if (!a) return;
    if (a !== this.cur) {
      this.cur?.stop();
      a.play();
      this.cur = a;
    }
    a.time = Math.min(ms / 1000, a.getClip().duration);
    this.mixer.update(0);
  }

  // Lift the shadows a little so the player reads at night, plus the white hit flash.
  shade(flash: number) {
    for (const { m, base } of this.mats) m.emissive.copy(base).multiplyScalar(0.45).addScalar(flash * 2);
  }
}

export async function loadModel(name: string) {
  return new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
}
