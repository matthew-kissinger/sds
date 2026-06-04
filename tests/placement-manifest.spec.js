// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    buildFieldPlacementManifest,
    FIELD_TREELINE_ZONES,
    FIELD_TREELINE_RADIUS,
} from '../tools/bake-placement.mjs';

/**
 * Field placement manifest (Cycle 45 Phase 3).
 *
 * tools/bake-placement.mjs pre-scatters Field's trees at build time so the
 * renderer skips the ~489ms Poisson scatter at scene-load. These tests guard
 * two things:
 *   1. The committed public/placement/field.json is well-formed and its treeline
 *      lands in the intended 380-450m band (the "pull the treeline inward" call).
 *   2. The committed file is exactly reproducible from source - re-running the
 *      bake produces byte-identical output. If someone hand-edits the manifest or
 *      changes the bake without re-running it, this fails loudly.
 */

const committedRaw = readFileSync(
    new URL('../public/placement/field.json', import.meta.url),
    'utf8',
);
const committed = JSON.parse(committedRaw);

describe('field placement manifest - committed shape', () => {
    it('has the expected top-level fields', () => {
        expect(committed.version).toBe(1);
        expect(committed.scene).toBe('field');
        expect(committed.seed).toBe(0);
        expect(Array.isArray(committed.trees)).toBe(true);
        expect(committed.treeCount).toBe(committed.trees.length);
    });

    it('every tree carries the TreeInstance shape placeTrees consumes', () => {
        for (const t of committed.trees) {
            expect(typeof t.x).toBe('number');
            expect(typeof t.z).toBe('number');
            expect(Number.isFinite(t.x) && Number.isFinite(t.z)).toBe(true);
            expect(t.type === 'tree1' || t.type === 'tree2').toBe(true);
            expect(t.scale).toBeGreaterThan(0);
            expect(Number.isFinite(t.rotationY)).toBe(true);
            expect(t.radiusXZ).toBe(1.8);
        }
    });

    it('records the treeline zones + radius the bake used', () => {
        expect(committed.treelineZones).toEqual(FIELD_TREELINE_ZONES);
        expect(committed.treelineRadius).toBe(FIELD_TREELINE_RADIUS);
    });
});

describe('field placement manifest - pulled-in treeline', () => {
    it('thins the scatter well below the full +/-800 zone count', () => {
        // Full-zone Field scatters ~1359 trees; the pulled-in treeline must be
        // a clear reduction without being pathologically sparse.
        expect(committed.treeCount).toBeGreaterThan(250);
        expect(committed.treeCount).toBeLessThan(600);
    });

    it('treeline lands in the 380-450m band (Matt: pull it inward)', () => {
        expect(committed.maxRadius).toBeGreaterThanOrEqual(380);
        expect(committed.maxRadius).toBeLessThanOrEqual(450);
    });

    it('no tree exceeds the radial clamp', () => {
        expect(committed.maxRadius).toBeLessThanOrEqual(committed.treelineRadius);
        for (const t of committed.trees) {
            expect(Math.hypot(t.x, t.z)).toBeLessThanOrEqual(committed.treelineRadius);
        }
    });

    it('keeps trees out of the +/-100 play area', () => {
        for (const t of committed.trees) {
            const inPlay = Math.abs(t.x) <= 100 && Math.abs(t.z) <= 100;
            expect(inPlay).toBe(false);
        }
    });
});

describe('field placement manifest - reproducible from source', () => {
    it('re-running the bake reproduces the committed trees exactly', () => {
        const rebuilt = buildFieldPlacementManifest();
        expect(rebuilt.treeCount).toBe(committed.treeCount);
        expect(rebuilt.maxRadius).toBe(committed.maxRadius);
        expect(JSON.stringify(rebuilt.trees)).toBe(JSON.stringify(committed.trees));
    });

    it('committed file is byte-identical to the current bake output', () => {
        const rebuilt = buildFieldPlacementManifest();
        expect(JSON.stringify(rebuilt)).toBe(committedRaw);
    });
});
