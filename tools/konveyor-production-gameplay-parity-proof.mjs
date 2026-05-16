import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const execFileAsync = promisify(execFile);
const DEFAULT_SCENES = ['field', 'rolling-hills', 'open-country'];
const DEFAULT_OUT = 'cycle36-validation/runtime/production-gameplay-parity-proof.json';
const DEFAULT_OUT_DIR = 'cycle36-validation/runtime/production-gameplay-parity-proof';
const VIEWPORT = { width: 1280, height: 720 };
const COMPARE_VIEWPORT = { width: 320, height: 180 };
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

const SHOTS = {
  field: {
    sun: 0.5,
    timeSeconds: 0.75,
    camera: { pos: { x: 0, y: 12, z: 30 }, target: { x: 0, y: 2, z: -20 } },
  },
  'rolling-hills': {
    sun: 0.5,
    timeSeconds: 0.75,
    camera: { pos: { x: -50, y: 25, z: 40 }, target: { x: 0, y: 5, z: 0 } },
  },
  'open-country': {
    sun: 0.5,
    timeSeconds: 0.75,
    camera: { pos: { x: 0, y: 30, z: 80 }, target: { x: 0, y: 5, z: 0 } },
  },
};

const REGIONS = {
  topSky: { left: 0.25, top: 0.05, width: 0.5, height: 0.08 },
  horizon: { left: 0.15, top: 0.28, width: 0.7, height: 0.12 },
  ground: { left: 0.15, top: 0.58, width: 0.7, height: 0.25 },
};

const DEFAULT_READY_THRESHOLDS = {
  fullSsimMin: 0.86,
  topSkyChromaDistanceMax: 0.06,
  horizonChromaDistanceMax: 0.08,
  groundChromaDistanceMax: 0.1,
  groundLumaDeltaMax: 35,
};

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:4173/',
    out: DEFAULT_OUT,
    outDir: DEFAULT_OUT_DIR,
    scenes: DEFAULT_SCENES.join(','),
    channel: null,
    enforceDefaultParity: false,
  };

  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
    if (match) {
      const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[key] = match[2];
      continue;
    }
    if (arg === '--enforce-default-parity') {
      args.enforceDefaultParity = true;
    }
  }

  return {
    ...args,
    sceneIds: args.scenes.split(',').map((scene) => scene.trim()).filter(Boolean),
    enforceDefaultParity: args.enforceDefaultParity === true
      || args.enforceDefaultParity === '1'
      || args.enforceDefaultParity === 'true',
  };
}

function buildUrl(baseUrl, sceneId, renderer) {
  const url = new URL(baseUrl);
  url.searchParams.set('scene', sceneId);
  url.searchParams.set('perfMode', '1');
  url.searchParams.set('probeRender', '1');
  url.searchParams.set('cinematic', '1');
  url.searchParams.set('visualGolden', '1');
  url.searchParams.set('ui', 'off');
  url.searchParams.set('konveyorRocks', '1');

  if (renderer === 'webgpu') {
    url.searchParams.set('renderer', 'webgpu');
    url.searchParams.set('diagnostic', '1');
    url.searchParams.set('konveyorProductionBootScout', '1');
    url.searchParams.set('konveyorProductionGameplayScout', '1');
    url.searchParams.set('konveyorProductionSceneBody', '1');
    url.searchParams.set('konveyorAtmosphere', '1');
    url.searchParams.set('konveyorEffects', '1');
    url.searchParams.set('konveyorMaterials', '1');
    url.searchParams.set('konveyorRocks', '1');
    url.searchParams.set('konveyorGrass', '1');
    url.searchParams.set('konveyorWater', '1');
    url.searchParams.set('konveyorTerrain', '1');
    url.searchParams.set('konveyorSheep', '1');
    url.searchParams.set('konveyorImpostors', '1');
    url.searchParams.set('konveyorNativeInstancing', '1');
    url.searchParams.set('autostart', '1');
    url.searchParams.set('mode', 'classic');
  }

  return url.href;
}

function cellSeed(id) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function luma(rgb) {
  return (0.2126 * rgb[0]) + (0.7152 * rgb[1]) + (0.0722 * rgb[2]);
}

function chroma(rgb) {
  const total = rgb[0] + rgb[1] + rgb[2];
  if (total <= 0.0001) return [0, 0, 0];
  return rgb.map((channel) => channel / total);
}

function distance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
  return Math.hypot(...a.map((value, index) => value - b[index]));
}

async function newSeededContext(browser, seed) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  await context.addInitScript(({ seed: initialSeed }) => {
    let state = initialSeed >>> 0;
    const setSeed = (nextSeed) => {
      state = nextSeed >>> 0;
    };
    const random = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    Math.random = random;
    window.__sdsSetVisualGoldenSeed = setSeed;
    try {
      localStorage.clear();
      localStorage.setItem('playerIdentity', JSON.stringify({
        persistentId: 'konveyor_parity',
        displayName: 'KonveyorParity',
        fullName: 'KonveyorParity#0001',
        discriminator: '0001',
        nameType: 'custom',
        createdAt: 1778862051000,
        isRegistered: false,
      }));
    } catch {}
  }, { seed });
  return context;
}

async function waitForWebGpuScout(page) {
  await page.waitForFunction(() => {
    const scout = window.__sdsG?.productionBootScout;
    return scout?.ok === true || !!scout?.error;
  }, null, { timeout: 120_000 });
  const error = await page.evaluate(() => window.__sdsG?.productionBootScout?.error ?? null);
  if (error) throw new Error(`production WebGPU scout failed: ${error}`);
}

async function prepareStaticShot(page, shot, renderer) {
  await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 120_000 });
  await page.evaluate(() => window.__sdsCinema.waitReady(90_000));

  if (renderer === 'webgpu') {
    await waitForWebGpuScout(page);
  } else {
    await page.evaluate(() => window.__sdsCinema.startSolo('jep', 'classic'));
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 90_000 });
  }

  await page.evaluate(async (shotConfig) => {
    const cinema = window.__sdsCinema;
    const sceneManager = window.__sds?.sceneManagerRef;
    const terrainBuilder = window.__sds?.terrainBuilderRef;
    const atmosphere = window.__sds?.atmosphereRef;
    const dog = cinema?.gameState?.getSheepdog?.();
    const terrainY = (x, z) => {
      const y = cinema?.getTerrainY?.(x, z);
      return Number.isFinite(y) ? y : 0;
    };
    const resetTimedSystems = (seconds) => {
      const t = Number.isFinite(seconds) ? seconds : 0;
      const grassSystem = terrainBuilder?.grassSystem;
      if (grassSystem) {
        grassSystem.time = t;
      }
      const sky = atmosphere?.sky;
      if (sky) {
        sky.cloudTimeSeconds = t;
        if (sky.uniforms?.uCloudTimeSeconds) {
          sky.uniforms.uCloudTimeSeconds.value = t;
        }
      }
      const cloudLayer = atmosphere?.cloudLayer;
      if (cloudLayer) {
        cloudLayer.elapsedSeconds = t;
        if (cloudLayer.uniforms?.uTimeSeconds) {
          cloudLayer.uniforms.uTimeSeconds.value = t;
        }
        cloudLayer.materialControls?.update?.({ timeSeconds: t });
      }
    };
    const cameraPose = {
      pos: { ...shotConfig.camera.pos },
      target: { ...shotConfig.camera.target },
    };
    const cameraClearance = shotConfig.camera.clearance ?? 12;
    const targetClearance = shotConfig.camera.targetClearance ?? 2.5;
    cameraPose.pos.y = Math.max(
      cameraPose.pos.y,
      terrainY(cameraPose.pos.x, cameraPose.pos.z) + cameraClearance,
    );
    cameraPose.target.y = Math.max(
      cameraPose.target.y,
      terrainY(cameraPose.target.x, cameraPose.target.z) + targetClearance,
    );
    window.__sdsSetVisualGoldenSeed?.(shotConfig.seed);
    cinema?.gameState?.startGame?.('solo', null, 'classic');
    resetTimedSystems(shotConfig.timeSeconds);
    cinema?.pauseSimulation?.();
    cinema?.hideUI?.();
    cinema?.setSun?.(shotConfig.sun);
    cinema?.setCameraPose?.(cameraPose.pos, cameraPose.target);
    for (let i = 0; i < 4; i++) {
      cinema?.setCameraPose?.(cameraPose.pos, cameraPose.target);
      sceneManager?.getCamera?.()?.updateMatrixWorld?.(true);
      await sceneManager?.render?.();
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    resetTimedSystems(shotConfig.timeSeconds);
    cinema?.setCameraPose?.(cameraPose.pos, cameraPose.target);
    await sceneManager?.render?.();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, shot);
}

async function captureRendererScene({ browser, baseUrl, sceneId, renderer, outDir }) {
  const seed = cellSeed(`konveyor-production-gameplay-parity:${sceneId}`);
  const context = await newSeededContext(browser, seed);
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

  try {
    const url = buildUrl(baseUrl, sceneId, renderer);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.addStyleTag({
      content: '#site-footer { visibility: hidden !important; }',
    }).catch(() => {});
    const shot = {
      ...(SHOTS[sceneId] ?? SHOTS.field),
      seed: cellSeed(`konveyor-production-gameplay-parity-static:${sceneId}`),
    };
    await prepareStaticShot(page, shot, renderer);

    const state = await page.evaluate(() => {
      const sceneManager = window.__sds?.sceneManagerRef ?? null;
      const rendererRef = sceneManager?.getRenderer?.() ?? null;
      const terrainBuilder = window.__sds?.terrainBuilderRef ?? null;
      const grassSystem = terrainBuilder?.grassSystem ?? null;
      const gameState = window.__sdsCinema?.gameState ?? null;
      const sheepSystem = gameState?.optimizedSheepSystem ?? null;
      const heightfield = gameState?.heightfield ?? null;
      const terrainPlacement = (() => {
        const camera = sceneManager?.getCamera?.() ?? null;
        const mesh = sheepSystem?.instancedMesh ?? null;
        const matrixArray = mesh?.instanceMatrix?.array ?? null;
        const sheep = sheepSystem?.sheep ?? [];
        const roundNumber = (value, digits = 3) => Number(value.toFixed(digits));
        const terrainY = (x, z) => {
          const y = heightfield?.surfaceY?.(x, z) ?? heightfield?.sample?.(x, z) ?? 0;
          return Number.isFinite(y) ? y : 0;
        };
        const cameraSurfaceY = camera ? terrainY(camera.position.x, camera.position.z) : null;
        let matrixSurfaceAbsMax = null;
        let belowWaterMatrices = null;
        let sampledCount = 0;
        const centroid = { x: 0, y: 0, z: 0 };

        if (matrixArray && sheep.length > 0) {
          matrixSurfaceAbsMax = 0;
          belowWaterMatrices = 0;
          const waterY = heightfield?.waterY ?? -0.05;
          const count = Math.min(mesh?.count ?? 0, sheep.length);
          for (let i = 0; i < count; i++) {
            const offset = i * 16;
            const matrixY = matrixArray[offset + 13];
            const x = matrixArray[offset + 12] ?? 0;
            const z = matrixArray[offset + 14] ?? 0;
            const surfaceY = terrainY(x, z);
            matrixSurfaceAbsMax = Math.max(matrixSurfaceAbsMax, Math.abs(matrixY - surfaceY));
            if (matrixY < waterY) belowWaterMatrices += 1;
            centroid.x += x;
            centroid.y += matrixY;
            centroid.z += z;
            sampledCount += 1;
          }
        }

        return {
          camera: camera ? {
            x: roundNumber(camera.position.x),
            y: roundNumber(camera.position.y),
            z: roundNumber(camera.position.z),
            surfaceY: roundNumber(cameraSurfaceY ?? 0),
            aboveSurface: roundNumber(camera.position.y - (cameraSurfaceY ?? 0)),
          } : null,
          sheepPlacement: {
            sampledCount,
            centroid: sampledCount > 0 ? {
              x: roundNumber(centroid.x / sampledCount),
              y: roundNumber(centroid.y / sampledCount),
              z: roundNumber(centroid.z / sampledCount),
            } : null,
            matrixSurfaceAbsMax: matrixSurfaceAbsMax == null ? null : roundNumber(matrixSurfaceAbsMax),
            belowWaterMatrices,
            waterY: heightfield?.waterY ?? -0.05,
          },
        };
      })();
      return {
        rendererMode: window.__sdsRendererMode ?? null,
        currentSceneId: window.__currentSceneId ?? null,
        productionBootScout: window.__sdsG?.productionBootScout ?? null,
        renderStatus: sceneManager?.getRenderStatus?.() ?? null,
        renderer: {
          className: rendererRef?.constructor?.name ?? null,
          isWebGLRenderer: rendererRef?.isWebGLRenderer === true,
          isWebGPURenderer: rendererRef?.isWebGPURenderer === true
            || rendererRef?.constructor?.name === 'WebGPURenderer',
          calls: rendererRef?.info?.render?.calls ?? null,
          triangles: rendererRef?.info?.render?.triangles ?? null,
        },
        scene: {
          childCount: sceneManager?.getScene?.()?.children?.length ?? null,
          hasTerrain: !!terrainBuilder?.terrainMesh,
          sheepCount: window.__sdsCinema?.gameState?.getSheep?.()?.length ?? null,
          grassTime: grassSystem?.time ?? null,
          sheepSystemReady: !!sheepSystem,
          ...terrainPlacement,
        },
        materials: {
          atmosphere: window.__sdsKonveyorAtmosphereMaterialAdapter ?? null,
          terrain: terrainBuilder?.konveyorTerrainMaterialSummary ?? null,
          grassBlade: grassSystem?.konveyorGrassBladeMaterialSummary
            ?? grassSystem?.grassMaterial?.userData?.konveyorGrassBladeMaterialSummary
            ?? null,
          meadow: grassSystem?.konveyorMeadowQuadMaterialSummary ?? null,
          sheep: sheepSystem?.konveyorSheepMaterialSummary
            ?? sheepSystem?.material?.userData?.konveyorSheepMaterialSummary
            ?? null,
          nativeTreeInstancing: terrainBuilder?.konveyorNativeTreeInstancingSummary ?? null,
          nativeRockInstancing: terrainBuilder?.konveyorNativeRockInstancingSummary ?? null,
        },
      };
    });

    const screenshot = `${sceneId}-${renderer}.png`;
    const screenshotPath = resolve(outDir, screenshot);
    await page.locator('#canvas-container canvas, canvas').first().screenshot({ path: screenshotPath });
    const screenshotProof = await inspectScreenshot(screenshotPath);

    return {
      renderer,
      sceneId,
      url,
      seed,
      screenshot,
      screenshotProof,
      ...state,
      consoleErrors,
      pageErrors,
    };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function sampleRegion(imagePath, ratios) {
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const left = Math.max(0, Math.floor(width * ratios.left));
  const top = Math.max(0, Math.floor(height * ratios.top));
  const regionWidth = Math.max(1, Math.min(width - left, Math.floor(width * ratios.width)));
  const regionHeight = Math.max(1, Math.min(height - top, Math.floor(height * ratios.height)));
  const { data } = await sharp(imagePath)
    .extract({ left, top, width: regionWidth, height: regionHeight })
    .resize({ width: 48, height: 24, fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const total = [0, 0, 0];
  let minLuma = Infinity;
  let maxLuma = -Infinity;
  const buckets = new Set();
  let count = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const rgb = [data[offset], data[offset + 1], data[offset + 2]];
    total[0] += rgb[0];
    total[1] += rgb[1];
    total[2] += rgb[2];
    const y = luma(rgb);
    minLuma = Math.min(minLuma, y);
    maxLuma = Math.max(maxLuma, y);
    buckets.add(`${rgb[0] >> 4},${rgb[1] >> 4},${rgb[2] >> 4}`);
    count += 1;
  }

  const averageRgb = total.map((value) => round(value / count, 2));
  const averageChroma = chroma(averageRgb).map((value) => round(value, 5));
  return {
    averageRgb,
    averageChroma,
    averageLuma: round(luma(averageRgb), 2),
    lumaRange: round(maxLuma - minLuma, 2),
    coarseColorBuckets: buckets.size,
  };
}

async function inspectScreenshot(imagePath) {
  const metadata = await sharp(imagePath).metadata();
  const full = await sampleRegion(imagePath, { left: 0, top: 0, width: 1, height: 1 });
  const regions = {};
  for (const [name, ratios] of Object.entries(REGIONS)) {
    regions[name] = await sampleRegion(imagePath, ratios);
  }
  return {
    dimensions: {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
    },
    full,
    regions,
    nonBlank: full.lumaRange >= 20 && full.coarseColorBuckets >= 16,
  };
}

async function decodeComparePixels(imagePath) {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const pixels = await image
    .resize(COMPARE_VIEWPORT.width, COMPARE_VIEWPORT.height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    pixels,
  };
}

function ssimLuma(a, b) {
  if (a.length !== b.length) return -1;
  const n = (a.length / 4) | 0;
  const lumaA = new Float64Array(n);
  const lumaB = new Float64Array(n);
  let muA = 0;
  let muB = 0;
  for (let i = 0, j = 0; i < a.length; i += 4, j++) {
    const la = (0.2126 * a[i]) + (0.7152 * a[i + 1]) + (0.0722 * a[i + 2]);
    const lb = (0.2126 * b[i]) + (0.7152 * b[i + 1]) + (0.0722 * b[i + 2]);
    lumaA[j] = la;
    lumaB[j] = lb;
    muA += la;
    muB += lb;
  }
  muA /= n;
  muB /= n;
  let sigA2 = 0;
  let sigB2 = 0;
  let sigAB = 0;
  for (let j = 0; j < n; j++) {
    const da = lumaA[j] - muA;
    const db = lumaB[j] - muB;
    sigA2 += da * da;
    sigB2 += db * db;
    sigAB += da * db;
  }
  sigA2 /= n;
  sigB2 /= n;
  sigAB /= n;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  return ((2 * muA * muB + c1) * (2 * sigAB + c2))
    / ((muA * muA + muB * muB + c1) * (sigA2 + sigB2 + c2));
}

async function writeComparisonImage(webglPath, webgpuPath, outputPath) {
  const width = VIEWPORT.width;
  const height = VIEWPORT.height;
  const webgl = await sharp(webglPath).resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const webgpu = await sharp(webgpuPath).resize(width, height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  const diff = Buffer.alloc(webgl.length);
  for (let i = 0; i < webgl.length; i += 4) {
    diff[i] = Math.abs(webgl[i] - webgpu[i]);
    diff[i + 1] = Math.abs(webgl[i + 1] - webgpu[i + 1]);
    diff[i + 2] = Math.abs(webgl[i + 2] - webgpu[i + 2]);
    diff[i + 3] = 255;
  }
  const panes = await Promise.all([
    sharp(webgl, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    sharp(webgpu, { raw: { width, height, channels: 4 } }).png().toBuffer(),
    sharp(diff, { raw: { width, height, channels: 4 } }).linear(2.5, 0).png().toBuffer(),
  ]);
  await sharp({
    create: {
      width: width * 3,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([
      { input: panes[0], left: 0, top: 0 },
      { input: panes[1], left: width, top: 0 },
      { input: panes[2], left: width * 2, top: 0 },
    ])
    .png()
    .toFile(outputPath);
}

async function compareScene({ sceneId, webgl, webgpu, outDir }) {
  const webglPath = resolve(outDir, webgl.screenshot);
  const webgpuPath = resolve(outDir, webgpu.screenshot);
  const [webglPixels, webgpuPixels] = await Promise.all([
    decodeComparePixels(webglPath),
    decodeComparePixels(webgpuPath),
  ]);
  const fullSsim = round(ssimLuma(webglPixels.pixels, webgpuPixels.pixels), 5);
  const regionComparisons = {};
  for (const name of Object.keys(REGIONS)) {
    const a = webgl.screenshotProof.regions[name];
    const b = webgpu.screenshotProof.regions[name];
    regionComparisons[name] = {
      chromaDistance: round(distance(a.averageChroma, b.averageChroma), 5),
      lumaDelta: round(Math.abs(a.averageLuma - b.averageLuma), 2),
      webgl: a,
      webgpu: b,
    };
  }

  const comparisonImage = `${sceneId}-webgl-webgpu-diff.png`;
  await writeComparisonImage(webglPath, webgpuPath, resolve(outDir, comparisonImage));

  const terrainPlacementOk = (capture) => {
    const camera = capture.scene?.camera;
    const sheep = capture.scene?.sheepPlacement;
    return (!camera || camera.aboveSurface >= 1)
      && (!sheep || sheep.matrixSurfaceAbsMax == null || sheep.matrixSurfaceAbsMax <= 3);
  };

  const checks = {
    webglDefaultRenderer: webgl.rendererMode?.effective === 'webgl'
      && webgl.renderer?.isWebGLRenderer === true,
    webgpuGuardedRenderer: webgpu.rendererMode?.effective === 'webgpu-production-boot-scout'
      && webgpu.renderer?.isWebGPURenderer === true,
    sceneMatches: webgl.currentSceneId === sceneId && webgpu.currentSceneId === sceneId,
    screenshotsNonBlank: webgl.screenshotProof.nonBlank === true && webgpu.screenshotProof.nonBlank === true,
    cleanConsole: webgl.consoleErrors.length === 0
      && webgl.pageErrors.length === 0
      && webgpu.consoleErrors.length === 0
      && webgpu.pageErrors.length === 0,
    webgpuFactoryGates: webgpu.productionBootScout?.sceneBody?.ok === true
      && webgpu.productionBootScout?.gameplayStart?.ok === true,
    terrainPlacement: terrainPlacementOk(webgl) && terrainPlacementOk(webgpu),
  };

  const defaultReadyChecks = {
    topSkyChroma: regionComparisons.topSky.chromaDistance <= DEFAULT_READY_THRESHOLDS.topSkyChromaDistanceMax,
    horizonChroma: regionComparisons.horizon.chromaDistance <= DEFAULT_READY_THRESHOLDS.horizonChromaDistanceMax,
    groundChroma: regionComparisons.ground.chromaDistance <= DEFAULT_READY_THRESHOLDS.groundChromaDistanceMax,
    groundLuma: regionComparisons.ground.lumaDelta <= DEFAULT_READY_THRESHOLDS.groundLumaDeltaMax,
  };
  const advisoryChecks = {
    fullSsim: fullSsim >= DEFAULT_READY_THRESHOLDS.fullSsimMin,
  };
  const captureOk = Object.values(checks).every(Boolean);

  return {
    sceneId,
    screenshots: {
      webgl: webgl.screenshot,
      webgpu: webgpu.screenshot,
      comparison: comparisonImage,
    },
    fullSsim,
    regions: regionComparisons,
    checks,
    captureOk,
    defaultReadyChecks,
    advisoryChecks,
    defaultReady: captureOk && Object.values(defaultReadyChecks).every(Boolean),
    webgl,
    webgpu,
  };
}

async function closeLocalhostBrowserProcesses() {
  if (process.platform !== 'win32') return;
  const script = `
$matches = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match '^(chrome|msedge|chromium)\\.exe$' -and
  $_.CommandLine -match '127\\.0\\.0\\.1:(3000|4173)'
}
foreach ($process in $matches) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
`;
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true })
    .catch(() => {});
}

async function run() {
  const args = parseArgs(process.argv);
  const outDir = resolve(ROOT, args.outDir);
  await mkdir(outDir, { recursive: true });

  const launchOptions = {
    headless: true,
    args: CHROMIUM_GPU_ARGS,
  };
  if (args.channel) launchOptions.channel = args.channel;
  const browser = await chromium.launch(launchOptions);

  try {
    const scenes = [];
    for (const sceneId of args.sceneIds) {
      const webgl = await captureRendererScene({
        browser,
        baseUrl: args.baseUrl,
        sceneId,
        renderer: 'webgl',
        outDir,
      });
      const webgpu = await captureRendererScene({
        browser,
        baseUrl: args.baseUrl,
        sceneId,
        renderer: 'webgpu',
        outDir,
      });
      scenes.push(await compareScene({ sceneId, webgl, webgpu, outDir }));
    }

    const manifest = {
      capturedAt: new Date().toISOString(),
      contract: 'konveyor-production-gameplay-webgl-webgpu-parity-proof',
      baseUrl: args.baseUrl,
      screenshotDir: args.outDir,
      sceneIds: args.sceneIds,
      channel: args.channel ?? 'playwright-chromium',
      chromiumArgs: CHROMIUM_GPU_ARGS,
      thresholds: DEFAULT_READY_THRESHOLDS,
      ok: scenes.every((scene) => scene.captureOk),
      defaultReady: scenes.every((scene) => scene.defaultReady),
      scenes,
    };

    const outPath = resolve(ROOT, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));

    if (!manifest.ok) {
      throw new Error('production gameplay parity capture did not satisfy renderer/capture gates');
    }
    if (args.enforceDefaultParity && !manifest.defaultReady) {
      throw new Error('production gameplay parity is not default-ready under current thresholds');
    }
  } finally {
    await browser.close().catch(() => {});
    await closeLocalhostBrowserProcesses();
  }
}

run().catch((error) => {
  console.error('[KONVEYOR-GAMEPLAY-PARITY] fatal:', error);
  process.exit(1);
});
