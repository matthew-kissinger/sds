// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 96 Phase 5 (harness-first): rock collider-parity gate.
 *
 * A rock re-bake changes rock GLB geometry. The standing hard stop is that a
 * visual-only change must not move collision footprints. This spec snapshots
 * every scene's rock collision footprint (x, z, colliderRadius for each
 * obstacle rock, plus totalRocks/obstacleCount) under a fixed seed and asserts
 * byte-stable parity against a committed baseline.
 *
 * If a re-bake (or any placement / collider-math change) moves a footprint,
 * this fails. Read the diff; do NOT regenerate to make it pass
 * (docs/EMERGENCY_STOPS.md: refactor-baseline drift). Intentional changes
 * regenerate the fixture explicitly:
 *   SDS_GEN_ROCK_BASELINE=1 npx vitest run tests/rock-collider-parity.spec.js
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
    ROCK_COLLIDER_SCENES,
    computeAllRockColliderFootprints,
    computeRockColliderFootprints,
} from './helpers/rockColliderFootprints.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, 'refactor-baseline/__fixtures__/rock-collider-footprints.json');

// One-time / intentional regeneration path, guarded by an env flag so a normal
// `npm test` never rewrites the baseline.
if (process.env.SDS_GEN_ROCK_BASELINE === '1') {
    writeFileSync(FIXTURE, `${JSON.stringify(computeAllRockColliderFootprints(), null, 2)}\n`);
}

const baseline = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const baselineFor = (sceneId) => baseline.find((s) => s.sceneId === sceneId);

describe('rock collider parity', () => {
    it('has a committed baseline for every shipped scene', () => {
        expect([...baseline.map((s) => s.sceneId)].sort()).toEqual([...ROCK_COLLIDER_SCENES].sort());
    });

    for (const sceneId of ROCK_COLLIDER_SCENES) {
        it(`${sceneId}: rock collision footprints match the committed baseline`, () => {
            const expected = baselineFor(sceneId);
            expect(expected, `no baseline entry for ${sceneId}`).toBeTruthy();
            expect(computeRockColliderFootprints(sceneId)).toEqual(expected);
        });
    }

    it('keeps every obstacle collider radius positive and finite', () => {
        for (const scene of baseline) {
            for (const c of scene.colliders) {
                expect(Number.isFinite(c.colliderRadius)).toBe(true);
                expect(c.colliderRadius).toBeGreaterThan(0);
            }
        }
    });
});
