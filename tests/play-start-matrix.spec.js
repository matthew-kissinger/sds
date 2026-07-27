// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';

import { DOGS, WORLDS, familiesForWorld } from '../js/components/entrance/worlds.ts';
import {
    PLAY_START_DOGS,
    buildCompleteCases,
    buildCoreCases,
    buildModeCases,
    buildSmokeCases,
} from '../tools/validation/play-start-matrix.mjs';
import {
    buildPlayStartUrl,
    findSettledAt,
    resolvePlayStartBudgets,
} from '../tools/validation/play-start-metrics.mjs';

describe('play-start matrix', () => {
    it('covers every selectable production family and rung', () => {
        const expected = WORLDS
            .filter((world) => !world.comingSoon)
            .flatMap((world) => familiesForWorld(world.id).flatMap((family) => (
                family.rungs.map((rung) => `${world.id}:${family.gameMode}:${rung.id}`)
            )))
            .sort();
        const actual = buildCoreCases()
            .map((entry) => `${entry.sceneId}:${entry.gameMode}:${entry.rungId}`)
            .sort();
        expect(actual).toEqual(expected);
    });

    it('keeps browser-driving world names aligned with the live entrance', () => {
        const actual = new Map(buildCoreCases().map((entry) => [entry.sceneId, entry.worldName]));
        for (const world of WORLDS.filter((entry) => !entry.comingSoon)) {
            expect(actual.get(world.id)).toBe(world.name);
        }
    });

    it('covers every selectable dog without multiplying the entire mode matrix', () => {
        expect(PLAY_START_DOGS.map((dog) => dog.id)).toEqual(DOGS.map((dog) => dog.id));
        const dogIds = new Set(buildCompleteCases().map((entry) => entry.dogId));
        expect([...dogIds].sort()).toEqual(DOGS.map((dog) => dog.id).sort());
    });

    it('keeps the smoke matrix to every public scene plus the maximum flock', () => {
        const smoke = buildSmokeCases();
        expect(smoke.map((entry) => entry.sceneId)).toEqual([
            'field',
            'rolling-hills',
            'open-country',
            'field',
        ]);
        expect(smoke.at(-1)).toMatchObject({ rungId: 'chaos', sheepCount: 5000 });
        expect(smoke.at(-1).cpuStress).toBe(true);
        expect(smoke[0].cpuStress).toBe(false);
    });

    it('keeps the gated survival scene in an explicit diagnostic lane', () => {
        expect(buildCoreCases().some((entry) => entry.diagnostic)).toBe(false);
        expect(buildCoreCases({ includeDiagnostic: true }).at(-1)).toMatchObject({
            sceneId: 'newsheepdogland',
            rungId: 'survival',
            diagnostic: true,
            coverRequired: false,
        });
        expect(buildCoreCases().every((entry) => entry.coverRequired)).toBe(true);
    });

    it('covers sandbox scene/count extremes and every local two-player mode', () => {
        const cases = buildModeCases();
        const sandbox = cases.filter((entry) => entry.flow === 'sandbox');
        expect(sandbox).toHaveLength(6);
        expect(new Set(sandbox.map((entry) => entry.sceneId))).toEqual(
            new Set(['field', 'rolling-hills', 'open-country']),
        );
        expect(new Set(sandbox.map((entry) => entry.sheepCount))).toEqual(new Set([10, 5000]));
        expect(cases.filter((entry) => entry.flow === 'local').map((entry) => entry.rungId)).toEqual([
            'coop', 'versus', 'timed',
        ]);
        expect(cases.filter((entry) => entry.flow === 'local').map((entry) => entry.sheepCount)).toEqual([
            200, 200, 200,
        ]);
    });
});

describe('play-start settled window', () => {
    it('uses the first real frame after two seconds without requiring timestamp equality', () => {
        const frames = Array.from({ length: 130 }, (_, index) => ({
            at: 1016.7 + index * 16.7,
            duration: 16.7,
        }));
        const settled = findSettledAt({
            frames,
            longTasks: [],
            inputResponsive: 1000,
            budgets: { maxPostPlayableLongTaskMs: 250, settledFrameP95Ms: 33 },
        });

        expect(settled).not.toBeNull();
        expect(settled.at).toBeGreaterThanOrEqual(frames[0].at + 2000);
        expect(settled.at).toBeLessThan(frames[0].at + 2020);
        expect(settled.p95).toBe(16.7);
    });
});

describe('play-start measurement URL', () => {
    it('keeps release timing free of the per-frame render-cost harness', () => {
        const entry = buildSmokeCases()[0];
        const url = buildPlayStartUrl('http://127.0.0.1:4173/?perfMode=1', { renderer: 'webgl' }, entry);

        expect(url.searchParams.get('renderer')).toBe('webgl');
        expect(url.searchParams.get('playStartProbe')).toBe('1');
        expect(url.searchParams.has('perfMode')).toBe(false);
    });

    it('enables render-cost bookkeeping only for an explicit diagnostic', () => {
        const entry = buildSmokeCases()[0];
        const url = buildPlayStartUrl('http://127.0.0.1:4173/', { renderer: 'webgl', perfMode: true }, entry);

        expect(url.searchParams.get('perfMode')).toBe('1');
    });

    it('enables collision timing only for an explicit diagnostic', () => {
        const entry = buildSmokeCases()[0];
        const url = buildPlayStartUrl('http://127.0.0.1:4173/', { renderer: 'webgl', collisionProbe: true }, entry);

        expect(url.searchParams.get('collisionProbe')).toBe('1');
    });
});

describe('play-start budget classes', () => {
    const base = {
        coldInputResponsiveMs: 3500,
        warmInputResponsiveMs: 2250,
        coldSettledMs: 6000,
        warmSettledMs: 4500,
        maxPostPlayableLongTaskMs: 250,
        settledFrameP95Ms: 33,
        stressColdInputResponsiveMs: 4000,
        stressColdSettledMs: 6500,
        stressSettledFrameP95Ms: 50,
    };

    it('uses the established high-count CPU stress rails only for stress cases', () => {
        expect(resolvePlayStartBudgets(base, { cpuStress: true })).toMatchObject({
            coldInputResponsiveMs: 4000,
            coldSettledMs: 6500,
            settledFrameP95Ms: 50,
        });
        expect(resolvePlayStartBudgets(base, { cpuStress: false })).toBe(base);
    });

    it('keeps the gated autostart lab on a separate diagnostic lifecycle budget', () => {
        expect(resolvePlayStartBudgets(base, { diagnostic: true, cpuStress: false })).toMatchObject({
            coldInputResponsiveMs: 6000,
            coldSettledMs: 9000,
            maxPostPlayableLongTaskMs: 500,
            settledFrameP95Ms: 50,
        });
    });
});
