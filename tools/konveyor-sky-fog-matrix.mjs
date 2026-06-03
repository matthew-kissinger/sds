// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { createSkyFogSamplePacket } from '../js/atmosphere/skyFogSamplePacket.js';
import {
  getRequiredPresetNames,
  SKY_PRESETS,
} from '../js/atmosphere/skyPresets.js';

const outPath = process.argv[2] ?? 'cycle36-validation/runtime/sky-fog-preset-matrix.json';

function rounded(value) {
  return Number(value.toFixed(6));
}

const presets = getRequiredPresetNames().map((presetName) => {
  const preset = SKY_PRESETS[presetName];
  const packet = createSkyFogSamplePacket({ presetName });
  return {
    presetName,
    label: preset.label,
    sunElevationRad: rounded(preset.sunElevationRad),
    sunAzimuthRad: rounded(preset.sunAzimuthRad),
    fogDensity: preset.fogDensity,
    cloudCoverageDefault: packet.cloudCoverage,
    packet,
  };
});

const matrix = {
  capturedAt: new Date().toISOString(),
  source: 'HosekWilkieSky.cpu-lut',
  contract: 'renderless-sky-fog-preset-matrix',
  presetCount: presets.length,
  presets,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(matrix, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, outPath, presetCount: presets.length }));
