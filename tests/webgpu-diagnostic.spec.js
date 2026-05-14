import { describe, expect, it } from 'vitest';

import { createSkyFogDiagnosticState } from '../js/diagnostics/webgpuDiagnostic.js';

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
});
