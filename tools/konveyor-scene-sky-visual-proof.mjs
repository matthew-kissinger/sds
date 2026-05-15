import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { listScenes } from '../shared/scenes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_MANIFEST = 'cycle36-validation/runtime/scene-sky-screenshots/manifest.json';
const DEFAULT_SCENE_PROOF = 'cycle36-validation/runtime/scene-fog-horizon-proof.json';
const DEFAULT_OUT = 'cycle36-validation/runtime/scene-sky-visual-proof.json';
const MIN_BACKGROUND_DISTANCE = 15;
const MIN_CLOUD_BACKGROUND_DISTANCE = 12;
const MAX_EDGE_BACKGROUND_DISTANCE = 12;
const MIN_ROLLING_DARKEN_DELTA = 35;

function parseArgs(argv) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    sceneProof: DEFAULT_SCENE_PROOF,
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

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function averageColor(colors) {
  const totals = [0, 0, 0];
  for (const color of colors) {
    totals[0] += color[0];
    totals[1] += color[1];
    totals[2] += color[2];
  }
  return totals.map((total) => round(total / colors.length, 2));
}

function colorDistance(a, b) {
  return round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), 2);
}

function luma([r, g, b]) {
  return round((0.2126 * r) + (0.7152 * g) + (0.0722 * b), 2);
}

function normalizedToRgb(color) {
  return color.map((value) => Math.round(value * 255));
}

function arraysNear(a, b, tolerance = 0.0002) {
  return Array.isArray(a)
    && Array.isArray(b)
    && a.length === b.length
    && a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
}

async function sampleRegion(filePath, region) {
  const { data } = await sharp(filePath)
    .extract(region)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const total = [0, 0, 0];
  let count = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    total[0] += data[offset];
    total[1] += data[offset + 1];
    total[2] += data[offset + 2];
    count += 1;
  }

  return total.map((value) => round(value / count, 2));
}

async function inspectScenePixels(scene, screenshotPath, expectedViewport) {
  const image = sharp(screenshotPath);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const leftBackground = await sampleRegion(screenshotPath, {
    left: 8,
    top: 96,
    width: 48,
    height: 240,
  });
  const rightBackground = await sampleRegion(screenshotPath, {
    left: width - 64,
    top: 96,
    width: 48,
    height: 240,
  });
  const cloudPatch = await sampleRegion(screenshotPath, {
    left: 500,
    top: 96,
    width: 260,
    height: 80,
  });
  const background = averageColor([leftBackground, rightBackground]);
  const edgeDistance = colorDistance(leftBackground, rightBackground);
  const cloudBackgroundDistance = colorDistance(cloudPatch, background);

  return {
    screenshot: scene.screenshot,
    dimensions: { width, height },
    expectedDimensions: expectedViewport,
    samples: {
      leftBackground,
      rightBackground,
      background,
      cloudPatch,
    },
    metrics: {
      backgroundLuma: luma(background),
      edgeDistance,
      cloudBackgroundDistance,
    },
    checks: {
      dimensionsMatch: width === expectedViewport.width && height === expectedViewport.height,
      edgeBackgroundStable: edgeDistance <= MAX_EDGE_BACKGROUND_DISTANCE,
      cloudPatchDistinctFromBackground: cloudBackgroundDistance >= MIN_CLOUD_BACKGROUND_DISTANCE,
    },
  };
}

function buildPairwiseDistances(scenes) {
  const pairs = [];
  for (let i = 0; i < scenes.length; i += 1) {
    for (let j = i + 1; j < scenes.length; j += 1) {
      pairs.push({
        a: scenes[i].sceneId,
        b: scenes[j].sceneId,
        backgroundDistance: colorDistance(
          scenes[i].visual.samples.background,
          scenes[j].visual.samples.background
        ),
      });
    }
  }
  return pairs;
}

async function run() {
  const args = parseArgs(process.argv);
  const manifest = await readJson(args.manifest);
  const sceneProof = await readJson(args.sceneProof);
  const expectedSceneIds = listScenes().map((scene) => scene.id).sort();
  const capturedSceneIds = manifest.scenes.map((scene) => scene.sceneId).sort();
  const expectedViewport = manifest.viewport ?? { width: 1280, height: 720 };
  const manifestDir = dirname(resolve(ROOT, args.manifest));
  const proofByScene = new Map(sceneProof.scenes.map((scene) => [scene.sceneId, scene]));

  const scenes = [];
  for (const scene of manifest.scenes) {
    const proof = proofByScene.get(scene.sceneId) ?? null;
    const screenshotPath = resolve(manifestDir, scene.screenshot);
    const visual = await inspectScenePixels(scene, screenshotPath, expectedViewport);
    const expectedFogColor = proof?.fog?.color ?? null;
    const checks = {
      rendererMode: scene.rendererMode?.effective === 'webgpu-diagnostic',
      sceneBinding: scene.sceneBinding?.sceneId === scene.sceneId,
      hasAtmosphereIslands: scene.hasSkyFog === true && scene.hasCloudPlane === true,
      consoleClean: scene.consoleErrors.length === 0 && scene.pageErrors.length === 0,
      proofFogColorMatches: arraysNear(scene.skyFog?.fogColor, expectedFogColor),
      proofHorizonMatches: arraysNear(scene.skyFog?.horizonColor, proof?.horizonColor),
      proofZenithMatches: arraysNear(scene.skyFog?.zenithColor, proof?.zenithColor),
      proofSunMatches: arraysNear(scene.skyFog?.sunColor, proof?.sunColor),
      ...visual.checks,
    };
    scenes.push({
      sceneId: scene.sceneId,
      presetName: scene.skyFog?.presetName ?? null,
      expectedFogRgb: expectedFogColor ? normalizedToRgb(expectedFogColor) : null,
      capturedBackgroundRgb: visual.samples.background,
      capturedCloudRgb: visual.samples.cloudPatch,
      visual,
      checks,
      ok: Object.values(checks).every(Boolean),
    });
  }

  const pairwiseBackgroundDistances = buildPairwiseDistances(scenes);
  const rolling = scenes.find((scene) => scene.sceneId === 'rolling-hills');
  const field = scenes.find((scene) => scene.sceneId === 'field');
  const openCountry = scenes.find((scene) => scene.sceneId === 'open-country');
  const rollingDarkenDeltas = [
    field ? luma(field.visual.samples.background) - luma(rolling.visual.samples.background) : 0,
    openCountry ? luma(openCountry.visual.samples.background) - luma(rolling.visual.samples.background) : 0,
  ].map((value) => round(value, 2));
  const crossSceneChecks = {
    sceneSetMatchesShippingScenes: JSON.stringify(capturedSceneIds) === JSON.stringify(expectedSceneIds),
    manifestOk: manifest.ok === true,
    sceneProofOk: sceneProof.ok === true,
    sceneBackgroundsDistinct: pairwiseBackgroundDistances.every(
      (pair) => pair.backgroundDistance >= MIN_BACKGROUND_DISTANCE
    ),
    rollingHillsDarkerThanDayScenes: !!rolling
      && rollingDarkenDeltas.every((delta) => delta >= MIN_ROLLING_DARKEN_DELTA),
  };

  const result = {
    capturedAt: new Date().toISOString(),
    source: 'Konveyor scene sky screenshot visual proof',
    manifest: args.manifest,
    sceneProof: args.sceneProof,
    thresholds: {
      minBackgroundDistance: MIN_BACKGROUND_DISTANCE,
      minCloudBackgroundDistance: MIN_CLOUD_BACKGROUND_DISTANCE,
      maxEdgeBackgroundDistance: MAX_EDGE_BACKGROUND_DISTANCE,
      minRollingDarkenDelta: MIN_ROLLING_DARKEN_DELTA,
    },
    crossSceneChecks,
    rollingDarkenDeltas,
    pairwiseBackgroundDistances,
    scenes,
    ok: Object.values(crossSceneChecks).every(Boolean) && scenes.every((scene) => scene.ok),
  };

  const outPath = resolve(ROOT, args.out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    throw new Error('scene sky visual proof did not satisfy gates');
  }
}

run().catch((error) => {
  console.error('[SCENE-SKY-VISUAL-PROOF] fatal:', error);
  process.exit(1);
});
