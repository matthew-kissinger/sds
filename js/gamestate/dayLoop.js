// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 65: the homestead herd-back day loop.
 *
 * A CLIENT-ONLY round controller, deliberately NOT a `shared/` deterministic
 * module - it mirrors the counting-mode precedent ([`js/gamestate/countingMode.js`]):
 * solo + client-side, so there is no sim-baseline regen and no multiplayer
 * desync surface. (When co-op needs a shared day clock, Cycle 67 promotes the
 * phase math into `shared/`; until then this stays here.)
 *
 * It reads the normalized time-of-day `t` in [0,1) from the atmosphere's
 * DayNightCycle plus a live "how many sheep are inside the pen" count, and
 * derives: the day number, the phase, whether the gate should be open, a dusk
 * warning, and a nightly tally of who made it home. The renderer drives the
 * gate from `gateOpen` and the HUD from the rest.
 *
 * Soft loop by design (Cycle 65): nightfall tallies the flock and rolls the
 * day. Nothing is lost, nothing ends the run. Predator stakes arrive with the
 * wolves in a later cycle.
 */

// Cycle 67 P3: the pure phase math moved to shared/survival/dayClock.js so the
// Worker can run the same clock for co-op survival. The DayLoop class below stays
// client-only (it drives the HUD); it imports the shared phase fns and this file
// re-exports them so existing importers keep working.
import { DayPhase, wrap01, phaseForT, gateOpenForPhase } from '../../shared/survival/dayClock.js';

export { DayPhase, phaseForT, gateOpenForPhase };

export class DayLoop {
    /**
     * @param {Object} [config]
     * @param {number} [config.initialT=0.28]
     */
    constructor(config = {}) {
        const initialT = config.initialT ?? 0.28;
        /** @private */
        this._prevT = wrap01(initialT);
        this.day = 1;
        this.phase = phaseForT(initialT);
        this.gateOpen = gateOpenForPhase(this.phase);
        this.duskWarning = this.phase === DayPhase.DUSK;
        this.sheepHome = 0;
        this.totalSheep = 0;
        /** @type {{day:number, home:number, total:number}|null} */
        this.lastNightTally = null;
    }

    /**
     * Advance the loop with the live time-of-day and a sheep-home count.
     * @param {number} t            Normalized time-of-day in [0,1).
     * @param {number} sheepHome    Count of sheep currently inside the pen.
     * @param {number} totalSheep   Total active sheep.
     * @returns {ReturnType<DayLoop['getState']>}
     */
    update(t, sheepHome = 0, totalSheep = 0) {
        const tn = wrap01(t);
        // Day rollover: t wrapped past midnight (a large backward jump).
        if (tn < this._prevT - 0.5) {
            this.day += 1;
        }
        const prevPhase = this.phase;
        this.phase = phaseForT(tn);
        this.gateOpen = gateOpenForPhase(this.phase);
        this.duskWarning = this.phase === DayPhase.DUSK;
        this.sheepHome = sheepHome | 0;
        this.totalSheep = totalSheep | 0;
        // On the day->night transition (gate closing), tally who made it home.
        if (prevPhase !== DayPhase.NIGHT && this.phase === DayPhase.NIGHT) {
            this.lastNightTally = { day: this.day, home: this.sheepHome, total: this.totalSheep };
        }
        this._prevT = tn;
        return this.getState();
    }

    getState() {
        return {
            day: this.day,
            phase: this.phase,
            gateOpen: this.gateOpen,
            duskWarning: this.duskWarning,
            sheepHome: this.sheepHome,
            totalSheep: this.totalSheep,
            lastNightTally: this.lastNightTally,
        };
    }
}
