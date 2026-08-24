// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The beauty angle: the third camera spec/05 asks every visual submission to be
 * captured from ("the two gameplay distances, plus one beauty angle").
 *
 * It is not a gameplay camera and it is not a mode. `?debug=beauty` parks the
 * rig on an authored slow orbit around the flock so the art critic loop judges
 * the same framing every time, and with the flag absent nothing in the app
 * reaches this file's behaviour.
 *
 * TWO AUTHORED DECISIONS, both about what the critic has to be able to see:
 *
 *  - LOW. 9 m up, 36 m out from the centroid: an 11 deg elevation, so sheep are
 *    read against the treeline and the sky rather than against grass. The
 *    gameplay cameras sit at 41 m (Classic) and 7.5 m at 20 m out (Follow);
 *    this one is deliberately outside both so a submission cannot pass on the
 *    strength of a framing the player already sees. The 36 m is also what fits
 *    a spread flock: a spawn is 50 m across and the 45 deg vertical fov spans
 *    roughly 47 m of width at that distance.
 *  - DOWN-SUN. The orbit starts at the bearing that puts the golden-hour key
 *    (app/src/tsl/toon.ts SUN_DIRECTION, up-field and to the west) beyond the
 *    flock, which is the angle wool rim-light and grass translucency have to
 *    survive. The orbit then walks off that bearing at 6 deg/s so a recording
 *    shows the light rotating around the silhouettes.
 *
 * TIME COMES FROM THE TICK, NOT THE CLOCK. spec/09 wants a golden to carry the
 * exact camera, time and seed that produced it. Driving the orbit angle from
 * `sim.tick` makes the pose a pure function of (seed, tick), so a manifest that
 * records those two records the camera as well, and a re-capture at the same
 * tick reproduces the frame on either backend.
 *
 * Allocates nothing per frame: two vectors, written in place.
 */

import * as THREE from 'three/webgpu';
import { groundY } from '@app/world/heightfield';
import { SHEEP_STATE_FLAG } from '@sim/FlockSim';
import { TICK_HZ } from '@sim/tuning';

/** Ground distance from the flock centroid, m. */
const RADIUS = 36;
/** Height above the ground under the camera, m. The hero angle, not a map. */
const HEIGHT = 9;
/** Aim height over the ground under the flock, m. Just above the wool line. */
const AIM_HEIGHT = 2.2;
/** Seconds for a full turn. Slow enough that a tick of drift is invisible. */
const PERIOD_SECONDS = 60;
/**
 * Opening bearing, radians, in the three.js yaw convention (0 = +z), measured
 * from the centroid to the camera. atan2(0.45, -0.52) is the reverse of
 * SUN_DIRECTION's ground component: the camera stands opposite the sun and
 * looks into it across the flock.
 */
const START_ANGLE = Math.atan2(0.45, -0.52);

const RATE = (Math.PI * 2) / (PERIOD_SECONDS * TICK_HZ);

export interface BeautyOrbit {
  /** Where the camera stands this tick. */
  readonly position: THREE.Vector3;
  /** What it looks at: the flock centroid, at wool height. */
  readonly aim: THREE.Vector3;
  /**
   * Pose for `tick` against the sim's presentation buffers. Pure: the same tick
   * and the same buffers give the same pose, on either renderer backend.
   */
  update(tick: number, positions: Float32Array, stateFlags: Uint8Array): void;
}

export function createBeautyOrbit(): BeautyOrbit {
  const position = new THREE.Vector3();
  const aim = new THREE.Vector3();

  return {
    position,
    aim,
    update(tick: number, positions: Float32Array, stateFlags: Uint8Array): void {
      // Active sheep only. Penned ones sit 100 m up-field behind the gate and
      // would drag the centroid off the flock the shot is about; late in a run,
      // when none are left loose, the whole set is the flock.
      let sumX = 0;
      let sumZ = 0;
      let count = 0;
      for (let i = 0; i < stateFlags.length; i++) {
        if (stateFlags[i] !== SHEEP_STATE_FLAG.active) continue;
        sumX += positions[i * 2]!;
        sumZ += positions[i * 2 + 1]!;
        count++;
      }
      if (count === 0) {
        for (let i = 0; i < stateFlags.length; i++) {
          sumX += positions[i * 2]!;
          sumZ += positions[i * 2 + 1]!;
        }
        count = stateFlags.length;
      }
      if (count === 0) return;

      const centreX = sumX / count;
      const centreZ = sumZ / count;
      const angle = START_ANGLE + tick * RATE;
      const x = centreX + Math.sin(angle) * RADIUS;
      const z = centreZ + Math.cos(angle) * RADIUS;
      // Both ends ride the relief through the one `groundY` every ground-sitting
      // thing reads (spec/04). The sim is flat, so the flock's own Y comes from
      // the same function; taking the camera's from anywhere else would tilt the
      // horizon against the sheep on the first hill the terrain pass adds.
      position.set(x, groundY(x, z) + HEIGHT, z);
      aim.set(centreX, groundY(centreX, centreZ) + AIM_HEIGHT, centreZ);
    },
  };
}
