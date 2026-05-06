/**
 * Cycle 25 Phase C — height-fog density patch.
 *
 * Replaces the standard linear `<fog_fragment>` chunk with an exponential
 * height-density model: `density(y) = ρ₀ * exp(-(y - y₀) / H)`. Closed-form
 * line integral along the view ray gives a per-fragment fog factor that
 * varies by altitude — distant trees on a hill silhouette through less
 * fog than equally-distant trees in the valley.
 *
 * Composes with any prior `material.onBeforeCompile` (chains `prev`).
 *
 * Why this and not the full Hillaire 2020 aerial-perspective LUT? The LUT
 * was the original Phase C plan but is genuinely multi-day work to ship
 * cleanly (3D-texture lifecycle + sun-driven regen + per-material LUT
 * integration). Height fog is the practical core of "atmospheric truth":
 * it replaces the structural fog wall with an altitude-aware haze that
 * reads correctly from every camera angle. The full LUT can land later
 * as a relighting input layered on top of this density.
 *
 * Usage:
 *   import { patchMaterialHeightFog } from './shaders/HeightFogPatch.js';
 *   patchMaterialHeightFog(material, { densityScale: 1.0, scaleHeight: 40, anchorY: 0 });
 *
 * The patched material reads `fogColor` injected by Three's standard fog
 * include, so the material must have `fog: true` (default for
 * MeshStandardMaterial under a scene with fog).
 *
 * Tunables:
 *   densityScale  — multiplier on the base density derived from the scene's
 *                   linear fog `near`/`far` (preserves rough visual parity
 *                   when first applied). Default 1.0.
 *   scaleHeight   — H in metres. Larger = fog density falls off slower
 *                   with altitude (distant mountains stay hazy). Default 40.
 *   anchorY       — y₀, the altitude at which fog density equals the base
 *                   value. Default 0 (sea level).
 */

const DEFAULT_DENSITY_SCALE = 1.0;
const DEFAULT_SCALE_HEIGHT = 40.0;
const DEFAULT_ANCHOR_Y = 0.0;

export function getHeightFogUniforms(opts = {}) {
  return {
    uHfogDensityScale: { value: opts.densityScale ?? DEFAULT_DENSITY_SCALE },
    uHfogScaleHeight:  { value: opts.scaleHeight  ?? DEFAULT_SCALE_HEIGHT },
    uHfogAnchorY:      { value: opts.anchorY      ?? DEFAULT_ANCHOR_Y },
  };
}

/**
 * Patch a material whose fragment shader runs Three's standard fog
 * include. Replaces the `<fog_fragment>` chunk with an exponential
 * height-density integral.
 *
 * @param {THREE.Material} material
 * @param {{ uHfogDensityScale:{value:number}, uHfogScaleHeight:{value:number}, uHfogAnchorY:{value:number} }} uniforms
 */
export function patchMaterialHeightFog(material, uniforms) {
  if (!material) return;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof prev === 'function') prev(shader, renderer);

    shader.uniforms.uHfogDensityScale = uniforms.uHfogDensityScale;
    shader.uniforms.uHfogScaleHeight  = uniforms.uHfogScaleHeight;
    shader.uniforms.uHfogAnchorY      = uniforms.uHfogAnchorY;

    // VERTEX: pipe view-space distance + world-space y of camera + fragment
    // through to the fragment shader.
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'varying float vHfogDist;',
          'varying float vHfogWorldY;',
          'varying float vHfogCameraY;',
        ].join('\n'),
      )
      .replace(
        '#include <fog_vertex>',
        [
          '#include <fog_vertex>',
          // mvPosition is set earlier in the standard chain; its -z is
          // forward depth in view space. worldPosition is also computed
          // earlier (when world_pos_pars_vertex is included).
          'vHfogDist = -mvPosition.z;',
          '#ifdef USE_FOG',
          '  vHfogWorldY = (modelMatrix * vec4(position, 1.0)).y;',
          '  vHfogCameraY = cameraPosition.y;',
          '#endif',
        ].join('\n'),
      );

    // FRAGMENT: replace the linear fog with the exponential height
    // integral. The closed-form for ρ₀ * exp(-(y - y₀) / H) integrated
    // along a ray from the camera to the fragment is:
    //   τ = ρ₀ * H * (exp(-(y_cam - y₀)/H) - exp(-(y_frag - y₀)/H)) /
    //       (y_cam - y_frag) * dist        if |y_cam - y_frag| > ε
    //   τ = ρ₀ * exp(-(y_avg - y₀)/H) * dist                          otherwise
    // (`y_avg = (y_cam + y_frag) / 2` for the degenerate horizontal-ray
    // case where the closed-form denominator vanishes.)
    //
    // fogFactor = 1 - exp(-τ); composed with fogColor like Three's
    // standard fog. ρ₀ is derived from the scene's linear fog near/far
    // — Three exposes `fogNear` + `fogFar` uniforms when USE_FOG is on
    // and the scene fog is `THREE.Fog`. We approximate the equivalent
    // base density that produces the same "1.0 at far, 0.0 at near"
    // shape on the y_anchor altitude.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'uniform float uHfogDensityScale;',
          'uniform float uHfogScaleHeight;',
          'uniform float uHfogAnchorY;',
          'varying float vHfogDist;',
          'varying float vHfogWorldY;',
          'varying float vHfogCameraY;',
        ].join('\n'),
      )
      .replace(
        '#include <fog_fragment>',
        [
          '#ifdef USE_FOG',
          '  // Base density picked so that on the anchor altitude the',
          '  // attenuation matches the legacy linear fogNear/fogFar curve',
          '  // when densityScale = 1. ρ₀ ≈ 4 / (fogFar - fogNear) gives',
          '  // ~98% saturation at fogFar, ~2% at fogNear (1 - e^{-4} ≈ 0.98).',
          '  #ifdef FOG_EXP2',
          '    float baseDensity = fogDensity;',
          '  #else',
          '    float fogRange = max(1.0, fogFar - fogNear);',
          '    float baseDensity = 4.0 / fogRange;',
          '  #endif',
          '  baseDensity *= uHfogDensityScale;',
          '',
          '  float dy = vHfogCameraY - vHfogWorldY;',
          '  float yAvg = 0.5 * (vHfogCameraY + vHfogWorldY);',
          '  float tau;',
          '  if (abs(dy) > 0.5) {',
          '    float kc = exp(-(vHfogCameraY - uHfogAnchorY) / uHfogScaleHeight);',
          '    float kf = exp(-(vHfogWorldY  - uHfogAnchorY) / uHfogScaleHeight);',
          '    tau = baseDensity * uHfogScaleHeight * (kc - kf) / dy * vHfogDist;',
          '  } else {',
          '    tau = baseDensity * exp(-(yAvg - uHfogAnchorY) / uHfogScaleHeight) * vHfogDist;',
          '  }',
          '  float hfogFactor = 1.0 - exp(-max(0.0, tau));',
          '  // Subtract a soft near offset so close fragments don\'t pick up haze.',
          '  hfogFactor *= smoothstep(fogNear * 0.5, fogFar, vHfogDist);',
          '  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, hfogFactor);',
          '#endif',
        ].join('\n'),
      );
  };
  material.needsUpdate = true;
}
