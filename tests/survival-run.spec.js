// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 66 P3: the survival run economy.
 * Start 10 -> herd before night -> lose <45% grows +6 -> 45%+ ends the run.
 * Score is the peak flock size.
 */
import { describe, it, expect } from 'vitest';
import { SurvivalRun, SurvivalState } from '../shared/survival/run.js';

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

    it('grows +6 and advances the day when no sheep are lost', () => {
        const run = new SurvivalRun();
        const ev = runNight(run, 0);
        expect(ev.type).toBe('survived');
        expect(run.flock).toBe(16);
        expect(run.day).toBe(2);
        expect(run.peak).toBe(16);
    });

    it('survives a night that loses under 45% (4 of 10), then grows', () => {
        const run = new SurvivalRun();
        const ev = runNight(run, 4); // 40% < 45%
        expect(ev.type).toBe('survived');
        // 10 - 4 lost = 6, + 6 growth = 12
        expect(run.flock).toBe(12);
        expect(run.day).toBe(2);
    });

    it('ends the run when 45% or more is lost (5 of 10)', () => {
        const run = new SurvivalRun();
        const ev = runNight(run, 5); // 50% >= 45%
        expect(ev.type).toBe('death');
        expect(run.isAlive()).toBe(false);
        expect(run.state).toBe(SurvivalState.DEAD);
        expect(ev.score).toBe(10); // peak reached before the fatal night
    });

    it('scores the peak flock size across several days', () => {
        const run = new SurvivalRun();
        runNight(run, 0); // -> 16
        runNight(run, 0); // -> 22
        expect(run.peak).toBe(22);
        // Day 3 starts at 22; lose 10 (45.5%) -> death. Peak stays 22.
        const ev = runNight(run, 10);
        expect(ev.type).toBe('death');
        expect(ev.score).toBe(22);
        expect(run.getScore()).toBe(22);
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
        expect(run.flock).toBe(16);
    });

    it('caps the flock (and the score) at maxFlock so it never exceeds the rendered ceiling', () => {
        const run = new SurvivalRun({ startFlock: 10, growth: 5, maxFlock: 18 });
        runNight(run, 0); // 10 -> 15
        runNight(run, 0); // 15 + 5 = 20, capped to 18
        expect(run.flock).toBe(18);
        expect(run.peak).toBe(18);
        runNight(run, 0); // already at cap, stays 18
        expect(run.flock).toBe(18);
    });
});
