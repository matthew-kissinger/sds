// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The Follow rig's line-of-sight floor (spec/06: sample 7 points camera-to-dog,
 * clamp Y above max + clearance). What it promises, in the order the promises
 * matter:
 *
 *  - a rise BETWEEN the rig and the dog lifts the rig,
 *  - a rise AT the dog does not (that is the thing being looked at),
 *  - the lift is instant, so the rig never spends a frame inside a hill,
 *  - the drop is eased, so cresting a rise glides instead of falling.
 *
 * Driven with a shaped ground rather than the baked field, so a change to the
 * terrain recipe never quietly makes this test vacuous.
 */

import { describe, expect, it } from 'vitest';
import { createRidgeClamp } from '@app/camera/ridgeClamp';

const DT = 1 / 60;
/** Rig 20 m behind the dog, the Follow distance. */
const CAMERA = { x: 0, z: 0 };
const DOG = { x: 0, z: 20 };

const clampOnce = (
  ground: (x: number, z: number) => number,
  cameraY: number,
): number => createRidgeClamp(ground).clamp(cameraY, CAMERA.x, CAMERA.z, DOG.x, DOG.z, DT);

describe('ridge clamp', () => {
  it('holds a clearance above flat ground and never pushes the rig down', () => {
    const flat = () => 0;
    expect(clampOnce(flat, 7.5)).toBe(7.5);
    const floor = clampOnce(flat, 0);
    expect(floor).toBeGreaterThan(1.5);
    expect(floor).toBeLessThan(3);
  });

  it('lifts the rig over a rise between it and the dog', () => {
    // A 4 m crest at the midpoint of the sight line.
    const crest = (_x: number, z: number) => (z > 8 && z < 12 ? 4 : 0);
    // A rig low enough that the crest is genuinely in the way.
    const lifted = clampOnce(crest, 3);
    expect(lifted).toBeGreaterThan(4);
    // Above the crest by the same clearance it holds over flat ground.
    expect(lifted - 4).toBeCloseTo(clampOnce(() => 0, 0), 9);
    // A rig already well clear of the crest is left exactly where it was.
    expect(clampOnce(crest, 7.5)).toBe(7.5);
  });

  it('follows the ground under the rig itself', () => {
    const shelf = (_x: number, z: number) => (z < 2 ? 5 : 0);
    expect(clampOnce(shelf, 3)).toBeGreaterThan(5);
  });

  it('ignores a rise at the dog: that is what we are looking at', () => {
    // Ground only at the dog's own position, which is the endpoint the sampler
    // skips. A rig lifted by this would rise for no occlusion at all.
    const atDog = (_x: number, z: number) => (z >= 19.5 ? 30 : 0);
    expect(clampOnce(atDog, 7.5)).toBe(7.5);
  });

  it('samples seven interior points, so a narrow ridge cannot slip between', () => {
    const hits: number[] = [];
    const record = (_x: number, z: number) => {
      hits.push(z);
      return 0;
    };
    clampOnce(record, 7.5);
    // One under the rig plus seven on the segment.
    expect(hits).toHaveLength(8);
    expect(hits[0]).toBe(0);
    const interior = hits.slice(1);
    expect(interior).toEqual([2.5, 5, 7.5, 10, 12.5, 15, 17.5]);
    // Strict interior: neither endpoint is among them.
    expect(interior).not.toContain(0);
    expect(interior).not.toContain(20);
  });

  it('snaps up instantly and eases down over the position tau', () => {
    let height = 6;
    const ground = (_x: number, z: number) => (z > 8 && z < 12 ? height : 0);
    const ridge = createRidgeClamp(ground);

    // Seat on flat, then raise a ridge: the very next frame is already clear.
    height = 0;
    ridge.clamp(3, CAMERA.x, CAMERA.z, DOG.x, DOG.z, DT);
    height = 6;
    const risen = ridge.clamp(3, CAMERA.x, CAMERA.z, DOG.x, DOG.z, DT);
    expect(risen).toBeGreaterThan(6);

    // Drop the ridge: the floor comes down over several frames, not one.
    height = 0;
    const afterOneFrame = ridge.clamp(3, CAMERA.x, CAMERA.z, DOG.x, DOG.z, DT);
    expect(afterOneFrame).toBeLessThan(risen);
    expect(afterOneFrame).toBeGreaterThan(5);

    for (let i = 0; i < 120; i++) ridge.clamp(3, CAMERA.x, CAMERA.z, DOG.x, DOG.z, DT);
    // And it does arrive: eased, not stalled. Read from a rig on the deck, so
    // what comes back is the floor rather than the rig's own height.
    expect(ridge.clamp(0, CAMERA.x, CAMERA.z, DOG.x, DOG.z, DT)).toBeCloseTo(
      clampOnce(() => 0, 0),
      3,
    );
  });
});
