// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listScenes } from '../shared/scenes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_MANIFEST = 'cycle36-validation/runtime/scene-sky-screenshots/manifest.json';
const DEFAULT_OUT = 'cycle36-validation/runtime/production-atmosphere-adapter-proof.json';

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    out: DEFAULT_OUT,
  };

  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = match[2];
  }

  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
}

function arraysNear(a, b, tolerance = 0.0004) {
  return Array.isArray(a)
    && Array.isArray(b)
    && a.length === b.length
    && a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
}

async function run() {
  const args = parseArgs(process.argv);
  const manifest = await readJson(args.manifest);
  const expectedSceneIds = listScenes().map((scene) => scene.id).sort();
  const capturedSceneIds = manifest.scenes.map((scene) => scene.sceneId).sort();

  const scenes = manifest.scenes.map((scene) => {
    const proof = scene.productionAtmosphereAdapter ?? null;
    const checks = {
      rendererMode: scene.rendererMode?.effective === 'webgpu-diagnostic',
      sceneBinding: scene.sceneBinding?.sceneId === scene.sceneId,
      diagnosticOk: (scene.frames ?? 0) >= 3
        && scene.consoleErrors?.length === 0
        && scene.pageErrors?.length === 0,
      productionAtmosphereOk: proof?.ok === true,
      proofSceneMatches: proof?.sceneId === scene.sceneId,
      proofPresetMatches: proof?.presetName === scene.skyFog?.presetName,
      skyFactoryApplied: proof?.sky?.summary?.applied === true,
      cloudFactoryApplied: proof?.cloud?.summary?.applied === true,
      skyNodeMaterial: proof?.sky?.materialName === 'konveyor-node-sky-dome'
        && proof?.sky?.isNodeMaterial === true,
      cloudNodeMaterial: proof?.cloud?.materialName === 'konveyor-node-cloud-layer'
        && proof?.cloud?.isNodeMaterial === true,
      cloudControlsConnected: proof?.cloud?.hasControls === true,
      linearFogPreserved: proof?.fog?.kind === 'Fog'
        && proof?.fog?.near === scene.sceneBinding?.fog?.near
        && proof?.fog?.far === scene.sceneBinding?.fog?.far,
      fogColorMatchesSkyFogPacket: arraysNear(proof?.fog?.color, scene.skyFog?.fogColor),
    };

    return {
      sceneId: scene.sceneId,
      presetName: scene.skyFog?.presetName ?? null,
      productionAtmosphereAdapter: proof,
      checks,
      ok: Object.values(checks).every(Boolean),
    };
  });

  const crossSceneChecks = {
    sceneSetMatchesShippingScenes: JSON.stringify(capturedSceneIds) === JSON.stringify(expectedSceneIds),
    manifestOk: manifest.ok === true,
  };

  const result = {
    capturedAt: new Date().toISOString(),
    source: 'Konveyor production atmosphere adapter proof',
    manifest: args.manifest,
    crossSceneChecks,
    scenes,
    ok: Object.values(crossSceneChecks).every(Boolean) && scenes.every((scene) => scene.ok),
  };

  const outPath = resolve(ROOT, args.out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    throw new Error('production atmosphere adapter proof did not satisfy gates');
  }
}

run().catch((error) => {
  console.error('[PRODUCTION-ATMOSPHERE-PROOF] fatal:', error);
  process.exit(1);
});
