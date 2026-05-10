import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FOAM_THICKNESS,
  WATER_PALETTE_RGB,
  computeShorelineMetrics,
  isNearFoamWhiteRgb,
  mixWaterBaseColor,
} from '../js/water/AnimeWater.js';

describe('AnimeWater shoreline field', () => {
  const boundaryRadius = 180;
  const boundaryFalloff = 40;

  it('allows foam at the circular shoreline', () => {
    const metrics = computeShorelineMetrics({
      x: boundaryRadius,
      z: 0,
      boundaryRadius,
      boundaryFalloff,
    });

    expect(metrics.distanceFromShore).toBe(0);
    expect(metrics.foamMask).toBe(1);
  });

  it('does not classify water beyond the foam band as foam-white', () => {
    const metrics = computeShorelineMetrics({
      x: boundaryRadius + DEFAULT_FOAM_THICKNESS + 6,
      z: 0,
      boundaryRadius,
      boundaryFalloff,
    });
    const rgb = mixWaterBaseColor(metrics.depthT);

    expect(metrics.foamMask).toBe(0);
    expect(isNearFoamWhiteRgb(rgb)).toBe(false);
  });

  it('trends toward the deep color across the scene boundary falloff', () => {
    const metrics = computeShorelineMetrics({
      x: boundaryRadius + boundaryFalloff,
      z: 0,
      boundaryRadius,
      boundaryFalloff,
    });
    const rgb = mixWaterBaseColor(metrics.depthT);

    expect(metrics.depthT).toBe(1);
    for (let index = 0; index < 3; index += 1) {
      expect(Math.abs(rgb[index] - WATER_PALETTE_RGB.deep[index])).toBeLessThanOrEqual(6);
    }
  });
});
