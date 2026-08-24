// SPDX-License-Identifier: AGPL-3.0-or-later
// Lifted from sds/shared/PenBarrier.js; same license and copyright holder.
/**
 * Fenced-enclosure barrier + enclosure-entry retirement.
 *
 * An axis-aligned box of fence with ONE passable gap at the gate. This module
 * makes that fence a real barrier:
 *   - The dog and every sheep collide with the four fence edges. The only way
 *     across is the gate gap, and only while the gate is open. No climbing the
 *     fence anywhere else.
 *   - Because non-gate crossings are blocked, any sheep that ends up inside the
 *     box MUST have been herded through the gate. So "inside" => "entered via the
 *     gate", which makes retirement trivial: on entry a sheep settles and
 *     retires in the pasture (a calm walk to a spot inside, then it grazes/idles
 *     until morning). No zap. No teleport.
 *
 * The box is declared either as a square (`{center, radius}`, where `radius` is
 * the half-side), or as an arbitrary rect (`{minX, maxX, minZ, maxZ}`). Every
 * method below reads only the resolved `minX/maxX/minZ/maxZ` plus the
 * half-extents, so the two forms are the same barrier.
 *
 * Determinism: the settle spot is a SEEDED draw (`mulberry32` keyed by a run
 * seed + the sheep id), so a given (settleSeed, sheepId) lands the same spot run
 * to run. No DOM, no Three, no `Math.random` here.
 *
 * Runs every frame AFTER the shared sheep sim tick (which has already moved the
 * sheep) and after the dog's move, so it corrects positions before render.
 */

import { Vector2D } from './Vector2D';
import { mulberry32 } from './rng';
import type { SheepLifecycle } from './types';

/** A position the barrier is allowed to move (mutated in place). */
export interface MutablePoint {
  x: number;
  z: number;
}

/** Velocity the barrier zeroes when it clamps a body against the fence. */
export interface MutableVelocity {
  x: number;
  z: number;
  set(x: number, z: number): void;
}

/** Enclosure declared as an arbitrary rect. Wins when all four are finite. */
export interface PenRectSpec {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Enclosure declared as a square: centre + half-side. */
export interface PenSquareSpec {
  center: { x: number; z: number };
  radius: number;
}

export type PenSpec = PenRectSpec | PenSquareSpec;

/** Gate centre + opening width (world space). */
export interface PenGate {
  x: number;
  z: number;
  width?: number;
}

export interface PenBarrierOptions {
  /** Sheep body radius (fence standoff). Default 0.6. */
  sheepBody?: number;
  /** Dog body radius. Default 1.0. */
  dogBody?: number;
  /** Walk-in speed (m/s) for a freshly penned sheep. Default 6. */
  settleSpeed?: number;
  /** Base seed for the deterministic settle spot. Default 0x5e77. */
  settleSeed?: number;
}

/**
 * The structural slice of a sheep this barrier reads and writes.
 *
 * sds tracked pen membership with `state` (0/1/2) plus `penned` plus
 * `_penSettling` plus `hasPassedGate`. herd has one lifecycle enum and this
 * module is its only writer: `active` -> `retiring` on entering the box,
 * `retiring` -> `penned` on reaching the settle spot. Same three positions on
 * the same state machine, one field instead of four, and no gate-passage flag
 * (spec/02 forbids carrying both retirement mechanisms).
 */
export interface PenSheep {
  position?: MutablePoint | null;
  velocity?: MutableVelocity | null;
  state: SheepLifecycle;
  id?: number;
  settleTarget?: Vector2D | null;
}

/** The structural slice of a dog this barrier reads and writes. */
export interface PenDog {
  position?: MutablePoint | null;
}

/** Per-dog inside memory for the co-op multi-dog path. */
export interface DogPenMemory {
  inside: boolean;
}

/** 0 = no push, 1 = pushed on X, 2 = pushed on Z. */
export type PushAxis = 0 | 1 | 2;

export class PenBarrier {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  halfX: number;
  halfZ: number;
  cx: number;
  cz: number;
  gateX: number;
  gateZ: number;
  gateHalf: number;
  onVertical: boolean;
  sheepBody: number;
  dogBody: number;
  settleSpeed: number;
  settleSeed: number;
  /** Side memory for the dog so it only flips sides at the gate. */
  _dogInside: boolean;
  /**
   * Live count of sheep inside the pen, i.e. `retiring` + `penned`. Crossing
   * the gate is the achievement; the settle walk is how it looks. This is the
   * number the HUD shows and the number the win predicate compares.
   */
  pennedCount: number;

  constructor(pen: PenSpec, gate: PenGate, opts: PenBarrierOptions = {}) {
    const rect = pen as Partial<PenRectSpec>;
    if (
      Number.isFinite(rect.minX) &&
      Number.isFinite(rect.maxX) &&
      Number.isFinite(rect.minZ) &&
      Number.isFinite(rect.maxZ)
    ) {
      // Rect form. Normalised so a swapped pair still describes a box.
      const r = pen as PenRectSpec;
      this.minX = Math.min(r.minX, r.maxX);
      this.maxX = Math.max(r.minX, r.maxX);
      this.minZ = Math.min(r.minZ, r.maxZ);
      this.maxZ = Math.max(r.minZ, r.maxZ);
      this.halfX = (this.maxX - this.minX) / 2;
      this.halfZ = (this.maxZ - this.minZ) / 2;
      this.cx = this.minX + this.halfX;
      this.cz = this.minZ + this.halfZ;
    } else {
      // Square form, unchanged to the last bit.
      const sq = pen as PenSquareSpec;
      const R = sq.radius;
      this.cx = sq.center.x;
      this.cz = sq.center.z;
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
    // z) or a horizontal edge (runs along x, gate gaps in x). Pick the face the
    // gate is NEAREST, measured as the gap left to each face pair. Comparing the
    // raw offsets instead would, on a long thin rect, pick the long axis almost
    // every time and gap the fence on the wrong side. On a square
    // (halfX === halfZ === R) the two rules agree: `R - a <= R - b` iff
    // `a >= b`, bar a tie that only appears when the two offsets are within an
    // ulp of each other, which puts the gate at the box centre.
    this.onVertical =
      (this.halfX - Math.abs(gate.x - this.cx)) <= (this.halfZ - Math.abs(gate.z - this.cz));

    this.sheepBody = opts.sheepBody ?? 0.6;
    this.dogBody = opts.dogBody ?? 1.0;
    this.settleSpeed = opts.settleSpeed ?? 6;
    this.settleSeed = (opts.settleSeed ?? 0x5e77) >>> 0;

    this._dogInside = false;
    this.pennedCount = 0;
  }

  /** True when (x,z) sits comfortably inside the fence box (not on the line). */
  _isInside(x: number, z: number): boolean {
    return x > this.minX && x < this.maxX && z > this.minZ && z < this.maxZ;
  }

  /**
   * Is (x,z) within the gate gap passage (and the gate open)? The gap is a slot
   * `br + 1.2` deep straddling the gate edge, spanning the opening width.
   */
  _inGateGap(x: number, z: number, br: number, gateOpen: boolean): boolean {
    if (!gateOpen) return false;
    const depth = br + 1.2;
    if (this.onVertical) {
      return (
        Math.abs(x - this.gateX) <= depth &&
        z >= this.gateZ - this.gateHalf &&
        z <= this.gateZ + this.gateHalf
      );
    }
    return (
      Math.abs(z - this.gateZ) <= depth &&
      x >= this.gateX - this.gateHalf &&
      x <= this.gateX + this.gateHalf
    );
  }

  /**
   * Keep an OUTSIDER out: the centre may not come within `br` of any fence edge
   * from outside (Minkowski-grown box). Push to the nearest grown face.
   */
  _keepOut(p: MutablePoint, br: number): PushAxis {
    const exMinX = this.minX - br,
      exMaxX = this.maxX + br;
    const exMinZ = this.minZ - br,
      exMaxZ = this.maxZ + br;
    if (p.x <= exMinX || p.x >= exMaxX || p.z <= exMinZ || p.z >= exMaxZ) return 0;
    const dW = p.x - exMinX,
      dE = exMaxX - p.x,
      dS = p.z - exMinZ,
      dN = exMaxZ - p.z;
    const m = Math.min(dW, dE, dS, dN);
    if (m === dW) {
      p.x = exMinX;
      return 1;
    }
    if (m === dE) {
      p.x = exMaxX;
      return 1;
    }
    if (m === dS) {
      p.z = exMinZ;
      return 2;
    }
    p.z = exMaxZ;
    return 2;
  }

  /**
   * Keep an INSIDER in: clamp the centre to the box shrunk by `br`.
   * Returns which axis was clamped (0 none).
   */
  _keepIn(p: MutablePoint, br: number): PushAxis {
    const inMinX = this.minX + br,
      inMaxX = this.maxX - br;
    const inMinZ = this.minZ + br,
      inMaxZ = this.maxZ - br;
    let axis: PushAxis = 0;
    if (p.x < inMinX) {
      p.x = inMinX;
      axis = 1;
    } else if (p.x > inMaxX) {
      p.x = inMaxX;
      axis = 1;
    }
    if (p.z < inMinZ) {
      p.z = inMinZ;
      axis = 2;
    } else if (p.z > inMaxZ) {
      p.z = inMaxZ;
      axis = 2;
    }
    return axis;
  }

  /**
   * A deterministic settle spot inside the pen, inset from the fence and the
   * gate. Seeded by (settleSeed, sheepId) so it is reproducible run to run and
   * order-independent (each sheep keys its own draw) - the determinism the
   * Worker authority requires. One-shot: drawn once when a sheep enters the pen,
   * never on the per-tick path, and it opens its own stream so it never
   * perturbs the shared tick rng.
   */
  _settleSpot(sheepId: number): Vector2D {
    const inset = 4;
    const rng = mulberry32((this.settleSeed ^ Math.imul(sheepId | 0, 2654435761)) >>> 0);
    const spanX = Math.max(0.1, (this.maxX - this.minX) - 2 * inset);
    const spanZ = Math.max(0.1, (this.maxZ - this.minZ) - 2 * inset);
    const x = this.minX + inset + rng() * spanX;
    const z = this.minZ + inset + rng() * spanZ;
    return new Vector2D(x, z);
  }

  /**
   * Release every retired sheep back to active grazing - called at dawn so the
   * flock leaves the pen and can be re-herded for the new day. The gate is open
   * by morning, so they wander back out through it.
   */
  releaseAll(sheep: PenSheep[] | null | undefined): void {
    if (!Array.isArray(sheep)) return;
    for (let i = 0; i < sheep.length; i++) {
      const s = sheep[i];
      if (!s || s.state === 'active') continue;
      s.settleTarget = null;
      s.state = 'active';
    }
    this.pennedCount = 0;
  }

  /**
   * Per-frame containment + retirement.
   * @param sheep    the flock (mutated in place).
   * @param dog      the player sheepdog, or null.
   * @param gateOpen whether the gate is currently open.
   * @param dt       frame delta (s).
   * @returns pennedCount
   */
  update(
    sheep: PenSheep[] | null | undefined,
    dog: PenDog | null | undefined,
    gateOpen: boolean,
    dt: number,
  ): number {
    const step = Number.isFinite(dt) ? dt : 0.016;
    let penned = 0;

    if (Array.isArray(sheep)) {
      for (let i = 0; i < sheep.length; i++) {
        const s = sheep[i];
        const p = s?.position;
        if (!s || !p) continue;

        if (s.state !== 'active') {
          // Settle walk: glide to the settle spot, then come to rest.
          if (s.state === 'retiring' && s.settleTarget) {
            const ddx = s.settleTarget.x - p.x,
              ddz = s.settleTarget.z - p.z;
            // sqrt, not hypot: hypot is implementation-approximated and this
            // distance gates a lifecycle flip, so it must round identically in
            // every engine a replica runs in (spec/02).
            const d = Math.sqrt(ddx * ddx + ddz * ddz);
            if (d < 0.4) {
              s.state = 'penned';
              s.settleTarget = null;
              if (s.velocity) s.velocity.set(0, 0);
            } else {
              const adv = Math.min(d, this.settleSpeed * step);
              p.x += (ddx / d) * adv;
              p.z += (ddz / d) * adv;
              // sds also wrote a render facing angle here with atan2. herd
              // derives facing in the presentation layer (FlockSim), so the
              // tick path stays trig-free.
            }
          }
          this._keepIn(p, this.sheepBody); // safety net: retired sheep stay in
          penned++;
          continue;
        }

        // Inside the box (only reachable by passing through the gate, since
        // the barrier below blocks every other crossing): retire calmly in
        // place, then settle-walk deeper. No zap, no teleport. This MUST be
        // checked before the keep-out barrier, or a sheep that has crossed
        // the gate and moved past the gap depth would be ejected back out.
        if (this._isInside(p.x, p.z)) {
          // The flocking tick stops moving it from here; the settle walk below
          // owns its position until it reaches the spot.
          s.state = 'retiring';
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
   * Co-op multi-dog fence collision. The single-dog branch in update() tracks
   * one inside-flag (`this._dogInside`); on the authority each player dog needs
   * its own. Pass a per-dog memory object `{ inside }` (created once per player)
   * plus the dog position; this clamps the position at the fence (gate-only
   * crossing) and updates the memory. Mirrors update()'s dog logic.
   */
  containDog(
    p: MutablePoint | null | undefined,
    gateOpen: boolean,
    mem: DogPenMemory | null | undefined,
  ): void {
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
