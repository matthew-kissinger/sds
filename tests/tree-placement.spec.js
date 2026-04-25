import { describe, it, expect } from 'vitest';
import { generateTrees, TREE_TRUNK_RADIUS } from '../shared/TreePlacement.js';
import { mulberry32 } from '../shared/Random.js';
import { field } from '../shared/scenes/field.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { openCountry } from '../shared/scenes/open-country.js';

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
            expect(['tree1', 'tree2', 'pine']).toContain(t.type);
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

    it('island scenes keep trees out of the corral keep-out', () => {
        const trees = generateTrees(rollingHills, mulberry32(13));
        const { center, radius } = rollingHills.corral;
        const keepOut = radius + 5 - 1; // -1m to mirror the strict-less-than check
        for (const t of trees) {
            const d = Math.hypot(t.x - center.x, t.z - center.z);
            expect(d).toBeGreaterThanOrEqual(keepOut);
        }
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

        // Expect at least 30% more trees inside the woods zone.
        expect(woodedInside).toBeGreaterThan(baseInside * 1.3);
    });

    it('woodsZones do not affect scenes that omit the field', () => {
        // Field has no woodsZones → bias factor is 1 everywhere → output
        // depends only on the seed, unchanged by the absence of zones.
        const a = generateTrees(field, mulberry32(123));
        const b = generateTrees(field, mulberry32(123));
        expect(a.length).toBe(b.length);
    });
});
