// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Refactor-baseline characterization tests (Cycle 28 Stream B0).
 *
 * These goldens are the safety net for Stream B's god-module
 * decomposition (`main.js` → `js/boot/`, `TerrainBuilder.js` →
 * `js/world/`). They lock in three behaviors that the existing
 * sim-baseline fixtures don't cover:
 *
 *   1. Heightfield sample grid hash — terrain mesh y-values are
 *      derived from this; if it changes, the visible terrain shifts.
 *   2. Tree scatter position hash — Poisson placement output for the
 *      canonical seed; B2 extracts placement to `js/world/TreePlacement.js`
 *      under this golden.
 *   3. Bundle size sanity — main-*.js / three-*.js byte sizes in dist/.
 *      Recorded after B0's first build; refactor MUST stay flat or smaller.
 *
 * Regenerate after an intentional refactor with:
 *
 *     UPDATE_FIXTURES=true npm test -- refactor-baseline
 *
 * Don't regenerate as a shortcut to make a test pass. Read the diff,
 * decide whether the change is intentional, and record the decision in
 * the active cycle plan's Acceptance section before committing the
 * regenerated fixtures (the same discipline applies to sim-baseline —
 * see .claude/rules/shared-sim.md).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-expect-error — harness is plain JS, no .d.ts
import {
    SCENES,
    captureSceneGoldens,
    readBundleSizes
} from './harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '__fixtures__');
const UPDATE = process.env.UPDATE_FIXTURES === 'true';

function loadOrWriteFixture(name: string, data: unknown): unknown {
    const path = resolve(FIXTURES_DIR, name);
    if (UPDATE || !existsSync(path)) {
        if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });
        writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
        return data;
    }
    return JSON.parse(readFileSync(path, 'utf8'));
}

describe('refactor-baseline — terrain mesh hash', () => {
    const captured = captureSceneGoldens();
    const fixture = loadOrWriteFixture('terrain-mesh-hash.json', captured.terrainMeshHash);

    for (const { id } of SCENES) {
        it(`scene "${id}" matches the committed heightfield-grid hash`, () => {
            // @ts-expect-error — runtime-typed JSON
            const expected = fixture[id];
            // @ts-expect-error — runtime-typed JSON
            const actual = captured.terrainMeshHash[id];
            expect(actual).toEqual(expected);
        });
    }
});

describe('refactor-baseline — scatter positions', () => {
    const captured = captureSceneGoldens();
    const fixture = loadOrWriteFixture('scatter-positions.json', captured.scatterPositions);

    for (const { id } of SCENES) {
        it(`scene "${id}" matches the committed tree-position hash`, () => {
            // @ts-expect-error — runtime-typed JSON
            const expected = fixture[id];
            // @ts-expect-error — runtime-typed JSON
            const actual = captured.scatterPositions[id];
            expect(actual).toEqual(expected);
        });
    }
});

describe('refactor-baseline — bundle sizes', () => {
    const sizes = readBundleSizes();
    if (sizes === null) {
        // dist/ not present — skip rather than fail. Bundle sizes are
        // a build-output artifact; running vitest before `npm run build`
        // is normal in dev. CI's deploy job runs the build first.
        it.skip('dist/assets not found — run `npm run build` to populate', () => {});
        return;
    }

    const fixture = loadOrWriteFixture('bundle-sizes.json', sizes) as {
        mainKB: number;
        threeKB: number;
    };

    it('main-*.js byte size has not regressed', () => {
        expect(sizes.mainKB).toBeLessThanOrEqual(fixture.mainKB);
    });

    it('three-*.js byte size has not regressed', () => {
        expect(sizes.threeKB).toBeLessThanOrEqual(fixture.threeKB);
    });
});
