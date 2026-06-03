// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';

import { HosekWilkieSky } from '../js/atmosphere/HosekWilkieSky.js';
import {
  getRequiredPresetNames,
  SKY_PRESETS,
} from '../js/atmosphere/skyPresets.js';

const outPath = process.argv[2] ?? 'cycle36-validation/runtime/sky-lut-profile.json';
const BAKE_ITERATIONS = 80;
const SAMPLE_BATCHES = 80;
const SAMPLE_DIRECTIONS = 1024;

function rounded(value) {
  return Number(value.toFixed(4));
}

function summarize(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    minMs: rounded(Math.min(...values)),
    maxMs: rounded(Math.max(...values)),
    avgMs: rounded(total / values.length),
  };
}

function createDirections(count) {
  const directions = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * (i + 0.5)) / count;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * goldenAngle;
    directions.push(new THREE.Vector3(
      Math.cos(theta) * radius,
      y,
      Math.sin(theta) * radius
    ));
  }
  return directions;
}

function profilePreset(presetName, directions) {
  const preset = SKY_PRESETS[presetName];
  const sky = new HosekWilkieSky({ createRenderable: false });
  const color = new THREE.Color();
  const bakeTimes = [];
  const sampleTimes = [];

  try {
    sky.applyPreset(preset);
    sky.setCloudCoverage(preset.cloudCoverageDefault ?? 0);
    if (preset.cloudScaleMetersPerFeature !== undefined) {
      sky.setCloudFeatureScaleMeters(preset.cloudScaleMetersPerFeature);
    }
    sky.update(0, sky.getSunDirection());

    for (let i = 0; i < BAKE_ITERATIONS; i++) {
      const started = performance.now();
      sky.bakeLUT();
      bakeTimes.push(performance.now() - started);
    }

    for (let i = 0; i < SAMPLE_BATCHES; i++) {
      const started = performance.now();
      for (const direction of directions) {
        sky.sample(direction, color);
      }
      sampleTimes.push(performance.now() - started);
    }

    return {
      presetName,
      label: preset.label,
      bakeIterations: BAKE_ITERATIONS,
      sampleBatches: SAMPLE_BATCHES,
      sampleDirections: directions.length,
      lutEntries: sky.lut.length / 3,
      bake: summarize(bakeTimes),
      sampleBatch: summarize(sampleTimes),
      samplePerDirectionAvgUs: rounded((summarize(sampleTimes).avgMs * 1000) / directions.length),
    };
  } finally {
    sky.dispose();
  }
}

const directions = createDirections(SAMPLE_DIRECTIONS);
const presets = getRequiredPresetNames().map((presetName) => profilePreset(presetName, directions));
const worstBake = Math.max(...presets.map((preset) => preset.bake.maxMs));
const worstSampleBatch = Math.max(...presets.map((preset) => preset.sampleBatch.maxMs));

const profile = {
  capturedAt: new Date().toISOString(),
  contract: 'konveyor-sky-lut-profile',
  source: 'HosekWilkieSky.renderless-cpu-lut',
  lutShape: {
    entries: presets[0]?.lutEntries ?? null,
    channels: 3,
  },
  methodology: {
    bakeIterations: BAKE_ITERATIONS,
    sampleBatches: SAMPLE_BATCHES,
    sampleDirections: SAMPLE_DIRECTIONS,
    directions: 'deterministic-fibonacci-sphere',
  },
  verdict: {
    currentStatus: 'not-a-measured-bottleneck',
    reason: 'The current CPU-visible LUT is small, rebakes only on dirty sky state, and remains the atmosphere handoff authority for fog, sun, water, grass, rocks, and impostors.',
    gpuLutCandidate: 'only-if-production-profile-shows-lut-cost-or-parity-drift',
  },
  worstCase: {
    bakeMaxMs: rounded(worstBake),
    sampleBatchMaxMs: rounded(worstSampleBatch),
  },
  presets,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(profile, null, 2)}\n`);
console.log(JSON.stringify({
  ok: true,
  outPath,
  presetCount: presets.length,
  worstCase: profile.worstCase,
}));
