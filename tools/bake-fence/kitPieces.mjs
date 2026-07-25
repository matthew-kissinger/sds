// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The fence kit's authoring source.
 *
 * Cycle 115 Phase 1 wrote this because the kit had none. `Fence_Kit-v1.0.0.glb`
 * arrived as an opaque binary from an external generator: 156 triangles of post
 * spread over 85 distinct hand-authored Y levels, no `COLOR_0`, no parameters.
 * Every ask in the cycle (a real chamfer, weathering, sag) was blocked on the
 * same missing thing, so the kit is authored here instead.
 *
 * Pure data in, pure buffers out. No three.js, no DOM, no file IO. That is what
 * lets the same code run in the bake harness's headless Chromium, in Node for
 * the driver's report, and in a vitest spec that measures the silhouette
 * against the shipped kit without launching a browser.
 *
 * ## The silhouette is frozen
 *
 * Cycle 115 Q2: silhouette yes, surface no. `js/StructureBuilder.js` instances
 * rails at [0.5, 1.2, 1.9] against a 2.18m post, and the entrance heroes are
 * shot against that fence. So {@link FENCE_POST}`.height` and the rail's 1.0
 * unit length along local +X are contract, not taste. Everything else here is
 * a knob.
 *
 * ## Palette, not textures
 *
 * Every piece samples the same 32x4 `PaletteBaseColor` PNG, six four-pixel
 * bands of flat colour, sampled NEAREST at the band centre. That texture is
 * lifted verbatim from the shipped kit by `tools/bake-fence.mjs`, so the hues
 * do not drift and the kit keeps its one shared image. Vertex colour only ever
 * DARKENS the palette (see `js/world/fenceWear.js`); it never introduces hue.
 */

import {
    groundWeatherFactor,
    undersideWeatherFactor,
} from '../../js/world/fenceWear.js';
import { mulberry32 } from '../../shared/Random.js';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/**
 * Band index into the shared 32x4 palette. Names and hexes are the SDS Pastoral
 * Survival v1 palette recorded in `cycle105-validation/fence-kiln-spec.md`;
 * the indices are what the shipped kit's UVs actually resolve to.
 */
export const PALETTE = Object.freeze({
    bark: 0,    // #4e3a2b  packed earth at the foot of a post
    stone: 1,   // #7d8580  the footing block
    wood: 2,    // #8b6a45  weathered warm wood, the body of everything
    cut: 3,     // #c1a36d  exposed end grain: post tops, rail ends
    lichen: 4,  // #6f7f4c  reserved for moss accents
    iron: 5,    // #383735  gate hardware
});

/** Centre of a palette band in UV. Six bands of four texels across 32. */
export const paletteUV = (band) => (band * 4 + 2) / 32;

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

/**
 * The fence post.
 *
 * Silhouette contract (measured off `Fence_Kit-v1.0.0.glb`): 2.180m tall,
 * footprint bbox 0.4184 x 0.3980, wood shaft corner radius 0.137 (a square of
 * half-width 0.097). `collarHalf` reproduces the footprint, `shaftHalf`
 * reproduces the shaft, and both matter: `createFencePostJitter` in
 * `js/FencePresets.js` caps post lean at 0.038 rad by arguing the leaned
 * cross-section must still cover the top rail's attachment at 1.9m. This post
 * is 0.0873 half-width there, which keeps that argument true with the same
 * margin the shipped post had. Narrow the shaft and that cap has to shrink too.
 *
 * `chamfer` is the point of the exercise: a genuine 45 degree weather chamfer
 * (equal rise and inset) around the top, instead of the shipped post's ring of
 * displacement noise. It is what catches the low sun along a run.
 *
 * `arrisChamfer` cuts the four vertical corners, turning the square post into
 * an octagon. A sawn square post reads as a stick from every angle; the cut
 * arris gives it two extra tones per face and is what makes a fence read as
 * hewn timber rather than as extruded box.
 */
export const FENCE_POST = Object.freeze({
    height: 2.180,        // FROZEN. Q2 silhouette.
    collarHalf: 0.205,    // earth mound at ground contact, sets the bbox footprint
    collarTop: 0.075,
    footingHalf: 0.132,   // stone block the post is set into
    footingTop: 0.235,
    shaftHalf: 0.098,     // half-width at the shaft's base
    shaftTaper: 0.878,    // multiplier at the shaft's top
    shaftRings: 4,        // controllable ring count, the Phase 1 ask
    arrisChamfer: 0.27,   // vertical corner cut, as a fraction of the half-width
    chamfer: 0.030,       // top weather chamfer, rise == inset == 45 degrees
    grainJitter: 0.045,   // per-ring tonal wander, seeded
    seed: 0x5d5f01,
});

/**
 * The rail.
 *
 * Silhouette contract: 1.000 long on local +X, centred on its own origin, so
 * that `railScale.set(spacing / railModelLength, 1, 1)` in
 * `js/StructureBuilder.js` still stretches it correctly between post centres.
 * Cross-section matches the shipped rail's 0.0992 x 0.1212.
 *
 * `segments` is the sag budget. The rail ships STRAIGHT; the droop is applied
 * per fence segment at load by `applyRailSag` in `js/world/fenceWear.js`,
 * because the droop has to scale with the span and the span is not known here.
 * Four bands (five vertex rings) resolve a 60mm parabola over 5m to within
 * 4mm of the true curve, and cost 8 triangles over the shipped rail.
 *
 * Only the two TOP arrises are chamfered. That is how a real rail wears: the
 * top edges take the rain and the sheep, the bottom ones stay square in shadow.
 * It also keeps the rail at 6 sides rather than 8, which matters when a Home
 * Field perimeter draws 480 of them.
 */
export const FENCE_RAIL = Object.freeze({
    length: 1.000,        // FROZEN. Q2 silhouette + railModelLength.
    halfHeight: 0.0496,
    halfDepth: 0.0606,
    arrisChamfer: 0.020,  // absolute metres, top two corners only
    segments: 4,
    grainJitter: 0.035,
    seed: 0x5d5f02,
});

/**
 * The gate post. Same builder, heavier proportions, plus an iron collar band.
 *
 * Silhouette contract: 1.4303 tall, footprint 0.4178 x 0.4800. Note this piece
 * is currently INERT at runtime: `FencePresets.createGateStructure` prefers the
 * authored `Gate_Assembly` GLB, and falls back to `fencePost` before it would
 * ever reach `gatePost`. It is authored anyway because the kit contract in
 * `cycle105-validation/fence-kiln-spec.md` names all four wrapper nodes and
 * `loadModels()` warns when one is missing.
 */
export const GATE_POST = Object.freeze({
    height: 1.4303,
    collarHalfX: 0.209,
    collarHalfZ: 0.240,
    collarTop: 0.075,
    footingHalfX: 0.150,
    footingHalfZ: 0.165,
    footingTop: 0.230,
    shaftHalfX: 0.118,
    shaftHalfZ: 0.128,
    shaftTaper: 0.915,
    bandBottom: 0.950,    // iron collar
    bandTop: 1.020,
    bandProud: 0.014,
    arrisChamfer: 0.24,
    chamfer: 0.030,
    grainJitter: 0.040,
    seed: 0x5d5f03,
});

/**
 * The gate arch: two uprights carrying a shallow arced lintel.
 *
 * Silhouette contract: 1.3188 wide, 2.2191 tall, 0.2912 deep. Inert at runtime
 * for the same reason as {@link GATE_POST} (nothing reads `models.gateArch`),
 * so it is authored to the bbox and no further.
 */
export const GATE_ARCH = Object.freeze({
    halfWidth: 0.6594,
    height: 2.2191,
    halfDepth: 0.1456,
    uprightHalf: 0.100,
    uprightTop: 1.880,
    beamHalf: 0.088,
    beamSegments: 6,
    arcRise: 0.339,       // height of the arc above the springing line
    chamfer: 0.026,
    grainJitter: 0.030,
    seed: 0x5d5f04,
});

// ---------------------------------------------------------------------------
// Section profiles
// ---------------------------------------------------------------------------

/**
 * A rectangle with all four corners cut at 45 degrees, as a closed loop of
 * (a, b) pairs in the ring's own frame. `chamfer` is absolute, in the same
 * units as the half-extents, and clamps to half the shorter side.
 */
export function chamferedRect(halfA, halfB, chamfer) {
    const c = Math.max(0, Math.min(chamfer, Math.min(halfA, halfB) * 0.98));
    if (c <= 1e-6) {
        return [[halfA, -halfB], [-halfA, -halfB], [-halfA, halfB], [halfA, halfB]];
    }
    return [
        [halfA - c, -halfB], [-(halfA - c), -halfB],
        [-halfA, -(halfB - c)], [-halfA, halfB - c],
        [-(halfA - c), halfB], [halfA - c, halfB],
        [halfA, halfB - c], [halfA, -(halfB - c)],
    ];
}

/**
 * A rectangle with only the two corners at +A chamfered. Used for the rail,
 * whose +A side is its top. Six sides instead of eight.
 */
export function topChamferedRect(halfA, halfB, chamfer) {
    const c = Math.max(0, Math.min(chamfer, Math.min(halfA, halfB) * 0.98));
    return [
        [halfA - c, -halfB], [-halfA, -halfB],
        [-halfA, halfB], [halfA - c, halfB],
        [halfA, halfB - c], [halfA, -(halfB - c)],
    ];
}

// ---------------------------------------------------------------------------
// Extrusion
// ---------------------------------------------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Sweep a stack of sections along a path and emit flat-shaded bands.
 *
 * A "ring" is `{ p, u, v, section, band, shade }`: a path point, the two frame
 * axes its section lives in, the loop itself, the palette band, and a tonal
 * multiplier. Section point (a, b) lands at `p + a*u + b*v`.
 *
 * Every band gets its own vertices, so every face carries its own normal. That
 * faceted read is the point: it is what the rocks, the sheep and the trees do,
 * and a smooth-shaded octagonal post reads as a plastic cylinder. Repeating a
 * ring at the same path point with a different band is how a colour break is
 * expressed (the earth-to-stone step at a post's foot, say).
 *
 * Winding is derived rather than assumed. Each quad's normal is flipped to
 * agree with the outward direction from the path, so a section can be authored
 * in whichever order reads clearest without anyone tracking handedness.
 */
export function extrudePath(rings, { capStart = true, capEnd = true, capStartBand, capEndBand, groundWeathered = true, footY = 0 } = {}) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];

    const ringPoint = (ring, j) => {
        const [a, b] = ring.section[j];
        return [
            ring.p[0] + a * ring.u[0] + b * ring.v[0],
            ring.p[1] + a * ring.u[1] + b * ring.v[1],
            ring.p[2] + a * ring.u[2] + b * ring.v[2],
        ];
    };

    /** Push one vertex, folding the wear model into COLOR_0 as we go. */
    const push = (pos, normal, band, shade) => {
        const index = positions.length / 3;
        positions.push(pos[0], pos[1], pos[2]);
        normals.push(normal[0], normal[1], normal[2]);
        const uv = paletteUV(band);
        uvs.push(uv, uv);
        let s = shade * undersideWeatherFactor(normal[1]);
        if (groundWeathered) s *= groundWeatherFactor(pos[1] - footY);
        colors.push(s, s, s);
        return index;
    };

    /** Widest point of a section, used to tell a step-in from a step-out. */
    const sectionReach = (section) => section.reduce((m, [a, b]) => Math.max(m, Math.hypot(a, b)), 0);

    for (let i = 0; i < rings.length - 1; i++) {
        const A = rings[i];
        const B = rings[i + 1];
        if (A.section.length !== B.section.length) {
            throw new Error(`extrudePath: ring ${i} has ${A.section.length} sides, ring ${i + 1} has ${B.section.length}`);
        }
        const sides = A.section.length;
        const axis = sub(B.p, A.p);
        const axisLength = Math.hypot(axis[0], axis[1], axis[2]);
        // A degenerate band is a pure colour break: two rings at the same path
        // point with the same section. It contributes no faces, only the split.
        const degenerate = axisLength < 1e-9
            && A.section.every(([a, b], j) => Math.abs(a - B.section[j][0]) < 1e-9 && Math.abs(b - B.section[j][1]) < 1e-9);
        if (degenerate) continue;

        // Two rings at the SAME path point with DIFFERENT sections make a step:
        // the shoulder where a post's earth mound meets its stone footing. Its
        // faces are perpendicular to the sweep, so the radial test below reads
        // zero on them and cannot orient them. Fall back to the local sweep
        // direction, pointed the way the step actually faces: a step that
        // narrows as the sweep advances faces forward, one that widens faces back.
        let stepNormal = null;
        if (axisLength < 1e-9) {
            const ahead = rings[Math.min(i + 2, rings.length - 1)].p;
            const behind = rings[Math.max(i - 1, 0)].p;
            const sweep = norm(sub(ahead, behind));
            const sign = sectionReach(B.section) < sectionReach(A.section) ? 1 : -1;
            stepNormal = [sweep[0] * sign, sweep[1] * sign, sweep[2] * sign];
        }

        for (let j = 0; j < sides; j++) {
            const k = (j + 1) % sides;
            const a0 = ringPoint(A, j);
            const a1 = ringPoint(A, k);
            const b1 = ringPoint(B, k);
            const b0 = ringPoint(B, j);

            let n = norm(cross(sub(a1, a0), sub(b0, a0)));
            // Outward is "away from the path", measured at the quad's centre.
            const centre = [
                (a0[0] + a1[0] + b0[0] + b1[0]) / 4,
                (a0[1] + a1[1] + b0[1] + b1[1]) / 4,
                (a0[2] + a1[2] + b0[2] + b1[2]) / 4,
            ];
            const axisMid = [(A.p[0] + B.p[0]) / 2, (A.p[1] + B.p[1]) / 2, (A.p[2] + B.p[2]) / 2];
            const reference = stepNormal ?? sub(centre, axisMid);
            const flipped = dot(n, reference) < 0;
            if (flipped) n = [-n[0], -n[1], -n[2]];

            const band = B.band ?? A.band;
            const shade = (A.shade ?? 1) * 0.5 + (B.shade ?? 1) * 0.5;
            const i0 = push(a0, n, band, shade);
            const i1 = push(a1, n, band, shade);
            const i2 = push(b1, n, band, shade);
            const i3 = push(b0, n, band, shade);
            if (flipped) indices.push(i0, i2, i1, i0, i3, i2);
            else indices.push(i0, i1, i2, i0, i2, i3);
        }
    }

    const cap = (ring, outward, band) => {
        const sides = ring.section.length;
        const pts = [];
        for (let j = 0; j < sides; j++) pts.push(ringPoint(ring, j));
        const n = norm(outward);
        const base = [];
        for (const p of pts) base.push(push(p, n, band, ring.shade ?? 1));
        // Fan from vertex 0, wound to agree with the cap's own normal.
        const winding = dot(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), n) > 0;
        for (let j = 1; j < sides - 1; j++) {
            if (winding) indices.push(base[0], base[j], base[j + 1]);
            else indices.push(base[0], base[j + 1], base[j]);
        }
    };

    if (capStart && rings.length > 1) {
        const d = norm(sub(rings[1].p, rings[0].p));
        cap(rings[0], [-d[0], -d[1], -d[2]], capStartBand ?? rings[0].band);
    }
    if (capEnd && rings.length > 1) {
        const last = rings.length - 1;
        const d = norm(sub(rings[last].p, rings[last - 1].p));
        cap(rings[last], d, capEndBand ?? rings[last].band);
    }

    return {
        positions: Float32Array.from(positions),
        normals: Float32Array.from(normals),
        uvs: Float32Array.from(uvs),
        colors: Float32Array.from(colors),
        indices: Uint16Array.from(indices),
    };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** Vertical ring frame. Section (a, b) maps straight to world (+X, +Z). */
const uprightRing = (y, section, band, shade) => ({
    p: [0, y, 0], u: [1, 0, 0], v: [0, 0, 1], section, band, shade,
});

/**
 * Per-ring tonal wander, so a run of posts does not read as one extruded
 * colour. Seeded, never `Math.random`: the bake has to be byte-stable or every
 * re-bake churns the GLB and the goldens.
 *
 * One-sided on purpose. Weathering only ever takes brightness away, and a
 * `COLOR_0` above 1 would brighten past the palette and then clamp the moment
 * the attribute is quantised by Draco.
 */
function grainSeries(seed, count, amplitude) {
    const rng = mulberry32(seed);
    const out = [];
    for (let i = 0; i < count; i++) out.push(1 - rng() * amplitude);
    return out;
}

/** The fence post: earth collar, stone footing, tapered octagonal shaft, 45 degree weather chamfer. */
export function buildFencePost(recipe = FENCE_POST) {
    const {
        height, collarHalf, collarTop, footingHalf, footingTop,
        shaftHalf, shaftTaper, shaftRings, arrisChamfer, chamfer, grainJitter, seed,
    } = recipe;

    const shaftTopY = height - chamfer;
    const grain = grainSeries(seed, shaftRings + 6, grainJitter);
    let g = 0;
    const sec = (half) => chamferedRect(half, half, half * arrisChamfer);
    const rings = [];

    // Earth mound. Widest thing on the post and the reason its bbox footprint
    // matches the shipped kit's; it also hides the seam where the post meets a
    // sloped terrain sample.
    rings.push(uprightRing(0, sec(collarHalf), PALETTE.bark, grain[g]));
    rings.push(uprightRing(collarTop, sec(collarHalf * 0.88), PALETTE.bark, grain[g++]));
    // Colour break: the mound's top ring repeated at the footing's width.
    rings.push(uprightRing(collarTop, sec(footingHalf), PALETTE.stone, grain[g]));
    rings.push(uprightRing(footingTop, sec(footingHalf * 0.90), PALETTE.stone, grain[g++]));

    // Shaft. `shaftRings` bands of linear taper with a seeded per-ring wobble
    // on the width, which is what reads as hewn rather than milled.
    rings.push(uprightRing(footingTop, sec(shaftHalf), PALETTE.wood, grain[g]));
    for (let i = 1; i <= shaftRings; i++) {
        const t = i / shaftRings;
        const y = footingTop + (shaftTopY - footingTop) * t;
        const half = shaftHalf * (1 + (shaftTaper - 1) * t) * (1 + (grain[g + i] - 1) * 0.22);
        rings.push(uprightRing(y, sec(half), PALETTE.wood, grain[g + i]));
    }
    g += shaftRings + 1;

    // The chamfer. Equal rise and inset is a true 45, which is what makes the
    // top face read as a deliberate cut rather than as a rounded-off end.
    const topHalf = shaftHalf * shaftTaper;
    rings.push(uprightRing(shaftTopY, sec(topHalf), PALETTE.cut, grain[g]));
    rings.push(uprightRing(height, sec(topHalf - chamfer), PALETTE.cut, grain[g]));

    return extrudePath(rings, {
        capStart: true, capEnd: true,
        capStartBand: PALETTE.bark, capEndBand: PALETTE.cut,
        groundWeathered: true, footY: 0,
    });
}

/** The rail: a straight chamfered bar along +X, segmented so it can be sagged at load. */
export function buildFenceRail(recipe = FENCE_RAIL) {
    const { length, halfHeight, halfDepth, arrisChamfer, segments, grainJitter, seed } = recipe;
    const grain = grainSeries(seed, segments + 1, grainJitter);
    const section = topChamferedRect(halfHeight, halfDepth, arrisChamfer);
    const rings = [];
    for (let i = 0; i <= segments; i++) {
        const x = -length / 2 + (length * i) / segments;
        rings.push({
            // Section (a, b) maps to world (+Y, +Z), so `a` really is the
            // rail's up and the chamfer really does land on its top arrises.
            p: [x, 0, 0], u: [0, 1, 0], v: [0, 0, 1],
            section, band: PALETTE.wood, shade: grain[i],
        });
    }
    return extrudePath(rings, {
        capStart: true, capEnd: true,
        capStartBand: PALETTE.cut, capEndBand: PALETTE.cut,
        // A rail's local origin is its own centre, not the ground, so it has no
        // height to weather against. Underside darkening is all it gets.
        groundWeathered: false,
    });
}

/** The gate post: the fence post's proportions, scaled up, with an iron collar. */
export function buildGatePost(recipe = GATE_POST) {
    const {
        height, collarHalfX, collarHalfZ, collarTop, footingHalfX, footingHalfZ, footingTop,
        shaftHalfX, shaftHalfZ, shaftTaper, bandBottom, bandTop, bandProud,
        arrisChamfer, chamfer, grainJitter, seed,
    } = recipe;

    const shaftTopY = height - chamfer;
    const grain = grainSeries(seed, 12, grainJitter);
    const sec = (a, b, c = arrisChamfer) => chamferedRect(a, b, Math.min(a, b) * c);
    const lerp = (from, to, t) => from + (to - from) * t;
    const shaftAt = (y) => {
        const t = (y - footingTop) / (shaftTopY - footingTop);
        return [shaftHalfX * lerp(1, shaftTaper, t), shaftHalfZ * lerp(1, shaftTaper, t)];
    };

    const rings = [];
    rings.push(uprightRing(0, sec(collarHalfX, collarHalfZ), PALETTE.bark, grain[0]));
    rings.push(uprightRing(collarTop, sec(collarHalfX * 0.9, collarHalfZ * 0.9), PALETTE.bark, grain[0]));
    rings.push(uprightRing(collarTop, sec(footingHalfX, footingHalfZ), PALETTE.stone, grain[1]));
    rings.push(uprightRing(footingTop, sec(footingHalfX * 0.92, footingHalfZ * 0.92), PALETTE.stone, grain[1]));

    rings.push(uprightRing(footingTop, sec(...shaftAt(footingTop)), PALETTE.wood, grain[2]));
    rings.push(uprightRing(bandBottom, sec(...shaftAt(bandBottom)), PALETTE.wood, grain[3]));
    // Iron collar. Proud of the shaft so it catches its own highlight, and a
    // sharper arris than the timber because metal does not weather round.
    const [bx, bz] = shaftAt(bandBottom);
    rings.push(uprightRing(bandBottom, sec(bx + bandProud, bz + bandProud, 0.12), PALETTE.iron, 1));
    rings.push(uprightRing(bandTop, sec(bx + bandProud, bz + bandProud, 0.12), PALETTE.iron, 1));
    const [tx, tz] = shaftAt(bandTop);
    rings.push(uprightRing(bandTop, sec(tx, tz), PALETTE.wood, grain[4]));
    rings.push(uprightRing(shaftTopY, sec(...shaftAt(shaftTopY)), PALETTE.wood, grain[5]));

    const [cx, cz] = shaftAt(shaftTopY);
    rings.push(uprightRing(shaftTopY, sec(cx, cz), PALETTE.cut, grain[6]));
    rings.push(uprightRing(height, sec(cx - chamfer, cz - chamfer), PALETTE.cut, grain[6]));

    return extrudePath(rings, {
        capStart: true, capEnd: true,
        capStartBand: PALETTE.bark, capEndBand: PALETTE.cut,
        groundWeathered: true, footY: 0,
    });
}

/**
 * The gate arch. Two uprights plus an arced lintel, emitted as three separate
 * sweeps concatenated into one buffer set.
 */
export function buildGateArch(recipe = GATE_ARCH) {
    const {
        halfWidth, height, halfDepth, uprightHalf, uprightTop,
        beamHalf, beamSegments, arcRise, grainJitter, seed,
    } = recipe;
    const grain = grainSeries(seed, beamSegments + 4, grainJitter);

    const parts = [];
    // Square uprights, offset so the widest ring at their base lands exactly on
    // the authored half-width rather than pushing the bbox past it.
    for (const side of [-1, 1]) {
        const x = side * (halfWidth - uprightHalf * 1.22);
        const sec = (h) => chamferedRect(h, h, h * 0.26);
        parts.push(extrudePath([
            { p: [x, 0, 0], u: [0, 0, 1], v: [1, 0, 0], section: sec(uprightHalf * 1.22), band: PALETTE.bark, shade: grain[0] },
            { p: [x, 0.07, 0], u: [0, 0, 1], v: [1, 0, 0], section: sec(uprightHalf * 1.12), band: PALETTE.bark, shade: grain[0] },
            { p: [x, 0.07, 0], u: [0, 0, 1], v: [1, 0, 0], section: sec(uprightHalf), band: PALETTE.wood, shade: grain[1] },
            { p: [x, uprightTop, 0], u: [0, 0, 1], v: [1, 0, 0], section: sec(uprightHalf * 0.94), band: PALETTE.wood, shade: grain[1] },
        ], { capStart: true, capEnd: true, capStartBand: PALETTE.bark, capEndBand: PALETTE.cut, groundWeathered: true, footY: 0 }));
    }

    // Lintel: a parabolic arc springing off the uprights and peaking at the
    // authored height, swept with a frame whose `v` stays on +Z so the beam
    // keeps a constant depth.
    //
    // The sweep runs a little short of `halfWidth`, because the frame tilts
    // with the arc and the section's outer corner then reaches past the path's
    // own end. Solving that in closed form means inverting the tilt against the
    // span it depends on, so it is iterated instead: three passes land the
    // outer corner on the authored half-width to well under a millimetre.
    const springing = height - arcRise;
    let span = halfWidth;
    const beamFrame = (x, currentSpan) => {
        const s = x / currentSpan;
        const y = springing + arcRise * (1 - s * s);
        // Parabola tangent; rotating it 90 degrees in the XY plane gives the
        // in-plane frame axis. `v` is the constant out-of-plane depth axis.
        const dy = -2 * arcRise * s / currentSpan;
        const inv = 1 / Math.hypot(1, dy);
        return { y, u: [-dy * inv, inv, 0] };
    };
    for (let pass = 0; pass < 3; pass++) {
        const reach = Math.abs(beamFrame(-span, span).u[0]) * beamHalf;
        span = halfWidth - reach;
    }

    const beamRings = [];
    for (let i = 0; i <= beamSegments; i++) {
        const x = -span + (2 * span * i) / beamSegments;
        const { y, u } = beamFrame(x, span);
        beamRings.push({
            p: [x, y - beamHalf, 0],
            u,
            v: [0, 0, 1],
            section: chamferedRect(beamHalf, halfDepth, beamHalf * 0.3),
            band: PALETTE.wood,
            shade: grain[i + 2],
        });
    }
    parts.push(extrudePath(beamRings, {
        capStart: true, capEnd: true,
        capStartBand: PALETTE.cut, capEndBand: PALETTE.cut,
        groundWeathered: false,
    }));

    return concatGeometry(parts);
}

/** Splice several emitted buffer sets into one, re-basing indices. */
export function concatGeometry(parts) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    let base = 0;
    for (const part of parts) {
        // Appended one at a time rather than spread: a spread of a typed array
        // becomes one argument per element, and a piece big enough to matter
        // would blow the argument limit rather than run slowly.
        for (const value of part.positions) positions.push(value);
        for (const value of part.normals) normals.push(value);
        for (const value of part.uvs) uvs.push(value);
        for (const value of part.colors) colors.push(value);
        for (const idx of part.indices) indices.push(idx + base);
        base += part.positions.length / 3;
    }
    return {
        positions: Float32Array.from(positions),
        normals: Float32Array.from(normals),
        uvs: Float32Array.from(uvs),
        colors: Float32Array.from(colors),
        indices: Uint16Array.from(indices),
    };
}

// ---------------------------------------------------------------------------
// Kit
// ---------------------------------------------------------------------------

/**
 * The four wrapper nodes `js/FencePresets.js` looks up by name, in the kit's
 * child order. Node names are contract; mesh names follow the shipped kit's
 * `Mesh_<Piece>_Runtime` convention so anything grepping for them still works.
 */
export const KIT_PIECES = [
    { node: 'Fence_Post', mesh: 'Mesh_Fence_Post_Runtime', build: buildFencePost },
    { node: 'Fence_Rail', mesh: 'Mesh_Fence_Rail_Runtime', build: buildFenceRail },
    { node: 'Gate_Post', mesh: 'Mesh_Gate_Post_Runtime', build: buildGatePost },
    { node: 'Gate_Arch', mesh: 'Mesh_Gate_Arch_Runtime', build: buildGateArch },
];

/** Build every piece, with a measured summary for the bake report and the spec. */
export function buildFenceKit() {
    return KIT_PIECES.map((piece) => {
        const geometry = piece.build();
        return { ...piece, geometry, stats: measure(geometry) };
    });
}

/** Bounds, counts and the palette bands actually used. */
export function measure(geometry) {
    const { positions, indices, uvs } = geometry;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
        for (let k = 0; k < 3; k++) {
            if (positions[i + k] < min[k]) min[k] = positions[i + k];
            if (positions[i + k] > max[k]) max[k] = positions[i + k];
        }
    }
    const bands = new Set();
    for (let i = 0; i < uvs.length; i += 2) bands.add(Math.round((uvs[i] * 32 - 2) / 4));
    return {
        vertices: positions.length / 3,
        triangles: indices.length / 3,
        min, max,
        height: max[1] - min[1],
        bands: [...bands].sort((a, b) => a - b),
    };
}
