import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listScenes } from '../shared/scenes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_MANIFEST = 'cycle36-validation/runtime/scene-sky-screenshots/manifest.json';
const DEFAULT_OUT = 'cycle36-validation/runtime/production-effect-adapter-proof.json';

const EXPECTED_MATERIALS = Object.freeze({
  sun: 'konveyor-node-sun-billboard',
  portalRing: 'konveyor-node-portal-ring',
  portalPad: 'konveyor-node-portal-pad',
  portalParticles: 'konveyor-node-portal-particles',
  corralZapBolt: 'konveyor-node-corral-zap-bolt',
  corralZapParticles: 'konveyor-node-corral-zap-particles',
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

function materialCheck(record, expectedName) {
  return record?.materialName === expectedName
    && record?.isNodeMaterial === true
    && record?.summary?.applied === true
    && record?.summary?.hasControls === true;
}

async function run() {
  const args = parseArgs(process.argv);
  const manifest = await readJson(args.manifest);
  const expectedSceneIds = listScenes().map((scene) => scene.id).sort();
  const capturedSceneIds = manifest.scenes.map((scene) => scene.sceneId).sort();

  const scenes = manifest.scenes.map((scene) => {
    const proof = scene.productionEffectAdapter ?? null;
    const checks = {
      rendererMode: scene.rendererMode?.effective === 'webgpu-diagnostic',
      sceneBinding: scene.sceneBinding?.sceneId === scene.sceneId,
      diagnosticOk: (scene.frames ?? 0) >= 3
        && scene.consoleErrors?.length === 0
        && scene.pageErrors?.length === 0,
      productionEffectOk: proof?.ok === true,
      proofSceneMatches: proof?.sceneId === scene.sceneId,
      expectedMaterialNames: JSON.stringify(proof?.expectedMaterialNames ?? null) === JSON.stringify(EXPECTED_MATERIALS),
      sunMaterial: materialCheck(proof?.sun, EXPECTED_MATERIALS.sun),
      portalRingMaterial: materialCheck(proof?.portal?.ring, EXPECTED_MATERIALS.portalRing),
      portalPadMaterial: materialCheck(proof?.portal?.pad, EXPECTED_MATERIALS.portalPad),
      portalParticleMaterial: materialCheck(proof?.portal?.particles, EXPECTED_MATERIALS.portalParticles),
      zapBoltMaterial: materialCheck(proof?.corralZap?.bolt, EXPECTED_MATERIALS.corralZapBolt),
      zapParticleMaterial: materialCheck(proof?.corralZap?.particles, EXPECTED_MATERIALS.corralZapParticles),
      zapPool: proof?.corralZap?.poolSize === 8
        && proof?.corralZap?.activeEffects >= 1,
      checksPassed: proof?.checks
        && Object.values(proof.checks).every(Boolean),
    };

    return {
      sceneId: scene.sceneId,
      productionEffectAdapter: proof,
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
    source: 'Konveyor production effect constructor proof',
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
    throw new Error('production effect adapter proof did not satisfy gates');
  }
}

run().catch((error) => {
  console.error('[PRODUCTION-EFFECT-PROOF] fatal:', error);
  process.exit(1);
});
