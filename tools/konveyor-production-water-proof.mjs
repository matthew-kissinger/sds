// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listScenes } from '../shared/scenes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_MANIFEST = 'cycle36-validation/runtime/scene-sky-screenshots/manifest.json';
const DEFAULT_OUT = 'cycle36-validation/runtime/production-water-adapter-proof.json';

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

async function run() {
  const args = parseArgs(process.argv);
  const manifest = await readJson(args.manifest);
  const expectedSceneIds = listScenes().map((scene) => scene.id).sort();
  const capturedSceneIds = manifest.scenes.map((scene) => scene.sceneId).sort();

  const scenes = manifest.scenes.map((scene) => {
    const proof = scene.productionWaterAdapter ?? null;
    const checks = {
      rendererMode: scene.rendererMode?.effective === 'webgpu-diagnostic',
      sceneBinding: scene.sceneBinding?.sceneId === scene.sceneId,
      diagnosticOk: (scene.frames ?? 0) >= 3
        && scene.consoleErrors?.length === 0
        && scene.pageErrors?.length === 0,
      productionWaterOk: proof?.ok === true,
      proofSceneMatches: proof?.sceneId === scene.sceneId,
      waterSourcePinnedToHeightfieldScene: proof?.waterSourceSceneId === 'rolling-hills',
      factoryApplied: proof?.summary?.applied === true,
      nodeMaterial: proof?.materialName === 'konveyor-node-anime-water'
        && proof?.isNodeMaterial === true,
      meshIsProductionPlane: proof?.mesh?.geometryType === 'PlaneGeometry'
        && proof?.mesh?.segments === 4,
      heightfieldBacked: proof?.heightfield?.sceneId === 'rolling-hills'
        && proof?.heightfield?.source === '/terrain/rolling-hills.bin'
        && proof?.heightfield?.size?.[0] === 1024
        && proof?.heightfield?.size?.[1] === 1024
        && proof?.heightfield?.worldSize === 500
        && proof?.heightfield?.peakHeight === 6
        && proof?.heightfield?.waterY === -0.05
        && proof?.heightfield?.rawArrayType === 'Float32Array'
        && proof?.heightfield?.rawArrayLength === 1024 * 1024,
      checksPassed: proof?.checks
        && Object.values(proof.checks).every(Boolean),
    };

    return {
      sceneId: scene.sceneId,
      productionWaterAdapter: proof,
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
    source: 'Konveyor production AnimeWater adapter proof',
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
    throw new Error('production water adapter proof did not satisfy gates');
  }
}

run().catch((error) => {
  console.error('[PRODUCTION-WATER-PROOF] fatal:', error);
  process.exit(1);
});
