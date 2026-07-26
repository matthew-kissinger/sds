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
 * The depth floor keeps radial-boundary islands from showing a turquoise disc;
 * coastline scenes (Newsheepdogland) pass the lower floor so a real shallow
 * band reads along the shore (Cycle 90).
 *
 * Measured, Cycle 118: at 0.82 the visible depthT is pinned to the floor until
 * the seabed is 13.18 m (Rolling Hills) / 23.03 m (Open Country) below the
 * water plane, so everything from the foam line out to that depth is a single
 * flat colour. At 0.45 on Newsheepdogland the pin ends at 6.41 m. Phase 3 owns
 * re-ranging this; Phase 2 only moves it into one place.
 */
export const WATER_DEFAULT_MIN_DEPTH_T = 0.82;
export const WATER_COASTLINE_MIN_DEPTH_T = 0.45;

/** smoothstep bounds for the heightfield-driven depth resolve. */
export const WATER_DEPTH_FROM_HEIGHTFIELD = Object.freeze({
    start: 0.2,
    falloffScale: 0.45,
    falloffFloor: 0.25,
});

export function waterDepthFalloffFromHeightfield(shorelineFalloff) {
    return Math.max(
        shorelineFalloff * WATER_DEPTH_FROM_HEIGHTFIELD.falloffScale,
        WATER_DEPTH_FROM_HEIGHTFIELD.falloffFloor
    );
}

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
 * SLOPE AMPLITUDE, measured Cycle 118 against the shipped scale of 0.055: the
 * per-axis sums are NOT unit-bounded (three waves, each up to 1 + w2), so the
 * naive atan(0.055) = 3.1 degrees understates it. True max tilt is 8.26
 * degrees, RMS 2.88. Phase 3 raises WATER_SLOPE_SCALE and records both numbers.
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
export const WATER_SLOPE_SCALE = 0.055;

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
