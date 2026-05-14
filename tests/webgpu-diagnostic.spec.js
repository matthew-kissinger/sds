import { describe, expect, it } from 'vitest';

import {
  createRockRimDiagnosticState,
  createSkyFogDiagnosticState,
} from '../js/diagnostics/webgpuDiagnostic.js';

describe('webgpu diagnostic sky fog state', () => {
  it('keeps fog color derived from the CPU horizon sample', () => {
    const state = createSkyFogDiagnosticState();
    expect(state.horizonColor).toHaveLength(3);
    expect(state.sunColor).toHaveLength(3);
    expect(state.fogColor).toEqual(
      state.horizonColor.map((v) => Number((v * state.fogDarkenMultiplier).toFixed(4)))
    );
    expect(state.fogNear).toBeLessThan(state.fogFar);
  });

  it('drives the diagnostic rock rim from the CPU sun color packet', () => {
    const skyFog = createSkyFogDiagnosticState();
    const rockRim = createRockRimDiagnosticState(skyFog);
    expect(rockRim.rimColor).toBe(skyFog.sunColor);
    expect(rockRim.sunColorSource).toBe('skyFog.sunColor');
    expect(rockRim.rimStrength).toBeGreaterThan(0);
    expect(rockRim.rimPower).toBeGreaterThan(1);
  });
});
