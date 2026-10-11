import * as THREE from 'three';
import { snapRes } from './pipeline';

// Shared x-ray cutout: screen px (x, y with y up), player view depth, radius px.
export const cutout = { value: new THREE.Vector4(0, 0, -1, 30) };

// PS1 vertex snapping on any built-in material: clip-space vertices snap to a 2-pixel grid.
// flash: an instanced float attribute `aFlash` blends the surface to white (hit flash).
// cut: dithered hole around the player for geometry in front of them.
export function ps1<T extends THREE.Material>(mat: T, opts: { flash?: boolean; cut?: boolean } = {}): T {
  const { flash = false, cut = false } = opts;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSnap = snapRes;
    if (cut) sh.uniforms.uCut = cutout;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec2 uSnap;
        ${flash ? 'attribute float aFlash; varying float vFlash;' : ''}
        ${cut ? 'varying float vViewZ;' : ''}`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;
        }
        ${flash ? 'vFlash = aFlash;' : ''}
        ${cut ? 'vViewZ = -mvPosition.z;' : ''}`,
      );
    let f = sh.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      ${flash ? 'varying float vFlash;' : ''}
      ${cut ? 'varying float vViewZ; uniform vec4 uCut;' : ''}`,
    );
    if (cut) {
      f = f.replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (vViewZ < uCut.z - 0.6) {
          vec2 dd = (gl_FragCoord.xy - uCut.xy) / vec2(uCut.w * 0.8, uCut.w);
          float r = dot(dd, dd);
          if (r < 1.0) {
            vec2 p = mod(gl_FragCoord.xy, 2.0);
            float b = (p.x + p.y * 2.0 + 0.5) / 4.0;
            if (b < (1.0 - r) * 2.0) discard;
          }
        }`,
      );
    }
    if (flash) f = f.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(3.0), vFlash);');
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => `ps1${flash ? 'f' : ''}${cut ? 'c' : ''}`;
  return mat;
}
