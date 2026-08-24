// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Classic: the elevated three-quarter view.
 *
 * sds's Classic sat at offset (0, d, -d) from the dog with d = 80 at a 75 deg
 * field of view: a 45 deg elevation, world-locked, looking up the field toward
 * the gate. herd keeps the world lock, tips the pitch 5 deg further over
 * (spec/06 calls Classic top-down, and the extra pitch is what makes the
 * dog-to-flock geometry read as a plan) and re-derives the distance for its own
 * 45 deg fov and its 200 m field (spec/02 HOME_FIELD). At these numbers the
 * view spans roughly 67 m of field depth and 79 m of width around the dog: the
 * whole 50 m spread of a spawned flock plus the ground you are pushing it
 * across, with the dog still a readable silhouette rather than a speck.
 *
 * World-locked is the load-bearing part, not a simplification: spec/06 says
 * Classic input stays world-axis because camera-relative movement from overhead
 * disorients. A camera that yawed with the dog would make W mean something
 * different every second. So this rig never rotates - it only ever glides.
 *
 * The aim sits a few metres up-field of the dog (world +z, toward the gate),
 * which puts the dog just below screen centre and spends the extra screen on
 * the ground the player is herding toward.
 */

import * as THREE from 'three/webgpu';
import type { Dog } from '@sim/types';
import { groundY } from '@app/world/heightfield';
import { CLASSIC_POSITION_TAU, approach, positionSmoothing } from './feel';
import type { CameraFraming } from './framing';

/** Camera-to-dog distance along the rig line, m. */
const RIG_DISTANCE = 54;
/** Elevation of the rig line above the ground plane, degrees. */
const PITCH_DEGREES = 50;
/** World +z bias on the aim point, m. The gate is north, so this is up-field. */
const AIM_LEAD = 6;
/** Aim a little above the ground so the dog's body, not its shadow, is centred.
 *  Measured from the ground UNDER the aim point: the rig height is world-locked
 *  (that is the whole design), so if the aim were world-locked too the dog would
 *  drift up and down the screen as it crossed the roll. */
const AIM_HEIGHT = 0.8;

const PITCH = (PITCH_DEGREES * Math.PI) / 180;
const HEIGHT = RIG_DISTANCE * Math.sin(PITCH);
const BACK = RIG_DISTANCE * Math.cos(PITCH);

export function createClassicFraming(): CameraFraming {
  const position = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  const desiredAim = new THREE.Vector3();
  let seated = false;

  return {
    position,
    aim,
    update(dt: number, dog: Dog): void {
      const aimZ = dog.position.z + AIM_LEAD;
      desiredPosition.set(dog.position.x, HEIGHT, dog.position.z - BACK);
      desiredAim.set(dog.position.x, groundY(dog.position.x, aimZ) + AIM_HEIGHT, aimZ);

      if (!seated) {
        // First frame of the page. Nothing to ease from.
        position.copy(desiredPosition);
        aim.copy(desiredAim);
        seated = true;
        return;
      }

      // Position and aim share one time constant on purpose: equal lag on both
      // ends of the same fixed offset holds the dog at a fixed screen position
      // while the rig glides, so Classic never sways.
      const k = positionSmoothing(dt, CLASSIC_POSITION_TAU);
      approach(position, desiredPosition, k, dt);
      approach(aim, desiredAim, k, dt);
    },
  };
}
