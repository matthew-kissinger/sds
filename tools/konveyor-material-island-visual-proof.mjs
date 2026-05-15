import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import { listScenes } from '../shared/scenes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_MANIFEST = 'cycle36-validation/runtime/scene-sky-screenshots/manifest.json';
const DEFAULT_OUT = 'cycle36-validation/runtime/material-island-visual-proof.json';

const REQUIRED_ISLANDS = Object.freeze([
  'sun-billboard',
  'portal-ring',
  'meadow-quad',
  'cloud-plane',
  'sky-fog',
  'rock-rim',
  'tree-leaf',
  'grass-blade',
  'sheep-wool',
  'kiln-impostor',
  'anime-water',
  'terrain-heightfield',
  'runtime-glb-rendered-clones',
  'production-instanced-tree-preview',
  'diagnostic-rock-instancing-preview',
  'production-tree-rock-adapter',
  'production-effect-adapter',
  'production-atmosphere-adapter',
  'production-water-adapter',
  'production-terrain-adapter',
  'production-grass-adapter',
  'production-sheep-adapter',
]);

const SAMPLE_REGIONS = Object.freeze({
  background: { left: 1210, top: 100, width: 48, height: 220 },
  sunBillboard: { left: 410, top: 300, width: 50, height: 50 },
  cloudPlane: { left: 500, top: 100, width: 260, height: 80 },
  meadowQuad: { left: 410, top: 430, width: 160, height: 95 },
  animeWater: { left: 580, top: 620, width: 100, height: 40 },
  terrainHeightfield: { left: 760, top: 540, width: 150, height: 90 },
  grassBlade: { left: 1090, top: 430, width: 60, height: 150 },
  sheepWool: { left: 58, top: 610, width: 160, height: 80 },
  treeLeaf: { left: 455, top: 585, width: 90, height: 70 },
  kilnImpostor: { left: 335, top: 635, width: 90, height: 70 },
  rockRim: { left: 1000, top: 570, width: 90, height: 60 },
});

const THRESHOLDS = Object.freeze({
  minWaterBackgroundDistance: 40,
  minTerrainBackgroundDistance: 40,
  minCloudBackgroundDistance: 10,
  minMeadowBackgroundDistance: 20,
  minSheepBackgroundDistance: 20,
  minKilnGreenBlueDelta: 10,
  maxSunChannelSpread: 8,
  maxSheepChannelSpread: 20,
  minSunLuma: 240,
  minSheepLuma: 130,
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

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function colorDistance(a, b) {
  return round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
}

function luma([r, g, b]) {
  return round((0.2126 * r) + (0.7152 * g) + (0.0722 * b));
}

function channelSpread([r, g, b]) {
  return round(Math.max(r, g, b) - Math.min(r, g, b));
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

  return total.map((value) => round(value / count));
}

async function sampleScene(filePath) {
  const image = sharp(filePath);
  const metadata = await image.metadata();
  const samples = {};

  for (const [key, region] of Object.entries(SAMPLE_REGIONS)) {
    samples[key] = await sampleRegion(filePath, region);
  }

  const distancesFromBackground = Object.fromEntries(
    Object.entries(samples)
      .filter(([key]) => key !== 'background')
      .map(([key, color]) => [key, colorDistance(color, samples.background)])
  );

  return {
    dimensions: {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
    },
    samples,
    distancesFromBackground,
    luma: Object.fromEntries(
      Object.entries(samples).map(([key, color]) => [key, luma(color)])
    ),
    channelSpread: Object.fromEntries(
      Object.entries(samples).map(([key, color]) => [key, channelSpread(color)])
    ),
  };
}

function hasRequiredIslands(scene) {
  if (Array.isArray(scene.islands)) {
    return REQUIRED_ISLANDS.every((island) => scene.islands.includes(island));
  }
  return Number(scene.islandCount ?? 0) >= REQUIRED_ISLANDS.length;
}

function materialChecks(visual) {
  const s = visual.samples;
  const d = visual.distancesFromBackground;
  const l = visual.luma;
  const spread = visual.channelSpread;

  return {
    sunBillboardVisible: l.sunBillboard >= THRESHOLDS.minSunLuma
      && spread.sunBillboard <= THRESHOLDS.maxSunChannelSpread,
    cloudPlaneVisible: d.cloudPlane >= THRESHOLDS.minCloudBackgroundDistance,
    meadowQuadVisible: d.meadowQuad >= THRESHOLDS.minMeadowBackgroundDistance
      && s.meadowQuad[1] > s.meadowQuad[0] + 3
      && s.meadowQuad[1] > s.meadowQuad[2] + 5,
    animeWaterVisible: d.animeWater >= THRESHOLDS.minWaterBackgroundDistance
      && s.animeWater[1] > s.animeWater[0] + 20
      && s.animeWater[2] > s.animeWater[0] + 20,
    terrainHeightfieldVisible: d.terrainHeightfield >= THRESHOLDS.minTerrainBackgroundDistance
      && s.terrainHeightfield[1] > s.terrainHeightfield[0] + 30,
    grassBladeVisible: s.grassBlade[1] > s.grassBlade[0] + 15
      && s.grassBlade[1] > s.grassBlade[2] + 40,
    sheepWoolVisible: l.sheepWool >= THRESHOLDS.minSheepLuma
      && spread.sheepWool <= THRESHOLDS.maxSheepChannelSpread
      && d.sheepWool >= THRESHOLDS.minSheepBackgroundDistance,
    treeLeafVisible: s.treeLeaf[1] > s.treeLeaf[0] + 15
      && s.treeLeaf[1] > s.treeLeaf[2] + 10,
    kilnImpostorVisible: s.kilnImpostor[0] >= 140
      && s.kilnImpostor[1] >= 120
      && s.kilnImpostor[2] < s.kilnImpostor[1] - THRESHOLDS.minKilnGreenBlueDelta,
    rockRimVisible: s.rockRim[2] < s.rockRim[1]
      && s.rockRim[2] < s.rockRim[0],
  };
}

async function run() {
  const args = parseArgs(process.argv);
  const manifest = await readJson(args.manifest);
  const expectedViewport = manifest.viewport ?? { width: 1280, height: 720 };
  const expectedSceneIds = listScenes().map((scene) => scene.id).sort();
  const capturedSceneIds = manifest.scenes.map((scene) => scene.sceneId).sort();
  const manifestDir = dirname(resolve(ROOT, args.manifest));

  const scenes = [];
  for (const scene of manifest.scenes) {
    const screenshotPath = resolve(manifestDir, scene.screenshot);
    const visual = await sampleScene(screenshotPath);
    const checks = {
      rendererMode: scene.rendererMode?.effective === 'webgpu-diagnostic',
      sceneBinding: scene.sceneBinding?.sceneId === scene.sceneId,
      requiredIslandsPresent: hasRequiredIslands(scene),
      consoleClean: scene.consoleErrors.length === 0 && scene.pageErrors.length === 0,
      dimensionsMatch: visual.dimensions.width === expectedViewport.width
        && visual.dimensions.height === expectedViewport.height,
      ...materialChecks(visual),
    };

    scenes.push({
      sceneId: scene.sceneId,
      presetName: scene.skyFog?.presetName ?? null,
      screenshot: scene.screenshot,
      islandCount: scene.islandCount ?? null,
      visual,
      checks,
      ok: Object.values(checks).every(Boolean),
    });
  }

  const crossSceneChecks = {
    sceneSetMatchesShippingScenes: JSON.stringify(capturedSceneIds) === JSON.stringify(expectedSceneIds),
    manifestOk: manifest.ok === true,
  };

  const result = {
    capturedAt: new Date().toISOString(),
    source: 'Konveyor diagnostic material island screenshot proof',
    manifest: args.manifest,
    thresholds: THRESHOLDS,
    sampleRegions: SAMPLE_REGIONS,
    requiredIslands: REQUIRED_ISLANDS,
    crossSceneChecks,
    scenes,
    ok: Object.values(crossSceneChecks).every(Boolean) && scenes.every((scene) => scene.ok),
  };

  const outPath = resolve(ROOT, args.out);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    throw new Error('material island visual proof did not satisfy gates');
  }
}

run().catch((error) => {
  console.error('[MATERIAL-ISLAND-VISUAL-PROOF] fatal:', error);
  process.exit(1);
});
