// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 118 Phase 6 - the capture's framing maths.
 *
 * The `shore-out` pose was broken in a way no browser run could report: both
 * frames rendered perfectly, they just did not contain their subject. On
 * Rolling Hills the camera stands on ground 12.7 m up, 12 m inland of the
 * waterline, and the pose aimed at a point 150 m out to sea. That is a
 * 5.4-degree downward pitch against a shoreline sitting 50.9 degrees below
 * horizontal, so the shoreline fell far under the bottom of frame and two of
 * that scene's four frames came back as duplicates of `open-water`. Rolling
 * Hills is the scene most players see first.
 *
 * These specs run the real geometry off-browser, against numbers read out of
 * the Phase 1 before-report, so the failure has somewhere to be caught. Both
 * fail against the pre-Phase-6 tool - recorded in the plan.
 */
import { describe, expect, it } from 'vitest';

import {
  SHORE_OUT_PITCH,
  SHORE_OUT_STANDOFF,
  buildWaterPoses,
  paletteHistogramFromPixels,
  shorelineIsInFrame,
} from '../tools/validation/water-look.mjs';

/** js/SceneManager.js constructs the gameplay camera at 75 degrees vertical. */
const VERTICAL_FOV_DEG = 75;

/**
 * Geometry as the Phase 1 before-capture measured it. Rolling Hills is the
 * hard case (a cliff coast); Newsheepdogland is the soft one (a 3 m shelf and
 * near-sea-level ground), and the solve has to hold at both ends.
 */
function shoreFixture({ groundYAtOutCam, waterY = -0.05 }) {
  return {
    waterY,
    frame: {
      P: { x: 0, z: -180 },
      D: { x: 0, z: -1 },
      T: { x: 1, z: 0 },
      alongOut: 8,
      openOut: 130,
      cameras: {
        out: { x: 0, z: -180 + SHORE_OUT_STANDOFF, groundY: groundYAtOutCam },
        along: { x: -70, z: -188, groundY: -12 },
        wide: { x: 0, z: -70, groundY: 57.1 },
        open: { x: 0, z: -310, groundY: -12 },
      },
    },
  };
}

describe('the shore-out pose frames the shore', () => {
  it('keeps the shoreline and the horizon in frame on a cliff coast', () => {
    // Rolling Hills, measured: ground 12.717 m at the shore-out camera, so the
    // camera lands at 14.717 and the waterline is 50.9 degrees below it.
    const poses = buildWaterPoses(shoreFixture({ groundYAtOutCam: 12.717 }));
    const shoreOut = poses.find((pose) => pose.id === 'shore-out');
    expect(shoreOut.pos.y).toBeCloseTo(14.717, 3);
    expect(shoreOut.framing.depressionToShoreDeg).toBeCloseTo(50.9, 0);

    // Measured off the pose's own camera and target, so an aim that goes
    // somewhere other than where the pitch solve says fails here.
    const framing = shorelineIsInFrame(shoreOut, VERTICAL_FOV_DEG);
    expect(framing.shorelineInFrame).toBe(true);
    expect(framing.horizonInFrame).toBe(true);
    // The bisector: both land the same angular distance from frame centre.
    expect(framing.shorelineBelowAxisDeg).toBeCloseTo(framing.horizonAboveAxisDeg, 3);
    expect(framing.horizonAboveAxisDeg).toBeCloseTo(shoreOut.framing.pitchDeg, 3);

    // The old pose aimed 150 m out from the crossing point. Same camera, that
    // target, and the shoreline is 45 degrees below the axis - outside a
    // 37.5-degree half-frame. This is what the before-capture photographed.
    const legacy = shorelineIsInFrame({
      ...shoreOut,
      target: {
        x: shoreOut.pos.x + 0 * (150 + SHORE_OUT_STANDOFF),
        y: -0.05 + 0.6,
        z: shoreOut.pos.z - (150 + SHORE_OUT_STANDOFF),
      },
    }, VERTICAL_FOV_DEG);
    expect(legacy.shorelineBelowAxisDeg).toBeGreaterThan(VERTICAL_FOV_DEG / 2);
    expect(legacy.shorelineInFrame).toBe(false);
  });

  it('does not over-tilt a camera that is already near sea level', () => {
    // Newsheepdogland: essentially flat ground at the waterline, so the camera
    // sits on the eye-height floor and the shoreline is only 9.7 degrees down.
    const poses = buildWaterPoses(shoreFixture({ groundYAtOutCam: -0.4 }));
    const shoreOut = poses.find((pose) => pose.id === 'shore-out');
    expect(shoreOut.pos.y).toBeCloseTo(-0.05 + SHORE_OUT_PITCH.eyeAboveWater, 3);

    const framing = shorelineIsInFrame(shoreOut, VERTICAL_FOV_DEG);
    expect(framing.shorelineInFrame).toBe(true);
    expect(framing.horizonInFrame).toBe(true);
    expect(framing.horizonAboveAxisDeg).toBeGreaterThanOrEqual(SHORE_OUT_PITCH.minDeg);
    expect(framing.horizonAboveAxisDeg).toBeLessThan(10);
    // The aim point stays out to sea rather than swinging back over the land.
    expect(shoreOut.framing.aimDistance).toBeGreaterThan(SHORE_OUT_STANDOFF);
  });

  it('aims every pose at the water and leaves the other three unmoved', () => {
    const poses = buildWaterPoses(shoreFixture({ groundYAtOutCam: 12.717 }));
    expect(poses.map((pose) => pose.id))
      .toEqual(['shore-out', 'shore-along', 'water-wide', 'open-water']);
    // The pitch fix is scoped to shore-out; the other three framings were
    // correct in the before-capture and must not have drifted with it.
    expect(poses[1].pos.y).toBeCloseTo(2.55, 3);
    expect(poses[2].pos.y).toBeCloseTo(107.1, 3);
    expect(poses[3].pos.y).toBeCloseTo(3.15, 3);
  });
});

describe('the palette histogram answers "is it still cobalt"', () => {
  const solid = (r, g, b, count = 400) => {
    const pixels = new Uint8Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      pixels[i * 3] = r;
      pixels[i * 3 + 1] = g;
      pixels[i * 3 + 2] = b;
    }
    return pixels;
  };

  it('scores the retired deep blue as cobalt and the new one as not', () => {
    // #002477, the shipped deep water through the tone curve with colorTint.
    const before = paletteHistogramFromPixels(solid(0x00, 0x24, 0x77), 3);
    expect(before.cobaltFraction).toBe(1);

    // #214c5f, the same depth through the pastoral palette.
    const after = paletteHistogramFromPixels(solid(0x21, 0x4c, 0x5f), 3);
    expect(after.cobaltFraction).toBe(0);
    expect(after.topBuckets[0].hue).toBe('180-210');

    // The saturation gate is what separates a cobalt sea from a pale blue sky
    // or a fogged horizon. #7f97a8 is squarely inside the blue hue wedge at
    // 205 degrees and must not score, or every dusk frame reads as cobalt
    // because of its own sky.
    const paleSky = paletteHistogramFromPixels(solid(0x7f, 0x97, 0xa8), 3);
    expect(paleSky.topBuckets[0].hue).toBe('180-210');
    expect(paleSky.cobaltFraction).toBe(0);
  });

  it('is insensitive to ripple phase, which is why it is not SSIM', () => {
    // Two frames of the same water with the light and dark halves swapped:
    // structurally different, identically coloured. SSIM would call this a
    // regression; the histogram correctly reports no palette change.
    const half = 200;
    const build = (first, second) => {
      const pixels = new Uint8Array(half * 2 * 3);
      for (let i = 0; i < half * 2; i += 1) {
        const [r, g, b] = i < half ? first : second;
        pixels[i * 3] = r;
        pixels[i * 3 + 1] = g;
        pixels[i * 3 + 2] = b;
      }
      return pixels;
    };
    const crestFirst = paletteHistogramFromPixels(build([0x3a, 0x6d, 0x77], [0x21, 0x4c, 0x5f]), 3);
    const troughFirst = paletteHistogramFromPixels(build([0x21, 0x4c, 0x5f], [0x3a, 0x6d, 0x77]), 3);
    expect(crestFirst.meanRgb).toEqual(troughFirst.meanRgb);
    expect(crestFirst.cobaltFraction).toBe(troughFirst.cobaltFraction);
    expect(crestFirst.topBuckets).toEqual(troughFirst.topBuckets);
  });
});
