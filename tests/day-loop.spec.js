// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 65: the homestead day loop controller. Pure client logic, so it is
 * unit-testable without a renderer: phase mapping, gate open/close by phase,
 * day rollover at the midnight wrap, the dusk warning window, and the nightly
 * home tally on the gate-closing transition.
 */
import { describe, it, expect } from 'vitest';
import { DayLoop, DayPhase, phaseForT, gateOpenForPhase } from '../js/gamestate/dayLoop.js';

describe('dayLoop — phaseForT', () => {
    it('maps the time-of-day arc to the four phases', () => {
        expect(phaseForT(0.0)).toBe(DayPhase.NIGHT);    // midnight
        expect(phaseForT(0.20)).toBe(DayPhase.NIGHT);   // pre-dawn
        expect(phaseForT(0.28)).toBe(DayPhase.MORNING); // first light (day start)
        expect(phaseForT(0.50)).toBe(DayPhase.DAY);     // noon
        expect(phaseForT(0.70)).toBe(DayPhase.DUSK);    // sunset window
        expect(phaseForT(0.85)).toBe(DayPhase.NIGHT);   // after nightfall
    });

    it('wraps out-of-range t into [0,1)', () => {
        expect(phaseForT(1.5)).toBe(phaseForT(0.5));
        expect(phaseForT(-0.5)).toBe(phaseForT(0.5));
    });
});

describe('dayLoop — gateOpenForPhase', () => {
    it('opens the gate from dawn through dusk and closes it at night', () => {
        expect(gateOpenForPhase(DayPhase.MORNING)).toBe(true);
        expect(gateOpenForPhase(DayPhase.DAY)).toBe(true);
        expect(gateOpenForPhase(DayPhase.DUSK)).toBe(true);
        expect(gateOpenForPhase(DayPhase.NIGHT)).toBe(false);
    });
});

describe('dayLoop — DayLoop controller', () => {
    it('starts on day one at the morning start', () => {
        const loop = new DayLoop({ initialT: 0.28 });
        const s = loop.getState();
        expect(s.day).toBe(1);
        expect(s.phase).toBe(DayPhase.MORNING);
        expect(s.gateOpen).toBe(true);
    });

    it('raises a dusk warning in the dusk window', () => {
        const loop = new DayLoop({ initialT: 0.28 });
        let s = loop.update(0.50, 0, 30); // noon
        expect(s.duskWarning).toBe(false);
        s = loop.update(0.70, 0, 30);      // dusk
        expect(s.duskWarning).toBe(true);
        expect(s.gateOpen).toBe(true);     // still open during dusk
    });

    it('closes the gate at night and tallies who made it home', () => {
        const loop = new DayLoop({ initialT: 0.28 });
        loop.update(0.50, 5, 30);          // noon, 5 home
        loop.update(0.70, 22, 30);         // dusk, herding in
        const s = loop.update(0.85, 25, 30); // night, gate closes
        expect(s.phase).toBe(DayPhase.NIGHT);
        expect(s.gateOpen).toBe(false);
        expect(s.lastNightTally).toEqual({ day: 1, home: 25, total: 30 });
    });

    it('rolls the day over at the midnight wrap', () => {
        const loop = new DayLoop({ initialT: 0.28 });
        loop.update(0.85, 25, 30);  // night, day 1
        expect(loop.day).toBe(1);
        loop.update(0.98, 25, 30);  // late night, still day 1
        expect(loop.day).toBe(1);
        const s = loop.update(0.05, 25, 30); // wrapped past midnight -> day 2
        expect(s.day).toBe(2);
    });

    it('does not roll the day on normal forward time steps', () => {
        const loop = new DayLoop({ initialT: 0.28 });
        for (let t = 0.30; t < 0.79; t += 0.02) loop.update(t, 0, 30);
        expect(loop.day).toBe(1);
    });

    it('does not re-tally without a fresh day->night transition', () => {
        const loop = new DayLoop({ initialT: 0.28 });
        loop.update(0.50, 10, 30);
        loop.update(0.85, 28, 30); // first night tally
        const firstTally = { ...loop.lastNightTally };
        const s = loop.update(0.90, 5, 30); // still night, count changed
        expect(s.lastNightTally).toEqual(firstTally); // tally frozen until next night
    });
});
