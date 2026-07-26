// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The single authority for how the ground is shaded across the four render
 * paths that draw it: the WebGL terrain shader, the WebGPU terrain node
 * material, the WebGL grass shaders (desktop + mobile) and the WebGPU grass
 * blade node material.
 *
 * Why this file exists. Terrain and grass each used to invent their own
 * variation. The terrain has shipped rotated hash value-noise since Cycle 91
 * Phase 7.5 (aperiodic blobs, tuned against Matt's "seems gridded" note),
 * while both grass paths computed `sin(x * 0.2) * cos(z * 0.15)`, a regular
 * plaid at roughly 31m by 42m. A varied ground under a plaid-varied grass
 * layer is exactly why the grass read as a static carpet laid OVER a surface
 * rather than as the surface. Cycle 114 Phase 2 collapses both onto one field,
 * so a blade standing on a browner patch of ground is itself browner.
 *
 * The same reasoning applies to the dog's contact darkening (Cycle 114 Phase
 * 5): if the grass and the terrain darken over different radii, the shadow
 * visibly changes shape as the dog crosses the grass line, which is worse than
 * no shadow at all. One radius, read by both.
 *
 * This follows the precedent set by js/world/foliageLightingRig.js (the single
 * foliage-lighting authority) and by shared/terrain/Heightfield.js (the single
 * source of truth for ground height). It is the same move for ground colour.
 *
 * Four consumers, three representations. GLSL and TSL cannot import a common
 * function without a codegen layer, so what they share is this constant table
 * plus generated source: the GLSL chunks below are BUILT from the constants,
 * and the TSL builders read the same constants, so the numbers physically
 * cannot drift between paths. The JS reference implementations exist for
 * tests and for any CPU-side consumer.
 */

/**
 * The low-frequency ground field. These are the exact numbers the WebGPU
 * terrain material has shipped since Cycle 91 Phase 7.5:
 *
 *   field(p) = valueNoise(p * 0.012 + seed0) * 0.55
 *            + valueNoise(rot43(p) * 0.026 + seed1) * 0.45
 *
 * Two octaves at roughly 83m and 38m wavelength. The second is rotated 43
 * degrees so the two do not share a lattice axis, which is what stops the
 * blobs lining up on a visible grid. Value noise rather than a 3D perlin:
 * mx_noise_float was tried in Cycle 91 and cost the field rail 40 FPS on the
 * 1%-low, because a flat pasture puts the terrain on every fragment.
 */
export const GROUND_VARIATION = Object.freeze({
    // hash2(p) = fract(sin(dot(p, hashVector)) * hashScale)
    hashVector: Object.freeze([127.1, 311.7]),
    hashScale: 43758.5453123,
    // 43 degrees. Any angle that is not a multiple of 90 works; 43 is what
    // shipped and what the goldens were baselined against.
    rotationCos: 0.7314,
    rotationSin: 0.6820,
    // noise01(p, seed) offsets the lattice by (seed, seed * seedSkew) so the
    // two octaves do not share a hash cell at the origin.
    seedSkew: 1.7,
    octaves: Object.freeze([
        Object.freeze({ frequency: 0.012, rotated: false, seed: 0.0, weight: 0.55 }),
        Object.freeze({ frequency: 0.026, rotated: true, seed: 13.7, weight: 0.45 }),
    ]),
});

/**
 * How the grass tints itself from the field above. Higher field value reads
 * warmer and browner (more red, less blue), which is the same direction the
 * terrain goes: its `dirtMask` keys off the same field, so the patches the
 * terrain browns are the patches the grass browns. Amplitudes are the ones
 * the grass fragment shader has always used for `vColorVariation`.
 */
export const GRASS_VARIATION_TINT = Object.freeze({
    red: 0.08,
    green: 0.05,
    greenBias: -0.02,
    blue: -0.03,
});

/**
 * Per-blade hue break-up. The pre-Cycle-114 offset was a hash of the instance
 * id (WebGL) or of the raw fragment world position (WebGPU) at full amplitude,
 * which reads as television snow rather than as clumping: every neighbour is
 * independent. Quantising the dominant term to roughly clump scale gives
 * neighbouring blades a shared tint, and a small residual keeps them from
 * banding into visible cells.
 */
export const GRASS_HUE = Object.freeze({
    // Metres. About three clump diameters, so a tint patch covers a handful of
    // clumps and reads as a patch of the meadow rather than as one clump.
    clumpCell: 3.0,
    // Metres. Roughly one clump footprint, for the residual break-up.
    detailCell: 0.4,
    clumpWeight: 0.8,
    detailWeight: 0.2,
});

/**
 * The dog's ground contact. An oriented rounded-rectangle footprint, the same
 * shape family the grass interaction SDF already uses, so the darkest point
 * sits under the dog's centre rather than at the edge of the pushed ring.
 *
 * Read by the grass shaders AND the terrain shaders on both render paths. The
 * grass alone is not enough: the pen and the farmhouse yard are bald by design
 * and are exactly where the dog spends its time, and a contact shadow that
 * vanishes on bare ground is worse than none.
 *
 * Dog only. Never sheep. A 5,000-instance version is a different problem with
 * a different budget (Cycle 114 Phase 5, step 4).
 */
export const GROUND_CONTACT = Object.freeze({
    // Half-extents of the contact patch in the dog's local frame, metres.
    // Under the torso rather than the full body silhouette: the dog's own
    // footprint reads about 2.3m nose to tail, and a contact shadow that
    // covers all of it looks like a puddle, not like weight.
    halfLength: 0.85,
    halfWidth: 0.38,
    // Metres of smooth falloff outside the patch. 0.85 + 1.15 = 2.0m of total
    // reach along the facing axis, so the ground one body-length away is
    // untouched and the ground underneath is at full strength.
    radius: 1.15,
    // Peak darkening as a multiplier subtracted from 1. Deliberately modest:
    // on desktop a real shadow map is already casting the dog's silhouette,
    // and this is a close-range grounding term underneath it, not a
    // replacement for it.
    strength: 0.2,
});

/**
 * The worn approach to a pen gate (Cycle 115 Phase 4).
 *
 * The roadmap asked for a dirt approach across the homestead yard. The yard is
 * at x 156-188, z 132-153 around the farmhouse at (180, 160), outside the
 * +/-100 play bounds, so there is no yard between the player and the gate to
 * lay a path across. The threshold the game is actually about is the PEN gate,
 * at (0, 100) on Home Field, so that is what this serves.
 *
 * Not a new material and not a decal. The terrain already carries a dirt colour
 * and a dirtMask keyed off the shared ground field above; the approach is a
 * shaped contribution to that same mask, one more reason for the ground to read
 * as dirt where traffic would have worn it. Both terrain paths take the MAXIMUM
 * of the two contributions rather than the sum, so a natural dirt patch that
 * happens to fall on the approach does not stack into a mud slick.
 *
 * The shape is a tapered band: narrow at the mouth, fanning out into the field,
 * strongest at the threshold, easing to nothing at its far end. That is what
 * converging traffic wears - everything funnels through the opening and spreads
 * once it is through - and it doubles as an arrow pointing at the gate.
 *
 * Every extent is a MULTIPLE OF THE GATE'S OWN WIDTH, so the only per-scene
 * numbers the shaders need are the mouth position, the outward axis and that
 * width. A scene with a wider gate gets a proportionally wider approach for
 * free, and no scene-id branch appears in render code.
 */
export const GROUND_APPROACH = Object.freeze({
    // x gate width. How far the worn ground reaches out into the field. 2.8 x
    // 8m = 22.4m on Home Field, about a ninth of the way to the far fence: long
    // enough to read as an approach from the Classic camera, short enough that
    // the pasture is still a pasture.
    reach: 2.8,
    // x gate width. How far it reaches BACK through the gate line into the pen,
    // so the dirt does not stop dead at the fence. The pen interior is bald by
    // design (its exclusion zone), so this only has to cover the threshold.
    backReach: 0.45,
    // x gate width, half-widths. Narrow at the mouth (the opening is the
    // funnel), wider at the far end (traffic spreads once it is through).
    mouthHalfWidth: 0.7,
    farHalfWidth: 1.5,
    // x gate width. Soft edge on the band, so the dirt meets the pasture the
    // way Cycle 114's exclusion falloff does rather than at a knife edge.
    feather: 0.4,
    // 0..1 along the band. Full wear from inside the pen out to here, then
    // easing to nothing at the far tip.
    wearStart: 0.22,
    // Peak fraction toward the terrain's own dirt colour, at full wear. Shared
    // by both terrain paths so the approach reads the same on each even though
    // their ambient dirt-patch strengths differ (0.4 on WebGL, a per-scene 0.26
    // to 0.34 on WebGPU).
    dirtBlend: 0.62,
    // Fraction of grass clumps that survive at full wear. Deliberately not
    // zero: the acceptance is that grass THINS over the approach rather than
    // stopping at an edge, and a bald strip is only a differently-shaped edge.
    grassKeepMin: 0.18,
});

/**
 * Worn ground: the zones that have been walked bare (Cycle 121).
 *
 * The pen interior, the farmhouse yard and the gate approach are the same
 * surface with three names. Until this cycle two separate systems described
 * them and neither knew about the other: grass removal was a rect list on
 * `js/GrassSystem.js`, ground wear was the approach term above, and nothing
 * connected them. So the grass thinned over a band around a rect the terrain
 * did not shade, and the terrain shaded a corridor the grass did not thin
 * against. Ground that does not change under a fading grass line is read by the
 * eye AS the line, which is why Cycle 114's falloff kept reading as a knife
 * edge no matter how carefully it was measured.
 *
 * One zone list therefore feeds both. `resolveWornGroundZones` builds it from
 * scene data; `wornZoneCoverage01` is the pure geometry both consumers read
 * (`GrassSystem.exclusionKeepProbability` is one minus it, exactly, which
 * tests/worn-ground.spec.js pins); and `groundWear01` scales that same coverage
 * by each zone's own intensity for the terrain. Shape and intensity differ per
 * zone. The material never does.
 */
export const GROUND_WEAR = Object.freeze({
    // Metres over which the ground eases back to untouched outside a zone edge.
    // Cycle 114 Phase 1 measured this at 4m (about two dog-lengths: wide enough
    // to read as worn, narrow enough that a pen still reads as a pen) and it
    // lived in js/GrassSystem.js as a grass-only number. Cycle 121 moved it here
    // unchanged, because the terrain now fades over the same band and one
    // falloff read by both is the whole point of this section.
    falloff: 4.0,
    // Peak fraction toward the terrain's own dirt colour at full wear. The SAME
    // number the gate approach peaks at, by reference rather than by copy: D26
    // and D27 are one cycle because the three surfaces get one treatment.
    dirtBlend: GROUND_APPROACH.dirtBlend,
    // Peak wear per zone kind, 0..1. This is the "differ in intensity" half.
    //
    // A pen interior is small, fenced, and every sheep in the run ends up
    // standing in it, so it goes to full wear. A farmhouse yard is the clearance
    // rect around a building - 80m x 80m on Home Field - and only the part near
    // the house sees traffic, so a full-strength yard would read as a painted
    // brown square rather than as dry ground around a homestead.
    kindWear: Object.freeze({
        pen: 1.0,
        farmyard: 0.5,
    }),
});

/**
 * How many worn zones the terrain shaders carry.
 *
 * Every scene the game ships resolves at most two (a pen and a farmhouse yard),
 * so three is one slot of headroom. The term is branchless and stays in the
 * graph on scenes that fill none of them, for the reason the gate approach does
 * (see js/world/webgpuTerrainNodeMaterial.js): shaping the graph per scene would
 * buy a rounding error and cost the two render paths their one common shape.
 * Each unused slot is about sixteen ALU ops with no transcendental in it, under
 * six value-noise evaluations that run four sines each.
 *
 * `resolveWornGroundZones` truncates past this rather than letting the grass
 * thin over a zone the terrain cannot shade, which would be the exact defect
 * this section exists to remove.
 */
export const WORN_ZONE_SLOTS = 3;

/**
 * The uniform names both terrain paths bind the packed zones to. Exported so
 * the GLSL that declares them and the JS that writes them cannot drift.
 */
export const WORN_ZONE_UNIFORMS = Object.freeze({
    rect: 'uWornZoneRect',
    shape: 'uWornZoneShape',
});

const glslFloat = (value) => {
    const text = String(value);
    return /[.eE]/.test(text) ? text : `${text}.0`;
};

const [VARIATION_OCTAVE_A, VARIATION_OCTAVE_B] = GROUND_VARIATION.octaves;

/**
 * GLSL for the ground field. Injected into the WebGL terrain fragment shader
 * and both WebGL grass vertex shaders. Generated from GROUND_VARIATION so the
 * literals cannot drift from the TSL twin.
 */
export const GROUND_VARIATION_GLSL = `
// Ground variation field - generated from js/world/groundShading.js.
// Do not hand-edit the constants here; change GROUND_VARIATION instead.
float sdsGroundHash2(vec2 p) {
    return fract(sin(dot(p, vec2(${glslFloat(GROUND_VARIATION.hashVector[0])}, ${glslFloat(GROUND_VARIATION.hashVector[1])}))) * ${glslFloat(GROUND_VARIATION.hashScale)});
}
float sdsGroundValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = sdsGroundHash2(i);
    float b = sdsGroundHash2(i + vec2(1.0, 0.0));
    float c = sdsGroundHash2(i + vec2(0.0, 1.0));
    float d = sdsGroundHash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec2 sdsGroundRotate(vec2 p) {
    return vec2(
        p.x * ${glslFloat(GROUND_VARIATION.rotationCos)} - p.y * ${glslFloat(GROUND_VARIATION.rotationSin)},
        p.x * ${glslFloat(GROUND_VARIATION.rotationSin)} + p.y * ${glslFloat(GROUND_VARIATION.rotationCos)}
    );
}
float sdsGroundVariation01(vec2 worldXZ) {
    vec2 pA = worldXZ * ${glslFloat(VARIATION_OCTAVE_A.frequency)} + vec2(${glslFloat(VARIATION_OCTAVE_A.seed)}, ${glslFloat(VARIATION_OCTAVE_A.seed * GROUND_VARIATION.seedSkew)});
    vec2 pB = sdsGroundRotate(worldXZ) * ${glslFloat(VARIATION_OCTAVE_B.frequency)} + vec2(${glslFloat(VARIATION_OCTAVE_B.seed)}, ${glslFloat(VARIATION_OCTAVE_B.seed * GROUND_VARIATION.seedSkew)});
    return sdsGroundValueNoise(pA) * ${glslFloat(VARIATION_OCTAVE_A.weight)} + sdsGroundValueNoise(pB) * ${glslFloat(VARIATION_OCTAVE_B.weight)};
}
`;

/**
 * GLSL for the clump-coherent grass hue offset. Depends on sdsGroundHash2, so
 * inject GROUND_VARIATION_GLSL alongside it.
 */
export const GRASS_HUE_GLSL = `
// Clump-coherent hue offset - generated from js/world/groundShading.js.
float sdsGrassHueOffset(vec2 worldXZ, float amplitude) {
    float clumpHue = sdsGroundHash2(floor(worldXZ / ${glslFloat(GRASS_HUE.clumpCell)})) - 0.5;
    float detailHue = sdsGroundHash2(floor(worldXZ / ${glslFloat(GRASS_HUE.detailCell)}) + vec2(17.0, 41.0)) - 0.5;
    return (clumpHue * ${glslFloat(GRASS_HUE.clumpWeight)} + detailHue * ${glslFloat(GRASS_HUE.detailWeight)}) * amplitude;
}
`;

/**
 * GLSL for the dog's contact darkening. `sdsGroundContactFalloff` takes the
 * distances already resolved into the dog's local frame (the grass shaders
 * have them from the interaction SDF); `sdsGroundContact` resolves them from a
 * world position plus the dog's position and facing (what the terrain has).
 */
export const GROUND_CONTACT_GLSL = `
// Dog ground contact - generated from js/world/groundShading.js.
float sdsGroundContactFalloff(float along, float across) {
    float qx = abs(across) - ${glslFloat(GROUND_CONTACT.halfWidth)};
    float qz = abs(along) - ${glslFloat(GROUND_CONTACT.halfLength)};
    float sdf = length(max(vec2(qx, qz), 0.0)) + min(max(qx, qz), 0.0);
    float t = clamp(sdf / ${glslFloat(GROUND_CONTACT.radius)}, 0.0, 1.0);
    return 1.0 - t * t * (3.0 - 2.0 * t);
}
float sdsGroundContact(vec2 worldXZ, vec3 contactPosition, vec2 contactFacing) {
    vec2 fwd = length(contactFacing) > 0.001 ? normalize(contactFacing) : vec2(0.0, 1.0);
    vec2 side = vec2(fwd.y, -fwd.x);
    vec2 delta = worldXZ - contactPosition.xz;
    return sdsGroundContactFalloff(dot(delta, fwd), dot(delta, side));
}
`;

/**
 * GLSL for the worn gate approach. Injected into the WebGL terrain fragment
 * shader. `mouth` is the gate's world (x, z), `axis` is the unit XZ direction
 * pointing out of the pen and into the field, `gateWidth` is the gate's own
 * width in metres and scales every extent.
 *
 * Both smoothsteps are written out longhand as t * t * (3 - 2t) on a clamped
 * ramp rather than called through GLSL's smoothstep(), because the TSL twin
 * below has to be the same expression node-for-node and the existing contact
 * falloff already sets that precedent in this file.
 */
export const GROUND_APPROACH_GLSL = `
// Worn gate approach - generated from js/world/groundShading.js.
// Do not hand-edit the constants here; change GROUND_APPROACH instead.
float sdsGroundApproachWear(vec2 worldXZ, vec2 mouth, vec2 axis, float gateWidth) {
    // A zero width would divide by zero and NaN the whole terrain colour, and a
    // NaN multiplied by a zero strength is still a NaN. Clamp, never branch.
    float w = max(gateWidth, 0.001);
    vec2 side = vec2(axis.y, -axis.x);
    vec2 rel = worldXZ - mouth;
    float along = dot(rel, axis);
    float across = abs(dot(rel, side));
    float reach = w * ${glslFloat(GROUND_APPROACH.reach)};
    float back = w * ${glslFloat(GROUND_APPROACH.backReach)};
    float t = clamp((along + back) / (reach + back), 0.0, 1.0);
    float halfWidth = mix(w * ${glslFloat(GROUND_APPROACH.mouthHalfWidth)}, w * ${glslFloat(GROUND_APPROACH.farHalfWidth)}, t);
    // Tapered rounded-rect SDF in the approach's own frame. Not a true distance
    // (the lateral term is measured perpendicular to the axis, not normal to
    // the slanted edge) but monotone and smooth, which is all the feather needs.
    float outAlong = max(-back - along, along - reach);
    float outAcross = across - halfWidth;
    float sdf = length(max(vec2(outAcross, outAlong), 0.0)) + min(max(outAcross, outAlong), 0.0);
    float e = clamp(sdf / (w * ${glslFloat(GROUND_APPROACH.feather)}) + 1.0, 0.0, 1.0);
    float band = 1.0 - e * e * (3.0 - 2.0 * e);
    float u = clamp((t - ${glslFloat(GROUND_APPROACH.wearStart)}) / ${glslFloat(1 - GROUND_APPROACH.wearStart)}, 0.0, 1.0);
    return band * (1.0 - u * u * (3.0 - 2.0 * u));
}
float sdsGroundApproachDirt(vec2 worldXZ, vec2 mouth, vec2 axis, float gateWidth) {
    return sdsGroundApproachWear(worldXZ, mouth, axis, gateWidth) * ${glslFloat(GROUND_APPROACH.dirtBlend)};
}
`;

/**
 * GLSL for the worn zones. Injected into the WebGL terrain fragment shader.
 *
 * This chunk DECLARES its own uniforms, which the other chunks in this file do
 * not. They take theirs as function parameters because each is a single vec2 or
 * float that the shader has an obvious name for. These are two fixed-length
 * arrays whose length, element packing and names all come from one constant, and
 * a consumer that hand-wrote `uniform vec4 uWornZoneRect[3];` would be a fourth
 * place WORN_ZONE_SLOTS could drift. `packWornZones` below writes the values, so
 * the declaration and the write have exactly one author.
 *
 * Packing, per slot:
 *   rect  = (centreX, centreZ, halfX, halfZ)
 *   shape = (cosAngle, sinAngle, wear, 0)
 *
 * An unused slot is rect (0,0,0,0) with shape (1,0,0,0): an identity rotation
 * and a zero wear, so it contributes nothing and cannot divide by zero.
 */
export const GROUND_WEAR_GLSL = `
// Worn ground zones - generated from js/world/groundShading.js.
// Do not hand-edit the constants or the array length here; change GROUND_WEAR
// and WORN_ZONE_SLOTS instead.
uniform vec4 ${WORN_ZONE_UNIFORMS.rect}[${WORN_ZONE_SLOTS}];
uniform vec4 ${WORN_ZONE_UNIFORMS.shape}[${WORN_ZONE_SLOTS}];
float sdsGroundWearZone(vec2 worldXZ, vec4 rect, vec4 shape) {
    vec2 d = worldXZ - rect.xy;
    // Rotate into the zone's own frame. The cos/sin pair is baked with the sign
    // convention js/GrassSystem.js#addRotatedExclusionZone uses, so an axis
    // aligned zone carries (1, 0) and this is two multiplies and an add.
    vec2 local = vec2(d.x * shape.x - d.y * shape.y, d.x * shape.y + d.y * shape.x);
    vec2 q = abs(local) - rect.zw;
    float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    float t = clamp(sdf / ${glslFloat(GROUND_WEAR.falloff)}, 0.0, 1.0);
    return (1.0 - t * t * (3.0 - 2.0 * t)) * shape.z;
}
float sdsGroundWear(vec2 worldXZ) {
    // MAX, not sum, for the reason the approach combines with the natural dirt
    // mask by MAX: two zones whose falloff bands overlap should wear the ground
    // the way the nearer one does. A sum would stack the overlap into a slick.
    float wear = 0.0;
    for (int i = 0; i < ${WORN_ZONE_SLOTS}; i++) {
        wear = max(wear, sdsGroundWearZone(worldXZ, ${WORN_ZONE_UNIFORMS.rect}[i], ${WORN_ZONE_UNIFORMS.shape}[i]));
    }
    return wear;
}
float sdsGroundWearDirt(vec2 worldXZ) {
    return sdsGroundWear(worldXZ) * ${glslFloat(GROUND_WEAR.dirtBlend)};
}
`;

/**
 * TSL primitives for the ground field. Returned rather than exported as nodes
 * because the TSL namespace arrives at runtime from the lazily-loaded
 * three.webgpu bundle (see js/world/webgpuModules.js).
 *
 * @param {object} TSL
 */
export function buildGroundNoiseNodes(TSL) {
    const { dot, floor, fract, mix, sin, vec2 } = TSL;
    const hash2 = (p) => fract(
        sin(dot(p, vec2(GROUND_VARIATION.hashVector[0], GROUND_VARIATION.hashVector[1])))
            .mul(GROUND_VARIATION.hashScale)
    );
    const valueNoise01 = (p) => {
        const i = floor(p);
        const f = fract(p);
        const u = f.mul(f).mul(f.mul(-2.0).add(3.0));
        const a = hash2(i);
        const b = hash2(i.add(vec2(1.0, 0.0)));
        const c = hash2(i.add(vec2(0.0, 1.0)));
        const d = hash2(i.add(vec2(1.0, 1.0)));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    };
    const rotate = (p) => vec2(
        p.x.mul(GROUND_VARIATION.rotationCos).sub(p.y.mul(GROUND_VARIATION.rotationSin)),
        p.x.mul(GROUND_VARIATION.rotationSin).add(p.y.mul(GROUND_VARIATION.rotationCos))
    );
    const noise01 = (p, seed) => valueNoise01(p.add(vec2(seed, seed * GROUND_VARIATION.seedSkew)));
    return { hash2, valueNoise01, rotate, noise01 };
}

/**
 * The ground field as a TSL node. `worldXZ` is a vec2 node of world (x, z).
 */
export function buildGroundVariationNode(TSL, worldXZ) {
    const { noise01, rotate } = buildGroundNoiseNodes(TSL);
    const a = noise01(worldXZ.mul(VARIATION_OCTAVE_A.frequency), VARIATION_OCTAVE_A.seed)
        .mul(VARIATION_OCTAVE_A.weight);
    const b = noise01(rotate(worldXZ).mul(VARIATION_OCTAVE_B.frequency), VARIATION_OCTAVE_B.seed)
        .mul(VARIATION_OCTAVE_B.weight);
    return a.add(b);
}

/**
 * The clump-coherent hue offset as a TSL node.
 */
export function buildGrassHueOffsetNode(TSL, worldXZ, amplitude) {
    const { floor, vec2 } = TSL;
    const { hash2 } = buildGroundNoiseNodes(TSL);
    const clumpHue = hash2(floor(worldXZ.div(GRASS_HUE.clumpCell))).sub(0.5);
    const detailHue = hash2(floor(worldXZ.div(GRASS_HUE.detailCell)).add(vec2(17.0, 41.0))).sub(0.5);
    return clumpHue.mul(GRASS_HUE.clumpWeight)
        .add(detailHue.mul(GRASS_HUE.detailWeight))
        .mul(amplitude);
}

/**
 * The contact falloff as a TSL node, from distances already resolved into the
 * dog's local frame. Returns 1 under the dog and 0 past the falloff radius.
 */
export function buildGroundContactFalloffNode(TSL, along, across) {
    const { abs, clamp, float, length, max, min, vec2 } = TSL;
    const qx = abs(across).sub(GROUND_CONTACT.halfWidth);
    const qz = abs(along).sub(GROUND_CONTACT.halfLength);
    const sdf = length(vec2(max(qx, 0.0), max(qz, 0.0))).add(min(max(qx, qz), 0.0));
    const t = clamp(sdf.div(GROUND_CONTACT.radius), 0.0, 1.0);
    return float(1.0).sub(t.mul(t).mul(float(3.0).sub(t.mul(2.0))));
}

/**
 * The contact falloff as a TSL node, resolved from a world position against
 * the dog's position and facing uniforms. This is the terrain's entry point.
 */
export function buildGroundContactNode(TSL, worldXZ, { position, facing }) {
    const { dot, normalize, vec2 } = TSL;
    const fwd = normalize(facing);
    const side = vec2(fwd.y, fwd.x.negate());
    const delta = vec2(worldXZ.x.sub(position.x), worldXZ.y.sub(position.z));
    return buildGroundContactFalloffNode(TSL, dot(delta, fwd), dot(delta, side));
}

/**
 * The worn gate approach as a TSL node. The node-for-node twin of
 * GROUND_APPROACH_GLSL above: same constants, same expression order, so the two
 * terrain paths cannot drift.
 *
 * @param {object} TSL
 * @param {object} worldXZ vec2 node of world (x, z)
 * @param {{mouth: object, axis: object, gateWidth: object}} uniforms vec2, vec2, float nodes
 * @returns {object} 0..1 wear
 */
export function buildGroundApproachWearNode(TSL, worldXZ, { mouth, axis, gateWidth }) {
    const { abs, clamp, dot, float, length, max, min, mix, vec2 } = TSL;
    const w = max(gateWidth, 0.001);
    const side = vec2(axis.y, axis.x.negate());
    const rel = vec2(worldXZ.x.sub(mouth.x), worldXZ.y.sub(mouth.y));
    const along = dot(rel, axis);
    const across = abs(dot(rel, side));
    const reach = w.mul(GROUND_APPROACH.reach);
    const back = w.mul(GROUND_APPROACH.backReach);
    const t = clamp(along.add(back).div(reach.add(back)), 0.0, 1.0);
    const halfWidth = mix(w.mul(GROUND_APPROACH.mouthHalfWidth), w.mul(GROUND_APPROACH.farHalfWidth), t);
    const outAlong = max(back.negate().sub(along), along.sub(reach));
    const outAcross = across.sub(halfWidth);
    const sdf = length(vec2(max(outAcross, 0.0), max(outAlong, 0.0)))
        .add(min(max(outAcross, outAlong), 0.0));
    const e = clamp(sdf.div(w.mul(GROUND_APPROACH.feather)).add(1.0), 0.0, 1.0);
    const band = float(1.0).sub(e.mul(e).mul(float(3.0).sub(e.mul(2.0))));
    const u = clamp(t.sub(GROUND_APPROACH.wearStart).div(1 - GROUND_APPROACH.wearStart), 0.0, 1.0);
    return band.mul(float(1.0).sub(u.mul(u).mul(float(3.0).sub(u.mul(2.0)))));
}

/**
 * The approach's contribution to the terrain's dirt blend, as a TSL node.
 */
export function buildGroundApproachDirtNode(TSL, worldXZ, uniforms) {
    return buildGroundApproachWearNode(TSL, worldXZ, uniforms).mul(GROUND_APPROACH.dirtBlend);
}

/**
 * The worn zones as a TSL node. The twin of GROUND_WEAR_GLSL above: same
 * packing, same falloff, same MAX combine, so the two terrain paths cannot
 * describe different ground.
 *
 * Unrolled in JS rather than looped in TSL, which is the same divergence the
 * GLSL twin's `for` and this loop already are: GLSL indexes a uniform array,
 * TSL takes one uniform node per slot. Both read WORN_ZONE_SLOTS, so the shape
 * is one number in one file either way.
 *
 * @param {object} TSL
 * @param {object} worldXZ vec2 node of world (x, z)
 * @param {Array<{rect: object, shape: object}>} slots vec4 uniform nodes per slot
 * @returns {object} 0..1 wear
 */
export function buildGroundWearNode(TSL, worldXZ, slots) {
    const { abs, clamp, float, length, max, min, vec2 } = TSL;
    let wear = null;
    for (const slot of slots ?? []) {
        const dx = worldXZ.x.sub(slot.rect.x);
        const dz = worldXZ.y.sub(slot.rect.y);
        const localX = dx.mul(slot.shape.x).sub(dz.mul(slot.shape.y));
        const localZ = dx.mul(slot.shape.y).add(dz.mul(slot.shape.x));
        const qx = abs(localX).sub(slot.rect.z);
        const qz = abs(localZ).sub(slot.rect.w);
        const sdf = length(vec2(max(qx, 0.0), max(qz, 0.0))).add(min(max(qx, qz), 0.0));
        const t = clamp(sdf.div(GROUND_WEAR.falloff), 0.0, 1.0);
        const term = float(1.0).sub(t.mul(t).mul(float(3.0).sub(t.mul(2.0)))).mul(slot.shape.z);
        wear = wear === null ? term : max(wear, term);
    }
    return wear === null ? float(0.0) : wear;
}

/**
 * The worn zones' contribution to the terrain's dirt blend, as a TSL node.
 */
export function buildGroundWearDirtNode(TSL, worldXZ, slots) {
    return buildGroundWearNode(TSL, worldXZ, slots).mul(GROUND_WEAR.dirtBlend);
}

// --- CPU reference implementations. Used by tests and by any placement-time
// consumer; the shaders above are the ones that actually render. ---

const hash2 = (x, y) => {
    const s = Math.sin(x * GROUND_VARIATION.hashVector[0] + y * GROUND_VARIATION.hashVector[1])
        * GROUND_VARIATION.hashScale;
    return s - Math.floor(s);
};

const lerp = (a, b, t) => a + (b - a) * t;

const valueNoise01 = (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
};

/**
 * The ground field at a world position, on the CPU. Note this will not match
 * the GPU bit-for-bit: `sin` is not spec-pinned across engines and GLSL runs
 * at 32-bit. It reproduces the FORMULA, which is what tests assert on.
 *
 * @param {number} x world X
 * @param {number} z world Z
 * @returns {number} 0..1
 */
export function sampleGroundVariation01(x, z) {
    const rx = x * GROUND_VARIATION.rotationCos - z * GROUND_VARIATION.rotationSin;
    const rz = x * GROUND_VARIATION.rotationSin + z * GROUND_VARIATION.rotationCos;
    const a = valueNoise01(
        x * VARIATION_OCTAVE_A.frequency + VARIATION_OCTAVE_A.seed,
        z * VARIATION_OCTAVE_A.frequency + VARIATION_OCTAVE_A.seed * GROUND_VARIATION.seedSkew
    );
    const b = valueNoise01(
        rx * VARIATION_OCTAVE_B.frequency + VARIATION_OCTAVE_B.seed,
        rz * VARIATION_OCTAVE_B.frequency + VARIATION_OCTAVE_B.seed * GROUND_VARIATION.seedSkew
    );
    return a * VARIATION_OCTAVE_A.weight + b * VARIATION_OCTAVE_B.weight;
}

/**
 * The RGB nudge the grass applies for a given field value. Positive red and
 * negative blue: higher field reads browner, the same direction the terrain's
 * dirt mask moves.
 *
 * @param {number} variation01
 * @returns {[number, number, number]}
 */
export function grassVariationTint(variation01) {
    return [
        variation01 * GRASS_VARIATION_TINT.red,
        variation01 * GRASS_VARIATION_TINT.green + GRASS_VARIATION_TINT.greenBias,
        variation01 * GRASS_VARIATION_TINT.blue,
    ];
}

/**
 * The clump-coherent hue offset at a world position, on the CPU.
 *
 * @param {number} x world X
 * @param {number} z world Z
 * @param {number} amplitude
 */
export function sampleGrassHueOffset(x, z, amplitude) {
    const clumpHue = hash2(
        Math.floor(x / GRASS_HUE.clumpCell),
        Math.floor(z / GRASS_HUE.clumpCell)
    ) - 0.5;
    const detailHue = hash2(
        Math.floor(x / GRASS_HUE.detailCell) + 17,
        Math.floor(z / GRASS_HUE.detailCell) + 41
    ) - 0.5;
    return (clumpHue * GRASS_HUE.clumpWeight + detailHue * GRASS_HUE.detailWeight) * amplitude;
}

/**
 * The contact falloff on the CPU, from local-frame distances. 1 under the dog,
 * 0 past the falloff radius, smooth in between.
 *
 * @param {number} along metres along the dog's facing axis
 * @param {number} across metres across it
 * @returns {number} 0..1
 */
export function groundContactFalloff(along, across) {
    const qx = Math.abs(across) - GROUND_CONTACT.halfWidth;
    const qz = Math.abs(along) - GROUND_CONTACT.halfLength;
    const sdf = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
    const t = Math.min(1, Math.max(0, sdf / GROUND_CONTACT.radius));
    return 1 - t * t * (3 - 2 * t);
}

/**
 * The contact falloff on the CPU, from world positions.
 *
 * @param {{x: number, z: number}} sample the shaded point
 * @param {{x: number, z: number}} dog the dog's world position
 * @param {{x: number, z: number}} facing the dog's unit forward vector in XZ
 * @returns {number} 0..1
 */
export function groundContactAt(sample, dog, facing) {
    const len = Math.hypot(facing.x, facing.z) || 1;
    const fx = facing.x / len;
    const fz = facing.z / len;
    const dx = sample.x - dog.x;
    const dz = sample.z - dog.z;
    return groundContactFalloff(dx * fx + dz * fz, dx * fz - dz * fx);
}

/**
 * The unit XZ forward vector for a grass/terrain interactor.
 *
 * Cycle 114. This exists because two callers resolved it independently and one
 * of them got it wrong. `GrassSystem.updateInteractors` has always handled three
 * entity shapes; `TerrainBuilder._syncGroundContact` shipped handling only the
 * first, so the dog (which carries none of it) fell through to the default and
 * the terrain's contact shadow never rotated with the animal standing on it.
 *
 * The three shapes, and why they differ:
 *
 * - `facingDirection`, a scalar angle in radians. Sheep and boids. Forward is
 *   `(cos, sin)`.
 * - `facing`, a pre-supplied vector, when a caller has one already.
 * - `currentRotation`, a scalar yaw. The sheepdog. Forward is `(sin, cos)`,
 *   which is the convention its MESH uses, and is deliberately NOT the same
 *   mapping as `facingDirection`. Swapping them rotates the dog's contact
 *   footprint by 90 degrees, which reads as the shadow pointing sideways.
 *
 * Falls back to +Z rather than a zero-length vector: zero-length NaNs the
 * oriented rounded-rect maths in all four shaders, which renders as a hole
 * rather than as a shadow.
 *
 * @param {{facingDirection?: number, facing?: {x: number, z: number}, currentRotation?: number}} entity
 * @returns {{x: number, z: number}} unit vector
 */
export function resolveEntityFacing(entity) {
    if (!entity) return { x: 0, z: 1 };
    if (typeof entity.facingDirection === 'number') {
        return { x: Math.cos(entity.facingDirection), z: Math.sin(entity.facingDirection) };
    }
    if (entity.facing && typeof entity.facing.x === 'number' && typeof entity.facing.z === 'number') {
        const len = Math.hypot(entity.facing.x, entity.facing.z);
        if (len > 0) return { x: entity.facing.x / len, z: entity.facing.z / len };
        return { x: 0, z: 1 };
    }
    if (typeof entity.currentRotation === 'number') {
        return { x: Math.sin(entity.currentRotation), z: Math.cos(entity.currentRotation) };
    }
    return { x: 0, z: 1 };
}

/**
 * Where a scene's worn gate approach sits, derived from the scene definition
 * rather than declared on it (Cycle 115 Phase 4).
 *
 * Derived, because `shared/scenes/types.js` is fence-frozen and this needs no
 * new field: a pen with a mouth already tells us everything. The gate gives the
 * mouth and the width; the pasture rect gives the inside, and the direction
 * from the pen's centre out through the gate is the direction the traffic
 * comes from. No scene-id branch, and any future scene that declares a pen and
 * a gate gets an approach for free.
 *
 * Returns null when the scene has no pen gate to approach. That covers Rolling
 * Hills and Open Country (no gate at all) and Newsheepdogland, whose gate
 * carries a `facingDeg` but no pasture rect, so there is no inside to point
 * away from. Its homestead approach is its own problem with its own geometry.
 *
 * Cycle 117 P4 note: Rolling Hills now HAS a gate, nested in its pen, and would
 * qualify for an approach off `pen.gate` plus the pen rect in about three lines.
 * Deliberately not taken here - the ground fan is a legibility affordance, not
 * part of the fence, and turning it on moves the island's grass scatter. Left
 * for whoever owns the island's legibility pass.
 *
 * Known limit: this reads the SCENE's pen. Competitive mode reassigns pastures
 * at runtime (js/world/sandbox.js#updateBounds), and the approach does not
 * follow them - it stays where the scene's single-player pen is.
 *
 * @param {{gate?: {position?: {x: number, z: number}, width?: number}, pasture?: {centerZ?: number, minX: number, maxX: number, minZ: number, maxZ: number}}} [sceneDef]
 * @returns {{mouth: {x: number, z: number}, axis: {x: number, z: number}, gateWidth: number} | null}
 */
export function resolveGateApproach(sceneDef) {
    const gate = sceneDef?.gate;
    const pasture = sceneDef?.pasture;
    if (!gate?.position || !pasture) return null;
    const gateWidth = gate.width;
    if (!(gateWidth > 0)) return null;
    const penX = (pasture.minX + pasture.maxX) / 2;
    const penZ = pasture.centerZ ?? (pasture.minZ + pasture.maxZ) / 2;
    const dx = gate.position.x - penX;
    const dz = gate.position.z - penZ;
    const len = Math.hypot(dx, dz);
    // A gate at the pen's own centre has no outward direction. Nothing declares
    // one today; returning null beats emitting a NaN axis into a shader.
    if (!(len > 1e-3)) return null;
    return {
        mouth: { x: gate.position.x, z: gate.position.z },
        axis: { x: dx / len, z: dz / len },
        gateWidth,
    };
}

/**
 * The worn approach on the CPU. The twin of GROUND_APPROACH_GLSL and
 * buildGroundApproachWearNode; this one is what the grass scatter reads, since
 * thinning grass is a placement decision, not a per-fragment one.
 *
 * @param {number} x world X
 * @param {number} z world Z
 * @param {{mouth: {x: number, z: number}, axis: {x: number, z: number}, gateWidth: number} | null} approach
 * @returns {number} 0..1 wear
 */
export function groundApproachWear(x, z, approach) {
    if (!approach) return 0;
    const w = Math.max(approach.gateWidth, 0.001);
    const ax = approach.axis.x, az = approach.axis.z;
    const relX = x - approach.mouth.x;
    const relZ = z - approach.mouth.z;
    const along = relX * ax + relZ * az;
    const across = Math.abs(relX * az - relZ * ax);
    const reach = w * GROUND_APPROACH.reach;
    const back = w * GROUND_APPROACH.backReach;
    const t = Math.min(1, Math.max(0, (along + back) / (reach + back)));
    const halfWidth = lerp(w * GROUND_APPROACH.mouthHalfWidth, w * GROUND_APPROACH.farHalfWidth, t);
    const outAlong = Math.max(-back - along, along - reach);
    const outAcross = across - halfWidth;
    const sdf = Math.hypot(Math.max(outAcross, 0), Math.max(outAlong, 0))
        + Math.min(Math.max(outAcross, outAlong), 0);
    const e = Math.min(1, Math.max(0, sdf / (w * GROUND_APPROACH.feather) + 1));
    const band = 1 - e * e * (3 - 2 * e);
    const u = Math.min(1, Math.max(0, (t - GROUND_APPROACH.wearStart) / (1 - GROUND_APPROACH.wearStart)));
    return band * (1 - u * u * (3 - 2 * u));
}

/**
 * A stable 0..1 hash of a world position.
 *
 * For placement decisions that must NOT consume a shared random stream. The
 * grass scatter runs one PRNG across the whole field, so any extra draw shifts
 * every clump scattered after it: a thinning term that reads this instead
 * changes the ground it is about and nothing else. It is also the more honest
 * decision for a static effect - the same spot thins the same way regardless of
 * what order the scatter reached it in.
 *
 * Same hash the shaders use (GROUND_VARIATION.hashVector / hashScale), fed raw
 * metres rather than lattice integers, which is what makes it a dither rather
 * than a noise field.
 *
 * @param {number} x world X
 * @param {number} z world Z
 * @returns {number} 0..1
 */
export function groundPositionHash01(x, z) {
    return hash2(x, z);
}

/**
 * The fraction of grass clumps that survive the approach at (x, z). 1 off the
 * approach, GROUND_APPROACH.grassKeepMin at full wear.
 *
 * @param {number} x world X
 * @param {number} z world Z
 * @param {{mouth: {x: number, z: number}, axis: {x: number, z: number}, gateWidth: number} | null} approach
 * @returns {number} 0..1
 */
export function groundApproachGrassKeep(x, z, approach) {
    const wear = groundApproachWear(x, z, approach);
    if (wear <= 0) return 1;
    return 1 - (1 - GROUND_APPROACH.grassKeepMin) * wear;
}

// --- Worn zones. One list, two consumers. ---

/**
 * Signed distance in metres from (x, z) to a worn zone's edge. Negative inside,
 * zero on the edge, positive outside.
 *
 * The rounded-rectangle SDF that `js/GrassSystem.js#_exclusionZoneDistance` has
 * run since Cycle 114, moved here so the terrain shaders measure the ground with
 * the same ruler the grass scatter does. `GrassSystem` now delegates to it.
 *
 * @param {{type?: string, minX?: number, maxX?: number, minZ?: number, maxZ?: number,
 *          centerX?: number, centerZ?: number, width?: number, depth?: number,
 *          cosAngle?: number, sinAngle?: number}} zone
 * @param {number} x
 * @param {number} z
 * @returns {number} metres, negative inside
 */
export function wornZoneDistance(zone, x, z) {
    let localX, localZ, halfWidth, halfDepth;
    if (zone.type === 'rotated') {
        const dx = x - zone.centerX;
        const dz = z - zone.centerZ;
        // Rotate the point by -angle to align with the rectangle's local axes.
        localX = dx * zone.cosAngle - dz * zone.sinAngle;
        localZ = dx * zone.sinAngle + dz * zone.cosAngle;
        halfWidth = zone.width / 2;
        halfDepth = zone.depth / 2;
    } else {
        halfWidth = (zone.maxX - zone.minX) / 2;
        halfDepth = (zone.maxZ - zone.minZ) / 2;
        localX = x - (zone.minX + zone.maxX) / 2;
        localZ = z - (zone.minZ + zone.maxZ) / 2;
    }
    const qx = Math.abs(localX) - halfWidth;
    const qz = Math.abs(localZ) - halfDepth;
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

/**
 * How thoroughly the ground at (x, z) is worn by a zone list, ignoring how hard
 * each zone wears it. 1 inside any zone, easing to 0 over GROUND_WEAR.falloff
 * metres outside, composed by MAXIMUM.
 *
 * This is the pure geometry both consumers share.
 * `GrassSystem.exclusionKeepProbability` is `1 - this`, exactly: a minimum over
 * per-zone smoothsteps is one minus a maximum over their complements, so the
 * grass thins over precisely the band the terrain darkens under. The equality is
 * pinned by tests/worn-ground.spec.js rather than left as a comment.
 *
 * @param {number} x
 * @param {number} z
 * @param {Array<object> | null | undefined} zones
 * @returns {number} 0..1
 */
export function wornZoneCoverage01(x, z, zones) {
    if (!zones) return 0;
    let coverage = 0;
    for (const zone of zones) {
        const distance = wornZoneDistance(zone, x, z);
        if (distance <= 0) return 1;
        if (distance >= GROUND_WEAR.falloff) continue;
        const t = distance / GROUND_WEAR.falloff;
        const zoneCoverage = 1 - t * t * (3 - 2 * t);
        if (zoneCoverage > coverage) coverage = zoneCoverage;
    }
    return coverage;
}

/**
 * The terrain's wear at (x, z): the same coverage above, scaled by each zone's
 * own peak intensity and composed by MAXIMUM. The CPU twin of GROUND_WEAR_GLSL
 * and buildGroundWearNode.
 *
 * @param {number} x
 * @param {number} z
 * @param {Array<object> | null | undefined} zones
 * @returns {number} 0..1
 */
export function groundWear01(x, z, zones) {
    if (!zones) return 0;
    let wear = 0;
    for (const zone of zones) {
        const peak = Number.isFinite(zone.wear) ? zone.wear : 0;
        if (!(peak > 0)) continue;
        const distance = wornZoneDistance(zone, x, z);
        if (distance >= GROUND_WEAR.falloff) continue;
        const t = Math.min(1, Math.max(0, distance / GROUND_WEAR.falloff));
        const value = (1 - t * t * (3 - 2 * t)) * peak;
        if (value > wear) wear = value;
    }
    return wear;
}

const rectZone = (kind, rect, wear) => ({
    kind,
    type: 'rect',
    minX: Math.min(rect.minX, rect.maxX),
    maxX: Math.max(rect.minX, rect.maxX),
    minZ: Math.min(rect.minZ, rect.maxZ),
    maxZ: Math.max(rect.minZ, rect.maxZ),
    wear,
});

const isFiniteRect = (r) => Number.isFinite(r?.minX) && Number.isFinite(r?.maxX)
    && Number.isFinite(r?.minZ) && Number.isFinite(r?.maxZ);

/**
 * The pen box a scene declares, in whichever of the two supported forms.
 *
 * A deliberate third copy of the normalisation in `shared/PenBarrier.js`'s
 * constructor and `js/StructureBuilder.js#resolvePenBox`, for the reason the
 * second one exists: `PenBarrier` is fence-frozen deterministic-sim code that
 * nothing on the render path may import render concerns into, and
 * `StructureBuilder` pulls in three.js. This file is read by four shader paths
 * and must stay free of both. `tests/worn-ground.spec.js` pins this against
 * `resolvePenBox` on the real scenes so the copies cannot drift.
 *
 * @param {{center?: {x: number, z: number}, radius?: number, minX?: number, maxX?: number, minZ?: number, maxZ?: number} | null | undefined} pen
 * @returns {{minX: number, maxX: number, minZ: number, maxZ: number} | null}
 */
function penBox(pen) {
    if (isFiniteRect(pen)) {
        return {
            minX: Math.min(pen.minX, pen.maxX), maxX: Math.max(pen.minX, pen.maxX),
            minZ: Math.min(pen.minZ, pen.maxZ), maxZ: Math.max(pen.minZ, pen.maxZ),
        };
    }
    if (pen?.center && pen.radius > 1) {
        const { x, z } = pen.center;
        return { minX: x - pen.radius, maxX: x + pen.radius, minZ: z - pen.radius, maxZ: z + pen.radius };
    }
    return null;
}

/**
 * Where a scene's ground has been walked bare, resolved once from scene data so
 * the grass thinning and the terrain shading read the same answer (Cycle 121).
 *
 * Two kinds today:
 *
 * - **`pen`**, from whichever pen form the scene declares. Home Field declares
 *   `pasture` (plus `bounds`), Rolling Hills declares a nested `pen` rect and
 *   Newsheepdogland declares `pen: {center, radius}`. Before this function only
 *   the first was read, so the island pasture every ranked solo run drives into
 *   had grass growing inside it and nobody had looked.
 * - **`farmyard`**, from `farmHouse.exclusionArea`.
 *
 * The `pasture` branch keeps Cycle 114 Phase 1's correction: `pasture` gives the
 * pen its DIMENSIONS but not its origin, because `js/FencePresets.js` builds
 * `createPenStructure({width, depth}, 'north')` at `z = bounds.maxZ`, so the
 * fence stands at `z[bounds.maxZ, bounds.maxZ + depth]` while the scene declares
 * `z[pasture.minZ, pasture.maxZ]`. On Home Field that is z[100,128] against a
 * declared z[102,130]. Excluding the declared rect leaves grass inside the front
 * of the pen and a bald strip behind its back fence. Derive, never hardcode, so
 * a scene that moves its bounds keeps bare ground under its own fence.
 *
 * No scene-id branch anywhere: every gate is on declared data, and a future
 * scene that declares a pen gets worn ground for free.
 *
 * @param {object | null | undefined} sceneDef
 * @param {{farmHouseArea?: object | null, pasture?: object | null}} [overrides]
 *   `pasture` REPLACES the scene's pen and is for the sandbox resize, which is
 *   the one caller that legitimately moves it. The mode-start reset path must
 *   not pass one: `gameState.pasture` there is `js/FieldConfig.js`'s default rect
 *   (z[102,125] off Home Field's bounds) on every scene, which is two metres off
 *   Home Field's real fence and nowhere near the islands'.
 *   `farmHouseArea` overrides the rect only, and only when the scene has a
 *   farmhouse at all.
 * @returns {Array<object>} zones, at most WORN_ZONE_SLOTS of them
 */
export function resolveWornGroundZones(sceneDef, overrides = {}) {
    const zones = [];

    // Farmhouse first, then the pen: the order js/TerrainBuilder.js#createGrass
    // registered them in before this function existed. Composition is by
    // minimum/maximum and so order-independent, but the scatter iterates the
    // list and there is no reason to make a golden re-baseline explain that.
    if (sceneDef?.farmHouse) {
        const position = sceneDef.farmHouse.position;
        const area = overrides.farmHouseArea
            ?? sceneDef.farmHouse.exclusionArea
            ?? (Number.isFinite(position?.x) && Number.isFinite(position?.z)
                ? { minX: position.x - 40, maxX: position.x + 40, minZ: position.z - 40, maxZ: position.z + 40 }
                : null);
        if (isFiniteRect(area)) zones.push(rectZone('farmyard', area, GROUND_WEAR.kindWear.farmyard));
    }

    const penWear = GROUND_WEAR.kindWear.pen;
    const override = overrides.pasture;
    if (isFiniteRect(override)) {
        if (override.edgeAngle) {
            const width = override.maxX - override.minX;
            const depth = override.maxZ - override.minZ;
            zones.push({
                kind: 'pen',
                type: 'rotated',
                centerX: (override.minX + override.maxX) / 2,
                centerZ: (override.minZ + override.maxZ) / 2,
                width,
                depth,
                angle: override.edgeAngle,
                cosAngle: Math.cos(-override.edgeAngle),
                sinAngle: Math.sin(-override.edgeAngle),
                wear: penWear,
            });
        } else {
            zones.push(rectZone('pen', override, penWear));
        }
    } else {
        const pasture = sceneDef?.pasture;
        const bounds = sceneDef?.bounds;
        if (isFiniteRect(pasture) && Number.isFinite(bounds?.maxZ)) {
            const halfWidth = (pasture.maxX - pasture.minX) / 2;
            const depth = pasture.maxZ - pasture.minZ;
            const centerX = (pasture.maxX + pasture.minX) / 2;
            zones.push(rectZone('pen', {
                minX: centerX - halfWidth,
                maxX: centerX + halfWidth,
                minZ: bounds.maxZ,
                maxZ: bounds.maxZ + depth,
            }, penWear));
        } else if (isFiniteRect(pasture)) {
            // No bounds on the scene def: fall back to the declared rect rather
            // than skipping the pen entirely.
            zones.push(rectZone('pen', pasture, penWear));
        } else {
            const box = penBox(sceneDef?.pen);
            if (box) zones.push(rectZone('pen', box, penWear));
        }
    }

    if (zones.length > WORN_ZONE_SLOTS) {
        // Truncate rather than let the grass thin over ground the terrain has no
        // slot to shade, which is the exact disconnect this cycle removes.
        console.warn(
            `[GROUND] ${zones.length} worn zones resolved but only ${WORN_ZONE_SLOTS} slots exist; `
            + 'dropping the surplus. Raise WORN_ZONE_SLOTS in js/world/groundShading.js.'
        );
        zones.length = WORN_ZONE_SLOTS;
    }
    return zones;
}

/**
 * Pack a zone list into the two vec4-per-slot arrays both terrain paths bind.
 * The single seam through which the resolved list reaches a shader.
 *
 *   rect  = (centreX, centreZ, halfX, halfZ)
 *   shape = (cosAngle, sinAngle, wear, 0)
 *
 * An unused slot gets an identity rotation and a zero wear, never a zero-sized
 * rotation matrix: the shader multiplies by it unconditionally.
 *
 * @param {Array<object> | null | undefined} zones
 * @param {number} [slots]
 * @returns {{rect: number[][], shape: number[][], used: number}}
 */
export function packWornZones(zones, slots = WORN_ZONE_SLOTS) {
    const rect = [];
    const shape = [];
    let used = 0;
    for (let i = 0; i < slots; i++) {
        const zone = zones?.[i] ?? null;
        const wear = Number.isFinite(zone?.wear) ? zone.wear : 0;
        if (!zone || !(wear > 0)) {
            rect.push([0, 0, 0, 0]);
            shape.push([1, 0, 0, 0]);
            continue;
        }
        if (zone.type === 'rotated') {
            rect.push([zone.centerX, zone.centerZ, zone.width / 2, zone.depth / 2]);
            shape.push([zone.cosAngle, zone.sinAngle, wear, 0]);
        } else {
            rect.push([
                (zone.minX + zone.maxX) / 2,
                (zone.minZ + zone.maxZ) / 2,
                (zone.maxX - zone.minX) / 2,
                (zone.maxZ - zone.minZ) / 2,
            ]);
            shape.push([1, 0, wear, 0]);
        }
        used++;
    }
    return { rect, shape, used };
}
