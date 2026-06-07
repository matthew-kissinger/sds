// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 66 P4: the Newsheepdogland night-wolf system.
 *
 * CLIENT-ONLY (the survival cycle is solo; the deterministic `shared/` sheep sim
 * is untouched - hard stop). Wolves are a local predator layer that reads the
 * shared sheep positions and the pen, hunts whatever is left outside the pen at
 * night, and feeds kills into the survival economy (js/gamestate/survivalRun.js).
 * Promoting this to a `shared/` Worker sim for co-op is a later cycle.
 *
 * Rendering reuses js/Wolf.js (the Quaternius rig + gait state machine). One glTF
 * is loaded once and cloned per wolf. The pack owns spawn/despawn (driven by the
 * day-loop nightfall/dawn transitions) and per-frame movement + kills (driven
 * from the main loop after the sheep sim + pen containment have run, so a wolf
 * never kills a sheep the same frame it crossed the gate to safety).
 *
 * Lifecycle:
 *   - await init()                load the wolf glTF once (idempotent).
 *   - spawnNight(day, sheep)      nightfall: spawn an escalating pack around the
 *                                 roaming flock; deterministic seeded placement.
 *   - update(dt, sheep, dog)      each frame: hunt / flee / retreat + kill.
 *   - repel(x, z, radius, secs)   a bark scares wolves in range (P5).
 *   - retreatAll()                dawn: wolves bolt for the edge and despawn.
 *   - dispose()                   teardown.
 */

import { Wolf, loadWolfGLTF, WOLF_MODEL_PATH } from '../Wolf.js';
import { resolveAssetUrl } from '../utils/assetUrl.js';
import { mulberry32 } from '../../shared/Random.js';
import {
    spawnCountForDay,
    nearestHuntableIndex,
    stepToward,
    stepAway,
} from './wolfBehavior.js';

/** @enum {string} */
const WolfState = { HUNT: 'hunt', FLEE: 'flee', RETREAT: 'retreat' };

export class WolfPack {
    /**
     * @param {Object} cfg
     * @param {THREE.Scene} cfg.scene            scene to add wolf meshes to.
     * @param {(x:number,z:number)=>number} cfg.groundY  terrain height sampler.
     * @param {{_isInside:Function,_keepOut:Function,cx:number,cz:number}|null} cfg.pen  PenContainment (fence keep-out + safety test).
     * @param {(sheep:any)=>void} [cfg.onKill]   called once per sheep killed (economy hook).
     * @param {Object} [cfg.tuning]              feel knobs (Matt's pass).
     * @param {number} [cfg.seed=0x5eed]         base RNG seed (mixed with the day).
     */
    constructor({ scene, groundY, pen, onKill, tuning = {}, seed = 0x5eed }) {
        this.scene = scene;
        this.groundY = typeof groundY === 'function' ? groundY : () => 0;
        this.pen = pen || null;
        this.onKill = typeof onKill === 'function' ? onKill : null;
        this.seed = seed >>> 0;

        // Feel knobs (all metres / m/s / seconds). Q3/Matt's spec; tunable.
        this.t = {
            base: tuning.base ?? 2,            // wolves on night one
            perDay: tuning.perDay ?? 1,        // + per day
            max: tuning.max ?? 8,              // pack ceiling
            huntSpeed: tuning.huntSpeed ?? 11.5,
            fleeSpeed: tuning.fleeSpeed ?? 13,
            retreatSpeed: tuning.retreatSpeed ?? 12,
            killRadius: tuning.killRadius ?? 1.7,
            killCooldown: tuning.killCooldown ?? 1.2,   // s between a wolf's kills
            spawnRadius: tuning.spawnRadius ?? 150,     // ring radius around the flock
            spawnJitter: tuning.spawnJitter ?? 60,
            body: tuning.body ?? 1.0,                   // fence standoff radius
            retreatDist: tuning.retreatDist ?? 260,     // despawn once this far out
            fleeRepelRadius: tuning.fleeRepelRadius ?? 22,
        };

        /** @type {{wolf:Wolf,x:number,z:number,state:string,target:number,killCd:number,fleeT:number,fleeFromX:number,fleeFromZ:number,age:number}[]} */
        this.wolves = [];
        this._gltf = null;
        this._ready = false;
        this.night = false;
    }

    get count() { return this.wolves.length; }

    /** Load the wolf glTF once (cloned per wolf at spawn). Idempotent. */
    async init() {
        if (this._ready) return;
        try {
            this._gltf = await loadWolfGLTF(resolveAssetUrl(WOLF_MODEL_PATH));
            this._ready = true;
        } catch (err) {
            console.warn('[WOLF] glTF load failed; wolves disabled this scene:', err?.message || err);
            this._ready = false;
        }
    }

    /**
     * Nightfall: spawn an escalating pack around the roaming flock. Seeded so a
     * given (seed, day) lays the pack down identically run to run.
     * @param {number} day
     * @param {Array} sheep
     */
    spawnNight(day, sheep) {
        this.night = true;
        if (!this._ready || !this._gltf) return;
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
            const entry = {
                wolf: new Wolf(this._gltf, { targetHeight: 1.15 }),
                x, z,
                state: WolfState.HUNT,
                target: -1,
                killCd: 0,
                fleeT: 0,
                fleeFromX: 0, fleeFromZ: 0,
                age: 0,
            };
            entry.wolf.setPosition(x, this.groundY(x, z), z);
            this.scene.add(entry.wolf.getObject3D());
            this.wolves.push(entry);
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
        if (this.pen) return { x: this.pen.cx, z: this.pen.cz };
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
        this._step = step; // _place / _tickRetreat advance the mixer by this

        for (let w = this.wolves.length - 1; w >= 0; w--) {
            const e = this.wolves[w];
            e.age += step;
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
                e.wolf.triggerAttack?.();
                e.killCd = this.t.killCooldown;
                e.target = -1;
                // Hold position during the lunge (don't slide through the kill).
                e.wolf.setSpeed?.(0);
                e.wolf.update(step);
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
                    e.wolf.setPosition(e.x, this.groundY(e.x, e.z), e.z);
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

    /** Apply a movement result: keep out of the pen, sit on terrain, drive the rig. */
    _place(e, r) {
        e.x = r.x; e.z = r.z;
        // Wolves collide with the pen fence exactly like the dog: they can never
        // reach a sheep sheltering inside the closed pen (acceptance).
        if (this.pen?._keepOut) {
            const p = { x: e.x, z: e.z, set() {} };
            this.pen._keepOut(p, this.t.body);
            e.x = p.x; e.z = p.z;
        }
        const y = this.groundY(e.x, e.z);
        e.wolf.setPosition(e.x, y, e.z);
        if (r.moved > 0.01) {
            // Face travel direction. Model forward is +Z (Quaternius rig); yaw
            // about world Y from the planar heading. Verified in-browser.
            e.wolf.setRotationY(Math.atan2(r.dirX, r.dirZ));
            e.wolf.setSpeed(r.moved);
        } else {
            e.wolf.setSpeed(0);
        }
        e.wolf.update(this._step || 0.016);
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
     * P5 bark wolf-repel: scare every wolf within `radius` of (x,z) into a flee
     * for `secs`, breaking pursuit. Longer range than the sheep cone. Returns the
     * count repelled (telemetry / tests).
     */
    repel(x, z, radius = this.t.fleeRepelRadius, secs = 1.6) {
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

    _removeAt(i) {
        const e = this.wolves[i];
        if (!e) return;
        try { e.wolf.dispose(); } catch { /* noop */ }
        this.wolves.splice(i, 1);
    }

    /** Remove every wolf immediately (no retreat). */
    clear() {
        for (const e of this.wolves) { try { e.wolf.dispose(); } catch { /* noop */ } }
        this.wolves.length = 0;
    }

    dispose() {
        this.clear();
        this._gltf = null;
        this._ready = false;
    }
}
