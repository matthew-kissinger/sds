// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';

import { createSceneFogHorizonProof } from '../js/diagnostics/konveyorSceneFogHorizonProof.js';

describe('konveyor scene fog horizon proof', () => {
  it('records shipped scene fog against the Atmosphere horizon color contract', () => {
    const proof = createSceneFogHorizonProof();

    expect(proof).toMatchObject({
      source: 'Atmosphere scene fog/horizon proof',
      sceneCount: 4,
      ok: true,
    });
    expect(proof.scenes.map((scene) => scene.sceneId)).toEqual([
      'field',
      'rolling-hills',
      'open-country',
      'newsheepdogland',
    ]);

    for (const scene of proof.scenes) {
      expect(scene.ok).toBe(true);
      expect(scene.source).toBe('shared/scenes + Atmosphere');
      expect(scene.fog.type).toBe('Fog');
      expect(scene.fog.near).toBe(scene.sceneFog.near);
      expect(scene.fog.far).toBe(scene.sceneFog.far);
      expect(scene.fog.color).toEqual(scene.horizonColor);
      expect(scene.cloudCoverage).toBe(scene.expectedCoverage);
      expect(scene.cloudLayerCoverage).toBe(scene.expectedCoverage);
      expect(scene.checks).toEqual({
        presetResolved: true,
        sceneFogType: true,
        sceneFogNearMatches: true,
        sceneFogFarMatches: true,
        fogColorTracksHorizon: true,
        skyCloudCoverageMatchesPreset: true,
        cloudLayerCoverageMatchesPreset: true,
      });
    }
  });
});
