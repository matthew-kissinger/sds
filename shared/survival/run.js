// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Newsheepdogland survival run economy.
 *
 * Cycle 67 P1: PROMOTED to `shared/survival/` (was the client-only
 * `js/gamestate/survivalRun.js` in Cycle 66) so the Cloudflare Worker
 * `GameSim` can run the same run economy authoritatively for co-op survival
 * rooms. The Worker cannot import `js/` (it pulls Three.js), so the economy
 * lives here in the deterministic boundary; `js/gamestate/survivalRun.js` is a
 * one-line re-export shim so every existing client import keeps working.
 *
 * Pure arithmetic only: no `Math.random`, no `Date.now`, no DOM, no Three. The
 * run is seeded/clocked by its caller (solo: the client day-loop; co-op: the DO
 * tick), so it is reproducible run to run.
 *
 * The run: start with a small flock; each day you have until nightfall to herd
 * the flock through the gate into the pen. At night the wolves hunt whatever is
 * still outside the pen (recordKill feeds kills in); sheep inside the closed pen
 * are safe. At dawn the night is accounted: if fewer than `lossThreshold` of the
 * flock died, the flock grows by `growth` and the run advances to the next day;
 * otherwise the run ends. The score is the peak flock size reached.
 *
 * Named numbers (10 start / 45% threshold / +6 growth) are exposed as
 * constructor opts for feel tuning.
 */

import { SURVIVAL_RUN_DEFAULTS } from './tuning.js';

/** @enum {string} */
export const SurvivalState = { ALIVE: 'alive', DEAD: 'dead' };

export class SurvivalRun {
    /**
     * @param {Object} [opts]
     * @param {number} [opts.startFlock=10]
     * @param {number} [opts.growth=6]
     * @param {number} [opts.lossThreshold=0.45] Die when the night's loss ratio reaches this.
     * @param {number} [opts.maxFlock=Infinity]  Cap on the flock (matches the rendered
     *        OptimizedSheep ceiling) so the score never drifts above the visible sheep.
     */
    constructor({
        startFlock = SURVIVAL_RUN_DEFAULTS.startFlock,
        growth = SURVIVAL_RUN_DEFAULTS.growth,
        lossThreshold = SURVIVAL_RUN_DEFAULTS.lossThreshold,
        maxFlock = Infinity,
    } = {}) {
        this.startFlock = startFlock;
        this.growth = growth;
        this.lossThreshold = lossThreshold;
        this.maxFlock = maxFlock > 0 ? maxFlock : Infinity;

        this.day = 1;
        this.flock = startFlock;
        this.peak = startFlock;
        this.state = SurvivalState.ALIVE;

        this.nightStartFlock = startFlock;
        this.killsThisNight = 0;
        /** @type {{day:number, lost:number, lossRatio:number, survived:boolean}|null} */
        this.lastNight = null;
        /** @private */
        this._prevPhase = null;
    }

    /** A wolf killed a roaming sheep. Counts only while alive. */
    recordKill() {
        if (this.state !== SurvivalState.ALIVE) return;
        this.killsThisNight += 1;
        this.flock = Math.max(0, this.flock - 1);
    }

    /**
     * Feed the current day phase each frame. Returns an event on a meaningful
     * transition, else null:
     *   { type: 'nightfall', nightStartFlock }
     *   { type: 'survived', day, flock, lost }
     *   { type: 'death', score, day, lost }
     * @param {string} phase  'morning' | 'day' | 'dusk' | 'night'
     */
    onPhase(phase) {
        if (this.state !== SurvivalState.ALIVE) return null;
        if (phase === this._prevPhase) return null;
        const prev = this._prevPhase;
        this._prevPhase = phase;
        if (!prev) return null; // first observation: no transition to account

        if (phase === 'night' && prev !== 'night') {
            this.nightStartFlock = this.flock;
            this.killsThisNight = 0;
            return { type: 'nightfall', nightStartFlock: this.nightStartFlock };
        }
        if (prev === 'night' && phase !== 'night') {
            return this._accountDawn();
        }
        return null;
    }

    /** @private Tally the night at dawn: grow + advance, or end the run. */
    _accountDawn() {
        const lost = this.killsThisNight;
        const base = this.nightStartFlock > 0 ? this.nightStartFlock : 1;
        const lossRatio = lost / base;
        const survived = this.flock > 0 && lossRatio < this.lossThreshold;

        if (!survived) {
            this.state = SurvivalState.DEAD;
            this.lastNight = { day: this.day, lost, lossRatio, survived: false };
            return { type: 'death', score: this.peak, day: this.day, lost };
        }

        // Grow the flock, capped at maxFlock so the score tracks the rendered
        // sheep (the OptimizedSheep InstancedMesh is sized to the same ceiling).
        this.flock = Math.min(this.maxFlock, this.flock + this.growth);
        this.peak = Math.max(this.peak, this.flock);
        const completedDay = this.day;
        this.day += 1;
        this.lastNight = { day: completedDay, lost, lossRatio, survived: true };
        return { type: 'survived', day: this.day, flock: this.flock, lost };
    }

    getScore() { return this.peak; }
    isAlive() { return this.state === SurvivalState.ALIVE; }
}
