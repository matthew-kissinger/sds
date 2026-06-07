// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 66 P3: the survival run economy.
 * Start 10 -> herd before night -> lose <33% grows +5 -> 33%+ ends the run.
 * Score is the peak flock size.
 */
import { describe, it, expect } from 'vitest';
import { SurvivalRun, SurvivalState } from '../js/gamestate/survivalRun.js';

/** Drive a full day -> night -> dawn cycle, returning the dawn event. */
function runNight(run, kills = 0) {
    run.onPhase('day');
    run.onPhase('dusk');
    run.onPhase('night'); // nightfall snapshot
    for (let i = 0; i < kills; i++) run.recordKill();
    return run.onPhase('morning'); // dawn accounting
}

describe('SurvivalRun (Cycle 66 P3)', () => {
    it('starts at 10 sheep, day 1, alive', () => {
        const run = new SurvivalRun();
        expect(run.flock).toBe(10);
        expect(run.day).toBe(1);
        expect(run.peak).toBe(10);
        expect(run.isAlive()).toBe(true);
        expect(run.getScore()).toBe(10);
    });

    it('snapshots the flock at nightfall', () => {
        const run = new SurvivalRun();
        run.onPhase('morning');
        run.onPhase('day');
        const ev = run.onPhase('night');
        expect(ev).toEqual({ type: 'nightfall', nightStartFlock: 10 });
    });

    it('grows +5 and advances the day when no sheep are lost', () => {
        const run = new SurvivalRun();
        const ev = runNight(run, 0);
        expect(ev.type).toBe('survived');
        expect(run.flock).toBe(15);
        expect(run.day).toBe(2);
        expect(run.peak).toBe(15);
    });

    it('survives a night that loses under 33% (3 of 10), then grows', () => {
        const run = new SurvivalRun();
        const ev = runNight(run, 3); // 30% < 33%
        expect(ev.type).toBe('survived');
        // 10 - 3 lost = 7, + 5 growth = 12
        expect(run.flock).toBe(12);
        expect(run.day).toBe(2);
    });

    it('ends the run when 33% or more is lost (4 of 10)', () => {
        const run = new SurvivalRun();
        const ev = runNight(run, 4); // 40% >= 33%
        expect(ev.type).toBe('death');
        expect(run.isAlive()).toBe(false);
        expect(run.state).toBe(SurvivalState.DEAD);
        expect(ev.score).toBe(10); // peak reached before the fatal night
    });

    it('scores the peak flock size across several days', () => {
        const run = new SurvivalRun();
        runNight(run, 0); // -> 15
        runNight(run, 0); // -> 20
        expect(run.peak).toBe(20);
        // Day 3 starts at 20; lose 10 (50%) -> death. Peak stays 20.
        const ev = runNight(run, 10);
        expect(ev.type).toBe('death');
        expect(ev.score).toBe(20);
        expect(run.getScore()).toBe(20);
    });

    it('ignores kills once dead', () => {
        const run = new SurvivalRun();
        runNight(run, 10); // death
        const before = run.flock;
        run.recordKill();
        expect(run.flock).toBe(before);
    });

    it('a fully-penned night (0 outside, 0 kills) always survives', () => {
        const run = new SurvivalRun({ startFlock: 10 });
        const ev = runNight(run, 0);
        expect(ev.type).toBe('survived');
        expect(run.flock).toBe(15);
    });
});
