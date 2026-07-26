// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Fenced-enclosure barrier + enclosure-entry retirement.
 *
 * An axis-aligned box of fence with ONE passable gap at the gate. This module
 * makes that fence a real barrier:
 *   - The dog and every sheep collide with the four fence edges. The only way
 *     across is the gate gap, and only while the gate is open (a day-loop scene
 *     seals it at night). No climbing the fence anywhere else.
 *   - Because non-gate crossings are blocked, any sheep that ends up inside the
 *     box MUST have been herded through the gate. So "inside" => "entered via the
 *     gate", which makes retirement trivial: on entry a sheep settles and
 *     retires in the pasture (a calm walk to a spot inside, then it grazes/idles
 *     until morning). No zap. No teleport.
 *
 * The box is declared either as a square (`{center, radius}`, where `radius` is
 * the half-side), or as an arbitrary rect (`{minX, maxX, minZ, maxZ}`).
 * `StructureBuilder.buildPenEnclosure` raises the fence around either form and
 * `resolvePenBox` there is this constructor's twin. Every method below reads only
 * the resolved `minX/maxX/minZ/maxZ` plus the half-extents, so the two forms are
 * the same barrier.
 *
 * Cycle 117 P1: was `shared/survival/pen.js` (class `PenContainment`). The
 * barrier is not survival-scoped - an island pasture is the same geometry - and
 * `scene-and-render.md` says a file names WHAT, not WHEN. `shared/survival/pen.js`
 * and `js/gamestate/penContainment.js` are re-export shims carrying the old name
 * so every existing import keeps working.
 *
 * Cycle 67 P1: PROMOTED to `shared/` (was the client-only
 * `js/gamestate/penContainment.js` in Cycle 66) so the Worker `GameSim` can run
 * the barrier authoritatively for co-op survival.
 *
 * Determinism: the one Cycle 66 `Math.random()` (the settle spot) is now a
 * SEEDED draw (`mulberry32` keyed by a run seed + the sheep id), so a given
 * (settleSeed, sheepId) lands the same spot run to run and the module is safe on
 * the deterministic boundary. No DOM, no Three, no `Math.random` here. `atan2`
 * for the settle-walk facing is render-only (guarded on `s.facingDirection`) and
 * the barrier is authoritative-only (render-from-snapshot in co-op), so it never
 * needs cross-engine agreement.
 *
 * Runs every frame AFTER the shared sheep sim tick (which has already moved the
 * sheep) and after the dog's move, so it corrects positions before render.
 */

import { Vector2D } from './Vector2D.js';
import { mulberry32 } from './Random.js';

export class PenBarrier {
    /**
     * @param {{center:{x:number,z:number}, radius:number}
     *        |{minX:number, maxX:number, minZ:number, maxZ:number}} pen
     *   The enclosure box. Square form: `center` + `radius` (half-side). Rect
     *   form: the four edges. The rect form wins when all four are finite.
     * @param {{x:number, z:number, width?:number}} gate  Gate centre + opening width (world space).
     * @param {Object} [opts]
     * @param {number} [opts.sheepBody=0.6] Sheep body radius (fence standoff).
     * @param {number} [opts.dogBody=1.0]   Dog body radius.
     * @param {number} [opts.settleSpeed=6] Walk-in speed (m/s) for a freshly penned sheep.
     * @param {number} [opts.settleSeed=0x5e77] Base seed for the deterministic settle spot.
     */
    constructor(pen, gate, opts = {}) {
        if (Number.isFinite(pen?.minX) && Number.isFinite(pen?.maxX)
            && Number.isFinite(pen?.minZ) && Number.isFinite(pen?.maxZ)) {
            // Rect form. Normalised so a swapped pair still describes a box.
            this.minX = Math.min(pen.minX, pen.maxX);
            this.maxX = Math.max(pen.minX, pen.maxX);
            this.minZ = Math.min(pen.minZ, pen.maxZ);
            this.maxZ = Math.max(pen.minZ, pen.maxZ);
            this.halfX = (this.maxX - this.minX) / 2;
            this.halfZ = (this.maxZ - this.minZ) / 2;
            this.cx = this.minX + this.halfX;
            this.cz = this.minZ + this.halfZ;
        } else {
            // Square form (Cycle 66), unchanged to the last bit.
            const R = pen.radius;
            this.cx = pen.center.x;
            this.cz = pen.center.z;
            this.minX = this.cx - R;
            this.maxX = this.cx + R;
            this.minZ = this.cz - R;
            this.maxZ = this.cz + R;
            this.halfX = R;
            this.halfZ = R;
        }

        this.gateX = gate.x;
        this.gateZ = gate.z;
        this.gateHalf = (gate.width ?? 10) / 2;
        // Which edge holds the gate: a vertical edge (runs along z, gate gaps in
        // z) or a horizontal edge (runs along x, gate gaps in x). Matches the
        // onVertical split in StructureBuilder.buildPenEnclosure. Pick the face
        // the gate is NEAREST, measured as the gap left to each face pair. The
        // Cycle 66 rule compared the raw offsets, which on a long, thin rect picks
        // the long axis almost every time and gaps the fence on the wrong side.
        // On a square (halfX === halfZ === R) the two rules agree: `R - a <= R - b`
        // iff `a >= b`, bar a tie that only appears when the two offsets are within
        // an ulp of each other, which puts the gate at the box centre.
        this.onVertical = (this.halfX - Math.abs(gate.x - this.cx))
            <= (this.halfZ - Math.abs(gate.z - this.cz));

        this.sheepBody = opts.sheepBody ?? 0.6;
        this.dogBody = opts.dogBody ?? 1.0;
        this.settleSpeed = opts.settleSpeed ?? 6;
        this.settleSeed = (opts.settleSeed ?? 0x5e77) >>> 0;

        /** Side memory for the dog so it only flips sides at the gate. */
        this._dogInside = false;
        /** Live count of sheep retired inside the pen (drives the day-loop HUD). */
        this.pennedCount = 0;
    }

    /** True when (x,z) sits comfortably inside the fence box (not on the line). */
    _isInside(x, z) {
        return x > this.minX && x < this.maxX && z > this.minZ && z < this.maxZ;
    }

    /**
     * Is (x,z) within the gate gap passage (and the gate open)? The gap is a slot
     * `br + 1.2` deep straddling the gate edge, spanning the opening width.
     */
    _inGateGap(x, z, br, gateOpen) {
        if (!gateOpen) return false;
        const depth = br + 1.2;
        if (this.onVertical) {
            return Math.abs(x - this.gateX) <= depth
                && z >= this.gateZ - this.gateHalf && z <= this.gateZ + this.gateHalf;
        }
        return Math.abs(z - this.gateZ) <= depth
            && x >= this.gateX - this.gateHalf && x <= this.gateX + this.gateHalf;
    }

    /**
     * Keep an OUTSIDER out: the centre may not come within `br` of any fence edge
     * from outside (Minkowski-grown box). Push to the nearest grown face.
     * @returns {0|1|2} 0 = no push, 1 = pushed on X, 2 = pushed on Z.
     */
    _keepOut(p, br) {
        const exMinX = this.minX - br, exMaxX = this.maxX + br;
        const exMinZ = this.minZ - br, exMaxZ = this.maxZ + br;
        if (p.x <= exMinX || p.x >= exMaxX || p.z <= exMinZ || p.z >= exMaxZ) return 0;
        const dW = p.x - exMinX, dE = exMaxX - p.x, dS = p.z - exMinZ, dN = exMaxZ - p.z;
        const m = Math.min(dW, dE, dS, dN);
        if (m === dW) { p.x = exMinX; return 1; }
        if (m === dE) { p.x = exMaxX; return 1; }
        if (m === dS) { p.z = exMinZ; return 2; }
        p.z = exMaxZ; return 2;
    }

    /**
     * Keep an INSIDER in: clamp the centre to the box shrunk by `br`.
     * @returns {0|1|2} which axis was clamped (0 none).
     */
    _keepIn(p, br) {
        const inMinX = this.minX + br, inMaxX = this.maxX - br;
        const inMinZ = this.minZ + br, inMaxZ = this.maxZ - br;
        let axis = 0;
        if (p.x < inMinX) { p.x = inMinX; axis = 1; } else if (p.x > inMaxX) { p.x = inMaxX; axis = 1; }
        if (p.z < inMinZ) { p.z = inMinZ; axis = 2; } else if (p.z > inMaxZ) { p.z = inMaxZ; axis = 2; }
        return axis;
    }

    /**
     * A deterministic settle spot inside the pen, inset from the fence and the
     * gate. Seeded by (settleSeed, sheepId) so it is reproducible run to run and
     * order-independent (each sheep keys its own draw) - the determinism the
     * Worker authority requires.
     * @param {number} sheepId
     * @returns {Vector2D}
     */
    _settleSpot(sheepId) {
        const inset = 4;
        const rng = mulberry32((this.settleSeed ^ Math.imul(sheepId | 0, 2654435761)) >>> 0);
        const spanX = Math.max(0.1, (this.maxX - this.minX) - 2 * inset);
        const spanZ = Math.max(0.1, (this.maxZ - this.minZ) - 2 * inset);
        const x = this.minX + inset + rng() * spanX;
        const z = this.minZ + inset + rng() * spanZ;
        return new Vector2D(x, z);
    }

    /**
     * Cycle 66 P3: release every retired sheep back to active grazing - called at
     * dawn so the flock leaves the pen and can be re-herded for the new day. The
     * gate is open by morning, so they wander back out through it.
     * @param {Array} sheep
     */
    releaseAll(sheep) {
        if (!Array.isArray(sheep)) return;
        for (let i = 0; i < sheep.length; i++) {
            const s = sheep[i];
            if (!s || !s.penned) continue;
            s.penned = false;
            s._penSettling = false;
            s.settleTarget = null;
            s.hasPassedGate = false;
            if (s.state === 2) s.state = 0;
        }
        this.pennedCount = 0;
    }

    /**
     * Per-frame containment + retirement.
     * @param {Array} sheep        OptimizedSheepInstance[] (gameState.sheep).
     * @param {{position:{x:number,z:number}}|null} dog  The player sheepdog.
     * @param {boolean} gateOpen   Whether the gate is currently open.
     * @param {number} dt          Frame delta (s).
     * @returns {number} pennedCount
     */
    update(sheep, dog, gateOpen, dt) {
        const step = (Number.isFinite(dt) ? dt : 0.016);
        let penned = 0;

        if (Array.isArray(sheep)) {
            for (let i = 0; i < sheep.length; i++) {
                const s = sheep[i];
                const p = s?.position;
                if (!p) continue;

                if (s.penned) {
                    // Settle walk: glide to the settle spot, then come to rest.
                    if (s._penSettling && s.settleTarget) {
                        const ddx = s.settleTarget.x - p.x, ddz = s.settleTarget.z - p.z;
                        const d = Math.hypot(ddx, ddz);
                        if (d < 0.4) {
                            s._penSettling = false;
                            s.settleTarget = null;
                            if (s.velocity) s.velocity.set(0, 0);
                        } else {
                            const adv = Math.min(d, this.settleSpeed * step);
                            p.x += (ddx / d) * adv;
                            p.z += (ddz / d) * adv;
                            if (typeof s.facingDirection === 'number') s.facingDirection = Math.atan2(ddz, ddx);
                            if (s.renderPosition) s.renderPosition.set(p.x, p.z);
                        }
                    }
                    this._keepIn(p, this.sheepBody); // safety net: retired sheep stay in
                    penned++;
                    continue;
                }

                if (s.state !== 0) continue;

                // Inside the box (only reachable by passing through the gate, since
                // the barrier below blocks every other crossing): retire calmly in
                // place, then settle-walk deeper. No zap, no teleport. This MUST be
                // checked before the keep-out barrier, or a sheep that has crossed
                // the gate and moved past the gap depth would be ejected back out.
                if (this._isInside(p.x, p.z)) {
                    s.penned = true;
                    s.hasPassedGate = true; // counts as retired/home (scene has no corral, so no zap)
                    s.state = 2;            // grazing/retired - the sim stops moving it
                    s._penSettling = true;
                    s.settleTarget = this._settleSpot(s.id ?? i);
                    if (s.velocity) s.velocity.set(0, 0);
                    penned++;
                    continue;
                }

                // Outsider: blocked at the fence except through the open gate gap.
                if (!this._inGateGap(p.x, p.z, this.sheepBody, gateOpen)) {
                    const axis = this._keepOut(p, this.sheepBody);
                    if (axis === 1 && s.velocity) s.velocity.x = 0;
                    else if (axis === 2 && s.velocity) s.velocity.z = 0;
                }
            }
        }

        // The dog collides with the fence too; it only flips sides at the gate.
        if (dog?.position) {
            const p = dog.position;
            if (this._inGateGap(p.x, p.z, this.dogBody, gateOpen)) {
                this._dogInside = this._isInside(p.x, p.z);
            } else if (this._dogInside) {
                this._keepIn(p, this.dogBody);
            } else {
                this._keepOut(p, this.dogBody);
            }
        }

        this.pennedCount = penned;
        return penned;
    }

    /**
     * Co-op multi-dog fence collision (Cycle 67 P3). The single-dog branch in
     * update() tracks one inside-flag (`this._dogInside`); on the DO each player
     * dog needs its own. Pass a per-dog memory object `{ inside }` (created once
     * per player) plus the dog position; this clamps the position at the fence
     * (gate-only crossing) and updates the memory. Mirrors update()'s dog logic.
     * @param {{x:number,z:number}} p   dog position (mutated in place)
     * @param {boolean} gateOpen
     * @param {{inside:boolean}} mem    per-dog inside memory
     */
    containDog(p, gateOpen, mem) {
        if (!p || !mem) return;
        if (this._inGateGap(p.x, p.z, this.dogBody, gateOpen)) {
            mem.inside = this._isInside(p.x, p.z);
        } else if (mem.inside) {
            this._keepIn(p, this.dogBody);
        } else {
            this._keepOut(p, this.dogBody);
        }
    }
}
