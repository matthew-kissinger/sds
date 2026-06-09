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
 *   3. Bundle size sanity — main-*.js / three-*.js byte sizes in dist/,
 *      recorded after B0's first build, plus per-chunk KiB budgets for
 *      every dist/assets chunk family (P4-BUNDLE-GATE). Refactors MUST
 *      stay flat or smaller; deliberate growth bumps the budget with a
 *      recorded decision.
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
import {
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    readdirSync,
    statSync
} from 'node:fs';
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

/**
 * Per-chunk bundle budgets (P4-BUNDLE-GATE).
 *
 * Each family groups every `dist/assets/<family>-<hash>.js` chunk by its
 * name prefix before the Rollup hash (i18n has two chunks per build, for
 * example — they're summed). Everything that doesn't match a named family
 * is summed into the `other` catchall, so a brand-new chunk still counts
 * against a budget instead of floating free.
 *
 * Budget convention (the ratchet): each budget is the measured size at
 * capture time rounded UP to the next KiB — the sub-KiB rounding is the
 * only built-in headroom. A budget trip means the bundle genuinely grew.
 * Bumps are deliberate, recorded decisions: edit
 * tests/refactor-baseline/__fixtures__/bundle-sizes.json by hand (or
 * regenerate with UPDATE_FIXTURES=true) and record why in the active
 * plan, same discipline as the goldens above.
 */
const CHUNK_FAMILIES = [
    'main',
    'three',
    'client',
    'ui',
    'App',
    'i18n',
    'vendor',
    'webgpuDiagnostic'
] as const;
const OTHER = 'other';

/**
 * Measure every dist/assets/*.js chunk, grouped by family, in KiB
 * rounded up. Returns null when dist/ is absent (pre-build dev runs).
 */
function readChunkSizesKiB(): Record<string, number> | null {
    const distAssets = resolve(__dirname, '..', '..', 'dist', 'assets');
    if (!existsSync(distAssets)) return null;
    const bytes: Record<string, number> = Object.fromEntries(
        [...CHUNK_FAMILIES, OTHER].map((f) => [f, 0])
    );
    for (const name of readdirSync(distAssets)) {
        if (!name.endsWith('.js')) continue;
        const family =
            CHUNK_FAMILIES.find((f) =>
                new RegExp(`^${f}-[A-Za-z0-9_-]+\\.js$`).test(name)
            ) ?? OTHER;
        bytes[family] += statSync(resolve(distAssets, name)).size;
    }
    return Object.fromEntries(
        Object.entries(bytes).map(([f, b]) => [f, Math.ceil(b / 1024)])
    );
}

describe('refactor-baseline — bundle sizes', () => {
    const sizes = readBundleSizes();
    const chunkSizes = readChunkSizesKiB();
    if (sizes === null || chunkSizes === null) {
        // dist/ not present — skip rather than fail. Bundle sizes are
        // a build-output artifact; running vitest before `npm run build`
        // is normal in dev. CI runs `npm run build` before `npm test`
        // in the deploy.yml / preview.yml test jobs, so the gate always
        // fires there (P4-BUNDLE-GATE).
        it.skip('dist/assets not found — run `npm run build` to populate', () => {});
        return;
    }

    const fixture = loadOrWriteFixture('bundle-sizes.json', {
        ...sizes,
        chunkBudgetsKiB: chunkSizes
    }) as {
        mainKB: number;
        threeKB: number;
        chunkBudgetsKiB: Record<string, number>;
    };

    // Legacy ratchet keys (Cycle 28 Stream B0) — kept alongside the
    // per-chunk budgets so the fixture history reads continuously.
    // These use Math.round semantics; the per-chunk budgets use ceil.
    it('main-*.js byte size has not regressed', () => {
        expect(sizes.mainKB).toBeLessThanOrEqual(fixture.mainKB);
    });

    it('three-*.js byte size has not regressed', () => {
        expect(sizes.threeKB).toBeLessThanOrEqual(fixture.threeKB);
    });

    for (const family of [...CHUNK_FAMILIES, OTHER]) {
        it(`chunk family "${family}" stays within its KiB budget`, () => {
            const budget = fixture.chunkBudgetsKiB?.[family];
            expect(
                budget,
                `No budget recorded for chunk family "${family}" in ` +
                'tests/refactor-baseline/__fixtures__/bundle-sizes.json. ' +
                'Capture one (UPDATE_FIXTURES=true npm test -- refactor-baseline) ' +
                'and commit it.'
            ).toBeTypeOf('number');
            expect(
                chunkSizes[family],
                `Chunk family "${family}" is ${chunkSizes[family]} KiB, over its ` +
                `${budget} KiB budget. If the growth is deliberate, bump the budget in ` +
                'tests/refactor-baseline/__fixtures__/bundle-sizes.json and record the ' +
                'decision (ratchet convention: bumps are deliberate, recorded decisions).'
            ).toBeLessThanOrEqual(budget as number);
        });
    }
});
