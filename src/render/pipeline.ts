import * as THREE from 'three';
import { cutout, cutBase } from './ps1';

// Characters render at a fixed 270 px height (pixel art); the environment renders at the full
// window resolution. Width follows the window's aspect so there are no bars.
export const H = 270;
export const view = { w: 480, h: H };
export const PPU = 20; // character render pixels per world unit
export const CHAR_LAYER = 1; // player and enemies; everything else stays on layer 0
export const YAW = Math.PI / 4;
export const PITCH = (30 * Math.PI) / 180;
export const CINE_PITCH = 0.05; // the run intro's low angle: nearly level, so the sky shows above the ground
export const CINE_LIFT = 1.5; // the close-up frames the character low, with sky above
const CAM_DIST = 80;

// PS1 vertex snap grid, shared by all ps1() materials. Set per pass in render().
export const snapRes = { value: new THREE.Vector2(240, H / 2) };

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const thresholdFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 texel; // bloom target texel
varying vec2 vUv;
void main() {
  vec2 o = texel * 0.3;
  vec3 c = 0.25 * (texture2D(tSrc, vUv + o).rgb + texture2D(tSrc, vUv - o).rgb
    + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv - vec2(o.x, -o.y)).rgb);
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * max(l - 0.9, 0.0) / max(l, 1e-4), 1.0);
}
`;

const blurFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
  c += texture2D(tSrc, vUv + dir * 1.385).rgb * 0.316;
  c += texture2D(tSrc, vUv - dir * 1.385).rgb * 0.316;
  c += texture2D(tSrc, vUv + dir * 3.231).rgb * 0.070;
  c += texture2D(tSrc, vUv - dir * 3.231).rgb * 0.070;
  gl_FragColor = vec4(c, 1.0);
}
`;

// The pixel layer (low res, nearest) over the map (full res). Opaque pixels write alpha 1;
// additive effects add their colour on top.
const compFrag = /* glsl */ `
uniform sampler2D tEnv;
uniform sampler2D tChar;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tChar, vUv);
  gl_FragColor = vec4(c.rgb + texture2D(tEnv, vUv).rgb * (1.0 - clamp(c.a, 0.0, 1.0)), 1.0);
}
`;

const finalFrag = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float bloom;
uniform float flash;
uniform vec3 flashColor;
uniform vec3 shadowTint;
uniform float vignette;
uniform float levels;
varying vec2 vUv;

const float BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * bloom;
  c = aces(c);
  c = pow(c, vec3(1.0 / 2.2));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c += shadowTint * pow(1.0 - l, 3.0);
  vec2 d = vUv - 0.5;
  c *= 1.0 - dot(d, d) * vignette;
  c = mix(c, flashColor, flash);
  ivec2 p = ivec2(mod(gl_FragCoord.xy, 4.0));
  float b = BAYER[p.x + p.y * 4] / 16.0 - 0.5;
  c = floor(c * levels + 0.5 + b) / levels;
  gl_FragColor = vec4(c, 1.0);
}
`;

const ZERO = new THREE.Vector3();

function pass(frag: string, uniforms: Record<string, THREE.IUniform>) {
  const m = new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { m, scene };
}

export class Pipeline {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  camTarget = new THREE.Vector3();
  camRight = new THREE.Vector3();
  camUp = new THREE.Vector3();
  camBack = new THREE.Vector3(); // unit vector from target toward camera
  camFwdGround = new THREE.Vector3(); // ground direction that maps to screen up
  scale = 1; // full-res pixels per character pixel
  private rtEnv: THREE.WebGLRenderTarget;
  private rtChar: THREE.WebGLRenderTarget;
  private rtScene: THREE.WebGLRenderTarget;
  private comp;
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private thr;
  private blur;
  private fin;
  private orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private off: THREE.Vector3;
  shake = 0;
  flash = 0;
  flashColor = new THREE.Color(1, 1, 1);
  shadowTint: THREE.Vector3;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(view.w, H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // filtered, soft-edged shadows
    this.renderer.shadowMap.autoUpdate = false; // two passes per frame, one shadow update
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.NoToneMapping;

    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    const near = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.rtEnv = new THREE.WebGLRenderTarget(view.w, H, near);
    this.rtChar = new THREE.WebGLRenderTarget(view.w, H, near);
    this.rtScene = new THREE.WebGLRenderTarget(view.w, H, near);
    this.comp = pass(compFrag, {
      tEnv: { value: this.rtEnv.texture },
      tChar: { value: this.rtChar.texture },
    });
    this.rtA = new THREE.WebGLRenderTarget(view.w / 3, H / 3, opts);
    this.rtB = new THREE.WebGLRenderTarget(view.w / 3, H / 3, opts);
    this.thr = pass(thresholdFrag, { tSrc: { value: this.rtScene.texture }, texel: { value: new THREE.Vector2() } });
    this.blur = pass(blurFrag, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
    this.shadowTint = new THREE.Vector3(0.05, 0.0, 0.08);
    this.fin = pass(finalFrag, {
      tScene: { value: this.rtScene.texture },
      tBloom: { value: this.rtA.texture },
      bloom: { value: 0.9 },
      flash: { value: 0 },
      flashColor: { value: this.flashColor },
      shadowTint: { value: this.shadowTint },
      vignette: { value: 1.1 },
      levels: { value: 31 },
    });

    const hw = view.w / 2 / PPU;
    const hh = H / 2 / PPU;
    // tight depth range (the scene spans ~20-140 from the camera) so close surfaces don't fight
    this.camera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 15, 150);
    this.off = new THREE.Vector3(
      Math.sin(YAW) * Math.cos(PITCH) * CAM_DIST,
      Math.sin(PITCH) * CAM_DIST,
      Math.cos(YAW) * Math.cos(PITCH) * CAM_DIST,
    );
    this.camera.position.copy(this.off);
    this.camera.lookAt(0, 0, 0);
    this.baseQuat.copy(this.camera.quaternion);
    this.camera.updateMatrixWorld();
    this.camRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.camUp.setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.camBack.copy(this.off).normalize();
    this.camFwdGround.set(-this.off.x, 0, -this.off.z).normalize();
  }

  // Size to the window in device pixels. Characters keep a 270 px height, width from the aspect.
  resize(fw: number, fh: number) {
    const w = Math.max(320, Math.min(760, Math.round((H * fw) / fh / 2) * 2));
    view.w = w;
    this.scale = fh / H;
    this.renderer.setSize(fw, fh, false);
    this.rtEnv.setSize(fw, fh);
    this.rtScene.setSize(fw, fh);
    this.rtChar.setSize(w, H);
    this.rtA.setSize(Math.floor(w / 3), H / 3);
    this.rtB.setSize(Math.floor(w / 3), H / 3);
    this.camera.left = -w / 2 / PPU;
    this.camera.right = w / 2 / PPU;
    this.camera.updateProjectionMatrix();
  }

  // Snap a world point so it lands on whole pixels of a grid with `ppu` pixels per unit, relative to `origin`.
  private snapTo(p: THREE.Vector3, origin: THREE.Vector3, ppu: number) {
    const tx = (p.x - origin.x) * this.camRight.x + (p.y - origin.y) * this.camRight.y + (p.z - origin.z) * this.camRight.z;
    const ty = (p.x - origin.x) * this.camUp.x + (p.y - origin.y) * this.camUp.y + (p.z - origin.z) * this.camUp.z;
    p.addScaledVector(this.camRight, Math.round(tx * ppu) / ppu - tx).addScaledVector(this.camUp, Math.round(ty * ppu) / ppu - ty);
    return p;
  }

  // Snap a world point to whole character pixels on screen (call after setTarget).
  snap(p: THREE.Vector3) {
    return this.snapTo(p, this.camTarget, PPU);
  }

  // Cinematic close-up blend for the run intro: 0 = gameplay camera, 1 = close on the target from a
  // lower, side-on angle, zoomed in 3x (a whole number, so sprite texels stay square).
  cine = 0;
  cineYaw = 0.55; // orbit of the close-up, picked per run for a clear view
  viewBack = new THREE.Vector3(); // toward the camera actually in use (gameplay or intro)
  private baseQuat = new THREE.Quaternion();
  private look = new THREE.Vector3();

  setTarget(x: number, z: number, t: number) {
    const cam = this.camera;
    if (this.cine > 0) {
      const k = this.cine;
      const pitch = PITCH + (CINE_PITCH - PITCH) * k;
      const yaw = YAW + this.cineYaw * k;
      this.camTarget.set(x, 0, z);
      this.look.set(x, CINE_LIFT * k, z);
      cam.position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(CAM_DIST).add(this.look);
      cam.lookAt(this.look);
      this.viewBack.copy(cam.position).sub(this.look).normalize();
      cam.zoom = Math.exp(Math.log(3) * k);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      return;
    }
    if (cam.zoom !== 1) {
      cam.zoom = 1;
      cam.updateProjectionMatrix();
    }
    cam.quaternion.copy(this.baseQuat);
    this.viewBack.copy(this.camBack);
    const p = this.camTarget.set(x, 0, z);
    if (this.shake > 0) {
      const s = Math.min(this.shake, 1) * 0.3;
      p.addScaledVector(this.camRight, Math.sin(t * 91) * s).addScaledVector(this.camUp, Math.cos(t * 73) * s);
    }
    this.snapTo(p, ZERO, PPU * this.scale);
    this.camera.position.copy(p).add(this.off);
    this.camera.updateMatrixWorld();
  }

  // World to render-pixel coordinates (origin top-left).
  toScreen(x: number, y: number, z: number, out: { x: number; y: number }) {
    const dx = x - this.camTarget.x;
    const dy = y - this.camTarget.y;
    const dz = z - this.camTarget.z;
    out.x = view.w / 2 + (dx * this.camRight.x + dy * this.camRight.y + dz * this.camRight.z) * PPU;
    out.y = H / 2 - (dx * this.camUp.x + dy * this.camUp.y + dz * this.camUp.z) * PPU;
    return out;
  }

  render(scene: THREE.Scene, bloom: number) {
    const r = this.renderer;
    const cam = this.camera;
    const cb = cutBase;
    const s = this.scale;
    r.shadowMap.needsUpdate = true;
    // map: full res, a fine PS1 vertex wobble
    snapRes.value.set(view.w, H);
    cutout.value.set(cb.x * s, cb.y * s, cb.z, cb.w * s);
    cam.layers.set(0);
    r.setRenderTarget(this.rtEnv);
    r.render(scene, cam);
    // pixel layer at 270 px: the map's depth only (so it still hides what is behind it), then
    // characters and effects over a transparent background
    snapRes.value.set(view.w / 2, H / 2);
    cutout.value.copy(cb);
    const bg = scene.background;
    scene.background = null;
    r.setRenderTarget(this.rtChar);
    r.setClearColor(0x000000, 0); // the map pass left the background colour as the clear colour
    r.clear();
    r.autoClear = false;
    const color = r.state.buffers.color;
    color.setMask(false);
    color.setLocked(true);
    r.render(scene, cam);
    color.setLocked(false);
    color.setMask(true);
    cam.layers.set(CHAR_LAYER);
    r.render(scene, cam);
    r.autoClear = true;
    scene.background = bg;
    cam.layers.set(0);
    r.setRenderTarget(this.rtScene);
    r.render(this.comp.scene, this.orthoCam);
    this.thr.m.uniforms.texel.value.set(1 / this.rtA.width, 1 / this.rtA.height);
    r.setRenderTarget(this.rtA);
    r.render(this.thr.scene, this.orthoCam);
    const bu = this.blur.m.uniforms;
    for (let i = 0; i < 2; i++) {
      bu.tSrc.value = this.rtA.texture;
      bu.dir.value.set(1 / this.rtA.width, 0);
      r.setRenderTarget(this.rtB);
      r.render(this.blur.scene, this.orthoCam);
      bu.tSrc.value = this.rtB.texture;
      bu.dir.value.set(0, 1 / this.rtA.height);
      r.setRenderTarget(this.rtA);
      r.render(this.blur.scene, this.orthoCam);
    }
    const fu = this.fin.m.uniforms;
    fu.bloom.value = bloom;
    fu.flash.value = Math.min(1, this.flash);
    r.setRenderTarget(null);
    r.render(this.fin.scene, this.orthoCam);
  }
}
