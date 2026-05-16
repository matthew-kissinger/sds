import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listScenes } from '../shared/scenes/index.js';
import { RUNTIME_GLB_RENDER_PREVIEW_ASSETS } from '../js/diagnostics/webgpuRuntimeGlbPreview.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_MANIFEST = 'cycle36-validation/runtime/scene-sky-screenshots/manifest.json';
const DEFAULT_OUT = 'cycle36-validation/runtime/production-tree-rock-adapter-proof.json';

const EXPECTED_MATERIALS = Object.freeze({
  treeBranches: 'konveyor-node-branches',
  treeLeaves: 'konveyor-node-leaves',
  rock: 'konveyor-node-rock-rim',
});

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

function sortedJson(value) {
  return JSON.stringify(value);
}

async function run() {
  const args = parseArgs(process.argv);
  const manifest = await readJson(args.manifest);
  const expectedSceneIds = listScenes().map((scene) => scene.id).sort();
  const capturedSceneIds = manifest.scenes.map((scene) => scene.sceneId).sort();
  const expectedAssetPaths = RUNTIME_GLB_RENDER_PREVIEW_ASSETS.map((asset) => asset.path).sort();

  const scenes = manifest.scenes.map((scene) => {
    const proof = scene.productionTreeRockAdapter ?? null;
    const renderedAssetPaths = (proof?.renderedAssets ?? []).map((asset) => asset.path).sort();
    const treeAssets = (proof?.renderedAssets ?? []).filter((asset) => asset.role === 'tree');
    const rockAssets = (proof?.renderedAssets ?? []).filter((asset) => asset.role === 'rock');
    const checks = {
      rendererMode: scene.rendererMode?.effective === 'webgpu-diagnostic',
      sceneBinding: scene.sceneBinding?.sceneId === scene.sceneId,
      diagnosticOk: (scene.frames ?? 0) >= 3
        && scene.consoleErrors?.length === 0
        && scene.pageErrors?.length === 0,
      productionTreeRockOk: proof?.ok === true,
      proofSceneMatches: proof?.sceneId === scene.sceneId,
      expectedMaterialNames: sortedJson(proof?.expectedMaterialNames ?? null) === sortedJson(EXPECTED_MATERIALS),
      shippedAssetSet: sortedJson(renderedAssetPaths) === sortedJson(expectedAssetPaths),
      adapterCounts: proof?.adapter?.ok === true
        && proof?.adapter?.treeReplacedMaterials === 8
        && proof?.adapter?.rockReplacedMaterials === 3,
      treeAssetsCovered: treeAssets.length === 4
        && treeAssets.every((asset) => asset.replacement?.strategy === 'material-name')
        && treeAssets.every((asset) => asset.replacement?.missingTargets?.length === 0),
      rockAssetsCovered: rockAssets.length === 3
        && rockAssets.every((asset) => asset.replacement?.strategy === 'asset-class-traversal')
        && rockAssets.every((asset) => asset.replacement?.replacedMaterials > 0),
      treeNodeMaterialsBound: proof?.materialNames?.trees?.includes(EXPECTED_MATERIALS.treeBranches)
        && proof?.materialNames?.trees?.includes(EXPECTED_MATERIALS.treeLeaves),
      rockNodeMaterialBound: proof?.materialNames?.rocks?.length === 1
        && proof.materialNames.rocks[0] === EXPECTED_MATERIALS.rock,
      productionPlacementPreview: proof?.productionPlacementPreview?.ok === true
        && proof?.productionPlacementPreview?.source === 'shared/TreePlacement.generateTrees'
        && proof?.productionPlacementPreview?.renderedTrees === proof?.productionPlacementPreview?.sampledTrees,
      productionTreeInstancingPreview: proof?.productionInstancingPreview?.ok === true
        && proof?.productionInstancingPreview?.source === 'THREE.InstancedMesh'
        && proof?.productionInstancingPreview?.instancedMesh2Status === 'not imported in WebGPU diagnostic',
      diagnosticRockInstancingPreview: proof?.diagnosticRockInstancingPreview?.ok === true
        && proof?.diagnosticRockInstancingPreview?.source === 'THREE.InstancedMesh'
        && proof?.diagnosticRockInstancingPreview?.instancedMesh2Status === 'not imported in WebGPU diagnostic',
      checksPassed: proof?.checks
        && Object.values(proof.checks).every(Boolean),
    };

    return {
      sceneId: scene.sceneId,
      productionTreeRockAdapter: proof,
      checks,
      ok: Object.values(checks).every(Boolean),
    };
  });

  const crossSceneChecks = {
    sceneSetMatchesShippingScenes: sortedJson(capturedSceneIds) === sortedJson(expectedSceneIds),
    manifestOk: manifest.ok === true,
  };

  const result = {
    capturedAt: new Date().toISOString(),
    source: 'Konveyor production tree/rock material adapter proof',
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
    throw new Error('production tree/rock adapter proof did not satisfy gates');
  }
}

run().catch((error) => {
  console.error('[PRODUCTION-TREE-ROCK-PROOF] fatal:', error);
  process.exit(1);
});
