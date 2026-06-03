// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 23 Phase A2 — camera-to-dog occlusion fade.
 *
 * Per-fragment patch that hash-discards leaf pixels when a fragment lies
 * inside a thin view-space capsule between the camera and the dog. The
 * effect: trees (specifically their leaves) standing between camera and
 * player turn into a stochastic dither curtain, restoring line-of-sight
 * without removing silhouette. Reuses the alphaHash idiom from Cycle 22
 * Phase B (same hash function so the dither pattern reads coherent across
 * tiers when an alpha-hash band ALSO triggers on the same fragment).
 *
 * Wiring:
 *
 *   import { patchMaterialOccluder, getOccluderUniforms } from './shaders/OccluderFadePatch.js';
 *   const occluderUniforms = getOccluderUniforms({ radius: 1.5 });
 *   patchMaterialOccluder(leafMat, occluderUniforms);
 *   // each frame:
 *   occluderUniforms.uOccluderDogVS.value.copy(dogWorldPos).applyMatrix4(camera.matrixWorldInverse);
 *   occluderUniforms.uOccluderStrength.value = isFollowOrFree ? 1.0 : 0.0;
 *
 * Why view space + not world space: avoids a `worldPosition` varying.
 * Three's `mvPosition` is already computed in the standard vertex chunk
 * chain, so we propagate that to the fragment as `vOccluderViewPos` and
 * compute capsule distance in view space — camera is at origin, dog is
 * the supplied uniform.
 *
 * Composition: chains with prior `material.onBeforeCompile` patches
 * (wind, desat). Idempotent — if patched twice the second patch shadows
 * the first via the `prev` chain.
 */

import * as THREE from 'three';

const DEFAULT_RADIUS = 1.5;
const DEFAULT_STRENGTH = 0.0;
const DEFAULT_PEAK_DISCARD = 0.85;

/**
 * Build a uniforms object suitable for sharing across every patched
 * material in a scene. One instance keeps everything in lock-step.
 *
 * @param {{ radius?: number, strength?: number, peakDiscard?: number }} [opts]
 */
export function getOccluderUniforms(opts = {}) {
  return {
    uOccluderDogVS:    { value: new THREE.Vector3(0, 0, -100) },  // far-away default = no effect
    uOccluderRadius:   { value: opts.radius   ?? DEFAULT_RADIUS },
    uOccluderStrength: { value: opts.strength ?? DEFAULT_STRENGTH },
    uOccluderPeak:     { value: opts.peakDiscard ?? DEFAULT_PEAK_DISCARD },
  };
}

/**
 * Patch a MeshStandardMaterial (or any material whose vertex shader runs
 * through Three's standard chunk chain) with a view-space capsule fade.
 *
 * @param {THREE.Material} material
 * @param {ReturnType<typeof getOccluderUniforms>} uniforms
 */
export function patchMaterialOccluder(material, uniforms) {
  if (!material) return;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof prev === 'function') prev(shader, renderer);

    shader.uniforms.uOccluderDogVS    = uniforms.uOccluderDogVS;
    shader.uniforms.uOccluderRadius   = uniforms.uOccluderRadius;
    shader.uniforms.uOccluderStrength = uniforms.uOccluderStrength;
    shader.uniforms.uOccluderPeak     = uniforms.uOccluderPeak;

    // VERTEX: pipe view-space position through to fragment.
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying vec3 vOccluderViewPos;'
        ].join('\n')
      )
      .replace(
        '#include <fog_vertex>',
        [
          '#include <fog_vertex>',
          'vOccluderViewPos = mvPosition.xyz;'
        ].join('\n')
      );

    // FRAGMENT: capsule-distance check + hash discard. Inserted before
    // <fog_fragment> so a fragment that fades out doesn't waste fog math.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying vec3 vOccluderViewPos;',
          'uniform vec3 uOccluderDogVS;',
          'uniform float uOccluderRadius;',
          'uniform float uOccluderStrength;',
          'uniform float uOccluderPeak;'
        ].join('\n')
      )
      .replace(
        '#include <fog_fragment>',
        [
          // Capsule fade BEFORE fog so fog isn't wasted on discarded pixels.
          'if (uOccluderStrength > 0.001) {',
          '  vec3 ab = uOccluderDogVS;',
          '  float abLenSq = dot(ab, ab);',
          '  if (abLenSq > 0.01) {',
          '    float t = clamp(dot(vOccluderViewPos, ab) / abLenSq, 0.0, 1.0);',
          '    vec3 closest = t * ab;',
          '    float dist = length(vOccluderViewPos - closest);',
          '    float fade = (1.0 - smoothstep(uOccluderRadius * 0.5, uOccluderRadius, dist)) * uOccluderStrength;',
          '    if (fade > 0.001) {',
          // Same hash function as the kiln-impostor alpha-hash to keep
          // the dither pattern visually coherent across LOD tiers.
          '      vec2 fc = floor(gl_FragCoord.xy);',
          '      float h = fract(1.0e4 * sin(17.0 * fc.x + 0.1 * fc.y) * (0.1 + abs(sin(13.0 * fc.y + fc.x))));',
          '      if (h < fade * uOccluderPeak) discard;',
          '    }',
          '  }',
          '}',
          '#include <fog_fragment>'
        ].join('\n')
      );
  };
  material.needsUpdate = true;
}
