import * as THREE from 'three';

// Render height is fixed; width follows the window's aspect so there are no bars.
export const H = 270;
export const view = { w: 480, h: H };
export const PPU = 20; // render pixels per world unit
export const YAW = Math.PI / 4;
export const PITCH = (30 * Math.PI) / 180;
const CAM_DIST = 80;

// PS1 vertex snap grid (2 render px), shared by all world materials.
export const snapRes = { value: new THREE.Vector2(240, H / 2) };

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const thresholdFrag = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
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
  private rtScene: THREE.WebGLRenderTarget;
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
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;

    const opts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtScene = new THREE.WebGLRenderTarget(view.w, H, { ...opts, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rtA = new THREE.WebGLRenderTarget(view.w / 3, H / 3, opts);
    this.rtB = new THREE.WebGLRenderTarget(view.w / 3, H / 3, opts);
    this.thr = pass(thresholdFrag, { tSrc: { value: this.rtScene.texture } });
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
    this.camera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 1, 200);
    this.off = new THREE.Vector3(
      Math.sin(YAW) * Math.cos(PITCH) * CAM_DIST,
      Math.sin(PITCH) * CAM_DIST,
      Math.cos(YAW) * Math.cos(PITCH) * CAM_DIST,
    );
    this.camera.position.copy(this.off);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    this.camRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.camUp.setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.camBack.copy(this.off).normalize();
    this.camFwdGround.set(-this.off.x, 0, -this.off.z).normalize();
  }

  // Match the render width to a window aspect ratio (height stays 270).
  resize(aspect: number) {
    const w = Math.max(320, Math.min(760, Math.round((H * aspect) / 2) * 2));
    if (w === view.w) return;
    view.w = w;
    this.renderer.setSize(w, H, false);
    this.rtScene.setSize(w, H);
    this.rtA.setSize(Math.floor(w / 3), H / 3);
    this.rtB.setSize(Math.floor(w / 3), H / 3);
    this.camera.left = -w / 2 / PPU;
    this.camera.right = w / 2 / PPU;
    this.camera.updateProjectionMatrix();
    snapRes.value.set(w / 2, H / 2);
  }

  // Snap a world point so it lands on whole render pixels on screen.
  snap(p: THREE.Vector3) {
    const tx = p.dot(this.camRight);
    const ty = p.dot(this.camUp);
    const sx = Math.round(tx * PPU) / PPU - tx;
    const sy = Math.round(ty * PPU) / PPU - ty;
    p.addScaledVector(this.camRight, sx).addScaledVector(this.camUp, sy);
    return p;
  }

  setTarget(x: number, z: number, t: number) {
    const p = this.camTarget.set(x, 0, z);
    if (this.shake > 0) {
      const s = Math.min(this.shake, 1) * 0.3;
      p.addScaledVector(this.camRight, Math.sin(t * 91) * s).addScaledVector(this.camUp, Math.cos(t * 73) * s);
    }
    this.snap(p);
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
    r.setRenderTarget(this.rtScene);
    r.render(scene, this.camera);
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
