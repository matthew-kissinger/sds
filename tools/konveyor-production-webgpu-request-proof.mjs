import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_SCENES = ['field', 'rolling-hills', 'open-country'];
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:4173/',
    out: 'cycle36-validation/runtime/production-webgpu-request-proof.json',
    outDir: 'cycle36-validation/runtime/production-webgpu-request-proof',
    scenes: DEFAULT_SCENES.join(','),
    channel: 'chrome',
    route: 'plain',
  };

  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = match[2];
  }

  return {
    ...args,
    sceneIds: args.scenes.split(',').map((scene) => scene.trim()).filter(Boolean),
  };
}

function buildUrl(baseUrl, sceneId, route) {
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', 'webgpu');
  if (route === 'explicit') {
    url.searchParams.set('konveyorProduction', '1');
  }
  url.searchParams.set('scene', sceneId);
  url.searchParams.set('probeRender', '1');
  url.searchParams.set('perfMode', '1');
  url.searchParams.set('autostart', '1');
  url.searchParams.set('mode', 'classic');
  return url.href;
}

async function captureDefaultMode({ context, baseUrl }) {
  const page = await context.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => {
      const state = window.__sdsG?.productionWebGpu;
      return state?.ok === true || !!state?.error;
    }, null, { timeout: 120_000 });
    const state = await page.evaluate(() => ({
      rendererMode: window.__sdsRendererMode ?? null,
      productionWebGpuState: window.__sdsG?.productionWebGpu ?? null,
    }));
    const checks = {
      defaultRequestedWebGpu: state.rendererMode?.requested === 'webgpu',
      defaultProductionWebGpu: state.rendererMode?.effective === 'webgpu-production',
      defaultHasNoFallback: state.rendererMode?.fallbackReason == null,
      defaultProductionStateOk: state.productionWebGpuState?.ok === true,
      defaultDevicePreflightOk: state.productionWebGpuState?.devicePreflight?.ok === true,
    };
    return {
      url: baseUrl,
      ...state,
      checks,
      ok: Object.values(checks).every(Boolean),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function captureStoredWebGlPreferenceMode({ context, baseUrl }) {
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      localStorage.setItem('sds-settings', JSON.stringify({ experimentalWebGpu: false }));
    });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const state = await page.evaluate(() => ({
      rendererMode: window.__sdsRendererMode ?? null,
      productionWebGpuState: window.__sdsG?.productionWebGpu ?? null,
    }));
    const checks = {
      storedPreferenceRequestedWebGl: state.rendererMode?.requested === 'webgl',
      storedPreferenceEffectiveWebGl: state.rendererMode?.effective === 'webgl',
      storedPreferenceHasNoFallback: state.rendererMode?.fallbackReason == null,
      storedPreferenceNotProductionWebGpu: state.rendererMode?.productionWebGpu === false,
      storedPreferenceNoProductionState: state.productionWebGpuState == null,
    };
    return {
      url: baseUrl,
      ...state,
      checks,
      ok: Object.values(checks).every(Boolean),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function captureExplicitWebGlMode({ context, baseUrl }) {
  const page = await context.newPage();
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', 'webgl');
  try {
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const state = await page.evaluate(() => ({
      rendererMode: window.__sdsRendererMode ?? null,
      productionWebGpuState: window.__sdsG?.productionWebGpu ?? null,
    }));
    const checks = {
      explicitRequestedWebGl: state.rendererMode?.requested === 'webgl',
      explicitEffectiveWebGl: state.rendererMode?.effective === 'webgl',
      explicitHasNoFallback: state.rendererMode?.fallbackReason == null,
      explicitNotProductionWebGpu: state.rendererMode?.productionWebGpu === false,
      explicitNoProductionState: state.productionWebGpuState == null,
    };
    return {
      url: url.href,
      ...state,
      checks,
      ok: Object.values(checks).every(Boolean),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function captureWebGpuUnavailableMode({ context, baseUrl }) {
  const page = await context.newPage();
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', 'webgpu');
  try {
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const state = await page.evaluate(() => ({
      rendererMode: window.__sdsRendererMode ?? null,
      productionWebGpuState: window.__sdsG?.productionWebGpu ?? null,
    }));
    const checks = {
      requestedWebGpu: state.rendererMode?.requested === 'webgpu',
      webgpuApiUnavailable: state.rendererMode?.webgpuApiAvailable === false,
      fallbackWebGl: state.rendererMode?.effective === 'webgl',
      fallbackReasonUnavailable: state.rendererMode?.fallbackReason === 'webgpu-unavailable',
      notProductionWebGpu: state.rendererMode?.productionWebGpu === false,
      noProductionState: state.productionWebGpuState == null,
    };
    return {
      url: url.href,
      ...state,
      checks,
      ok: Object.values(checks).every(Boolean),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function captureWebGpuDeviceFailureMode({ context, baseUrl }) {
  const page = await context.newPage();
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('probeRender', '1');
  try {
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => window.__sds?.sceneManagerRef, null, { timeout: 60_000 });
    const state = await page.evaluate(() => {
      const sceneManager = window.__sds?.sceneManagerRef ?? null;
      const renderer = sceneManager?.getRenderer?.() ?? null;
      return {
        rendererMode: window.__sdsRendererMode ?? null,
        productionWebGpuState: window.__sdsG?.productionWebGpu ?? null,
        renderer: {
          className: renderer?.constructor?.name ?? null,
          isWebGLRenderer: renderer?.isWebGLRenderer === true,
          isWebGPURenderer: renderer?.isWebGPURenderer === true,
        },
      };
    });
    const checks = {
      requestedWebGpu: state.rendererMode?.requested === 'webgpu',
      webgpuApiAvailable: state.rendererMode?.webgpuApiAvailable === true,
      fallbackWebGl: state.rendererMode?.effective === 'webgl',
      fallbackReasonDevice: state.rendererMode?.fallbackReason === 'webgpu-device-request-failed',
      notProductionWebGpu: state.rendererMode?.productionWebGpu === false,
      productionStateFailed: state.productionWebGpuState?.ok === false
        && state.productionWebGpuState?.enabled === false,
      preflightFailed: state.productionWebGpuState?.devicePreflight?.ok === false
        && state.productionWebGpuState?.devicePreflight?.adapterAvailable === true
        && state.productionWebGpuState?.devicePreflight?.deviceAvailable === false,
      rendererWebGl: state.renderer?.isWebGLRenderer === true
        && state.renderer?.isWebGPURenderer === false,
    };
    return {
      url: url.href,
      ...state,
      checks,
      ok: Object.values(checks).every(Boolean),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function luma(r, g, b) {
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

async function inspectScreenshot(path) {
  const image = sharp(path);
  const metadata = await image.metadata();
  const { data } = await image
    .resize({ width: 64, height: 36, fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minLuma = Infinity;
  let maxLuma = -Infinity;
  const colorBuckets = new Set();

  for (let offset = 0; offset < data.length; offset += 4) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const y = luma(r, g, b);
    minLuma = Math.min(minLuma, y);
    maxLuma = Math.max(maxLuma, y);
    colorBuckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }

  return {
    dimensions: {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
    },
    lumaRange: round(maxLuma - minLuma),
    coarseColorBuckets: colorBuckets.size,
    nonBlank: maxLuma - minLuma >= 20 && colorBuckets.size >= 16,
  };
}

async function captureScene({ context, baseUrl, sceneId, outDir, route }) {
  const page = await context.newPage();
  const url = buildUrl(baseUrl, sceneId, route);
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => {
      const state = window.__sdsG?.productionWebGpu;
      return state?.ok === true || !!state?.error;
    }, null, { timeout: 120_000 });
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 30_000 });
    await page.evaluate(() => window.__perfHarness.startSampling(2000));
    await page.waitForTimeout(2200);

    const state = await page.evaluate(() => {
      const terrain = window.__sds?.terrainBuilderRef ?? null;
      const grass = terrain?.grassSystem ?? null;
      const sceneManager = window.__sds?.sceneManagerRef ?? null;
      const renderer = sceneManager?.getRenderer?.() ?? null;
      const water = sceneManager?.waterBundle?.water ?? null;
      return {
        rendererMode: window.__sdsRendererMode ?? null,
        diagnosticBoot: window.__sdsG?.r === true,
        productionWebGpu: window.__sdsG?.productionWebGpu ?? null,
        currentSceneId: window.__currentSceneId ?? null,
        renderer: {
          className: renderer?.constructor?.name ?? null,
          isWebGLRenderer: renderer?.isWebGLRenderer === true,
          isWebGPURenderer: renderer?.isWebGPURenderer === true,
          calls: renderer?.info?.render?.calls ?? null,
          triangles: renderer?.info?.render?.triangles ?? null,
        },
        summaries: {
          treeRockMaterial: terrain?.konveyorTreeRockMaterialSummary ?? null,
          rockPlacement: terrain?.konveyorRockPlacementSummary ?? null,
          terrainMaterial: terrain?.konveyorTerrainMaterialSummary ?? null,
          grassBladeMaterial: grass?.konveyorGrassBladeMaterialSummary ?? null,
          meadowQuadMaterial: grass?.konveyorMeadowQuadMaterialSummary ?? null,
          waterMaterial: water?.konveyorWaterMaterialSummary ?? null,
          atmosphereMaterial: window.__sdsKonveyorAtmosphereMaterialAdapter ?? null,
          effectMaterial: window.__sdsKonveyorEffectMaterialAdapter ?? null,
        },
        perfSummary: window.__perfHarness?.getSummary?.() ?? null,
      };
    });
    const screenshot = `${sceneId}.png`;
    const screenshotPath = resolve(outDir, screenshot);
    await page.locator('#canvas-container canvas').first().screenshot({ path: screenshotPath });
    const screenshotProof = await inspectScreenshot(screenshotPath);
    const isIsland = sceneId !== 'field';
    const checks = {
      effectiveProductionWebGpu: state.rendererMode?.effective === 'webgpu-production',
      noFallback: state.rendererMode?.fallbackReason == null,
      diagnosticOff: state.diagnosticBoot === false,
      productionStateOk: state.productionWebGpu?.ok === true,
      devicePreflightOk: state.productionWebGpu?.devicePreflight?.ok === true,
      rendererWebGpu: state.renderer?.isWebGPURenderer === true
        || state.renderer?.className === 'WebGPURenderer',
      sceneMatches: state.currentSceneId === sceneId,
      treeRockMaterialApplied: state.summaries?.treeRockMaterial?.applied === true,
      terrainMaterialApplied: state.summaries?.terrainMaterial?.applied === true,
      grassMaterialApplied: state.summaries?.grassBladeMaterial?.applied === true,
      sheepMaterialApplied: state.productionWebGpu?.checks?.sheepFactoryApplied === true,
      nativeInstancing: state.productionWebGpu?.checks?.nativeTreeInstancing === true
        && state.productionWebGpu?.checks?.nativeRockInstancing === true,
      waterMaterialApplied: !isIsland || state.summaries?.waterMaterial?.applied === true,
      atmosphereFrameRecorded: state.productionWebGpu?.atmosphereFrame?.contract === 'AtmosphereFrame.v1'
        && state.productionWebGpu?.atmosphereFrame?.presetName != null
        && Array.isArray(state.productionWebGpu?.atmosphereFrame?.sunDirection)
        && Array.isArray(state.productionWebGpu?.atmosphereFrame?.sunColor)
        && Array.isArray(state.productionWebGpu?.atmosphereFrame?.zenithColor)
        && Array.isArray(state.productionWebGpu?.atmosphereFrame?.horizonColor)
        && Array.isArray(state.productionWebGpu?.atmosphereFrame?.fogColor)
        && Number.isFinite(state.productionWebGpu?.atmosphereFrame?.fogNear)
        && Number.isFinite(state.productionWebGpu?.atmosphereFrame?.fogFar)
        && Number.isFinite(state.productionWebGpu?.atmosphereFrame?.cloudCoverage),
      screenshotNonBlank: screenshotProof.nonBlank === true,
      perfSampled: (state.perfSummary?.sampleCount ?? 0) >= 1,
      noConsoleErrors: consoleErrors.length === 0,
      noPageErrors: pageErrors.length === 0,
    };

    return {
      sceneId,
      url,
      screenshot,
      screenshotProof,
      ...state,
      consoleErrors,
      pageErrors,
      checks,
      ok: Object.values(checks).every(Boolean),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function run() {
  const args = parseArgs(process.argv);
  const launchOptions = { args: CHROMIUM_GPU_ARGS, headless: true };
  if (args.channel) launchOptions.channel = args.channel;
  const outDir = resolve(ROOT, args.outDir);
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch(launchOptions);
  try {
    const unavailableContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: 'block',
    });
    await unavailableContext.addInitScript(() => {
      try {
        Object.defineProperty(Navigator.prototype, 'gpu', {
          configurable: true,
          get: () => undefined,
        });
      } catch {}
      try {
        Object.defineProperty(window.navigator, 'gpu', {
          configurable: true,
          get: () => undefined,
        });
      } catch {}
    });
    let webGpuUnavailableMode;
    try {
      webGpuUnavailableMode = await captureWebGpuUnavailableMode({
        context: unavailableContext,
        baseUrl: args.baseUrl,
      });
    } finally {
      await unavailableContext.close().catch(() => {});
    }

    const deviceFailureContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: 'block',
    });
    await deviceFailureContext.addInitScript(() => {
      const simulatedGpu = {
        requestAdapter: async () => ({
          requestDevice: async () => {
            throw new Error('simulated-device-failure');
          },
        }),
      };
      try {
        Object.defineProperty(Navigator.prototype, 'gpu', {
          configurable: true,
          get: () => simulatedGpu,
        });
      } catch {}
      try {
        Object.defineProperty(window.navigator, 'gpu', {
          configurable: true,
          get: () => simulatedGpu,
        });
      } catch {}
    });
    let webGpuDeviceFailureMode;
    try {
      webGpuDeviceFailureMode = await captureWebGpuDeviceFailureMode({
        context: deviceFailureContext,
        baseUrl: args.baseUrl,
      });
    } finally {
      await deviceFailureContext.close().catch(() => {});
    }

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: 'block',
    });
    try {
      const scenes = [];
      const defaultMode = await captureDefaultMode({
        context,
        baseUrl: args.baseUrl,
      });
      const storedWebGlPreferenceMode = await captureStoredWebGlPreferenceMode({
        context,
        baseUrl: args.baseUrl,
      });
      const explicitWebGlMode = await captureExplicitWebGlMode({
        context,
        baseUrl: args.baseUrl,
      });
      for (const sceneId of args.sceneIds) {
        scenes.push(await captureScene({
          context,
          baseUrl: args.baseUrl,
          sceneId,
          outDir,
          route: args.route,
        }));
      }

      const manifest = {
        capturedAt: new Date().toISOString(),
        contract: 'konveyor-production-webgpu-request-proof',
        baseUrl: args.baseUrl,
        route: args.route,
        screenshotDir: args.outDir,
        channel: args.channel,
        chromiumArgs: CHROMIUM_GPU_ARGS,
        defaultMode,
        storedWebGlPreferenceMode,
        explicitWebGlMode,
        webGpuUnavailableMode,
        webGpuDeviceFailureMode,
        ok: defaultMode.ok
          && storedWebGlPreferenceMode.ok
          && explicitWebGlMode.ok
          && scenes.every((scene) => scene.ok),
        scenes,
      };
      manifest.ok = manifest.ok
        && webGpuUnavailableMode.ok
        && webGpuDeviceFailureMode.ok;

      const outPath = resolve(ROOT, args.out);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, JSON.stringify(manifest, null, 2));
      console.log(JSON.stringify(manifest, null, 2));
      if (!manifest.ok) {
        throw new Error('production WebGPU request proof did not satisfy manifest gates');
      }
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error('[PRODUCTION-WEBGPU-REQUEST] fatal:', error);
  process.exit(1);
});
