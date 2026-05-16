import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listScenes } from '../shared/scenes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_MANIFEST = 'cycle36-validation/runtime/scene-sky-screenshots/manifest.json';
const DEFAULT_OUT = 'cycle36-validation/runtime/production-sheep-adapter-proof.json';

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
    const proof = scene.productionSheepAdapter ?? null;
    const attrs = proof?.geometry?.attributes ?? [];
    const checks = {
      rendererMode: scene.rendererMode?.effective === 'webgpu-diagnostic',
      sceneBinding: scene.sceneBinding?.sceneId === scene.sceneId,
      diagnosticOk: (scene.frames ?? 0) >= 3
        && scene.consoleErrors?.length === 0
        && scene.pageErrors?.length === 0,
      productionSheepOk: proof?.ok === true,
      proofSceneMatches: proof?.sceneId === scene.sceneId,
      factoryApplied: proof?.summary?.applied === true,
      nodeMaterial: proof?.materialName === 'konveyor-node-sheep-wool'
        && proof?.isNodeMaterial === true,
      instancedMesh: proof?.mesh?.isInstancedMesh === true
        && proof?.mesh?.count === 3,
      mergedGeometry: proof?.geometry?.vertices > 0
        && proof?.geometry?.triangles > 0
        && attrs.includes('position')
        && attrs.includes('normal')
        && attrs.includes('uv')
        && attrs.includes('color')
        && attrs.includes('vertexId'),
      instanceAttributes: attrs.includes('instanceData')
        && attrs.includes('instanceAnimation'),
      sheepData: proof?.sheepData?.count === 3
        && proof?.sheepData?.useExtremeBoids === false,
      checksPassed: proof?.checks
        && Object.values(proof.checks).every(Boolean),
    };

    return {
      sceneId: scene.sceneId,
      productionSheepAdapter: proof,
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
    source: 'Konveyor production OptimizedSheepSystem constructor proof',
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
    throw new Error('production sheep adapter proof did not satisfy gates');
  }
}

run().catch((error) => {
  console.error('[PRODUCTION-SHEEP-PROOF] fatal:', error);
  process.exit(1);
});
