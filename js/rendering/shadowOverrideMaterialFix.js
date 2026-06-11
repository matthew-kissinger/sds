// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 92: suppress the shadow override material's per-frame version churn.
 *
 * The WebGPU renderer's shadow pass renders the whole caster set through ONE
 * shared override NodeMaterial per light (three r184 `getShadowMaterial`),
 * mutating it per object: alphaTest, alphaMap, transparent, side, node slots.
 * `Material.alphaTest`'s setter bumps `material.version` whenever the value
 * crosses zero - so a caster set that mixes alphaTest 0 (opaque trunks,
 * structures, the dog) with alphaTest > 0 (canopy cross-billboard casters)
 * bumps the shared material's version several times per depth pass, every
 * frame. Each bump makes every shadow RenderObject fail its
 * `renderObject.version !== material.version` check next frame and recompute
 * its full material cache key (string building via getOwnPropertyNames /
 * join / sort). Measured on NSL driven survival: ~221 full recomputes per
 * frame, ~4GB of string garbage per 30s run, 95% of frame hitches
 * GC-correlated (cycle92-validation/jitter-nsl-attr-a.json + ATTRIBUTION.md).
 *
 * The bump is redundant for SDS content: per-object pipeline selection
 * happens when the RenderObject's cache key is computed from the override
 * material's just-mutated state at fetch time, and no SDS object changes its
 * alphaTest at runtime. Replacing the instance's alphaTest with a
 * non-bumping accessor keeps the per-object shader variants (alphaTest still
 * lands in each RenderObject's material cache key) while eliminating the
 * per-frame re-key churn.
 *
 * Scoped deliberately to the shadow-pass override material instance - the
 * accessor is installed on the instance, never the Material prototype, and
 * only when `isShadowPassMaterial` is true.
 */
export function suppressShadowOverrideVersionChurn(material) {
    if (!material || material.isShadowPassMaterial !== true) return false;
    if (material.userData?.sdsNoAlphaTestVersionBump) return false;
    material.userData.sdsNoAlphaTestVersionBump = true;
    let current = material.alphaTest;
    Object.defineProperty(material, 'alphaTest', {
        configurable: true,
        get: () => current,
        set: (v) => { current = v; },
    });
    return true;
}
