// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Follow: the low cinematic chase.
 *
 * Sits behind and slightly above the dog and looks past it at a point that
 * leads with speed. Every carried constant in spec/06 lands here, each on its
 * own smoother (see feel.ts for why they cannot collapse into one):
 *
 *   yaw 0.35 s     where "behind" is, so the rig arcs around a turn
 *   position 0.15 s the glide to that point, capped at 0.3 per frame
 *   aim 0.08 s     the direction the look-ahead point is thrown in
 *   speedNorm 0.1 s how far ahead it is thrown
 *
 * Two angles are tracked, not one. The rig yaw lags a third of a second, which
 * is what makes a turn feel like the camera swinging wide; if the aim point
 * rode that same yaw it would swing wide too and the horizon would slew. The
 * aim yaw is the same dog facing at a quarter of that lag: tight enough to feel
 * attached, slow enough to filter the per-tick noise off fence contact.
 *
 * The dog's heading is a unit forward the sim already slews (DOG_TURN_RATE), so
 * the angle here is stable input, not raw velocity direction. Speed comes from
 * the velocity, normalized against the sprint top speed so the look-ahead
 * saturates exactly when the dog does.
 */

import * as THREE from 'three/webgpu';
import type { Dog } from '@sim/types';
import { DOG_SPRINT_SPEED } from '@sim/tuning';
import {
  FOLLOW_AIM_TAU,
  FOLLOW_POSITION_TAU,
  FOLLOW_YAW_TAU,
  SPEED_NORM_TAU,
  approach,
  lerpAngle,
  positionSmoothing,
  smoothing,
} from './feel';
import type { CameraFraming } from './framing';
import { createRidgeClamp } from './ridgeClamp';
import { groundY } from '@app/world/heightfield';
import type { FollowViewProfile } from './viewProfile';

/** How far behind the dog the rig sits, m. */
const DEFAULT_VIEW: FollowViewProfile = {
  distance: 20,
  height: 7.5,
  lookAhead: 7,
};
/** How far above the ground the rig sits, m. A 21 deg look-down: low, not flat.
 *  Above the ground UNDER THE RIG, not above sea level: the relief is a few
 *  metres and a world-locked height would swing the pitch as the dog crosses
 *  the field. The ridge clamp then handles the ground BETWEEN rig and dog. */
/** Aim height above the ground under the aim point, m. The dog's shoulder. */
const AIM_HEIGHT = 1.6;
/** Look-ahead throw at full sprint, m. Scaled by the smoothed speedNorm. */
/** Below this heading length the facing is degenerate; hold the last angle. */
const MIN_HEADING = 1e-4;

export interface FollowFraming extends CameraFraming {
  setView(view: FollowViewProfile): void;
}

export function createFollowFraming(initialView: FollowViewProfile = DEFAULT_VIEW): FollowFraming {
  const position = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const desiredPosition = new THREE.Vector3();
  const desiredAim = new THREE.Vector3();
  let yaw = 0;
  let aimYaw = 0;
  let speedNorm = 0;
  let seated = false;
  let view = initialView;
  const ridge = createRidgeClamp();

  return {
    position,
    aim,
    setView(nextView: FollowViewProfile): void {
      view = nextView;
    },
    update(dt: number, dog: Dog): void {
      const hx = dog.heading.x;
      const hz = dog.heading.z;
      // Yaw is measured the three.js way (0 = +z), so the forward direction is
      // (sin yaw, cos yaw) and "behind the dog" is the negative of that.
      const facing =
        Math.abs(hx) + Math.abs(hz) > MIN_HEADING ? Math.atan2(hx, hz) : yaw;

      const speed = Math.hypot(dog.velocity.x, dog.velocity.z);
      const rawSpeedNorm = Math.min(1, speed / DOG_SPRINT_SPEED);

      if (!seated) {
        yaw = facing;
        aimYaw = facing;
        speedNorm = rawSpeedNorm;
        seated = true;
        const seatX = dog.position.x - Math.sin(yaw) * view.distance;
        const seatZ = dog.position.z - Math.cos(yaw) * view.distance;
        desiredPosition.set(seatX, groundY(seatX, seatZ) + view.height, seatZ);
        position.copy(desiredPosition);
        position.y = ridge.clamp(
          position.y,
          position.x,
          position.z,
          dog.position.x,
          dog.position.z,
          dt,
        );
        aim.set(
          dog.position.x,
          groundY(dog.position.x, dog.position.z) + AIM_HEIGHT,
          dog.position.z,
        );
        return;
      }

      yaw = lerpAngle(yaw, facing, smoothing(dt, FOLLOW_YAW_TAU));
      aimYaw = lerpAngle(aimYaw, facing, smoothing(dt, FOLLOW_AIM_TAU));
      speedNorm += (rawSpeedNorm - speedNorm) * smoothing(dt, SPEED_NORM_TAU);

      const rigX = dog.position.x - Math.sin(yaw) * view.distance;
      const rigZ = dog.position.z - Math.cos(yaw) * view.distance;
      desiredPosition.set(rigX, groundY(rigX, rigZ) + view.height, rigZ);
      approach(position, desiredPosition, positionSmoothing(dt, FOLLOW_POSITION_TAU), dt);
      // What keeps a ridge between the rig and the dog from swallowing the dog.
      position.y = ridge.clamp(
        position.y,
        position.x,
        position.z,
        dog.position.x,
        dog.position.z,
        dt,
      );

      const lead = view.lookAhead * speedNorm;
      const aimX = dog.position.x + Math.sin(aimYaw) * lead;
      const aimZ = dog.position.z + Math.cos(aimYaw) * lead;
      desiredAim.set(aimX, groundY(aimX, aimZ) + AIM_HEIGHT, aimZ);
      // The aim tau smooths the point as well as the direction it is thrown
      // in. In play that is a hair of trail on a point already thrown metres
      // ahead, so the feel is the tuned one; what it buys is that a dog that
      // moves discontinuously (a reset while the player is across the field)
      // eases the aim over instead of whipping it.
      approach(aim, desiredAim, smoothing(dt, FOLLOW_AIM_TAU), dt);
    },
  };
}
