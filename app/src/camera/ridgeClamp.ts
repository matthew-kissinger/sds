// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Follow rig's line-of-sight floor.
 *
 * spec/06 carries this rule with the camera constants: "Ridge clamp: sample 7
 * points camera-to-dog, clamp Y above max + clearance." Its job is that when
 * the dog crests a rise, the ground BETWEEN the camera and the dog cannot
 * occlude the dog: the rig lifts over the ridge instead of looking into it.
 *
 * What it does, in order:
 *
 *   1. sample the ground at 7 points on the strict interior of the camera ->
 *      dog segment. Both endpoints are skipped on purpose: the camera end is
 *      covered by its own sample below, and the dog end is where we WANT to be
 *      looking, so including it would lift the rig for no occlusion at all,
 *   2. sample the ground under the camera itself,
 *   3. floor = max(those) + clearance,
 *   4. snap UP to a rising floor, so the rig never clips through a ridge, and
 *      ease DOWN a falling one on the position tau, so it glides off a crest
 *      instead of dropping off it.
 *
 * Step 4 is why this is a factory rather than a bare function: the eased floor
 * is per-rig memory. Nothing outside the Follow rig creates one.
 *
 * The clamp reads `groundY`, the same single source of truth every
 * ground-sitting object reads (spec/04). The Follow rig runs OUTSIDE the scene
 * Suspense boundary by design, so on the frames before the heightfield lands it
 * samples a flat field - which is the right answer, since nothing is drawn yet
 * (see world/heightfield.ts).
 */

import { groundY } from '@app/world/heightfield';
import { FOLLOW_POSITION_TAU, smoothing } from './feel';

/** Interior samples along the camera -> dog segment. spec/06 says seven. */
const SEGMENT_SAMPLES = 7;

/**
 * Metres of air between the highest ground on the sight line and the rig. Just
 * over the dog's shoulder height, so a crest between them clears the dog's
 * whole silhouette and not only its back.
 */
const CLEARANCE = 2.2;

/** The ground under a world point, metres. `groundY` in the game. */
export type GroundSampler = (x: number, z: number) => number;

export interface RidgeClamp {
  /**
   * Returns the camera height to use: never below the terrain floor between
   * the camera and the dog, and never falling faster than the position tau.
   */
  clamp(
    cameraY: number,
    cameraX: number,
    cameraZ: number,
    dogX: number,
    dogZ: number,
    dt: number,
  ): number;
}

/**
 * @param sampleGround the ground to clamp against. Defaults to the game's one
 *   `groundY`; the parameter exists so the clamp's own behaviour can be tested
 *   against a shaped ridge rather than only against the field that happens to
 *   be baked.
 */
export function createRidgeClamp(sampleGround: GroundSampler = groundY): RidgeClamp {
  /** The eased floor. NaN until the first call seats it. */
  let floor = Number.NaN;

  return {
    clamp(cameraY, cameraX, cameraZ, dogX, dogZ, dt) {
      let highest = sampleGround(cameraX, cameraZ);
      const dx = dogX - cameraX;
      const dz = dogZ - cameraZ;
      for (let i = 1; i <= SEGMENT_SAMPLES; i++) {
        const t = i / (SEGMENT_SAMPLES + 1);
        const h = sampleGround(cameraX + dx * t, cameraZ + dz * t);
        if (h > highest) highest = h;
      }

      const target = highest + CLEARANCE;
      if (Number.isNaN(floor) || target >= floor) floor = target;
      else floor += (target - floor) * smoothing(dt, FOLLOW_POSITION_TAU);

      return cameraY > floor ? cameraY : floor;
    },
  };
}
