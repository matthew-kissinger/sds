// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * The gate cue's numbers, and the gate-post rim (Cycle 116 Phase 3-A).
 *
 * WHAT THIS OWNS. Every scalar the near-field half of the four-state cue reads:
 * where the near/far handover sits, how big the ground threshold arc is for a
 * given destination, what warm the whole cue is painted in, and how the arc
 * brightens as the flock funnels in. It owns no geometry and no scene-graph
 * node. `js/effects/GateThresholdArc.js` builds the arc mesh and imports these;
 * `js/effects/GateColumn.js` owns the per-frame hook and imports
 * {@link gateRimFactor} rather than inventing a second near threshold. One
 * number in one file is the whole point: two phases each picking their own 60m
 * is how the column and the arc end up handing over at different distances on
 * different scenes.
 *
 * THIS MODULE MUST NOT IMPORT `gateCue.js`, AND THAT IS A MEASUREMENT RATHER
 * THAN A PREFERENCE (Phase 3-B). It is pulled into the built `main-*.js` chunk
 * because `js/FencePresets.js` calls {@link applyGatePostRim} on a synchronous
 * gate-construction path. `gateCue.js` is not: it is reached only from the
 * lazily loaded cue (`js/boot/initWorld.js` imports `GateColumn.js` on demand),
 * so it rides in that chunk and costs the measured one nothing. The moment a
 * function that main actually CALLS
 * reaches into `gateCue.js`, rollup assigns that whole module to `main-*.js`
 * instead: measured at +2,663 bytes against 80 bytes of remaining headroom on a
 * fenced ratchet. Phase 3-A imported the two handover constants from there and
 * got away with it only because the importing function was dead code in main and
 * was shaken out; Phase 3-B's arc made it live. So the constants are declared
 * HERE and `gateCue.js` re-exports them, which keeps one declaration and points
 * the edge the harmless way: a lazily loaded chunk reading from the eagerly
 * loaded one. `tests/gate-threshold-arc.spec.js` fails if the edge is ever
 * pointed back.
 *
 * WHY THE RIM IS EMISSIVE AND NOT A SHADER. `js/world/webgpuRockRimNodeMaterial.js`
 * is the repo's existing rim and it is the cautionary tale rather than the
 * pattern. Its WebGPU half is 25 lines of TSL with no uniform and no setter, so
 * it is a compile-time constant; its WebGL half is an `onBeforeCompile` uniform
 * that `js/main.js` re-writes every frame from the sun colour. The two halves
 * do not even agree on their constants (rimPower 2.0 against 2.25, strength
 * 0.35 against 0.22). A player on a WebGPU machine and a player on a WebGL
 * machine are looking at two different rocks.
 *
 * So this rim is driven by the one mechanism that is provably identical on both
 * paths: `material.emissive` and `material.emissiveIntensity` on a stock
 * material. `js/world/farmhouseMaterialRoles.js` works through why in detail
 * (three's EMISSIVE material scope resolves to `materialReference('emissive')`
 * and `materialReference('emissiveIntensity')`, and `MaterialReferenceNode`
 * re-resolves those against the rendered object's ORIGINAL material every
 * frame), and `js/atmosphere/duskLamp.js` is the shipped worked example: the
 * homestead lantern animates on WebGPU with no node twin at all. Writing one
 * float lights the rim on both backends, from one call site, with one number.
 *
 * What that costs is the view-dependent fresnel a true rim term has. A gate
 * post is a 0.4m square section seen from an aerial camera; the fresnel band on
 * one would be a couple of pixels wide. What the player actually needs to read
 * at that size is "these two posts are warm and the fence either side is not",
 * and a flat emissive lift delivers exactly that, on every machine, for free.
 * A node twin would buy the falloff and re-open the drift this file exists to
 * close, and Cycle 116 hard stop 5 forbids a new node-material module anyway.
 */

/**
 * THE near threshold, in metres from the dog to the destination.
 *
 * One number, one file, read by every surface that has an opinion about
 * far-versus-near: the world-space column (`js/effects/GateColumn.js`), the
 * ground threshold arc (`js/effects/GateThresholdArc.js`), the gate-post rim
 * below, and the screen-edge chevron (which since Phase 5 does not read it at
 * all: the cue resolves the far/near state and publishes the answer, and
 * `js/components/GameHUD/CorralCompass.tsx` renders what it is given). Two
 * thresholds in two files is the drift this constant exists to prevent, so
 * nothing downstream keeps its own copy:
 * `js/world/gateCue.js` re-exports it rather than declaring it, and
 * `tests/gate-cue-column.spec.js` fails any consumer that hard-codes the value.
 *
 * 60m is "the destination is now a place rather than a direction": inside it
 * the ground threshold arc is legible and the column would stand in front of
 * the thing it is pointing at.
 *
 * Authored in Phase 2 in `gateCue.js`, moved here in Phase 3-B for the chunking
 * reason in the file header. The value and the semantics are Phase 2's,
 * unchanged.
 */
export const GATE_CUE_NEAR_DISTANCE = 60;

/**
 * Metres above the near threshold over which the column fades up and the arc
 * fades down. The fade band opens ABOVE the threshold rather than straddling
 * it, so the two states are exactly complementary: at or inside the threshold
 * the column contributes nothing at all, and any distance beyond it draws
 * something.
 */
export const GATE_CUE_COLUMN_FADE_SPAN = 25;

/**
 * The cue's warm, in LINEAR RGB.
 *
 * One triple, not a hex, and linear rather than sRGB, because that is the space
 * `Color.setRGB` writes in by default and the space `emissive` is consumed in.
 * A hex constant would need an sRGB decode somewhere, and "somewhere" is how two
 * consumers end up a decode apart. Consumers call `color.setRGB(...GATE_CUE_WARM_LINEAR)`.
 *
 * The value sits between the two warms already shipping. The homestead lantern
 * is (1.00, 0.47, 0.16), which is fire: it has to read as a source seen
 * directly, at night, at eight centimetres across. This is a marker read in
 * daylight against green grass and golden-hour terrain, so it carries more
 * green and blue - far enough from the terrain's own gold to separate from it,
 * not so far that it reads as a UI element pasted onto the world.
 */
export const GATE_CUE_WARM_LINEAR = Object.freeze([1.00, 0.62, 0.26]);

/**
 * Rim materials, cached per SOURCE material instance.
 *
 * This cache is load-bearing, not tidiness. Three facts about the fence system
 * make the naive version leak or bleed:
 *
 *   1. `StructureBuilder.clearAllStructures` disposes GEOMETRIES only and
 *      deliberately never materials, because gate and fence meshes are GLB
 *      clones that share their material with the `FencePresets.loadModels`
 *      cache and disposing one forces a texture re-upload on the next clone.
 *   2. `FencePresets.loadModels` caches the loaded models forever, and
 *      `cloneModel` shares material references with them.
 *   3. Scenes swap freely, and every swap rebuilds the gate.
 *
 * So a rim material derived per gate is a material nothing will ever release,
 * once per scene load, for the life of the tab. And the other obvious shortcut,
 * writing the rim onto the source material in place, lights every fence post in
 * the field along with the gate and keeps them lit after the swap.
 *
 * Keying a WeakMap on the source resolves both: one derived material per source
 * material for the session no matter how many gates or swaps, and the derived
 * one becomes collectable the moment the GLB cache that holds the source does.
 * Same reasoning and same shape as `derivedRoleMaterials` in
 * `js/world/farmhouseMaterialRoles.js`.
 *
 * @type {WeakMap<object, object>}
 */
const derivedRimMaterials = new WeakMap();

/** Marker written on a derived material, so a second pass is a no-op. */
export const GATE_POST_RIM_FLAG = 'gatePostRim';

/**
 * `userData` key a built gate structure publishes its rim materials on, for the
 * per-frame owner to hand to {@link setGatePostRimIntensity}. Named here rather
 * than in `js/FencePresets.js` because the writer and the reader live in
 * different files and a string literal in each is a rename waiting to go
 * silently wrong. Same shape as the farmhouse's `userData.duskLampMaterials`.
 */
export const GATE_RIM_MATERIALS_KEY = 'gateRimMaterials';

/**
 * Derive (or fetch) the rim material for one source material.
 *
 * Returns the SAME instance for the same source every time, and returns an
 * already-derived material unchanged, so callers may run over a gate twice
 * without compounding anything. The source is never mutated.
 *
 * Starts at `emissiveIntensity = 0`, so a gate whose rim is never driven
 * renders as it did before this phase. The one thing that is not preserved is a
 * decorative emissive tint the source may have carried: the fully procedural
 * fallback gate in `js/FencePresets.js` uses a Phong material with a 0.1
 * emissive lift, and the derived material replaces the colour it lifts. That
 * branch runs only when neither the gate assembly nor the fence kit loaded, and
 * the tint it loses is under two percent of the post's value. The shipped
 * assets declare no emissive at all, so on every path a player actually sees,
 * an undriven rim is a byte-for-byte no-op.
 *
 * Returns `null` for anything that cannot carry a rim: a missing material, a
 * multi-material array, or an unlit one with no emissive term to drive. The
 * fallback gate's own ground threshold is that last case, and a caller walking a
 * whole gate group should neither pay for a clone that can never do anything nor
 * publish a shared material on a list the per-frame owner writes to. Null rather
 * than the input, so the caller's whole handling is `if (rim)`.
 *
 * @param {object} sourceMaterial - a stock three material (Standard, Phong, Lambert).
 * @returns {object|null} the rim material to assign to the mesh, or null.
 */
export function applyGatePostRim(sourceMaterial) {
    if (!sourceMaterial?.emissive?.setRGB) return null;
    if (sourceMaterial.userData[GATE_POST_RIM_FLAG]) return sourceMaterial;

    const cached = derivedRimMaterials.get(sourceMaterial);
    if (cached) return cached;

    // `Material.copy` deep-copies `userData` through JSON, so the clone's is
    // already its own object and writing the flag on it cannot reach the source.
    const material = sourceMaterial.clone();
    material.emissive.setRGB(...GATE_CUE_WARM_LINEAR);
    material.emissiveIntensity = 0;
    material.userData[GATE_POST_RIM_FLAG] = true;

    derivedRimMaterials.set(sourceMaterial, material);
    return material;
}
