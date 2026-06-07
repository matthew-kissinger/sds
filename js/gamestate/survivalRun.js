// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 66 P3: the Newsheepdogland survival run economy.
 *
 * CLIENT-ONLY (the dayLoop / penContainment precedent): solo, no `shared/` sim
 * change, no sim-baseline regen. Co-op promotion is a later cycle.
 *
 * The run: start with a small flock; each day you have until nightfall to herd
 * the flock through the gate into the pen. At night the wolves hunt whatever is
 * still outside the pen (Cycle 66 P4 feeds kills via recordKill); sheep inside
 * the closed pen are safe. At dawn the night is accounted: if fewer than
 * `lossThreshold` of the flock died, the flock grows by `growth` and the run
 * advances to the next day; otherwise the run ends. The score is the peak flock
 * size reached (Q2: "the number of sheep is the score").
 *
 * Named numbers (10 start / 33% threshold / +5 growth) are Matt's spec, exposed
 * as constructor opts for his feel pass.
 */

/** @enum {string} */
export const SurvivalState = { ALIVE: 'alive', DEAD: 'dead' };

export class SurvivalRun {
    /**
     * @param {Object} [opts]
     * @param {number} [opts.startFlock=10]
     * @param {number} [opts.growth=5]
     * @param {number} [opts.lossThreshold=1/3]  Die when the night's loss ratio reaches this.
     */
    constructor({ startFlock = 10, growth = 5, lossThreshold = 1 / 3 } = {}) {
        this.startFlock = startFlock;
        this.growth = growth;
        this.lossThreshold = lossThreshold;

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

        this.flock += this.growth;
        this.peak = Math.max(this.peak, this.flock);
        const completedDay = this.day;
        this.day += 1;
        this.lastNight = { day: completedDay, lost, lossRatio, survived: true };
        return { type: 'survived', day: this.day, flock: this.flock, lost };
    }

    getScore() { return this.peak; }
    isAlive() { return this.state === SurvivalState.ALIVE; }
}
