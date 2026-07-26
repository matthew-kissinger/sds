// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import {
    generateTrees,
    getTreeCanopyRadius,
    TREE_CANOPY_SPACING_PADDING,
    TREE_TRUNK_RADIUS
} from '../shared/TreePlacement.js';
import { mulberry32 } from '../shared/Random.js';
import { field } from '../shared/scenes/field.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { openCountry } from '../shared/scenes/open-country.js';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';

/**
 * TreePlacement (Cycle 6 Phase 1).
 *
 * The cross-V8 determinism contract: same (scene, seed) → identical
 * TreeInstance[]. This is what unlocks MP island scenes — client and
 * Worker can independently compute identical tree positions.
 */

describe('generateTrees — determinism', () => {
    it('same seed produces identical sequence', () => {
        const a = generateTrees(rollingHills, mulberry32(42));
        const b = generateTrees(rollingHills, mulberry32(42));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('different seeds produce different sequences', () => {
        const a = generateTrees(rollingHills, mulberry32(1));
        const b = generateTrees(rollingHills, mulberry32(2));
        expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    });

    it('output is canonically sorted by (x, z)', () => {
        const trees = generateTrees(openCountry, mulberry32(7));
        for (let i = 1; i < trees.length; i++) {
            const prev = trees[i - 1];
            const curr = trees[i];
            const cmp = prev.x !== curr.x ? prev.x - curr.x : prev.z - curr.z;
            expect(cmp).toBeLessThanOrEqual(0);
        }
    });
});

describe('generateTrees — TreeInstance shape', () => {
    it('every tree has the expected fields and trunk radius', () => {
        const trees = generateTrees(rollingHills, mulberry32(3));
        expect(trees.length).toBeGreaterThan(0);
        for (const t of trees) {
            expect(typeof t.x).toBe('number');
            expect(typeof t.z).toBe('number');
            expect(['tree1', 'tree2']).toContain(t.type);
            expect(t.scale).toBeGreaterThan(0);
            expect(t.rotationY).toBeGreaterThanOrEqual(0);
            expect(t.rotationY).toBeLessThan(Math.PI * 2 + 1e-6);
            expect(t.radiusXZ).toBe(TREE_TRUNK_RADIUS);
        }
    });
});

describe('generateTrees — placement constraints', () => {
    it('island scenes keep all trees within the safe land radius', () => {
        const trees = generateTrees(rollingHills, mulberry32(11));
        const { center, radius, falloff } = rollingHills.boundary;
        const safeR = radius - falloff - 4 + 1; // +1m fudge for float math
        for (const t of trees) {
            const d = Math.hypot(t.x - center.x, t.z - center.z);
            expect(d).toBeLessThanOrEqual(safeR);
        }
    });

    // Cycle 117 retired Rolling Hills' corral, so Open Country is the last
    // scene that has one and this case retargeted to it. The seed is the
    // scene's own production seed, not a hand-picked one: a 14m keep-out disc
    // on a 380m island is a small target, and on most seeds the nearest tree
    // lands 20m+ away for reasons that have nothing to do with the keep-out.
    // Under mulberry32(13) - the seed this case used to carry - the nearest
    // unguarded tree sits at 16.6m, so the assertion held with the keep-out
    // deleted from TreePlacement.js outright. Verified by mutation.
    it('island scenes keep trees out of the corral keep-out', () => {
        const seed = openCountry.terrain.seed;
        const trees = generateTrees(openCountry, mulberry32(seed));
        const { center, radius } = openCountry.corral;
        const keepOut = radius + 5;
        const distance = (t) => Math.hypot(t.x - center.x, t.z - center.z);
        for (const t of trees) {
            expect(distance(t), `tree at ${t.x},${t.z} is inside the corral keep-out`)
                .toBeGreaterThanOrEqual(keepOut);
        }
        // Same shape as the pen sibling below: the claim only says something if
        // trees would otherwise land there, so run the same scatter with the
        // corral dropped and confirm some do. Canopy spacing means the disc
        // holds one tree at a time, so this is a one-stray check by
        // construction rather than a loose bound.
        const unguarded = generateTrees({ ...openCountry, corral: undefined }, mulberry32(seed));
        const strays = unguarded.filter((t) => distance(t) < keepOut);
        expect(strays.length, 'the keep-out is doing work').toBeGreaterThan(0);
    });

    // Cycle 117 P2. Rolling Hills' destination stopped being a corral disc and
    // became a fenced pasture, and the keep-out had to follow it or trees would
    // scatter inside the pasture and, once the fence goes up, through it.
    it('island scenes keep trees out of the pen keep-out', () => {
        const trees = generateTrees(rollingHills, mulberry32(13));
        const pen = rollingHills.pen;
        expect(pen?.scatterKeepOut, 'rolling-hills opts into the pen keep-out').toBe(true);
        const m = 5;
        for (const t of trees) {
            const inside = t.x > pen.minX - m && t.x < pen.maxX + m
                && t.z > pen.minZ - m && t.z < pen.maxZ + m;
            expect(inside, `tree at ${t.x},${t.z} is inside the pasture keep-out`).toBe(false);
        }
        // The claim only says something if trees would otherwise land there, so
        // check the same scatter WITHOUT the opt-in and confirm some do.
        const unguarded = generateTrees(
            { ...rollingHills, pen: { ...pen, scatterKeepOut: false } },
            mulberry32(13),
        );
        const strays = unguarded.filter((t) => t.x > pen.minX - m && t.x < pen.maxX + m
            && t.z > pen.minZ - m && t.z < pen.maxZ + m);
        expect(strays.length, 'the keep-out is doing work').toBeGreaterThan(0);
    });

    // The opt-in is what keeps Newsheepdogland's baked layout still. Its pen
    // carries no flag, so its scatter must be indifferent to the pen entirely.
    it('leaves a pen without the opt-in out of it', () => {
        expect(newsheepdogland.pen?.scatterKeepOut).toBeUndefined();
        const asIs = generateTrees(newsheepdogland, mulberry32(newsheepdogland.terrain.seed));
        const penless = generateTrees(
            { ...newsheepdogland, pen: undefined },
            mulberry32(newsheepdogland.terrain.seed),
        );
        expect(JSON.stringify(asIs)).toBe(JSON.stringify(penless));
    });

    it('field (legacy rect) keeps trees out of the play area + buffer', () => {
        const trees = generateTrees(field, mulberry32(5));
        const buffer = 20;
        const { playArea } = field.terrain.zones;
        for (const t of trees) {
            const insidePlayBuffer =
                t.x >= playArea.minX - buffer && t.x <= playArea.maxX + buffer &&
                t.z >= playArea.minZ - buffer && t.z <= playArea.maxZ + buffer;
            expect(insidePlayBuffer).toBe(false);
        }
    });

    it('keeps visual tree canopies from overlapping across nested zones', () => {
        const cases = [
            [field, 0],
            [rollingHills, rollingHills.terrain.seed],
            [openCountry, openCountry.terrain.seed],
        ];

        for (const [scene, seed] of cases) {
            const trees = generateTrees(scene, mulberry32(seed));
            const violations = [];
            for (let i = 0; i < trees.length; i++) {
                for (let j = i + 1; j < trees.length; j++) {
                    const a = trees[i];
                    const b = trees[j];
                    const distance = Math.hypot(a.x - b.x, a.z - b.z);
                    const minDistance =
                        getTreeCanopyRadius(a) +
                        getTreeCanopyRadius(b) +
                        TREE_CANOPY_SPACING_PADDING;
                    if (distance < minDistance - 1e-6) {
                        violations.push({ scene: scene.id, i, j, distance, minDistance });
                    }
                }
            }
            expect(violations).toEqual([]);
        }
    });

    it('keeps production tree scale above the tiny-sapling floor', () => {
        const cases = [
            [field, 0],
            [rollingHills, rollingHills.terrain.seed],
            [openCountry, openCountry.terrain.seed],
        ];

        for (const [scene, seed] of cases) {
            const trees = generateTrees(scene, mulberry32(seed));
            const minScale = Math.min(...trees.map((t) => t.scale));
            expect(minScale).toBeGreaterThanOrEqual(13.5 - 1e-6);
        }
    });
});

describe('generateTrees — scene counts (sanity)', () => {
    // A regression here often means the Poisson sampler diverged structurally
    // (e.g. the 100-attempt seed retry was lost). Loose bounds — just enough
    // to catch order-of-magnitude breakage.
    it('field produces a few thousand trees (rect outside-play-area)', () => {
        const trees = generateTrees(field, mulberry32(0));
        expect(trees.length).toBeGreaterThan(500);
        expect(trees.length).toBeLessThan(5000);
    });

    it('rolling-hills produces tens of trees on the small island', () => {
        const trees = generateTrees(rollingHills, mulberry32(rollingHills.terrain.seed));
        expect(trees.length).toBeGreaterThan(20);
        expect(trees.length).toBeLessThan(500);
    });

    it('open-country produces hundreds of trees on the big island', () => {
        const trees = generateTrees(openCountry, mulberry32(openCountry.terrain.seed));
        expect(trees.length).toBeGreaterThan(80);
        expect(trees.length).toBeLessThan(2000);
    });

    it('newsheepdogland keeps the default cold-build tree budget bounded', () => {
        const trees = generateTrees(newsheepdogland, mulberry32(newsheepdogland.terrain.seed));
        expect(trees.length).toBeGreaterThan(60);
        expect(trees.length).toBeLessThan(110);
    });
});

describe('generateTrees — streamed-wave opts (Cycle 87 Phase 2)', () => {
    // The streamed rect: the pre-trim nearField band, much larger than the
    // cold corridor. Kept to one wave here so the spec stays fast.
    const streamedRect = newsheepdogland.terrain.streamedZones.nearField;
    const coldRects = Object.entries(newsheepdogland.terrain.zones)
        .filter(([name]) => name !== 'playArea')
        .map(([, rect]) => rect);
    const streamedOpts = () => ({
        zones: { nearField: streamedRect, playArea: newsheepdogland.terrain.zones.playArea },
        excludeRects: coldRects,
    });

    it('defaults stay byte-identical when no streamed opts are passed', () => {
        const a = generateTrees(newsheepdogland, mulberry32(newsheepdogland.terrain.seed));
        const b = generateTrees(newsheepdogland, mulberry32(newsheepdogland.terrain.seed), {});
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('streamed scatter is deterministic for the same salted seed', () => {
        const a = generateTrees(newsheepdogland, mulberry32(777), streamedOpts());
        const b = generateTrees(newsheepdogland, mulberry32(777), streamedOpts());
        expect(a.length).toBeGreaterThan(0);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('excludeRects rejects every candidate inside the cold zone rects', () => {
        const trees = generateTrees(newsheepdogland, mulberry32(777), streamedOpts());
        for (const t of trees) {
            for (const r of coldRects) {
                const inside = t.x >= r.minX && t.x <= r.maxX && t.z >= r.minZ && t.z <= r.maxZ;
                expect(inside).toBe(false);
            }
        }
    });

    it('existingTrees are respected by the canopy pass and never returned', () => {
        const cold = generateTrees(newsheepdogland, mulberry32(newsheepdogland.terrain.seed));
        const streamed = generateTrees(newsheepdogland, mulberry32(777), {
            ...streamedOpts(),
            existingTrees: cold,
        });
        const coldKeys = new Set(cold.map((t) => `${t.x},${t.z}`));
        for (const t of streamed) {
            expect(coldKeys.has(`${t.x},${t.z}`)).toBe(false);
            for (const other of cold) {
                const minDist = getTreeCanopyRadius(t) + getTreeCanopyRadius(other)
                    + TREE_CANOPY_SPACING_PADDING;
                const d = Math.hypot(t.x - other.x, t.z - other.z);
                expect(d).toBeGreaterThanOrEqual(minDist - 1e-9);
            }
        }
    });
});

describe('generateTrees — woods zones (Phase 3)', () => {
    it('woodsZones bias produces denser placement inside the zone', () => {
        const baseScene = {
            ...openCountry,
            woodsZones: undefined,
        };
        const woodedScene = {
            ...openCountry,
            woodsZones: [
                { center: { x: 0, z: 0 }, radius: 80, density: 2 },
            ],
        };
        const baseTrees = generateTrees(baseScene, mulberry32(99));
        const woodedTrees = generateTrees(woodedScene, mulberry32(99));

        const insideRadius = 80;
        const inside = (t) => Math.hypot(t.x, t.z) <= insideRadius;

        const baseInside = baseTrees.filter(inside).length;
        const woodedInside = woodedTrees.filter(inside).length;

        // Expect a meaningful bias inside the woods zone. Cycle 21 Phase 0
        // (2026-05-04): threshold relaxed 1.3× → 1.05× when WOODS_INSIDE_FACTOR
        // tightened 0.85 → 0.92 to reduce canopy overlap. (1/0.92)² ≈ 1.18×
        // theoretical density gain; Poisson-disc packing efficiency near the
        // zone boundary lands closer to ~1.09× empirically. 1.05× still
        // guards against losing the bias entirely (1.0× = no bias).
        expect(woodedInside).toBeGreaterThan(baseInside * 1.05);
    });

    it('woodsZones do not affect scenes that omit the field', () => {
        // Field has no woodsZones → bias factor is 1 everywhere → output
        // depends only on the seed, unchanged by the absence of zones.
        const a = generateTrees(field, mulberry32(123));
        const b = generateTrees(field, mulberry32(123));
        expect(a.length).toBe(b.length);
    });
});
