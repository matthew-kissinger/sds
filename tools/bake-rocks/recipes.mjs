// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Rock recipe pool — Cycle 15 Phase 1.
 *
 * Each recipe drives one IcosahedronGeometry + 3D simplex displacement
 * bake (see `tools/bake-rocks/bake.html` for the pipeline). Tweaks
 * across the array are intentionally diverse: small pebbles, medium
 * boulders, tall spires, flat slabs, mossy chunks. Every recipe is
 * byte-stable given its `seed`.
 *
 * Workflow:
 *   1. Edit / extend this array.
 *   2. `npm run bake-rocks` (writes all to `tools/asset-gallery/staging/rocks/`).
 *   3. Open the gallery, pick 3, save.
 *   4. `node tools/asset-gen/integrate.mjs --compress` renames picks to
 *      rock1/rock2/rock3 and copies them into `assets/models/rocks/`.
 *
 * Knob legend:
 *   radius             — base IcosahedronGeometry radius before displace
 *   detail             — icosa subdivision (2 → 320 tris before non-indexed)
 *   seed               — mulberry32 seed for byte-stability
 *   displacementAmp    — how lumpy (0.010 = smooth pebble, 0.050 = jagged outcrop)
 *   noise.freq1        — primary lump frequency (lower = larger lumps)
 *   noise.freq2        — facet break-up frequency (higher = sharper facets)
 *   noise.weight2      — blend (0.0 = pure low-freq, 0.5 = lots of high-freq)
 *   scale.{x,y,z}      — non-uniform stretch (1.0 = sphere; 0.5/2.0 = wide/flat or tall/narrow)
 *   color              — base hex color, AO-modulated by Y position (vertex colors)
 *   targetHeight       — final native height in metres (TerrainBuilder normalizes again)
 *
 * For new recipes: pick a target silhouette first (sketch on paper if
 * needed), then twist these knobs until it reads. amp + scale do most
 * of the visual lift; color sets the mood.
 */
export const RECIPES = [
    // ---------------- SMALL PEBBLES (~0.10–0.12m) ----------------
    {
        name: 'pebble_round_small',
        radius: 0.08, detail: 2, seed: 11,
        displacementAmp: 0.012,
        noise: { freq1: 9.0, freq2: 24.0, weight2: 0.20 },
        scale: { x: 1.05, y: 0.65, z: 0.95 },
        color: 0xa49684, targetHeight: 0.10
    },
    {
        name: 'pebble_river_smooth',
        radius: 0.10, detail: 2, seed: 17,
        displacementAmp: 0.010,
        noise: { freq1: 6.0, freq2: 18.0, weight2: 0.15 },
        scale: { x: 1.40, y: 0.35, z: 1.10 },
        color: 0x7e8a8e, targetHeight: 0.08 // very flat slate-blue river stone
    },
    {
        name: 'pebble_oval_chunky',
        radius: 0.10, detail: 2, seed: 29,
        displacementAmp: 0.018,
        noise: { freq1: 8.0, freq2: 22.0, weight2: 0.30 },
        scale: { x: 1.50, y: 0.55, z: 0.90 },
        color: 0x9c8e7a, targetHeight: 0.12 // matches existing rock1 vibe
    },
    {
        name: 'pebble_speckled',
        radius: 0.10, detail: 2, seed: 37,
        displacementAmp: 0.020,
        noise: { freq1: 10.0, freq2: 28.0, weight2: 0.35 },
        scale: { x: 1.00, y: 0.75, z: 1.00 },
        color: 0xb0a292, targetHeight: 0.12 // light warm grey
    },

    // ---------------- MEDIUM BOULDERS (~0.20–0.30m) ----------------
    {
        name: 'boulder_chunky_mid',
        radius: 0.15, detail: 2, seed: 41,
        displacementAmp: 0.030,
        noise: { freq1: 5.0, freq2: 15.0, weight2: 0.30 },
        scale: { x: 1.20, y: 0.85, z: 1.05 },
        color: 0x8a7e6b, targetHeight: 0.28 // mid grey-brown (~existing rock2)
    },
    {
        name: 'boulder_round_warm',
        radius: 0.15, detail: 2, seed: 53,
        displacementAmp: 0.022,
        noise: { freq1: 6.0, freq2: 18.0, weight2: 0.25 },
        scale: { x: 1.05, y: 0.95, z: 1.00 },
        color: 0xa68b6e, targetHeight: 0.30 // tan-warm round boulder
    },
    {
        name: 'boulder_mossy',
        radius: 0.15, detail: 2, seed: 67,
        displacementAmp: 0.028,
        noise: { freq1: 5.5, freq2: 17.0, weight2: 0.32 },
        scale: { x: 1.10, y: 0.90, z: 1.00 },
        color: 0x6e7855, targetHeight: 0.28 // olive-green-brown
    },
    {
        name: 'boulder_lichen_grey',
        radius: 0.15, detail: 2, seed: 79,
        displacementAmp: 0.025,
        noise: { freq1: 6.5, freq2: 19.0, weight2: 0.28 },
        scale: { x: 1.05, y: 0.85, z: 1.05 },
        color: 0x8e8a82, targetHeight: 0.26 // cool grey
    },
    {
        name: 'boulder_dark_dense',
        radius: 0.13, detail: 2, seed: 89,
        displacementAmp: 0.030,
        noise: { freq1: 7.0, freq2: 21.0, weight2: 0.30 },
        scale: { x: 0.95, y: 0.85, z: 0.95 },
        color: 0x4a4642, targetHeight: 0.24 // obsidian-dark
    },

    // ---------------- LARGE FORMATIONS (~0.35–0.50m) ----------------
    {
        name: 'craggy_outcrop',
        radius: 0.18, detail: 3, seed: 101,
        displacementAmp: 0.050,
        noise: { freq1: 4.0, freq2: 22.0, weight2: 0.45 },
        scale: { x: 1.10, y: 0.90, z: 0.90 },
        color: 0x8c8278, targetHeight: 0.40 // granite-mottled
    },
    {
        name: 'craggy_chunk_warm',
        radius: 0.17, detail: 3, seed: 113,
        displacementAmp: 0.045,
        noise: { freq1: 4.5, freq2: 20.0, weight2: 0.40 },
        scale: { x: 1.10, y: 0.80, z: 1.05 },
        color: 0x927b66, targetHeight: 0.38 // granite-warm
    },
    {
        name: 'spire_jagged_dark',
        radius: 0.15, detail: 3, seed: 127,
        displacementAmp: 0.045,
        noise: { freq1: 4.0, freq2: 18.0, weight2: 0.45 },
        scale: { x: 0.60, y: 2.00, z: 0.60 },
        color: 0x4e5258, targetHeight: 0.50 // tall jagged slate
    },
    {
        name: 'spire_smooth_grey',
        radius: 0.15, detail: 2, seed: 139,
        displacementAmp: 0.025,
        noise: { freq1: 5.0, freq2: 17.0, weight2: 0.25 },
        scale: { x: 0.70, y: 1.70, z: 0.70 },
        color: 0x8a8e92, targetHeight: 0.45 // tall smooth grey spire
    },
    {
        name: 'slab_flat_sandstone',
        radius: 0.20, detail: 2, seed: 151,
        displacementAmp: 0.020,
        noise: { freq1: 5.0, freq2: 15.0, weight2: 0.25 },
        scale: { x: 1.60, y: 0.30, z: 1.40 },
        color: 0xc09a72, targetHeight: 0.20 // wide flat sandstone slab
    },
    {
        name: 'slab_tilted_dark',
        radius: 0.20, detail: 2, seed: 163,
        displacementAmp: 0.025,
        noise: { freq1: 5.5, freq2: 16.0, weight2: 0.30 },
        scale: { x: 1.40, y: 0.50, z: 1.20 },
        color: 0x5a5e62, targetHeight: 0.30 // dark tilted slab
    },
    {
        name: 'weathered_low_wide',
        radius: 0.16, detail: 2, seed: 173,
        displacementAmp: 0.022,
        noise: { freq1: 6.0, freq2: 18.0, weight2: 0.25 },
        scale: { x: 1.30, y: 0.55, z: 1.15 },
        color: 0xb09578, targetHeight: 0.25 // sandstone-eroded
    }
];
