// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The camera's promises, pinned without a renderer: both framings are plain
 * functions of the dog's sim state, so they run in node.
 *
 * What is worth pinning is not the framing numbers (those are art direction and
 * will move) but the properties the rest of the game leans on: Classic never
 * rotates, Follow stands one chase radius back along a single bearing and aims
 * along that same bearing, the smoothing is frame-rate independent, and nothing
 * the camera does can cover ground faster than MAX_RIG_SPEED - which is the
 * "never jumps" promise in a form a test can check.
 *
 * The ceiling on the bearing itself has a file of its own, camera-rotation-cap.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import type { Dog } from '@sim/types';
import { createClassicFraming } from '@app/camera/classicFraming';
import { createFollowFraming } from '@app/camera/followFraming';
import { cameraViewProfile } from '@app/camera/viewProfile';
import {
  MAX_FOLLOW_YAW_RATE,
  MAX_POSITION_K,
  MAX_RIG_SPEED,
  approach,
  easeInOut,
  lerpAngle,
  positionSmoothing,
  smoothing,
} from '@app/camera/feel';

const DT = 1 / 60;
const DEG = Math.PI / 180;

/** The landscape profile the rig is built with before a size is known. */
const VIEW = cameraViewProfile(16 / 9).follow;

/**
 * The resting dead zone on the bearing error, at the default turning profile.
 * The bearing settles inside this of the direction of travel rather than on it,
 * so nothing here may assert that the rig arrives dead astern.
 */
const DEAD_ZONE = 20 * DEG;

/** The three fields a framing reads. The rest of Dog is not its business. */
function makeDog(x: number, z: number): Dog {
  return {
    position: { x, z },
    velocity: { x: 0, z: 0 },
    heading: { x: 0, z: 1 },
  } as unknown as Dog;
}

function run(framing: { update(dt: number, dog: Dog): void }, dog: Dog, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) framing.update(DT, dog);
}

describe('smoothing', () => {
  it('is frame-rate independent: two half steps equal one whole step', () => {
    const half = smoothing(DT / 2, 0.15);
    const whole = smoothing(DT, 0.15);
    expect(1 - (1 - half) * (1 - half)).toBeCloseTo(whole, 12);
  });

  it('holds the position blend under the posK cap on a long frame', () => {
    expect(positionSmoothing(1, 0.15)).toBe(MAX_POSITION_K);
    expect(positionSmoothing(DT, 0.15)).toBeLessThan(MAX_POSITION_K);
  });

  it('takes the short way around the angle wrap', () => {
    const result = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(result)).toBeGreaterThan(Math.PI - 0.05);
  });

  it('eases in and out of the mode blend', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBe(0.5);
    // Zero velocity at both ends is the point: the first tenth barely moves.
    expect(easeInOut(0.1)).toBeLessThan(0.05);
  });

  it('never moves a rig faster than MAX_RIG_SPEED', () => {
    const current = new THREE.Vector3(0, 0, 0);
    const desired = new THREE.Vector3(0, 0, 200);
    approach(current, desired, 1, DT);
    expect(current.z).toBeCloseTo(MAX_RIG_SPEED * DT, 9);
  });
});

describe('Classic framing', () => {
  it('seats on the first frame instead of flying in from the origin', () => {
    const classic = createClassicFraming();
    const dog = makeDog(10, -20);
    classic.update(DT, dog);
    expect(classic.position.x).toBe(10);
    // Elevated, south of the dog, aimed up-field toward the gate.
    expect(classic.position.y).toBeGreaterThan(20);
    expect(classic.position.z).toBeLessThan(dog.position.z);
    expect(classic.aim.z).toBeGreaterThan(dog.position.z);
  });

  it('never rotates: the offset is world-locked wherever the dog goes', () => {
    const classic = createClassicFraming();
    const first = makeDog(0, 0);
    classic.update(DT, first);
    const seated = classic.position.clone();

    const second = makeDog(60, 40);
    run(classic, second, 6);
    expect(classic.position.x - second.position.x).toBeCloseTo(seated.x - first.position.x, 3);
    expect(classic.position.y).toBeCloseTo(seated.y, 3);
    expect(classic.position.z - second.position.z).toBeCloseTo(seated.z - first.position.z, 3);
  });

  it('eases a run reset instead of cutting, and stays under the speed cap', () => {
    const classic = createClassicFraming();
    const atGate = makeDog(0, 95);
    run(classic, atGate, 4);

    // Reset: the dog is suddenly back at the spawn, 155 m away.
    const atSpawn = makeDog(-20, -60);
    let previous = classic.position.clone();
    let worst = 0;
    for (let i = 0; i < 60 * 8; i++) {
      classic.update(DT, atSpawn);
      worst = Math.max(worst, classic.position.distanceTo(previous));
      previous = classic.position.clone();
    }
    expect(worst).toBeLessThanOrEqual(MAX_RIG_SPEED * DT + 1e-9);
    // And it does arrive: eased, not stalled.
    expect(classic.position.x).toBeCloseTo(atSpawn.position.x, 2);
  });
});

describe('Follow framing', () => {
  it('glides through a distant reset and settles behind the new travel', () => {
    // This case used to turn the dog's HEADING around and assert where the rig
    // ended up. The bearing is driven by the dog's VELOCITY now, so a heading
    // change on a motionless dog is not a camera event at all and the old
    // assertion described a law that no longer exists. Drive the velocity.
    const follow = createFollowFraming();
    const dog = makeDog(90, 90);
    dog.velocity.z = 10;
    run(follow, dog, 2);
    dog.position.x = -20;
    dog.position.z = -60;
    dog.velocity.z = -10;
    dog.heading.z = -1;
    const previous = follow.position.clone();
    let largestStep = 0;
    for (let frame = 0; frame < 600; frame++) {
      follow.update(DT, dog);
      largestStep = Math.max(largestStep, follow.position.distanceTo(previous));
      previous.copy(follow.position);
    }
    // Orbit and translation may combine, but a reset must never cut directly
    // to the new dog position or move by a whole chase radius in one frame.
    expect(largestStep).toBeLessThan(5);

    run(follow, dog, 20);
    // The rig ends one chase radius back along its own bearing, and that
    // bearing has come round to within the dead zone of the way the dog runs.
    expect(Math.abs(follow.bearing - Math.PI)).toBeLessThan(DEAD_ZONE);
    expect(follow.position.x)
      .toBeCloseTo(dog.position.x - Math.sin(follow.bearing) * VIEW.distance, 3);
    expect(follow.position.z)
      .toBeCloseTo(dog.position.z - Math.cos(follow.bearing) * VIEW.distance, 3);
  });

  it('eases viewport changes after seating and reaches each framing', () => {
    const follow = createFollowFraming();
    const dog = makeDog(0, 0);
    run(follow, dog, 2);
    const datum: number[] = [];
    for (const aspect of [390 / 844, 16 / 9]) {
      const view = cameraViewProfile(aspect).follow;
      const previous = follow.position.clone();
      follow.setView(view);
      follow.update(DT, dog);
      expect(follow.position.distanceTo(previous)).toBeLessThan(1);
      run(follow, dog, 4);
      expect(follow.position.z).toBeCloseTo(-view.distance, 2);
      datum.push(follow.position.y - view.height);
    }
    // The elevation is measured from ONE world datum rather than from ground
    // sampled under the rig, so what is left over is the same number in both
    // orientations and it is the field's mean ground rather than a local one.
    expect(datum[0]!).toBeCloseTo(datum[1]!, 6);
    expect(Math.abs(datum[0]!)).toBeLessThan(0.1);
  });

  it('sits behind the dog, low, on the heading', () => {
    const follow = createFollowFraming();
    const dog = makeDog(0, 0);
    run(follow, dog, 3);

    const behind = new THREE.Vector3(
      follow.position.x - dog.position.x,
      0,
      follow.position.z - dog.position.z,
    );
    // Heading is +z, so the rig is at -z: dot with the heading is negative.
    expect(behind.z).toBeLessThan(0);
    expect(behind.x).toBeCloseTo(0, 6);
    // Elevated, but nothing like the Classic overhead. The height is what buys
    // the drop in ground optic flow; going further costs the horizon.
    expect(follow.position.y).toBeGreaterThan(12);
    expect(follow.position.y).toBeLessThan(18);
  });

  it('arcs the rig around a turn at its cap rather than snapping it', () => {
    const follow = createFollowFraming();
    const dog = makeDog(0, 0);
    dog.velocity.z = 15;
    run(follow, dog, 3);
    const beforeTurn = follow.position.clone();

    // A right-angle turn, as a change of the direction the dog is TRAVELLING.
    dog.velocity.x = 15;
    dog.velocity.z = 0;

    // One yaw tau in: well off the old position, and nowhere near the new
    // bearing, because across a 90 degree error it is the cap that binds rather
    // than the lag. 0.35 s of cap, exactly.
    run(follow, dog, 0.35);
    expect(follow.position.distanceTo(beforeTurn)).toBeGreaterThan(1);
    expect(follow.bearing).toBeCloseTo(MAX_FOLLOW_YAW_RATE * 0.35, 6);

    // Given time it comes round behind the dog, stopping inside the dead zone
    // of dead astern rather than arriving on it.
    run(follow, dog, 20);
    expect(Math.abs(follow.bearing - Math.PI / 2)).toBeLessThan(DEAD_ZONE);
    expect(follow.position.x)
      .toBeCloseTo(dog.position.x - Math.sin(follow.bearing) * VIEW.distance, 3);
    expect(follow.position.z)
      .toBeCloseTo(dog.position.z - Math.cos(follow.bearing) * VIEW.distance, 3);
  });

  it('holds the look-ahead at a fixed distance instead of scaling it by speed', () => {
    // The look-ahead used to be scaled by a smoothed speed, which made it a
    // second rotating quantity stacked on the orbit. It is a fixed framing
    // offset along the rig's own bearing now, so it costs no rotation at all
    // and does not move when the dog starts or stops.
    const follow = createFollowFraming();
    const dog = makeDog(0, 0);
    run(follow, dog, 3);
    const ahead = VIEW.distance + VIEW.lookAhead;
    expect(follow.aim.z - follow.position.z).toBeCloseTo(ahead, 6);
    expect(follow.aim.x - follow.position.x).toBeCloseTo(0, 6);

    dog.velocity.z = 25;
    run(follow, dog, 3);
    expect(follow.aim.z - follow.position.z).toBeCloseTo(ahead, 6);

    dog.velocity.z = 0;
    run(follow, dog, 3);
    expect(follow.aim.z - follow.position.z).toBeCloseTo(ahead, 6);
  });

  it('uses a wider, higher follow view only in portrait', () => {
    const landscape = cameraViewProfile(16 / 9);
    const portrait = cameraViewProfile(390 / 844);
    expect(landscape).toMatchObject({
      fov: 45,
      portraitBlend: 0,
      follow: { distance: 26, height: 14, lookAhead: 4 },
    });
    expect(portrait.fov).toBeGreaterThan(74);
    expect(portrait.follow.distance).toBeGreaterThan(landscape.follow.distance);
    expect(portrait.follow.height).toBeGreaterThan(landscape.follow.height);
    // Both orientations share a pitch, so distance and height scale together.
    expect(portrait.follow.distance / portrait.follow.height)
      .toBeCloseTo(landscape.follow.distance / landscape.follow.height, 9);
    // A tall frame needs less downward bias, so the look-ahead is set shorter
    // rather than scaled with the pair above.
    expect(portrait.follow.lookAhead).toBeLessThan(landscape.follow.lookAhead);
  });

  it('keeps the dog inside portrait framing through a fast right-angle turn', () => {
    const aspect = 390 / 844;
    const view = cameraViewProfile(aspect);
    const follow = createFollowFraming(view.follow);
    const dog = makeDog(0, 0);
    dog.velocity.z = 25;
    run(follow, dog, 2);

    const camera = new THREE.PerspectiveCamera(view.fov, aspect, 0.5, 1200);
    const dogPoint = new THREE.Vector3();
    let worstHorizontal = 0;
    for (let frame = 0; frame < 90; frame++) {
      dog.heading.x = 1;
      dog.heading.z = 0;
      dog.velocity.x = 25;
      dog.velocity.z = 0;
      dog.position.x += dog.velocity.x * DT;
      follow.update(DT, dog);
      camera.position.copy(follow.position);
      camera.lookAt(follow.aim);
      camera.updateMatrixWorld(true);
      dogPoint.set(dog.position.x, 1.1, dog.position.z).project(camera);
      worstHorizontal = Math.max(worstHorizontal, Math.abs(dogPoint.x));
    }
    expect(worstHorizontal).toBeLessThan(0.82);
  });
});
