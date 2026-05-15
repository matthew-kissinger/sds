import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { getRequiredPresetNames } from '../js/atmosphere/skyPresets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:4173/',
    outDir: 'cycle36-validation/runtime/sky-preset-screenshots',
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

function buildDiagnosticUrl(baseUrl, presetName) {
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('diagnostic', '1');
  url.searchParams.set('konveyorSkyPreset', presetName);
  return url.href;
}

async function capturePreset({ context, baseUrl, presetName, outDir }) {
  const page = await context.newPage();
  const url = buildDiagnosticUrl(baseUrl, presetName);
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => {
      const state = window.__sdsG;
      return state && (state.ok || state.error);
    }, null, { timeout: 30_000 });
    await page.waitForFunction(() => (window.__sdsG?.frames ?? 0) >= 3, null, { timeout: 30_000 });

    const state = await page.evaluate(() => ({
      rendererMode: window.__sdsRendererMode ?? null,
      skyPreset: window.__sdsG?.skyPreset ?? null,
      skyFog: window.__sdsG?.skyFog ?? null,
      ok: !!window.__sdsG?.ok,
      error: window.__sdsG?.error ?? null,
      frames: window.__sdsG?.frames ?? 0,
      islands: window.__sdsG?.islands ?? [],
    }));

    if (!state.ok) {
      throw new Error(`diagnostic failed for ${presetName}: ${state.error || 'unknown error'}`);
    }

    const screenshot = `${presetName}.png`;
    await page.locator('canvas').first().screenshot({
      path: resolve(outDir, screenshot),
    });

    return {
      presetName,
      url,
      screenshot,
      rendererMode: state.rendererMode,
      skyPreset: state.skyPreset,
      skyFog: {
        source: state.skyFog?.source ?? null,
        presetName: state.skyFog?.presetName ?? null,
        horizonColor: state.skyFog?.horizonColor ?? null,
        zenithColor: state.skyFog?.zenithColor ?? null,
        sunColor: state.skyFog?.sunColor ?? null,
        sunDirection: state.skyFog?.sunDirection ?? null,
        fogColor: state.skyFog?.fogColor ?? null,
        fogNear: state.skyFog?.fogNear ?? null,
        fogFar: state.skyFog?.fogFar ?? null,
        cloudCoverage: state.skyFog?.cloudCoverage ?? null,
      },
      frames: state.frames,
      islandCount: state.islands.length,
      hasCloudPlane: state.islands.includes('cloud-plane'),
      consoleErrors,
      pageErrors,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function run() {
  const args = parseArgs(process.argv);
  const outDir = resolve(ROOT, args.outDir);
  await mkdir(outDir, { recursive: true });

  const launchOptions = { args: CHROMIUM_GPU_ARGS };
  if (args.channel) launchOptions.channel = args.channel;

  const browser = await chromium.launch(launchOptions);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    try {
      const presets = [];
      for (const presetName of getRequiredPresetNames()) {
        presets.push(await capturePreset({
          context,
          baseUrl: args.baseUrl,
          presetName,
          outDir,
        }));
      }

      const manifest = {
        capturedAt: new Date().toISOString(),
        baseUrl: args.baseUrl,
        channel: args.channel ?? 'playwright-chromium',
        chromiumArgs: CHROMIUM_GPU_ARGS,
        viewport: { width: 1280, height: 720 },
        ok: presets.every((preset) => preset.rendererMode?.effective === 'webgpu-diagnostic'),
        presets,
      };

      await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      console.log(JSON.stringify(manifest, null, 2));
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error('[SKY-PRESET-CAPTURE] fatal:', error);
  process.exit(1);
});
