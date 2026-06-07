// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 68 P2: the survival feel constants are centralized in
 * shared/survival/tuning.js, and every consumer resolves from it (no second
 * definition site). These tests pin the single-source contract so a future
 * feel-pass change in one file cannot silently drift a duplicate elsewhere.
 */
import { describe, it, expect } from 'vitest';
import { SURVIVAL_RUN_DEFAULTS, WOLF_TUNING } from '../shared/survival/tuning.js';
import { SurvivalRun } from '../shared/survival/run.js';
import { WolfSim, DEFAULT_WOLF_TUNING } from '../shared/survival/wolves.js';
import { spawnCountForDay } from '../shared/survival/wolfBehavior.js';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';

describe('survival tuning is single-source (Cycle 68 P2)', () => {
    it('exports the run-economy feel defaults', () => {
        expect(SURVIVAL_RUN_DEFAULTS).toMatchObject({
            startFlock: 10,
            growth: 5,
            lossThreshold: 1 / 3,
        });
    });

    it('exports the full wolf tuning surface', () => {
        for (const key of [
            'base', 'perDay', 'max', 'huntSpeed', 'fleeSpeed', 'retreatSpeed',
            'killRadius', 'killCooldown', 'spawnRadius', 'spawnJitter', 'body',
            'retreatDist', 'fleeRepelRadius', 'barkRepelSecs',
        ]) {
            expect(typeof WOLF_TUNING[key]).toBe('number');
        }
    });

    it('wolves.js consumes WOLF_TUNING (DEFAULT_WOLF_TUNING is the same object)', () => {
        // Same reference, not a copy: proves there is no second wolf-tuning literal.
        expect(DEFAULT_WOLF_TUNING).toBe(WOLF_TUNING);
    });

    it('a default WolfSim resolves its knobs from the centralized tuning', () => {
        const sim = new WolfSim();
        expect(sim.t.huntSpeed).toBe(WOLF_TUNING.huntSpeed);
        expect(sim.t.killRadius).toBe(WOLF_TUNING.killRadius);
        expect(sim.t.barkRepelSecs).toBe(WOLF_TUNING.barkRepelSecs);
    });

    it('spawnCountForDay defaults resolve from WOLF_TUNING (no duplicated 2/1/8)', () => {
        expect(spawnCountForDay(1)).toBe(WOLF_TUNING.base);
        expect(spawnCountForDay(2)).toBe(WOLF_TUNING.base + WOLF_TUNING.perDay);
        expect(spawnCountForDay(9999)).toBe(WOLF_TUNING.max);
    });

    it('SurvivalRun default construction resolves from SURVIVAL_RUN_DEFAULTS', () => {
        const run = new SurvivalRun();
        expect(run.startFlock).toBe(SURVIVAL_RUN_DEFAULTS.startFlock);
        expect(run.growth).toBe(SURVIVAL_RUN_DEFAULTS.growth);
        expect(run.lossThreshold).toBe(SURVIVAL_RUN_DEFAULTS.lossThreshold);
    });

    it('the Newsheepdogland scene sources its run economy from the defaults (maxFlock stays scene data)', () => {
        expect(newsheepdogland.survival.startFlock).toBe(SURVIVAL_RUN_DEFAULTS.startFlock);
        expect(newsheepdogland.survival.growth).toBe(SURVIVAL_RUN_DEFAULTS.growth);
        expect(newsheepdogland.survival.lossThreshold).toBe(SURVIVAL_RUN_DEFAULTS.lossThreshold);
        expect(newsheepdogland.survival.maxFlock).toBe(200);
    });
});
