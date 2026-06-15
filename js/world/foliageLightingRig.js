// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Cycle 103 Phase 2 - the single foliage-lighting authority.
 *
 * Before this module the LOD0 leaf (webgpuTreeLeafNodeMaterial.js) was standard
 * MeshStandard PBR (roughness 1, metalness 0 -> Lambert diffuse + hemispheric
 * ambient, no env map) while the far-tree impostor relit through TWO divergent
 * hand-tuned paths in webgpuKilnImpostorNodeMaterial.js: a half-Lambert `wrap^1.2`
 * + Schlick fresnel rim (octahedral / consolidated) and a separate `*0.65+0.35`,
 * sun `*0.42`, flat-floor model (latlon / per-chunk). Those deviations are exactly
 * the brightness/colour step a viewer sees at the LOD0->impostor switch (~200m).
 *
 * Per Cycle 103 Q1 (Matt's call: "calibrate impostor to PBR"), the impostor is
 * calibrated to REPRODUCE the LOD0 leaf's PBR-Lambert response, not the reverse -
 * the LOD0 mesh is the match reference and its look is untouched. So the rig
 * defaults reduce the impostor to the same Lambert direct term + the same
 * PI-consistent hemispheric ambient the MeshStandard leaf already produces; the
 * old wrap, fresnel, subsurface, and floor all retire to zero.
 *
 * `directWrap` is the ONE reserved canopy-aggregation knob: 0 = pure Lambert (the
 * PBR match, the Cycle 103 default), 1 = full half-Lambert. A single far-tree
 * impostor billboard carries one blended normal, so its shadow side can read
 * darker than the AGGREGATE of many LOD0 leaves around a sphere. If the Phase 6
 * paired visual shows that step, raise `directWrap` slightly - here, in one place,
 * with Matt's eyes - rather than re-introducing per-path magic.
 *
 * Units: ambient/ground are PI-pre-multiplied irradiance (sky = ambient, the
 * `RECIPROCAL_PI` in the BRDF cancels the PI). The latlon path historically fed
 * raw (non-PI) ambient; it pre-multiplies by PI at the call site so its dominant
 * ambient brightness is preserved while its sun term becomes PBR-correct.
 */

export const RECIPROCAL_PI = 1 / Math.PI;

export const FOLIAGE_RIG = Object.freeze({
  // The LOD0 leaf is MeshStandard roughness 1 / metalness 0; the impostor matches
  // that Lambert response. The leaf reads these so both sides share one source.
  pbrRoughness: 1.0,
  pbrMetalness: 0.0,
  // 0 = Lambert (the calibrated PBR match, Cycle 103 default). Raise toward 1 only
  // in the Phase 6 paired pass if the canopy shadow side reads too dark.
  directWrap: 0.0,
  // Retired Cycle 103 deviations - kept as named knobs, default off.
  fresnelStrength: 0.0,
  subsurfaceLift: 0.0,
});

/**
 * Hemispheric ambient weight from a normal's up component, matching three's
 * HemisphereLight: mix(ground, sky, 0.5 * N.y + 0.5).
 */
export function hemisphereWeight(nY) {
  return nY * 0.5 + 0.5;
}

/**
 * The LOD0 leaf reference: MeshStandard Lambert diffuse + hemispheric ambient, no
 * env map. Pure JS, in PI-consistent irradiance units, [r,g,b] -> [r,g,b]. This is
 * the response the impostor is calibrated to reproduce.
 */
export function pbrLeafReflectance({ albedo, nDotL, nY, sun, skyIrradiance, groundIrradiance }) {
  const w = hemisphereWeight(nY);
  const direct = Math.max(nDotL, 0);
  return albedo.map((a, i) => (
    (sun[i] * direct + (groundIrradiance[i] + (skyIrradiance[i] - groundIrradiance[i]) * w)) * a * RECIPROCAL_PI
  ));
}

/**
 * The impostor relight, in the SAME units and shape. At FOLIAGE_RIG defaults
 * (directWrap/fresnelStrength/subsurfaceLift all 0) this is byte-identical to
 * pbrLeafReflectance - that identity is the calibration the parity test pins.
 */
export function impostorReflectance(
  { albedo, nDotL, nY, nDotV, sun, skyIrradiance, groundIrradiance },
  rig = FOLIAGE_RIG,
) {
  const w = hemisphereWeight(nY);
  const lambert = Math.max(nDotL, 0);
  const halfLambert = Math.min(Math.max(nDotL * 0.5 + 0.5, 0), 1);
  const direct = lambert + (halfLambert - lambert) * rig.directWrap;
  const fres = rig.fresnelStrength > 0 && Number.isFinite(nDotV)
    ? Math.pow(1 - Math.max(nDotV, 0), 5) * rig.fresnelStrength
    : 0;
  return albedo.map((a, i) => (
    (sun[i] * direct + (groundIrradiance[i] + (skyIrradiance[i] - groundIrradiance[i]) * w)) * a * RECIPROCAL_PI
    + a * rig.subsurfaceLift
    + sun[i] * fres
  ));
}

/**
 * TSL node builder: the single impostor relight path. Both impostor materials
 * call this so there is one relight model, not two. Mirrors impostorReflectance.
 * All nodes are object-space. `viewDirObj` is only needed when fresnelStrength > 0.
 *
 * @param {object} TSL the three TSL namespace (dot, max, clamp, mix, pow, float, normalize)
 * @param {object} inputs { albedo, normal, sunDirObj, sunColor, skyIrradiance, groundIrradiance, viewDirObj }
 * @param {object} [rig] FOLIAGE_RIG or an override merged over it
 */
export function buildFoliageImpostorColorNode(TSL, inputs, rig = FOLIAGE_RIG) {
  const { dot, max, clamp, mix, pow, float, normalize } = TSL;
  const { albedo, normal, sunDirObj, sunColor, skyIrradiance, groundIrradiance, viewDirObj } = inputs;
  const dotNL = dot(normal, sunDirObj);
  const lambert = max(dotNL, float(0));
  const direct = rig.directWrap > 0
    ? mix(lambert, clamp(dotNL.mul(0.5).add(0.5), float(0), float(1)), float(rig.directWrap))
    : lambert;
  const hemi = normal.y.mul(0.5).add(0.5);
  const indirect = mix(groundIrradiance, skyIrradiance, hemi);
  let reflected = sunColor.mul(direct).add(indirect).mul(albedo.mul(float(RECIPROCAL_PI)));
  if (rig.subsurfaceLift > 0) {
    reflected = reflected.add(albedo.mul(float(rig.subsurfaceLift)));
  }
  let lit = reflected;
  if (rig.fresnelStrength > 0 && viewDirObj) {
    const dotNV = max(dot(normal, normalize(viewDirObj)), float(0));
    const fres = pow(float(1).sub(dotNV), float(5)).mul(float(rig.fresnelStrength));
    lit = lit.add(sunColor.mul(fres));
  }
  return lit;
}
