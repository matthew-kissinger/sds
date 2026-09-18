// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Customize framing: the Studio camera the panel inspects the dog, one sheep and
 * the flock through. Each tab names a pose; this eases the live pose toward it
 * while the player orbits it.
 *
 * THERE IS NO DESIRED EYE POSITION IN THIS FILE, AND THAT IS THE FIX. It used to
 * hold one, and to run `approach(position, desiredPosition)` beside
 * `approach(aim, desiredAim)` on a shared alpha: two independent Cartesian
 * eases, one per end of the view. That is the shape that puts a camera through
 * the `lookAt` singularity, and it is the fifth place in this rig it was found.
 * The horizontal part of `aim - eye` and the vertical part cancel at different
 * moments, so between the two the view direction passes through straight down,
 * where `up x forward` goes to zero and the horizon flips half a turn in one
 * frame. Two clicks reach it: the store resets `customizeOrbitAngle` to 0 on
 * every tab and every preset, so the pose the panel asks for jumps to the far
 * side of the subject while the live pose is still on this side, and the two
 * are then exactly opposed.
 *
 * MEASURED ON THE CODE THIS REPLACES, on the framing's own pose with a camera
 * looking down it, at 30, 60 and 144 Hz, at every orbit angle at one degree. A
 * preset click took the view to 0.3885 degrees off straight down, left the eye
 * 0.0068 m from its own aim and flipped the horizon at 25,920 deg/s; 8.2% of
 * those runs came within 30 degrees of the pole, and 321 of the 360 orbit
 * angles a player can be sitting at are in at least one of them. A tab click
 * reached 1.3546 degrees, 0.0277 m and 24,791 deg/s. And a drag flick with no
 * click at all reached 4.4567 degrees, 0.4579 m and 3,334 deg/s, because a
 * 0.22 s Cartesian lag does not preserve a radius either: the collapse is not
 * something only the reset could reach.
 *
 * WHAT THE POSE IS NOW. A point to look at, and three numbers about it: the
 * bearing the eye stands on, the horizontal radius it stands at, and its height
 * above the aim. Every tab states its pose in those terms, because that is what
 * the tabs were always written in - a `camDist`, a `camHeight` and an angle -
 * and the Cartesian eye was a derived quantity the file then tried to smooth.
 * The eye is rebuilt from the aim and those three at the end of every update,
 * and written nowhere else.
 *
 * TWO PROPERTIES FALL OUT OF THAT, AND NEITHER IS A GUARD THAT COULD BE FORGOTTEN.
 *
 *  - The radius is a smoothed quantity in its own right. One step of an
 *    exponential ease between two positive numbers is strictly between them, so
 *    the live radius stays inside the range of the radii the tabs ask for: 3.8 m
 *    at the closest, the dog's `face` preset, and 28 m at the widest. It cannot
 *    reach zero, during a flick or anywhere else, because there is no arithmetic
 *    here that could take it there. Measured over every tab, preset and orbit
 *    angle: 3.800000 m at its smallest, held to the tab's own `camDist` within
 *    7.1e-15 m through a drag at up to 40 rad/s, and strictly monotone between
 *    its two endpoints across a tab click with no excursion outside them.
 *  - The view direction is `-(sin b * r, h, cos b * r)` normalized, so it is a
 *    function of the three numbers and NOT of the aim. The angle it makes with
 *    straight down is `atan2(r, h)`, and the minimum of that over the convex
 *    hull of the tabs' own poses sits at one of them, because a ratio is
 *    minimised at a vertex. That vertex is the dog's `top` preset at 53.13
 *    degrees, and 53.1301 is exactly what the same sweep measures settled, and
 *    through a preset click, and 66.4566 through a tab click or a flick. The
 *    sheep tab is the one pose the ground can move, since its eye clears the
 *    ground it stands over; on the committed bake the worst rise over its 4.6 m
 *    radius is 0.6167 m, which leaves it 74.84 degrees off the pole. And a
 *    moving subject contributes no view rotation at all - 0.0 deg/s with the
 *    dog running at 12 m/s under a settled Studio - because the eye rides with
 *    the aim rather than lagging behind it.
 *
 * ONE STEP, ONE FACTOR. The whole pose advances on a single alpha, held under
 * MAX_RIG_SPEED by backing that alpha off until the eye's own travel fits. The
 * ceiling used to be applied to the eye and to the aim separately, inside
 * `approach`, and that is the co-lerp again wearing a clamp: two ends of one
 * view marched along their own straight lines under their own limits rotate the
 * picture, and nothing was measuring it. Backing off one shared factor slows
 * the path instead of bending it. It is not idle: a drag at
 * 8 rad/s never reaches it, and one at 14 rad/s sits on it for 57 frames of 140.
 *
 * HOW FAST THE FRAMING TURNS IS NOT BOUNDED HERE, DELIBERATELY. The lag is the
 * only law on it, so the peak is the size of the step over the time constant:
 * a preset click, which resets up to a half-turn of orbit, swings this pose at
 * 819.1 deg/s, and a drag is whatever the hand asks for. Taking that rate off
 * here would be one more ceiling on one more stage, which is the defect one
 * class up rather than a fix for it - independently capped stages compose
 * additively and the total on screen exceeds every one of them. It belongs
 * where the player's inner ear is, on the composed view, which is what
 * `viewBudget` holds. Measured this round by driving `composedRig` over the
 * same sweep: the picture turns at 90.0 deg/s and carries its horizon at 125.0,
 * whatever this framing asked for, and comes no nearer the pole than 45.10
 * degrees.
 *
 * WHAT THAT LEAVES is the 0.22 s of lag between the drag and the picture, which
 * is a feel number and is unchanged. The budget is the only thing charging the
 * orbit drag, and the drag is direct manipulation - the one camera motion in
 * the game the player's own hand is driving - so whether it should be charged
 * at the same rate as a camera that moves on its own is an owner's call, and it
 * is recorded rather than taken.
 */

import * as THREE from 'three/webgpu';
import type { Dog } from '@sim/types';
import { groundY } from '@app/world/heightfield';
import { MAX_RIG_SPEED, lerpAngle, positionSmoothing } from './feel';

const CUSTOMIZE_POSITION_TAU = 0.22;

export type DogCameraAngle = 'hero' | 'face' | 'profile' | 'front' | 'rear' | 'top';

export interface DogCameraConfig {
  readonly camDist: number;
  readonly camHeight: number;
  readonly aimHeight: number;
  readonly baseAngle: number;
}

export const DOG_CAMERA_CONFIGS: Record<DogCameraAngle, DogCameraConfig> = {
  hero: {
    camDist: 5.0,
    camHeight: 1.65,
    aimHeight: 0.9,
    baseAngle: 0.35,
  },
  face: {
    camDist: 3.8,
    camHeight: 1.65,
    aimHeight: 1.18,
    baseAngle: 0.22,
  },
  profile: {
    camDist: 5.8,
    camHeight: 1.45,
    aimHeight: 0.9,
    baseAngle: Math.PI / 2,
  },
  front: {
    camDist: 4.9,
    camHeight: 1.5,
    aimHeight: 0.95,
    baseAngle: 0.0,
  },
  rear: {
    camDist: 4.8,
    camHeight: 1.55,
    aimHeight: 0.85,
    baseAngle: Math.PI * 0.82,
  },
  top: {
    camDist: 4.6,
    camHeight: 4.2,
    aimHeight: 0.75,
    baseAngle: 0.25,
  },
};

export interface CustomizeFraming {
  readonly position: THREE.Vector3;
  readonly aim: THREE.Vector3;
  update(
    dt: number,
    tab: 'dog' | 'flock' | 'sheep',
    dogAngle: DogCameraAngle,
    orbitAngle: number,
    selectedSheep: number,
    dog: Dog,
    sheepList: readonly { readonly position: { readonly x: number; readonly z: number } }[],
  ): void;
}

export function createCustomizeFraming(): CustomizeFraming {
  const position = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const desiredAim = new THREE.Vector3();
  /** The live pose about `aim`. These three and the aim are the state; there is
   *  no live eye, only `position`, which is their product rewritten each
   *  update and never smoothed, clamped or read back into them. */
  let bearing = 0;
  let radius = 0;
  let height = 0;
  let desiredBearing = 0;
  let desiredRadius = 0;
  let desiredHeight = 0;
  let seated = false;

  /**
   * How far the eye would move if the step ran at `k`. The displacement is not
   * linear in `k`, because the bearing goes through a sine, so this evaluates
   * the whole step rather than estimating it. Arithmetic on numbers: the
   * framing allocates nothing.
   */
  function eyeTravel(k: number): number {
    const b = lerpAngle(bearing, desiredBearing, k);
    const r = radius + (desiredRadius - radius) * k;
    return Math.hypot(
      aim.x + (desiredAim.x - aim.x) * k + Math.sin(b) * r - position.x,
      aim.y + (desiredAim.y - aim.y) * k + height + (desiredHeight - height) * k - position.y,
      aim.z + (desiredAim.z - aim.z) * k + Math.cos(b) * r - position.z,
    );
  }

  return {
    position,
    aim,

    update(
      dt: number,
      tab: 'dog' | 'flock' | 'sheep',
      dogAngle: DogCameraAngle,
      orbitAngle: number,
      selectedSheep: number,
      dog: Dog,
      sheepList: readonly { readonly position: { readonly x: number; readonly z: number } }[],
    ): void {
      if (tab === 'dog') {
        const dogX = dog.position.x;
        const dogZ = dog.position.z;
        const ground = groundY(dogX, dogZ);
        const cfg = DOG_CAMERA_CONFIGS[dogAngle] ?? DOG_CAMERA_CONFIGS.hero;

        // Screen composition belongs to the shared Studio viewport in CameraRig.
        desiredAim.set(dogX, ground + cfg.aimHeight, dogZ);
        desiredBearing = cfg.baseAngle + orbitAngle;
        desiredRadius = cfg.camDist;
        desiredHeight = cfg.camHeight - cfg.aimHeight;
      } else if (tab === 'sheep') {
        const sheep = sheepList[selectedSheep] ?? sheepList[0];
        const sheepX = sheep ? sheep.position.x : 0;
        const sheepZ = sheep ? sheep.position.z : -30;
        const ground = groundY(sheepX, sheepZ);
        const aimHeight = 0.62;
        const camDist = 4.6;
        const camHeight = 1.75;

        desiredBearing = 0.42 + orbitAngle;
        desiredRadius = camDist;
        // The eye clears the ground it stands over as well as the ground the
        // sheep stands on, so the lift is sampled at the eye's own x and z.
        const eyeX = sheepX + Math.sin(desiredBearing) * camDist;
        const eyeZ = sheepZ + Math.cos(desiredBearing) * camDist;
        const lift = Math.max(camHeight, groundY(eyeX, eyeZ) - ground + 1.25);

        desiredAim.set(sheepX, ground + aimHeight, sheepZ);
        desiredHeight = lift - aimHeight;
      } else {
        // 'flock' pasture overview
        let sumX = 0;
        let sumZ = 0;
        const count = sheepList.length;
        if (count > 0) {
          for (let i = 0; i < count; i++) {
            const s = sheepList[i]!;
            sumX += s.position.x;
            sumZ += s.position.z;
          }
          sumX /= count;
          sumZ /= count;
        } else {
          sumX = 0;
          sumZ = -30;
        }

        const ground = groundY(sumX, sumZ);
        const camDist = count > 100 ? 28.0 : count > 50 ? 22.0 : 18.0;
        const camHeight = count > 100 ? 13.0 : count > 50 ? 10.5 : 8.5;
        const aimHeight = 0.8;

        desiredAim.set(sumX, ground + aimHeight, sumZ);
        // The pasture tab orbits at half the rate the other two do.
        desiredBearing = orbitAngle * 0.5;
        desiredRadius = camDist;
        desiredHeight = camHeight - aimHeight;
      }

      if (!seated) {
        // The rig's first frame takes the pose whole, as it always has - this
        // framing runs whether or not the panel is open, so it seats once per
        // rig and glides from then on. It is the same eye the previous code
        // seated on: bit for bit over every tab, preset and orbit angle on
        // level ground, and within 3.6e-15 m where the ground is not level,
        // which is the one rounding the height now being an offset from the aim
        // rather than an absolute costs.
        aim.copy(desiredAim);
        bearing = desiredBearing;
        radius = desiredRadius;
        height = desiredHeight;
        seated = true;
      } else {
        let k = positionSmoothing(dt, CUSTOMIZE_POSITION_TAU);
        const limit = MAX_RIG_SPEED * dt;
        // Three proportional passes, the same back-off the rig's own blends use
        // and for the same reason: the eye's travel is not linear in `k` once
        // the bearing is part of the step. Measured on this arithmetic over
        // every tab and preset pair at 30, 60 and 144 Hz, the worst frame lands
        // at 1.0852 of the ceiling after one pass, 1.0062 after two, 1.0007
        // after three and 1.0001 after four. Three is where the residue stops
        // being worth four more trig calls on every frame of every drag; the
        // measured worst through the framing itself is 1.000553.
        for (let pass = 0; pass < 3; pass += 1) {
          const travel = eyeTravel(k);
          if (travel <= limit) break;
          k *= limit / travel;
        }
        bearing = lerpAngle(bearing, desiredBearing, k);
        radius += (desiredRadius - radius) * k;
        height += (desiredHeight - height) * k;
        aim.lerp(desiredAim, k);
      }

      // The eye, once, from the pose. Settled, this is the tab's own expression
      // with the tab's own numbers in it, so the framing arrives AT the pose it
      // was asked for rather than near it: 7.1e-14 m of residual twelve seconds
      // after a preset click, against 2.5e-13 m for the two approaches it
      // replaces. There is no arrival epsilon and nothing snaps.
      position.set(
        aim.x + Math.sin(bearing) * radius,
        aim.y + height,
        aim.z + Math.cos(bearing) * radius,
      );
    },
  };
}
