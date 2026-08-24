// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * A scripted sheepdog. Drives the acceptance run: a headless controller that
 * herds a whole flock through the gate, so the completion trace is a real
 * gameplay outcome and not a teleport.
 *
 * This is TEST code. It is not a model of good play, it is a robot that
 * reliably finishes. It reads the same public sim state the HUD would and emits
 * the same PlayerInputs a keyboard would, so it exercises `step` through the
 * front door.
 *
 * IMPORTANT (spec/02 fixture discipline): when the acceptance run stalls, the
 * fix goes HERE. Never in the sim math. A stall is the driver being bad at
 * herding; sim behaviour is pinned by fixtures and a change to it is a decision
 * recorded in its own diff.
 *
 * HOW IT PLAYS
 * ------------
 * Collect, then drive. Every tick it looks at the flock as a body:
 *
 *   COLLECT - some sheep is further from the flock centroid than a tight flock
 *     of this size should ever be. Stand just beyond that sheep, on the far side
 *     from the centroid, and it flees back into the group.
 *   DRIVE - the flock is tight enough to move as one. Stand behind the centroid
 *     on the line from the gate, far enough back that the whole body feels it,
 *     and the group runs at the gate.
 *
 * Two earlier policies were tried and measured, and both fail for the same
 * reason: they aim at a point no single sheep is standing on.
 *   - Pressing the centroid alone splits a flock in two and then presses the
 *     empty grass between the halves (0 of 25 penned in 20000 ticks).
 *   - Working only the sheep furthest from the GATE drags the dog to whichever
 *     corner holds the worst stray, while the body of the flock drifts back
 *     down the field behind it (4 of 25, then a stall).
 * Ranking strays by distance from the FLOCK, not from the gate, is what fixes
 * that: the dog never leaves the flock to chase a bolter, it tucks the edge of
 * the group back in and returns to pushing.
 *
 * The dog also swings around the flock rather than through it, and cuts its own
 * throttle on approach - PlayerInputs has no analogue stick, so the only way to
 * arrive slowly is to stop asking to move.
 */

import type { PlayerInputs, SimState } from '@sim/types';

export interface DriverConfig {
  /**
   * Sheep-to-sheep interaction distance, m. The unit the flock's own scale is
   * measured in: sds's separation radius.
   */
  neighbourRadius: number;
  /** Collect stays engaged until the stray is back inside this much of it. */
  spreadHysteresis: number;
  /**
   * Floor and ceiling on that threshold, m. A pair of sheep would otherwise be
   * asked to stand 3 m apart and the dog would collect forever; forty sheep
   * would be allowed a 23 m sprawl, which does not fit through an 8 m gate.
   */
  minSpread: number;
  maxSpread: number;
  /** Standoff behind a stray when collecting, m. Well inside the flee radius. */
  collectStandoff: number;
  /**
   * Standoff behind the centroid when driving, in units of neighbourRadius
   * times sqrt(n): a bigger flock needs the dog further back to lean on all of
   * it at once.
   */
  driveStandoff: number;
  /** Metres past the gate line the dog aims the flock, so it pushes through. */
  gateOvershoot: number;
  /** Cosine of the largest angle off the drive line at which the dog presses. */
  alignDot: number;
  /** Radius the dog swings around the flock at when repositioning, m. */
  arcRadius: number;
  /** Stop inside this distance of the press point: the dog is very fast. */
  arriveRadius: number;
  /** Sprint when this far from the press point, m. */
  sprintDistance: number;
  /**
   * Approach speed per metre still to travel, 1/s. PlayerInputs has no
   * throttle - any direction at all means full speed - so the driver regulates
   * speed by cutting the stick when it is going faster than it wants to be.
   * Without this the dog crosses the whole 8 m flee radius in half a second on
   * every approach and detonates the flock instead of leaning on it.
   */
  speedGain: number;
}

export const DEFAULT_DRIVER: DriverConfig = {
  neighbourRadius: 2,
  spreadHysteresis: 0.7,
  minSpread: 6,
  maxSpread: 16,
  collectStandoff: 3,
  driveStandoff: 1,
  gateOvershoot: 8,
  alignDot: 0.4,
  arcRadius: 14,
  arriveRadius: 1,
  sprintDistance: 25,
  speedGain: 1.4,
};

const IDLE: PlayerInputs = { direction: { x: 0, z: 0 }, sprint: false, bark: false };

/**
 * n^(2/3): a flock packs in two dimensions, so its radius grows with the
 * two-thirds power of its size (the standard shepherding-model figure; about
 * 17 m of spread for 25 sheep at neighbourRadius 2).
 *
 * Computed with Newton's method on y^3 = n^2 rather than Math.pow, because pow
 * (like cbrt and hypot) is implementation-approximated per the ES spec and
 * V8-in-Node and V8-in-Chromium round it differently in the last bit. This
 * threshold gates the collect/drive switch, the fixture is recorded in Node and
 * the browser probe replays it in Chromium, so one flipped comparison forks the
 * two runs (measured: divergence at tick ~1765, completion 5090 vs 6088). Only
 * basic arithmetic and Math.sqrt are correctly rounded everywhere; a fixed
 * iteration count with no early exit keeps the float sequence identical, and
 * Newton converges in single digits from the sqrt seed at these magnitudes.
 */
function pow23(n: number): number {
  const x = n * n;
  let y = Math.sqrt(x);
  for (let i = 0; i < 40; i++) {
    y = (2 * y + x / (y * y)) / 3;
  }
  return y;
}

/**
 * Build a driver. Stateful only in whether it is currently collecting, which is
 * what gives the mode switch hysteresis; that state is a function of the ticks
 * it has seen, so a driver replayed over the same sim produces the same inputs.
 */
export function createHerdingDriver(config: DriverConfig = DEFAULT_DRIVER) {
  let collecting = false;

  return function herdingInput(state: SimState): PlayerInputs {
    const dog = state.dogs[0];
    if (!dog) return IDLE;

    // --- the flock as a body ---------------------------------------------
    let n = 0;
    let cx = 0;
    let cz = 0;
    for (const s of state.sheep) {
      if (s.state !== 'active') continue;
      n++;
      cx += s.position.x;
      cz += s.position.z;
    }
    if (n === 0) return IDLE;
    cx /= n;
    cz /= n;

    let stray = null;
    let strayDist = -1;
    for (const s of state.sheep) {
      if (s.state !== 'active') continue;
      const sdx = s.position.x - cx;
      const sdz = s.position.z - cz;
      const d = Math.sqrt(sdx * sdx + sdz * sdz);
      if (d > strayDist) {
        strayDist = d;
        stray = s;
      }
    }
    if (!stray) return IDLE;

    // --- collect or drive, with hysteresis on the switch -------------------
    const spread = Math.min(
      config.maxSpread,
      Math.max(config.minSpread, config.neighbourRadius * pow23(n)),
    );
    collecting = collecting ? strayDist > spread * config.spreadHysteresis : strayDist > spread;

    // The point the flock is being sent to, and the point the dog presses from.
    let aimX: number;
    let aimZ: number;
    let anchorX: number;
    let anchorZ: number;
    let standoff: number;
    if (collecting) {
      aimX = cx;
      aimZ = cz;
      anchorX = stray.position.x;
      anchorZ = stray.position.z;
      standoff = config.collectStandoff;
    } else {
      aimX = state.field.gate.position.x;
      aimZ = state.field.gate.position.z + config.gateOvershoot;
      anchorX = cx;
      anchorZ = cz;
      standoff = config.driveStandoff * config.neighbourRadius * Math.sqrt(n);
    }

    // --- the drive line: from the aim point out through the anchor ---------
    let vx = anchorX - aimX;
    let vz = anchorZ - aimZ;
    const vLen = Math.sqrt(vx * vx + vz * vz) || 1;
    vx /= vLen;
    vz /= vLen;

    const pressX = anchorX + vx * standoff;
    const pressZ = anchorZ + vz * standoff;

    let ox = dog.position.x - anchorX;
    let oz = dog.position.z - anchorZ;
    const oLen = Math.sqrt(ox * ox + oz * oz) || 1;
    ox /= oLen;
    oz /= oLen;
    const aligned = ox * vx + oz * vz >= config.alignDot;

    let dirX: number;
    let dirZ: number;
    let travel: number;

    if (aligned) {
      dirX = pressX - dog.position.x;
      dirZ = pressZ - dog.position.z;
      travel = Math.sqrt(dirX * dirX + dirZ * dirZ);
      if (travel < config.arriveRadius) return IDLE;
    } else {
      // Swing around the flock at arc radius, never through it, in whichever
      // direction closes the angle to the drive line. The radial term pulls the
      // dog onto the arc; the tangential term carries it along the arc.
      const cross = ox * vz - oz * vx;
      const sign = cross >= 0 ? 1 : -1;
      const radial = (config.arcRadius - oLen) / config.arcRadius;
      dirX = -oz * sign + ox * radial;
      dirZ = ox * sign + oz * radial;
      const tdx = pressX - dog.position.x;
      const tdz = pressZ - dog.position.z;
      travel = Math.sqrt(tdx * tdx + tdz * tdz);
    }

    const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
    if (len < 1e-6) return IDLE;

    // Speed regulation: coast when already faster than the approach wants.
    if (dog.velocity.magnitude() > travel * config.speedGain) return IDLE;

    return {
      direction: { x: dirX / len, z: dirZ / len },
      sprint: travel > config.sprintDistance,
      bark: false,
    };
  };
}
