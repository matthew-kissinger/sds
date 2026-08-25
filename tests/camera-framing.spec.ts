// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The camera's promises, pinned without a renderer: both framings are plain
 * functions of the dog's sim state, so they run in node.
 *
 * What is worth pinning is not the framing numbers (those are art direction and
 * will move) but the properties the rest of the game leans on: Classic never
 * rotates, Follow sits behind the dog and leads with speed, the smoothing is
 * frame-rate independent, and nothing the camera does can cover ground faster
 * than MAX_RIG_SPEED - which is the "never jumps" promise in a form a test can
 * check.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import type { Dog } from '@sim/types';
import { createClassicFraming } from '@app/camera/classicFraming';
import { createFollowFraming } from '@app/camera/followFraming';
import { cameraViewProfile } from '@app/camera/viewProfile';
import {
  MAX_POSITION_K,
  MAX_RIG_SPEED,
  approach,
  easeInOut,
  lerpAngle,
  positionSmoothing,
  smoothing,
} from '@app/camera/feel';

const DT = 1 / 60;

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
    // Low and cinematic, not the Classic height.
    expect(follow.position.y).toBeGreaterThan(3);
    expect(follow.position.y).toBeLessThan(12);
  });

  it('lags the yaw: a turn arcs the rig around rather than snapping it', () => {
    const follow = createFollowFraming();
    const dog = makeDog(0, 0);
    run(follow, dog, 3);
    const beforeTurn = follow.position.clone();

    dog.heading.x = 1;
    dog.heading.z = 0;
    const settledDistance = beforeTurn.distanceTo(
      new THREE.Vector3(dog.position.x, beforeTurn.y, dog.position.z),
    );

    // One yaw tau in: well off the old position, still short of the new one.
    run(follow, dog, 0.35);
    expect(follow.position.distanceTo(beforeTurn)).toBeGreaterThan(1);
    expect(follow.position.x).toBeGreaterThan(-settledDistance + 1);

    // Given time it does come round behind the dog on the new heading.
    run(follow, dog, 4);
    expect(follow.position.x).toBeCloseTo(dog.position.x - settledDistance, 1);
    expect(follow.position.z).toBeCloseTo(dog.position.z, 1);
  });

  it('leads the aim with speed and drops the lead when the dog stops', () => {
    const follow = createFollowFraming();
    const dog = makeDog(0, 0);
    run(follow, dog, 3);
    expect(follow.aim.z).toBeCloseTo(dog.position.z, 1);

    dog.velocity.z = 25;
    run(follow, dog, 3);
    const sprinting = follow.aim.z;
    expect(sprinting).toBeGreaterThan(dog.position.z + 3);

    dog.velocity.z = 0;
    run(follow, dog, 3);
    expect(follow.aim.z).toBeLessThan(sprinting);
    expect(follow.aim.z).toBeCloseTo(dog.position.z, 1);
  });

  it('uses a wider, higher follow view only in portrait', () => {
    const landscape = cameraViewProfile(16 / 9);
    const portrait = cameraViewProfile(390 / 844);
    expect(landscape).toMatchObject({
      fov: 45,
      portraitBlend: 0,
      follow: { distance: 20, height: 7.5, lookAhead: 7 },
    });
    expect(portrait.fov).toBeGreaterThan(74);
    expect(portrait.follow.distance).toBeGreaterThan(23.5);
    expect(portrait.follow.height).toBeGreaterThan(10);
    expect(portrait.follow.lookAhead).toBeLessThan(5);
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
