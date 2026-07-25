// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The fence kit's wear model: how a run of fence darkens near the ground and
 * how its rails droop between posts.
 *
 * This module is the SINGLE authority for both, because the fence reaches the
 * screen by two routes that must agree:
 *
 *   1. The baked kit. `tools/bake-fence.mjs` evaluates these same functions at
 *      bake time and writes the result into the GLB's `COLOR_0` attribute, so
 *      the weathering costs nothing at runtime.
 *   2. The procedural fallback in `js/FencePresets.js`, which builds cylinders
 *      and boxes on a machine that never got the kit. It evaluates them at
 *      build time against its own geometry.
 *
 * Keeping the curve in one file is what stops those two fences drifting apart.
 * Cycle 115 Phase 2 authored it; before that the kit had no `COLOR_0` at all
 * and the fallback materials had `vertexColors` off, so neither route had any
 * weathering to share.
 *
 * Deliberately three-free and DOM-free. The bake harness imports it over a
 * static server into a headless Chromium, the client imports it through Vite,
 * and a vitest spec imports it in Node. Geometry arguments are duck-typed
 * (anything with `attributes.position`), not `instanceof BufferGeometry`.
 */

/**
 * The whole wear budget in one object, so a reviewer can see the model without
 * reading the maths.
 *
 * `groundShade` and `undersideShade` are multipliers on the palette colour, not
 * absolute colours: the kit's hue lives in its 32x4 palette texture and the
 * vertex colour only ever darkens it. Values are in three's working (linear)
 * space, which is where `COLOR_0` and a `MeshStandardMaterial`'s vertex-colour
 * multiply both live, so no colour-space conversion belongs anywhere near here.
 *
 * `sagPerSquareMetre` is the parabolic-cable coefficient: a uniformly loaded
 * span sags in proportion to the SQUARE of its length (w*L^2/8T), which is what
 * makes a long run read as heavier than a short one. At the kit's nominal 5m
 * post spacing it yields 60mm, a little over one rail thickness, which is the
 * amount that reads as "hung" rather than "broken" at play distance.
 */
export const FENCE_WEAR = Object.freeze({
    /** Multiplier at ground contact. Matches `tools/bake-rocks` aoMin so a post and a boulder sit in the same dirt. */
    groundShade: 0.55,
    /** Metres over which the ground darkening fades back to full brightness. */
    groundFadeHeight: 0.75,
    /** Multiplier on a fully down-facing face. Rails have no ground reference of their own, so this is all they get. */
    undersideShade: 0.82,
    /** Metres of droop per square metre of span. 0.0024 * 5^2 = 60mm at nominal spacing. */
    sagPerSquareMetre: 0.0024,
    /** Hard ceiling, so a freak long span cannot droop a rail into the grass. */
    sagMax: 0.10,
});

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Hermite smoothstep on an already-clamped t. */
const smooth = (t) => t * t * (3 - 2 * t);

/**
 * How much darker a surface is for sitting `height` metres above the ground.
 * 1.0 well clear of the ground, `groundShade` at contact.
 *
 * Smoothstep rather than linear because a linear ramp puts its only crease at
 * the top of the fade, exactly where the eye is looking on a 2.18m post.
 *
 * @param {number} height metres above the piece's ground contact
 * @returns {number} multiplier in [groundShade, 1]
 */
export function groundWeatherFactor(height) {
    const t = smooth(clamp01(height / FENCE_WEAR.groundFadeHeight));
    return FENCE_WEAR.groundShade + (1 - FENCE_WEAR.groundShade) * t;
}

/**
 * How much darker a surface is for facing downward. Up-facing and vertical
 * faces are untouched; a fully down-facing face gets `undersideShade`.
 *
 * This is the only weathering a rail can carry, because a rail's authored
 * geometry is centred on its own origin and has no idea whether it will be
 * placed at 0.5m or at 1.9m.
 *
 * @param {number} normalY the surface normal's Y component, unit length
 * @returns {number} multiplier in [undersideShade, 1]
 */
export function undersideWeatherFactor(normalY) {
    return 1 - (1 - FENCE_WEAR.undersideShade) * clamp01(-normalY);
}

/**
 * Droop in metres at the midpoint of a rail spanning `span` metres.
 * @param {number} span horizontal distance between the two posts, metres
 * @returns {number}
 */
export function railSagDepth(span) {
    if (!(span > 0)) return 0;
    return Math.min(FENCE_WEAR.sagMax, FENCE_WEAR.sagPerSquareMetre * span * span);
}

/**
 * Write a `color` attribute carrying this wear model onto a geometry.
 *
 * Used by the procedural fallback, which has no baked `COLOR_0` to inherit.
 * The bake harness computes the same product per vertex as it authors the mesh,
 * where it also has a per-ring grain term to fold in.
 *
 * @param {{attributes: {position: {count: number, getY(i: number): number}, normal?: {getY(i: number): number}}, setAttribute: Function}} geometry
 * @param {object} [options]
 * @param {number|null} [options.footY] Local Y of the piece's ground contact.
 *   `null` disables the ground term, which is right for anything (a rail) whose
 *   local origin is not on the ground.
 * @param {Function} [options.BufferAttributeCtor] three's `BufferAttribute`.
 *   Injected rather than imported so this module stays three-free.
 * @returns {object} the same geometry, for chaining
 */
export function writeFenceVertexColors(geometry, { footY = 0, BufferAttributeCtor } = {}) {
    const position = geometry?.attributes?.position;
    if (!position || !BufferAttributeCtor) return geometry;
    const normal = geometry.attributes?.normal ?? null;
    const count = position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        let shade = 1;
        if (footY !== null) shade *= groundWeatherFactor(position.getY(i) - footY);
        if (normal) shade *= undersideWeatherFactor(normal.getY(i));
        colors[i * 3 + 0] = shade;
        colors[i * 3 + 1] = shade;
        colors[i * 3 + 2] = shade;
    }
    geometry.setAttribute('color', new BufferAttributeCtor(colors, 3));
    return geometry;
}

/**
 * Bend a straight rail geometry into a parabolic droop, in place.
 *
 * The droop is applied in the rail's LOCAL frame on purpose. Both consumers
 * rotate the finished rail to point at the next post, so a locally-applied sag
 * rides that rotation: on a slope the droop tilts with the chord instead of
 * fighting it. `StructureBuilder._slopeRailToTerrain` and the instanced path's
 * `railRotation` are both minimal rotations from the geometry's long axis to
 * the chord, so at pasture-scale gradients the sag stays within a few degrees
 * of vertical, which is the read we want.
 *
 * The caller must pass a geometry it owns. The instanced path clones the kit's
 * rail geometry per fence segment, and the procedural fallback builds one box
 * per rail, so both already do. `userData` is REPLACED rather than mutated
 * because `BufferGeometry.copy` shares the source's `userData` object by
 * reference, and mutating it here would mark every future clone as sagged.
 *
 * Normals are deliberately left alone. At the nominal 5m span the droop tilts
 * the end faces by about 2.7 degrees, which is below the threshold where a
 * re-shade is visible on a matte painted-wood material, and recomputing them
 * would cost a full face pass per fence segment at scene load.
 *
 * ## Why `metresPerUnit` exists
 *
 * The baked kit ships Draco + meshopt compressed, which means
 * `KHR_mesh_quantization`: positions arrive as normalised 16-bit integers in
 * [-1, 1] with a scale on the mesh's own node putting them back into metres.
 * `getY`/`setY` undo the 16-bit part (three's `BufferAttribute` normalises in
 * its accessors), but nothing here can see that node scale, so the caller has
 * to hand it over. A droop measured in metres written straight into a
 * quantised buffer would come out at whatever fraction of a metre the
 * quantisation volume happened to be.
 *
 * Pass 1 for anything authored in metres, which is what the procedural
 * fallback's boxes are.
 *
 * @param {{attributes: {position: {count: number, getX(i:number):number, getY(i:number):number, getZ(i:number):number, setY(i:number,v:number):unknown, needsUpdate: boolean}}, userData?: object, computeBoundingBox?: Function, computeBoundingSphere?: Function}} geometry
 * @param {number} span horizontal distance between the two posts, metres
 * @param {object} [options]
 * @param {'x'|'z'} [options.longAxis] which local axis the rail runs along
 * @param {number} [options.metresPerUnit] world metres per unit of the geometry's own Y
 * @returns {number} the sag depth actually applied, metres
 */
export function applyRailSag(geometry, span, { longAxis = 'x', metresPerUnit = 1 } = {}) {
    const position = geometry?.attributes?.position;
    const sag = railSagDepth(span);
    if (!position || sag <= 0 || !(metresPerUnit > 0)) return 0;

    const count = position.count;
    const readAxis = longAxis === 'z' ? (i) => position.getZ(i) : (i) => position.getX(i);

    // Normalise against the geometry's OWN extent rather than assuming a unit
    // rail. The kit's rail is 1.0 long and gets stretched to the span at draw
    // time; the procedural fallback's box is already built at span length; a
    // quantised kit's rail is neither.
    let extent = 0;
    for (let i = 0; i < count; i++) {
        const a = Math.abs(readAxis(i));
        if (a > extent) extent = a;
    }
    if (!(extent > 0)) return 0;

    const sagInUnits = sag / metresPerUnit;
    for (let i = 0; i < count; i++) {
        const t = readAxis(i) / extent;   // -1 at one post, +1 at the other
        position.setY(i, position.getY(i) - sagInUnits * (1 - t * t));
    }
    position.needsUpdate = true;
    geometry.userData = { ...(geometry.userData ?? {}), fenceRailSagSpan: span, fenceRailSagDepth: sag };
    geometry.computeBoundingBox?.();
    geometry.computeBoundingSphere?.();
    return sag;
}
