// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:4173/',
    scene: 'field',
    out: 'cycle36-validation/runtime/scene-manager-webgpu-renderer-proof.json',
    outDir: 'cycle36-validation/runtime/scene-manager-webgpu-renderer-proof',
    channel: null,
  };

  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = match[2];
  }

  return args;
}

function buildUrl(baseUrl, sceneId) {
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('diagnostic', '1');
  url.searchParams.set('konveyorScene', sceneId);
  url.searchParams.set('konveyorSceneManagerProof', '1');
  return url.href;
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
  const buckets = new Set();
  for (let offset = 0; offset < data.length; offset += 4) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const y = luma(r, g, b);
    minLuma = Math.min(minLuma, y);
    maxLuma = Math.max(maxLuma, y);
    buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }

  return {
    dimensions: {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
    },
    lumaRange: Number((maxLuma - minLuma).toFixed(2)),
    coarseColorBuckets: buckets.size,
    nonBlank: maxLuma - minLuma >= 10 && buckets.size >= 4,
  };
}

async function run() {
  const args = parseArgs(process.argv);
  const outDir = resolve(ROOT, args.outDir);
  await mkdir(outDir, { recursive: true });

  const launchOptions = { args: CHROMIUM_GPU_ARGS };
  if (args.channel) launchOptions.channel = args.channel;
  const browser = await chromium.launch(launchOptions);
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

    const url = buildUrl(args.baseUrl, args.scene);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => {
      const state = window.__sdsG;
      return state && (state.ok || state.error);
    }, null, { timeout: 45_000 });
    await page.waitForFunction(() => (window.__sdsG?.frames ?? 0) >= 2, null, { timeout: 45_000 });

    const state = await page.evaluate(() => ({
      rendererMode: window.__sdsRendererMode ?? null,
      diagnosticOk: window.__sdsG?.ok === true,
      diagnosticError: window.__sdsG?.error ?? null,
      frames: window.__sdsG?.frames ?? 0,
      sceneBinding: window.__sdsG?.sceneBinding ?? null,
      sceneManagerRendererProof: window.__sdsG?.sceneManagerRendererProof ?? null,
    }));

    const screenshot = 'scene-manager-webgpu-renderer-proof.png';
    const screenshotPath = resolve(outDir, screenshot);
    await page.locator('canvas[data-konveyor-scene-manager-webgpu-proof="1"]').screenshot({ path: screenshotPath });
    const screenshotProof = await inspectScreenshot(screenshotPath);

    const manifest = {
      capturedAt: new Date().toISOString(),
      contract: 'konveyor-scene-manager-webgpu-renderer-proof',
      url,
      sceneId: args.scene,
      channel: args.channel ?? 'playwright-chromium',
      chromiumArgs: CHROMIUM_GPU_ARGS,
      screenshotDir: args.outDir,
      screenshot,
      ...state,
      screenshotProof,
      consoleErrors,
      pageErrors,
    };
    manifest.ok = manifest.rendererMode?.effective === 'webgpu-diagnostic'
      && manifest.diagnosticOk === true
      && manifest.sceneManagerRendererProof?.ok === true
      && manifest.sceneManagerRendererProof?.checks?.webgpuRenderer === true
      && manifest.sceneManagerRendererProof?.checks?.factorySupplyReady === true
      && manifest.sceneManagerRendererProof?.factorySupply?.mode === 'window-global'
      && manifest.sceneManagerRendererProof?.checks?.productionAtmosphereIsland === true
      && manifest.sceneManagerRendererProof?.productionAtmosphereIsland?.ok === true
      && manifest.sceneManagerRendererProof?.checks?.productionSunBillboardIsland === true
      && manifest.sceneManagerRendererProof?.productionSunBillboardIsland?.ok === true
      && manifest.sceneManagerRendererProof?.checks?.productionEffectIsland === true
      && manifest.sceneManagerRendererProof?.productionEffectIsland?.ok === true
      && manifest.sceneManagerRendererProof?.checks?.productionTreeRockIsland === true
      && manifest.sceneManagerRendererProof?.productionTreeRockIsland?.ok === true
      && manifest.sceneManagerRendererProof?.checks?.productionTerrainIsland === true
      && manifest.sceneManagerRendererProof?.productionTerrainIsland?.ok === true
      && manifest.sceneManagerRendererProof?.checks?.productionWaterIsland === true
      && manifest.sceneManagerRendererProof?.productionWaterIsland?.ok === true
      && manifest.sceneManagerRendererProof?.checks?.productionGrassIsland === true
      && manifest.sceneManagerRendererProof?.productionGrassIsland?.ok === true
      && manifest.sceneManagerRendererProof?.checks?.productionSheepIsland === true
      && manifest.sceneManagerRendererProof?.productionSheepIsland?.ok === true
      && manifest.sceneManagerRendererProof?.checks?.productionImpostorIsland === true
      && manifest.sceneManagerRendererProof?.productionImpostorIsland?.ok === true
      && manifest.sceneManagerRendererProof?.checks?.rendererReady === true
      && manifest.sceneManagerRendererProof?.renderStatus?.rendererReady === true
      && manifest.sceneManagerRendererProof?.renderStatus?.rendererReadyError === null
      && manifest.sceneManagerRendererProof?.checks?.sceneManagerAsyncRender === true
      && manifest.sceneManagerRendererProof?.renderStatus?.mode === 'async'
      && manifest.sceneManagerRendererProof?.renderStatus?.lastError === null
      && manifest.sceneManagerRendererProof?.checks?.rendered === true
      && manifest.screenshotProof.nonBlank === true
      && consoleErrors.length === 0
      && pageErrors.length === 0;

    const outPath = resolve(ROOT, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    if (!manifest.ok) {
      throw new Error('scene manager WebGPU renderer proof did not satisfy manifest gates');
    }
    await context.close().catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error('[SCENE-MANAGER-WEBGPU-PROOF] fatal:', error);
  process.exit(1);
});
