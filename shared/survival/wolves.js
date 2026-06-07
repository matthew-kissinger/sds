// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The night-wolf state machine - pure, render-free.
 *
 * Cycle 67 P2: EXTRACTED from `js/gamestate/wolfPack.js` (Cycle 66) so the Worker
 * `GameSim` can run the wolf AI authoritatively for co-op survival. This module
 * owns wolf POSITIONS + the hunt/kill/flee/retreat state machine as plain data;
 * it imports no Three.js and touches no DOM. The Three.js layer is a separate
 * `js/gamestate/wolfRenderer.js` that reads the wolf-state array this produces.
 *
 * Authority model (see docs/cycle-67-plan.md): wolves are AUTHORITATIVE-ONLY. In
 * solo the client runs this sim locally and renders the result; in co-op the DO
 * runs it and broadcasts the wolf array, and clients render from the snapshot.
 * Nobody re-simulates wolves to agree byte-for-byte across engines, so the spawn
 * ring's `Math.cos/sin` is fine here (it is never on a cross-engine PREDICTED
 * path). Seeding is still via `mulberry32` (no `Math.random`) so a run is
 * reproducible for replays/debug and the DO is deterministic given its seed.
 *
 * Lifecycle (driven by the caller's day clock):
 *   - spawnNight(day, sheep)   nightfall: lay down an escalating, seeded pack.
 *   - update(dt, sheep, dog)   each frame: hunt / flee / retreat + kill.
 *   - repel(x, z, radius, secs) a bark scares wolves in range (breaks pursuit).
 *   - retreatAll()             dawn: wolves bolt for open ground, then despawn.
 *   - clear()                  drop the pack immediately.
 */

import { mulberry32 } from '../Random.js';
import { WOLF_TUNING } from './tuning.js';
import {
    spawnCountForDay,
    nearestHuntableIndex,
    stepToward,
    stepAway,
} from './wolfBehavior.js';

/** @enum {string} */
export const WolfState = { HUNT: 'hunt', FLEE: 'flee', RETREAT: 'retreat' };

/**
 * Default feel knobs. Cycle 68 P2: the values now live in the centralized
 * shared/survival/tuning.js (one feel-pass file); this re-export keeps the
 * DEFAULT_WOLF_TUNING name every existing importer + test already uses.
 */
export const DEFAULT_WOLF_TUNING = WOLF_TUNING;

/**
 * @typedef {Object} WolfRecord
 * @property {number} id        stable per-wolf id (for the renderer + the wire).
 * @property {number} x
 * @property {number} z
 * @property {string} state     WolfState
 * @property {number} target    sheep index being hunted (-1 none).
 * @property {number} killCd    cooldown remaining before the next kill.
 * @property {number} fleeT     flee timer remaining.
 * @property {number} fleeFromX
 * @property {number} fleeFromZ
 * @property {number} age       seconds since spawn (or since retreat began).
 * @property {number} dirX      last movement direction (unit) - renderer facing.
 * @property {number} dirZ
 * @property {number} moved     last planar speed (m/s) - renderer gait.
 * @property {boolean} justKilled  true on the single tick a kill landed (attack anim).
 */

export class WolfSim {
    /**
     * @param {Object} [cfg]
     * @param {{_isInside?:Function,_keepOut?:Function,cx?:number,cz?:number}|null} [cfg.pen]
     *        Pen barrier (fence keep-out + the inside-test that protects penned sheep).
     * @param {(sheep:any)=>void} [cfg.onKill]  called once per sheep killed (economy hook).
     * @param {Object} [cfg.tuning]             feel overrides merged over the defaults.
     * @param {number} [cfg.seed=0x5eed]        base RNG seed (mixed with the day).
     */
    constructor({ pen = null, onKill = null, tuning = {}, seed = 0x5eed } = {}) {
        this.pen = pen;
        this.onKill = typeof onKill === 'function' ? onKill : null;
        this.seed = seed >>> 0;
        this.t = { ...DEFAULT_WOLF_TUNING, ...tuning };
        /** @type {WolfRecord[]} */
        this.wolves = [];
        this.night = false;
        this._nextId = 1;
        this._step = 0.016;
    }

    get count() { return this.wolves.length; }

    /**
     * Nightfall: spawn an escalating pack around the roaming flock. Seeded so a
     * given (seed, day) lays the pack down identically run to run.
     * @param {number} day
     * @param {Array} sheep
     */
    spawnNight(day, sheep) {
        this.night = true;
        this.clear(); // never stack two nights' packs

        const n = spawnCountForDay(day, { base: this.t.base, perDay: this.t.perDay, max: this.t.max });
        if (n <= 0) return;

        // Centre the spawn ring on the roaming-flock centroid so wolves appear
        // near the action; fall back to the pen if everything is already penned.
        const c = this._roamingCentroid(sheep);
        const rng = mulberry32((this.seed + day * 2654435761) >>> 0);

        for (let i = 0; i < n; i++) {
            // Even angular spread + seeded jitter, radius in [R, R+jitter].
            const ang = (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.8;
            const rad = this.t.spawnRadius + rng() * this.t.spawnJitter;
            let x = c.x + Math.cos(ang) * rad;
            let z = c.z + Math.sin(ang) * rad;
            // Keep the spawn off the fence line if it lands on the pen.
            if (this.pen?._keepOut) {
                const sp = { x, z, set() {} };
                this.pen._keepOut(sp, this.t.body + 1);
                x = sp.x; z = sp.z;
            }
            this.wolves.push({
                id: this._nextId++,
                x, z,
                state: WolfState.HUNT,
                target: -1,
                killCd: 0,
                fleeT: 0,
                fleeFromX: 0, fleeFromZ: 0,
                age: 0,
                dirX: 0, dirZ: 0, moved: 0,
                justKilled: false,
            });
        }
    }

    /** Average position of huntable (roaming) sheep, or the pen centre. */
    _roamingCentroid(sheep) {
        let sx = 0, sz = 0, n = 0;
        if (Array.isArray(sheep)) {
            for (let i = 0; i < sheep.length; i++) {
                const s = sheep[i];
                if (this._isHuntable(s)) { sx += s.position.x; sz += s.position.z; n++; }
            }
        }
        if (n > 0) return { x: sx / n, z: sz / n };
        if (this.pen) return { x: this.pen.cx ?? 0, z: this.pen.cz ?? 0 };
        return { x: 0, z: 0 };
    }

    /** A sheep is fair game iff it is roaming (state 0), not penned, not already killed, outside the pen box. */
    _isHuntable(s) {
        if (!s || !s.position || s.state !== 0 || s.penned || s.killed) return false;
        if (this.pen?._isInside && this.pen._isInside(s.position.x, s.position.z)) return false;
        return true;
    }

    /**
     * Per-frame movement + kills. Call AFTER the sheep sim + pen containment so
     * positions and pen membership are final this frame.
     * @param {number} dt
     * @param {Array} sheep
     * @param {{position:{x:number,z:number}}|null} dog
     */
    update(dt, sheep, dog) {
        if (this.wolves.length === 0) return;
        const step = Number.isFinite(dt) ? Math.min(dt, 0.05) : 0.016;
        this._step = step;

        for (let w = this.wolves.length - 1; w >= 0; w--) {
            const e = this.wolves[w];
            e.age += step;
            e.justKilled = false; // transient: true only on the tick a kill lands
            if (e.killCd > 0) e.killCd -= step;

            if (e.state === WolfState.RETREAT) {
                this._tickRetreat(e, step);
                // Despawn once it has fled far from the pen / map centre.
                const dx = e.x - (this.pen?.cx ?? 0), dz = e.z - (this.pen?.cz ?? 0);
                if (Math.hypot(dx, dz) > this.t.retreatDist || e.age > 12) {
                    this._removeAt(w);
                }
                continue;
            }

            if (e.state === WolfState.FLEE) {
                e.fleeT -= step;
                const r = stepAway(e.x, e.z, e.fleeFromX, e.fleeFromZ, this.t.fleeSpeed, step);
                this._place(e, r);
                if (e.fleeT <= 0) { e.state = WolfState.HUNT; e.target = -1; }
                continue;
            }

            // HUNT: lock the nearest huntable sheep, pursue, kill on contact.
            let s = sheep && sheep[e.target];
            if (!this._isHuntable(s)) {
                e.target = nearestHuntableIndex(e.x, e.z, sheep, (x) => this._isHuntable(x));
                s = sheep && sheep[e.target];
            }
            if (!s) {
                // Nothing to hunt (flock all penned): prowl toward the pen so the
                // player sees them circling the fence, but they cannot get in.
                const tx = this.pen?.cx ?? e.x, tz = this.pen?.cz ?? e.z;
                const r = stepToward(e.x, e.z, tx, tz, this.t.huntSpeed * 0.5, step);
                this._place(e, r);
                continue;
            }

            const tx = s.position.x, tz = s.position.z;
            const distToTarget = Math.hypot(tx - e.x, tz - e.z);
            if (distToTarget <= this.t.killRadius && e.killCd <= 0) {
                this._kill(s);
                e.justKilled = true;
                e.killCd = this.t.killCooldown;
                e.target = -1;
                // Hold position during the lunge (don't slide through the kill).
                e.moved = 0; e.dirX = 0; e.dirZ = 0;
                continue;
            }
            const r = stepToward(e.x, e.z, tx, tz, this.t.huntSpeed, step);
            this._place(e, r);
        }

        // Dog body-checks a wolf: a wolf pressed against the dog flinches back a
        // touch so the player can physically shoulder one off a sheep.
        if (dog?.position) {
            for (const e of this.wolves) {
                const dx = e.x - dog.position.x, dz = e.z - dog.position.z;
                const d = Math.hypot(dx, dz);
                if (d > 1e-3 && d < 1.6) {
                    e.x = dog.position.x + (dx / d) * 1.6;
                    e.z = dog.position.z + (dz / d) * 1.6;
                }
            }
        }
    }

    /** Move a retreating wolf away from the pen and toward open ground. */
    _tickRetreat(e, step) {
        const ox = this.pen?.cx ?? 0, oz = this.pen?.cz ?? 0;
        const r = stepAway(e.x, e.z, ox, oz, this.t.retreatSpeed, step);
        this._place(e, r);
    }

    /** Apply a movement result: keep out of the pen, record direction + gait. */
    _place(e, r) {
        e.x = r.x; e.z = r.z;
        // Wolves collide with the pen fence exactly like the dog: they can never
        // reach a sheep sheltering inside the closed pen (acceptance).
        if (this.pen?._keepOut) {
            const p = { x: e.x, z: e.z, set() {} };
            this.pen._keepOut(p, this.t.body);
            e.x = p.x; e.z = p.z;
        }
        e.dirX = r.dirX; e.dirZ = r.dirZ; e.moved = r.moved;
    }

    /** Mark a sheep killed (invisible, frozen) and fire the economy hook once. */
    _kill(s) {
        if (!s || s.killed) return;
        s.killed = true;
        s.state = 2;             // retired/grazing - the sim stops driving it
        if (s.velocity?.set) s.velocity.set(0, 0);
        this.onKill?.(s);
    }

    /**
     * Bark wolf-repel: scare every wolf within `radius` of (x,z) into a flee for
     * `secs`, breaking pursuit. Longer range than the sheep cone. Returns the
     * count repelled (telemetry / tests).
     */
    repel(x, z, radius = this.t.fleeRepelRadius, secs = this.t.barkRepelSecs) {
        let n = 0;
        const r2 = radius * radius;
        for (const e of this.wolves) {
            if (e.state === WolfState.RETREAT) continue;
            const dx = e.x - x, dz = e.z - z;
            if (dx * dx + dz * dz > r2) continue;
            e.state = WolfState.FLEE;
            e.fleeT = secs;
            e.fleeFromX = x; e.fleeFromZ = z;
            e.target = -1;
            n++;
        }
        return n;
    }

    /** Dawn: every wolf bolts for the edge and despawns. */
    retreatAll() {
        this.night = false;
        for (const e of this.wolves) { e.state = WolfState.RETREAT; e.age = 0; }
    }

    _removeAt(i) { this.wolves.splice(i, 1); }

    /** Remove every wolf immediately (no retreat). */
    clear() { this.wolves.length = 0; }

    /**
     * Lean wire snapshot for the broadcast (Cycle 67 P5): id + position + state
     * only. Facing + gait are derived by the renderer from position deltas, so
     * they stay out of the frame.
     * @returns {Array<{id:number,x:number,z:number,state:string}>}
     */
    snapshot() {
        const out = [];
        for (const e of this.wolves) {
            out.push({ id: e.id, x: e.x, z: e.z, state: e.state });
        }
        return out;
    }
}
