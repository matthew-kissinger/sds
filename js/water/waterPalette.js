// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Cycle 118 Phase 2 - the water's one palette, and the one statement of the
 * space it lives in.
 *
 * This is a leaf of [`waterSurfaceModel.js`](./waterSurfaceModel.js), which
 * re-exports every symbol here. Read the model's header for the full account of
 * the six sites this retired. Almost every consumer should import from the
 * model; the exception is the one that forced the split.
 *
 * WHY IT IS ITS OWN FILE. `js/diagnostics/glProbe.js` is statically imported by
 * `js/main.js`, so anything it imports lands in the `main` chunk, and `main`
 * runs with about 1.6 KB of ratchet headroom. The full surface model minifies
 * to ~4.7 KB, so pulling it in for three bytes of foam white would have blown
 * `tests/refactor-baseline/__fixtures__/bundle-sizes.json` - a fence-frozen
 * fixture this cycle is explicitly not authorised to bump. The alternative was
 * to let glProbe keep its own copy of the colour and carve an exception into
 * the single-declaration guard, which is how a spec starts certifying a bug
 * instead of catching it. A leaf costs a few hundred bytes and keeps the
 * invariant honest.
 *
 * COLOUR SPACE. Authored as sRGB bytes (the numbers a human picks), consumed as
 * linear-sRGB working-space floats (the numbers both shaders multiply).
 * srgbToLinear/linearToSrgb reproduce three's own SRGBToLinear/LinearToSRGB
 * exactly, so `new THREE.Color(0x6fd7d2).toArray()` and
 * WATER_PALETTE_LINEAR.shallow are the same three numbers - pinned by
 * tests/water-surface-model.spec.js. No THREE import: the transfer is four
 * lines and importing three here would drag it into the `main` chunk.
 */

/** The space every consumer of WATER_PALETTE_LINEAR works in. */
export const WATER_COLOR_SPACE = 'linear-srgb';

/**
 * The one palette definition. Nothing else in the repo may spell these numbers;
 * tests/water-surface-model.spec.js fails on any file that re-declares them in
 * any spelling (hex, 0x byte array, decimal byte array, sRGB float, linear
 * float).
 */
export const WATER_PALETTE_SRGB_BYTES = Object.freeze({
    shallow: Object.freeze([0x6f, 0xd7, 0xd2]),
    deep: Object.freeze([0x10, 0x36, 0x62]),
    foam: Object.freeze([0xea, 0xf6, 0xff]),
});

/** Mirrors three's SRGBToLinear (three.core.js). */
export function srgbToLinear(channel) {
    const c = Math.min(1, Math.max(0, Number(channel) || 0));
    return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

/** Mirrors three's LinearToSRGB (three.core.js). */
export function linearToSrgb(channel) {
    const c = Math.min(1, Math.max(0, Number(channel) || 0));
    return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055;
}

function bytesToLinear(bytes) {
    return Object.freeze(bytes.map((byte) => srgbToLinear(byte / 255)));
}

/** The palette in WATER_COLOR_SPACE. This is what both shaders multiply. */
export const WATER_PALETTE_LINEAR = Object.freeze({
    shallow: bytesToLinear(WATER_PALETTE_SRGB_BYTES.shallow),
    deep: bytesToLinear(WATER_PALETTE_SRGB_BYTES.deep),
    foam: bytesToLinear(WATER_PALETTE_SRGB_BYTES.foam),
});

/**
 * Foam-white comparison against sRGB bytes read off a framebuffer. The
 * "ground rendered white" detector in js/diagnostics/glProbe.js is the live
 * consumer, and it had re-derived both the colour and this predicate.
 */
export function isNearFoamWhiteRgb(rgb, tolerance = 14) {
    return WATER_PALETTE_SRGB_BYTES.foam.every((channel, index) => Math.abs(rgb[index] - channel) <= tolerance);
}
