// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Cycle 118 Phase 2 - the single water-surface authority.
 *
 * Before this module the water's geometry-independent maths lived in five
 * places that had already drifted apart:
 *
 *   1. js/water/AnimeWater.js            WATER_PALETTE_RGB, sRGB bytes
 *   2. js/water/AnimeWater.js            the same three hexes again as uniform
 *                                        defaults, NOT derived from (1)
 *   3. js/water/webgpuWaterNodeMaterialFactories.js
 *                                        DEFAULT_WATER_COLORS, the same colours
 *                                        as sRGB floats while the live context
 *                                        path fed LINEAR floats - a silent
 *                                        colour-space fork
 *   4. js/diagnostics/webgpuDiagnostic.js
 *                                        a byte-identical copy of (1), reported
 *                                        as /255 sRGB floats so its cross-check
 *                                        spec compared /255 on both sides and
 *                                        was structurally unable to see (3)
 *   5. js/atmosphere/skyFogPresetTuning.js
 *                                        `colorTint`, a per-channel multiplier
 *                                        of [0.22, 0.40, 1.42] that turned the
 *                                        authored teal into the shipped cobalt
 *
 * Plus one noise basis implemented twice and disagreeing: a 27-line Ashima
 * simplex in GLSL on the WebGL twin against a TSL value-noise on the node path.
 * And a three-rotation slope field that only the node path had at all, so the
 * WebGL twin shaded against a perfect plane.
 *
 * Everything above now derives from this file. Precedent and shape:
 * js/world/foliageLightingRig.js, the single foliage-lighting authority.
 *
 * COLOUR SPACE. The palette is authored as sRGB bytes (the numbers a human
 * picks) and consumed as LINEAR-sRGB working-space floats (the numbers both
 * shaders multiply). That, and the transfer between them, lives one file down
 * in [`waterPalette.js`](./waterPalette.js) and is re-exported here, so almost
 * everything can import the model and forget the split exists. The one file
 * that must not is js/diagnostics/glProbe.js: it rides the `main` chunk, which
 * has about 1.6 KB of ratchet headroom against this module's ~4.7 KB. The leaf
 * carries its own note.
 *
 * No THREE import: this module is pure JS plus a GLSL source string plus TSL
 * builders that take the TSL namespace as an argument, so both render paths and
 * the off-GPU tests can all take it.
 */

export {
    WATER_COLOR_SPACE,
    WATER_PALETTE_LINEAR,
    WATER_PALETTE_SRGB_BYTES,
    isNearFoamWhiteRgb,
    linearToSrgb,
    srgbToLinear,
} from './waterPalette.js';

import { WATER_PALETTE_LINEAR, linearToSrgb } from './waterPalette.js';

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}

/**
 * The base-colour ramp, in the space the shaders mix in. Both render paths do
 * mix(shallow, deep, depthT) on LINEAR values, so this is the off-GPU mirror of
 * that expression rather than a second, byte-space model of it.
 */
export function mixWaterBaseColorLinear(depthT) {
    const t = clamp01(depthT);
    return WATER_PALETTE_LINEAR.shallow.map((channel, index) => (
        channel + (WATER_PALETTE_LINEAR.deep[index] - channel) * t
    ));
}

/**
 * The same ramp encoded back to sRGB bytes, for anything comparing against
 * pixels read off a canvas.
 */
export function waterBaseColorSrgbBytes(depthT) {
    return mixWaterBaseColorLinear(depthT).map((channel) => Math.round(linearToSrgb(channel) * 255));
}

// ---------------------------------------------------------------------------
// Shoreline and depth resolve
// ---------------------------------------------------------------------------

export const WATER_FOAM_THICKNESS = 2.5;

/**
 * The heightfield-interface foam band, as multiples of WATER_FOAM_THICKNESS, in
 * METRES OF SEABED (the branch keys on |terrainY - waterY|, not on horizontal
 * distance).
 *
 * Cycle 118 Phase 3 narrowed it from 0.18-1.15 (0.45 m to 2.875 m of seabed).
 * Because the threshold is a depth, the band's WIDTH on screen is set by the
 * bathymetry: on Rolling Hills' cliff coast 2.875 m of seabed is a couple of
 * metres and it reads as a line, but on Newsheepdogland's 3 m shelf it covers
 * most of the visible sea, and the before-capture shows that scene's near shore
 * as a single white field. Cobalt hid it; a pastoral sea does not.
 *
 * This does not fix the underlying shape - foam keyed to depth will always
 * widen on a gentle shelf - it just stops the widest case swallowing the water.
 * Keying foam on the horizontal distance to the interface is the real fix and
 * it needs its own pass. Recorded in the cycle plan as not fixed.
 */
export const WATER_FOAM_INTERFACE_BAND = Object.freeze({
    start: 0.08,
    end: 0.70,
});

/**
 * The depth floor, and the ONE branch that still takes it (Cycle 118 Phase 3).
 *
 * It used to floor the resolved depth on both branches, which is why the whole
 * near-shore band was a single flat colour: at 0.82 the visible depthT stayed
 * pinned until the seabed was 13.18 m down on Rolling Hills and 23.03 m on Open
 * Country, and no shipped seabed is that deep (measured: -12 m, -10 m, -3 m).
 * The floor was compensating for a mis-ranged ramp, not expressing a look.
 *
 * Phase 3 re-ranged the ramp (see WATER_DEPTH_FROM_HEIGHTFIELD) and scoped the
 * floor to the heightfield-LESS branch, which is the one it was authored for:
 * without a heightfield the resolve is `distance from the boundary circle`,
 * which reads as a turquoise disc drawn around the island rather than as depth.
 * Every shipped water scene binds a heightfield, so this is the degraded-boot
 * guard now and nothing else.
 */
export const WATER_DEFAULT_MIN_DEPTH_T = 0.82;

/**
 * The shore-to-deep ramp, in METRES OF SEABED under the water plane.
 *
 * Was `smoothstep(0.2, max(shorelineFalloff * 0.45, 0.25), depth)`, which
 * derived a depth range from a horizontal falloff distance: 18 m on Rolling
 * Hills, 31.5 m on Open Country, 13.5 m on Newsheepdogland. Those are the
 * distances the shoreline gradient fades over, not the depths the seabed
 * reaches, so the ramp asked for water three to ten times deeper than any of
 * these scenes has and never left its first few percent. Measured seabeds:
 * -12 m (Rolling Hills), -10 m (Open Country), -3 m (Newsheepdogland).
 *
 * A depth range is now a depth range. `full` is deliberately shallower than the
 * two island seabeds so their open water sits at the deep colour and the whole
 * ramp is spent where it is visible - between the foam line and the drop-off.
 * At 6 m Newsheepdogland's 3 m shelf resolves to 0.467, within two hundredths
 * of the 0.45 floor that scene was hand-tuned to in Cycle 90, so its overall
 * tone is preserved while its shore gains the gradient it never had.
 */
export const WATER_DEPTH_FROM_HEIGHTFIELD = Object.freeze({
    start: 0.25,
    full: 6.0,
});

/**
 * Off-GPU shoreline metrics for the radial-boundary case. Unit-testable mirror
 * of the boundary branch both shaders carry.
 */
export function computeShorelineMetrics({
    x,
    z,
    centerX = 0,
    centerZ = 0,
    boundaryRadius,
    boundaryFalloff,
    foamThickness = WATER_FOAM_THICKNESS,
}) {
    const falloff = Math.max(boundaryFalloff, 0.001);
    const radialDistance = Math.hypot(x - centerX, z - centerZ);
    const distanceFromShore = Math.abs(radialDistance - boundaryRadius);
    const depthT = clamp01(distanceFromShore / falloff);
    const foamMask = distanceFromShore < foamThickness ? 1 : 0;

    return {
        radialDistance,
        distanceFromShore,
        depthT,
        foamMask,
    };
}

// ---------------------------------------------------------------------------
// The noise basis
// ---------------------------------------------------------------------------

/**
 * ONE basis, three artefacts, one set of constants.
 *
 * Cycle 118 Phase 2 decision: strategy (ii) of the two the plan offered - the
 * WebGL twin transcribes the node path's TSL value-noise, rather than the two
 * sides keeping a GLSL simplex and a TSL value-noise and pinning them against
 * each other. A GLSL template string and a TSL node graph cannot be literally
 * one implementation, so the invariant that is actually enforceable is that
 * both are generated from the constants below and neither render path declares
 * a noise of its own. waterValueNoise2D is the off-GPU reference of the same
 * arithmetic, so the basis also has pinned numeric behaviour in CI.
 *
 * The twin's call sites wanted a signed [-1, 1] value (Ashima simplex's range),
 * so the GLSL exposes waterValueNoiseSigned and every former snoise() call maps
 * one-for-one onto it. That keeps every threshold the twin was authored with
 * exactly as authored; only the basis underneath them changed.
 */
export const WATER_NOISE_HASH_VECTOR = Object.freeze([123.34, 456.21]);
export const WATER_NOISE_HASH_OFFSET = 45.32;

const fract = (value) => value - Math.floor(value);

export function waterHash21(x, y) {
    const qx = fract(x * WATER_NOISE_HASH_VECTOR[0]);
    const qy = fract(y * WATER_NOISE_HASH_VECTOR[1]);
    const d = qx * (qx + WATER_NOISE_HASH_OFFSET) + qy * (qy + WATER_NOISE_HASH_OFFSET);
    return fract((qx + d) * (qy + d));
}

export function waterValueNoise2D(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const a = waterHash21(ix, iy);
    const b = waterHash21(ix + 1, iy);
    const c = waterHash21(ix, iy + 1);
    const d = waterHash21(ix + 1, iy + 1);
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    return (a + (b - a) * ux) + (c - a) * uy * (1 - ux) + (d - b) * ux * uy;
}

export function waterValueNoise2DSigned(x, y) {
    return waterValueNoise2D(x, y) * 2 - 1;
}

/**
 * TSL twin of the noise basis. Returns the same three functions the GLSL block
 * below declares, built from the same constants.
 */
export function buildWaterNoiseNodes(TSL) {
    const { dot, floor, fract: fractNode, mix, vec2 } = TSL;
    const hash21 = (p) => {
        const q = fractNode(p.mul(vec2(WATER_NOISE_HASH_VECTOR[0], WATER_NOISE_HASH_VECTOR[1])));
        const r = q.add(dot(q, q.add(WATER_NOISE_HASH_OFFSET)));
        return fractNode(r.x.mul(r.y));
    };
    const valueNoise = (p) => {
        const i = floor(p);
        const f = fractNode(p);
        const a = hash21(i);
        const b = hash21(i.add(vec2(1.0, 0.0)));
        const c = hash21(i.add(vec2(0.0, 1.0)));
        const d = hash21(i.add(vec2(1.0, 1.0)));
        const u = f.mul(f).mul(vec2(3.0, 3.0).sub(f.mul(2.0)));
        return mix(a, b, u.x)
            .add(c.sub(a).mul(u.y).mul(u.x.oneMinus()))
            .add(d.sub(b).mul(u.x).mul(u.y));
    };
    return {
        hash21,
        valueNoise,
        signedValueNoise: (p) => valueNoise(p).mul(2.0).sub(1.0),
    };
}

// ---------------------------------------------------------------------------
// The slope field
// ---------------------------------------------------------------------------

/**
 * Three rotations 60 degrees apart, each carrying a two-term wave. Summing
 * rotated waves instead of one wavefront is the same reasoning the grass wind
 * uses (see .claude/rules/scene-and-render.md): a single noise reads as a
 * coherent front.
 *
 * SLOPE AMPLITUDE. The per-axis sums are NOT unit-bounded (three waves, each up
 * to 1 + w2), so reading the tilt off atan(scale) understates it by a factor of
 * 2.64. At the scale Cycle 118 Phase 2 inherited, 0.055, the max tilt was 8.26
 * degrees and the RMS 2.88 - and the surface photographed as a mirror. Phase 3
 * raises it; the numbers it lands on are recorded on WATER_SLOPE_SCALE below.
 *
 * Cycle 118 Phase 2 also gave the WebGL twin this normal. It shaded against a
 * hardcoded up-vector before, which is why WATER_BEFORE.md read the whole
 * surface as mirror-flat; that claim was exact for the twin and false for the
 * node path. One field now, so Phase 3 raises one constant and both move.
 */
export const WATER_SLOPE_ROTATIONS = Object.freeze([
    Object.freeze([1.0, 0.0]),
    Object.freeze([0.5, 0.8660254]),
    Object.freeze([-0.5, 0.8660254]),
]);

/** term = sin(proj * f1 + t * s1) + sin(proj * f2 + t * s2) * w2 */
export const WATER_SLOPE_WAVES = Object.freeze([
    Object.freeze({ f1: 0.052, s1: 0.21, f2: 0.033, s2: -0.13, w2: 0.55 }),
    Object.freeze({ f1: 0.046, s1: 0.19, f2: 0.029, s2: 0.11, w2: 0.5 }),
    Object.freeze({ f1: 0.041, s1: -0.17, f2: 0.026, s2: 0.09, w2: 0.45 }),
]);

export const WATER_SLOPE_NORMALISE = 0.6667;

/**
 * Cycle 118 Phase 3. 0.055 -> 0.138: max tilt 8.26 -> 20.01 degrees, RMS 2.88 ->
 * 7.06 (both measured by tests/water-surface-model.spec.js, the max analytically
 * from the wave amplitudes and the RMS over a 200 m x 200 m x 8 s sample grid).
 *
 * The waves this rides are long - the fastest term is 2*pi/0.052 = 121 m - so
 * raising the amplitude buys broad, slow undulation rather than chop, which is
 * the right currency for a painterly surface and the only safe one for an
 * analytic normal with no mip chain: short waves at this amplitude would alias
 * into shimmer everywhere past the first fifty metres.
 */
export const WATER_SLOPE_SCALE = 0.138;

/**
 * How hard the slope shades the surface, as a fraction of the sun colour added
 * per unit of `dot(N, sun) - dot(up, sun)`.
 *
 * This is the term that makes the normal read as FORM rather than as gloss, and
 * before Phase 3 it did not exist: the only two consumers of the normal were
 * specular lobes, so a wave face pointing away from the sun was exactly as
 * bright as one pointing into it and the surface could only ever read flat.
 */
export const WATER_WAVE_SHADE_GAIN = 0.30;

/**
 * The glint's near-shore fade, in resolved depthT.
 *
 * The retired expression here was `smoothstep(0.08, 0.55, depthT)`, authored for
 * an unfloored depthT and then left identically 1.0 for the entire life of the
 * 0.82 floor. Phase 3 un-floors depthT, so those constants would have gone live
 * as a side effect of a different change - a look nobody has ever seen, chosen
 * by a shader author who could not have known what the new ramp would resolve
 * to. They are replaced with constants authored against the new ramp: the shore
 * keeps a third of its glint rather than losing all of it, and the fade is spent
 * inside the shallow band instead of running halfway out to the drop-off.
 */
export const WATER_GLINT_SHORE_FADE = Object.freeze({
    floor: 0.35,
    start: 0.0,
    end: 0.30,
});

/**
 * The weight of the two specular lobes, and the whole of Phase 3's rebalance.
 *
 * `broad` is a sun path evaluated against the FLAT up-vector: it does not read
 * the perturbed normal at all, so it cannot know the surface has waves. `ripple`
 * is the sharp Blinn lobe on the slope normal, and it is the only term that
 * turns slope amplitude into something you can see. They shipped at 0.70 / 0.22
 * in the material's defaults and 0.32 / 0.42 in the presets, and because the
 * broad lobe is `pow(x, 8)` against the sharp one's `pow(x, 64)` it covered
 * enough of the frame to carry the picture at either weighting. Reversed here.
 *
 * The preset tuning still overrides per sky preset; these are the defaults both
 * render paths fall back to, and the WebGL twin (which has no preset plumbing)
 * uses them directly.
 */
export const WATER_GLINT_GAIN_DEFAULTS = Object.freeze({
    broad: 0.16,
    ripple: 0.60,
});

/**
 * How far the slow swell nudges the depth the colour ramp reads, either way.
 *
 * The swell used to be a hardcoded `vec3(0.02, 0.08, 0.10)` added on top of the
 * ramp, which is a fourth colour spelled outside the palette and one that could
 * only ever add blue. Reading it as depth instead is the truer model - a swell
 * changes the colour by changing how much water you look through - and it lets
 * the swell darken as well as lighten.
 */
export const WATER_SWELL_DEPTH_SWING = 0.12;

/**
 * The surface's response to the height of the sun.
 *
 * Both render paths are UNLIT - MeshBasicNodeMaterial on the node path, a bare
 * ShaderMaterial on the twin - so without this the sea holds full daylight
 * brightness while the terrain, the grass and the sky all fall away at dusk.
 * The before-capture shows it plainly: at t=0.74 the Rolling Hills cliff is
 * nearly black and the water beside it is at noon strength. It reads as a lit
 * plane laid over a dark world, and the pastoral palette makes it MORE obvious
 * rather than less, because a bright teal draws the eye where a dark navy hid.
 *
 * Driven off the sun's elevation, which is the one light quantity already on
 * this material (sunDirection.y, repushed every frame by the controls update).
 * Measured on the capture poses: 0.94 at noon, 0.15 at dusk.
 *
 * This is a light response, not a colour scale, so it is applied AFTER the foam
 * mix - the foam keeps its documented exemption from the colour chain and still
 * only ever sees foamScale, but it stops glowing white through a night.
 */
export const WATER_SUN_LEVEL = Object.freeze({
    night: 0.32,
    elevationLow: -0.06,
    elevationHigh: 0.42,
});

/**
 * Off-GPU reference of the slope field, from the same constants as the TSL
 * builder and the GLSL. It exists so the tilt a scale produces is a MEASURED
 * number in CI rather than a claim in a plan - the 0.055 scale shipped for two
 * cycles described as a 3.1-degree tilt when the real figure was 8.26, because
 * nothing could evaluate the field off a GPU to check.
 */
export function waterSlopeNormalAt(x, z, t, slopeScale = WATER_SLOPE_SCALE) {
    let slopeX = 0;
    let slopeZ = 0;
    for (let index = 0; index < WATER_SLOPE_ROTATIONS.length; index += 1) {
        const rot = WATER_SLOPE_ROTATIONS[index];
        const wave = WATER_SLOPE_WAVES[index];
        const proj = x * rot[0] + z * rot[1];
        const term = Math.sin(proj * wave.f1 + t * wave.s1)
            + Math.sin(proj * wave.f2 + t * wave.s2) * wave.w2;
        slopeX += term * rot[0];
        slopeZ += term * rot[1];
    }
    const nx = slopeX * WATER_SLOPE_NORMALISE * slopeScale;
    const nz = slopeZ * WATER_SLOPE_NORMALISE * slopeScale;
    const length = Math.hypot(nx, 1, nz);
    return [nx / length, 1 / length, nz / length];
}

/** Tilt of the surface normal away from vertical, in degrees. */
export function waterSlopeTiltDegrees(x, z, t, slopeScale = WATER_SLOPE_SCALE) {
    const normal = waterSlopeNormalAt(x, z, t, slopeScale);
    return Math.acos(Math.min(1, Math.max(-1, normal[1]))) * 180 / Math.PI;
}

/**
 * TSL twin of the GLSL waterSlopeNormal below. `worldXZ` and `time` are nodes;
 * `slopeScale` is a plain number (or a node) so Phase 3 can raise it in one
 * place and both paths move.
 */
export function buildWaterSlopeNormalNode(TSL, { worldXZ, time, slopeScale = WATER_SLOPE_SCALE }) {
    const { dot, normalize, sin, vec2, vec3 } = TSL;
    let slopeX = null;
    let slopeZ = null;
    WATER_SLOPE_ROTATIONS.forEach((rot, index) => {
        const wave = WATER_SLOPE_WAVES[index];
        const proj = dot(worldXZ, vec2(rot[0], rot[1]));
        const term = sin(proj.mul(wave.f1).add(time.mul(wave.s1)))
            .add(sin(proj.mul(wave.f2).add(time.mul(wave.s2))).mul(wave.w2));
        slopeX = slopeX === null ? term.mul(rot[0]) : slopeX.add(term.mul(rot[0]));
        slopeZ = slopeZ === null ? term.mul(rot[1]) : slopeZ.add(term.mul(rot[1]));
    });
    return normalize(vec3(
        slopeX.mul(WATER_SLOPE_NORMALISE).mul(slopeScale),
        1.0,
        slopeZ.mul(WATER_SLOPE_NORMALISE).mul(slopeScale)
    ));
}

/**
 * GLSL ES 1.00 has no implicit int-to-float conversion, so every interpolated
 * constant has to carry a decimal point. `1` is a compile error where `1.0` is
 * not, and the failure is a blank shader at scene load rather than a test.
 */
function glslFloat(value) {
    const text = String(value);
    return /[.eE]/.test(text) ? text : `${text}.0`;
}

function waterSlopeGlslBody() {
    return WATER_SLOPE_ROTATIONS.map((rot, index) => {
        const wave = WATER_SLOPE_WAVES[index];
        return [
            `    float proj${index} = dot(worldXZ, vec2(${glslFloat(rot[0])}, ${glslFloat(rot[1])}));`,
            `    float wave${index} = sin(proj${index} * ${glslFloat(wave.f1)} + t * (${glslFloat(wave.s1)}))`,
            `      + sin(proj${index} * ${glslFloat(wave.f2)} + t * (${glslFloat(wave.s2)})) * ${glslFloat(wave.w2)};`,
            `    slopeX += wave${index} * (${glslFloat(rot[0])});`,
            `    slopeZ += wave${index} * (${glslFloat(rot[1])});`,
        ].join('\n');
    }).join('\n');
}

/**
 * GLSL source for the noise basis and the slope field, included verbatim by
 * js/water/AnimeWater.js's fragment shader. Every constant is interpolated from
 * the exports above, so the GLSL and the TSL cannot drift apart.
 */
export const WATER_SURFACE_GLSL = /* glsl */ `
  float waterHash21(vec2 p) {
    vec2 q = fract(p * vec2(${glslFloat(WATER_NOISE_HASH_VECTOR[0])}, ${glslFloat(WATER_NOISE_HASH_VECTOR[1])}));
    q += dot(q, q + ${glslFloat(WATER_NOISE_HASH_OFFSET)});
    return fract(q.x * q.y);
  }

  float waterValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = waterHash21(i);
    float b = waterHash21(i + vec2(1.0, 0.0));
    float c = waterHash21(i + vec2(0.0, 1.0));
    float d = waterHash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (vec2(3.0) - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float waterValueNoiseSigned(vec2 p) {
    return waterValueNoise(p) * 2.0 - 1.0;
  }

  vec3 waterSlopeNormal(vec2 worldXZ, float t, float slopeScale) {
    float slopeX = 0.0;
    float slopeZ = 0.0;
${waterSlopeGlslBody()}
    slopeX *= ${glslFloat(WATER_SLOPE_NORMALISE)};
    slopeZ *= ${glslFloat(WATER_SLOPE_NORMALISE)};
    return normalize(vec3(slopeX * slopeScale, 1.0, slopeZ * slopeScale));
  }

  // Metres of seabed under the water plane -> the ramp both paths mix on.
  float waterDepthFromSeabed(float seabedDepth) {
    return smoothstep(${glslFloat(WATER_DEPTH_FROM_HEIGHTFIELD.start)}, ${glslFloat(WATER_DEPTH_FROM_HEIGHTFIELD.full)}, seabedDepth);
  }

  float waterGlintShoreFade(float depthT) {
    return mix(${glslFloat(WATER_GLINT_SHORE_FADE.floor)}, 1.0, smoothstep(${glslFloat(WATER_GLINT_SHORE_FADE.start)}, ${glslFloat(WATER_GLINT_SHORE_FADE.end)}, depthT));
  }

  // Signed against the flat reference, so troughs darken as crests lift.
  float waterWaveShade(vec3 normal, vec3 sunDirection) {
    return (dot(normal, sunDirection) - dot(vec3(0.0, 1.0, 0.0), sunDirection)) * ${glslFloat(WATER_WAVE_SHADE_GAIN)};
  }

  // Both paths are unlit, so the surface dims with the sun or it does not dim.
  float waterSunLevel(float sunElevationY) {
    return mix(${glslFloat(WATER_SUN_LEVEL.night)}, 1.0, smoothstep(${glslFloat(WATER_SUN_LEVEL.elevationLow)}, ${glslFloat(WATER_SUN_LEVEL.elevationHigh)}, sunElevationY));
  }
`;

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/**
 * Cycle 118 Phase 5. The water's animation clock advances by the frame's own
 * deltaTime and stops when the sim is paused, so a capture can pin it. It used
 * to be TSL `time` (the renderer's own frame clock), which free-runs regardless
 * of anything main.js does and made a byte-identical re-capture impossible.
 */
export function advanceWaterClock(current, deltaTime, { paused = false } = {}) {
    const now = Number.isFinite(current) ? current : 0;
    if (paused) return now;
    const dt = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
    return now + dt;
}
