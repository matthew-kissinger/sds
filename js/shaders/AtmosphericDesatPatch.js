/**
 * Cycle 22 Phase C — atmospheric desaturation toward fog.
 *
 * Per-fragment patch that fades a material toward (luma + fogColor mix) as
 * view-space distance grows. The Sable / Tiny Glade / Townscaper idiom: stop
 * trying to read distant trees as full-color objects, embrace atmospheric
 * perspective so distant clusters pass as silhouettes against the sky.
 *
 * Wiring:
 *
 *   import { patchMaterialDesat, getDesatUniforms } from './shaders/AtmosphericDesatPatch.js';
 *   const desatUniforms = getDesatUniforms({ start: 100, end: 320, strength: 0.6 });
 *   patchMaterialDesat(mat, desatUniforms);
 *
 * The shared uniform handle is reused across every leaf MeshStandardMaterial
 * (LOD0 + LOD1) AND the kiln-impostor ShaderMaterial (also patched, see
 * `js/kiln-impostor-material.js` for the inline equivalent — different
 * shader so it's duplicated rather than shared, but the same math).
 *
 * Composition: chains with any prior `material.onBeforeCompile` (e.g. the
 * wind patch in `TerrainBuilder._patchTreeWindMaterial`). Reads `fogColor`
 * which Three injects via `<fog_pars_fragment>`, so the material must have
 * `fog: true` (default for MeshStandardMaterial under a scene with fog).
 *
 * Defaults: start=100m, end=320m, strength=0.6. start lifted high enough
 * that near-tree (<60m) saturation is unchanged; end pinned in the impostor
 * band so the LOD2 takeover at 200m happens within an already-desaturated
 * region (smooth visual continuity).
 */

import * as THREE from 'three';

const DEFAULT_START_M = 100;
const DEFAULT_END_M = 320;
const DEFAULT_STRENGTH = 0.6;

/**
 * Build a uniforms object suitable for sharing across every patched
 * material in a scene. Same instance keeps everything in lock-step on
 * runtime tweaks.
 *
 * @param {{ start?: number, end?: number, strength?: number }} [opts]
 */
export function getDesatUniforms(opts = {}) {
  return {
    uDesatStartM:    { value: opts.start    ?? DEFAULT_START_M },
    uDesatEndM:      { value: opts.end      ?? DEFAULT_END_M },
    uDesatStrength:  { value: opts.strength ?? DEFAULT_STRENGTH },
  };
}

/**
 * Patch a MeshStandardMaterial (or any material whose fragment shader runs
 * through Three's standard fog include path) with view-space-distance
 * desaturation toward the scene's fog color. Idempotent (subsequent calls
 * with the same uniforms shadow the prior patch via the chained `prev`).
 *
 * @param {THREE.Material} material
 * @param {{ uDesatStartM: {value:number}, uDesatEndM: {value:number}, uDesatStrength: {value:number} }} uniforms
 */
export function patchMaterialDesat(material, uniforms) {
  if (!material) return;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof prev === 'function') prev(shader, renderer);

    shader.uniforms.uDesatStartM   = uniforms.uDesatStartM;
    shader.uniforms.uDesatEndM     = uniforms.uDesatEndM;
    shader.uniforms.uDesatStrength = uniforms.uDesatStrength;

    // VERTEX: pipe view-space depth through to the fragment.
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying float vDesatDist;'
        ].join('\n')
      )
      .replace(
        '#include <fog_vertex>',
        [
          '#include <fog_vertex>',
          // mvPosition is the view-space position; -z is positive forward depth.
          'vDesatDist = -mvPosition.z;'
        ].join('\n')
      );

    // FRAGMENT: mix gl_FragColor toward luma+fogColor based on distance.
    // Inject after `<fog_fragment>` so the desat composes with fog (fog
    // pulls the silhouette toward fogColor; desat pulls saturation out
    // first, so the silhouette reads as a colorless ghost rather than a
    // washed-out version of itself).
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform float uDesatStartM;',
          'uniform float uDesatEndM;',
          'uniform float uDesatStrength;',
          'varying float vDesatDist;'
        ].join('\n')
      )
      .replace(
        '#include <fog_fragment>',
        [
          '#include <fog_fragment>',
          '{',
          '  float dt = smoothstep(uDesatStartM, uDesatEndM, vDesatDist);',
          '  if (dt > 0.0) {',
          '    float lum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));',
          '    vec3 luma = vec3(lum);',
          '    #ifdef USE_FOG',
          '      vec3 fogTint = mix(luma, fogColor, 0.4);',
          '    #else',
          '      vec3 fogTint = luma;',
          '    #endif',
          '    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogTint, dt * uDesatStrength);',
          '  }',
          '}'
        ].join('\n')
      );
  };
  material.needsUpdate = true;
}
