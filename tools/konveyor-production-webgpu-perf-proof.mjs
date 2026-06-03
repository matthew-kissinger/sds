// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_SCENES = ['field', 'rolling-hills', 'open-country'];
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

const DEFAULT_BUDGETS = {
  field: { avgFrameTime: 22, p95FrameTime: 30, minSamples: 240 },
  'rolling-hills': { avgFrameTime: 22, p95FrameTime: 30, minSamples: 240 },
  'open-country': { avgFrameTime: 22, p95FrameTime: 30, minSamples: 240 },
};

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:4173/',
    out: 'cycle36-validation/runtime/production-webgpu-perf-proof.json',
    scenes: DEFAULT_SCENES.join(','),
    channel: 'chrome',
    route: 'plain',
    warmupMs: '5000',
    measureMs: '8000',
    maxAvgFrameTime: null,
    maxP95FrameTime: null,
    minSamples: null,
  };

  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = match[2];
  }

  return {
    ...args,
    warmupMs: Number(args.warmupMs),
    measureMs: Number(args.measureMs),
    maxAvgFrameTime: args.maxAvgFrameTime == null ? null : Number(args.maxAvgFrameTime),
    maxP95FrameTime: args.maxP95FrameTime == null ? null : Number(args.maxP95FrameTime),
    minSamples: args.minSamples == null ? null : Number(args.minSamples),
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

function round(value, digits = 3) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toFixed(digits))
    : value;
}

function budgetFor(sceneId, args) {
  const base = DEFAULT_BUDGETS[sceneId] ?? DEFAULT_BUDGETS['open-country'];
  return {
    avgFrameTime: args.maxAvgFrameTime ?? base.avgFrameTime,
    p95FrameTime: args.maxP95FrameTime ?? base.p95FrameTime,
    minSamples: args.minSamples ?? base.minSamples,
  };
}

async function captureScene({ context, baseUrl, sceneId, warmupMs, measureMs, budget, route }) {
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
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 60_000 });
    await page.waitForTimeout(warmupMs);
    await page.evaluate(() => window.__perfHarness.reset?.());
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 15_000 });
    await page.waitForTimeout(500);

    const duration = await page.evaluate((ms) => window.__perfHarness.startSampling(ms), measureMs);
    await page.waitForTimeout(Number(duration) + 500);

    const state = await page.evaluate(() => {
      const sceneManager = window.__sds?.sceneManagerRef ?? null;
      const renderer = sceneManager?.getRenderer?.() ?? null;
      return {
        rendererMode: window.__sdsRendererMode ?? null,
        productionWebGpu: window.__sdsG?.productionWebGpu ?? null,
        currentSceneId: window.__currentSceneId ?? null,
        renderer: {
          className: renderer?.constructor?.name ?? null,
          isWebGLRenderer: renderer?.isWebGLRenderer === true,
          isWebGPURenderer: renderer?.isWebGPURenderer === true,
          calls: renderer?.info?.render?.calls ?? null,
          triangles: renderer?.info?.render?.triangles ?? null,
        },
        perfSummary: window.__perfHarness?.getSummary?.() ?? null,
      };
    });

    const summary = state.perfSummary;
    const checks = {
      effectiveProductionWebGpu: state.rendererMode?.effective === 'webgpu-production',
      noFallback: state.rendererMode?.fallbackReason == null,
      productionStateOk: state.productionWebGpu?.ok === true,
      rendererWebGpu: state.renderer?.isWebGPURenderer === true
        || state.renderer?.className === 'WebGPURenderer',
      sceneMatches: state.currentSceneId === sceneId,
      perfSampled: (summary?.sampleCount ?? 0) >= budget.minSamples,
      avgWithinBudget: (summary?.avgFrameTime ?? Infinity) <= budget.avgFrameTime,
      p95WithinBudget: (summary?.p95FrameTime ?? Infinity) <= budget.p95FrameTime,
      noConsoleErrors: consoleErrors.length === 0,
      noPageErrors: pageErrors.length === 0,
    };

    return {
      sceneId,
      url,
      warmupMs,
      measureMs,
      budget,
      ...state,
      perfSummary: summary == null ? null : {
        ...summary,
        avgFrameTime: round(summary.avgFrameTime),
        p50FrameTime: round(summary.p50FrameTime),
        p95FrameTime: round(summary.p95FrameTime),
        p99FrameTime: round(summary.p99FrameTime),
        maxFrameTime: round(summary.maxFrameTime),
        avgDrawCalls: round(summary.avgDrawCalls),
        avgTriangles: round(summary.avgTriangles),
        avgActiveSheep: round(summary.avgActiveSheep),
      },
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

  const browser = await chromium.launch(launchOptions);
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: 'block',
    });
    try {
      const scenes = [];
      for (const sceneId of args.sceneIds) {
        scenes.push(await captureScene({
          context,
          baseUrl: args.baseUrl,
          sceneId,
          warmupMs: args.warmupMs,
          measureMs: args.measureMs,
          budget: budgetFor(sceneId, args),
          route: args.route,
        }));
      }

      const manifest = {
        capturedAt: new Date().toISOString(),
        contract: 'konveyor-production-webgpu-perf-proof',
        baseUrl: args.baseUrl,
        route: args.route,
        channel: args.channel,
        chromiumArgs: CHROMIUM_GPU_ARGS,
        warmupMs: args.warmupMs,
        measureMs: args.measureMs,
        ok: scenes.every((scene) => scene.ok),
        scenes,
      };

      const outPath = resolve(ROOT, args.out);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, JSON.stringify(manifest, null, 2));
      console.log(JSON.stringify(manifest, null, 2));
      if (!manifest.ok) {
        throw new Error('production WebGPU perf proof exceeded manifest gates');
      }
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error('[PRODUCTION-WEBGPU-PERF] fatal:', error);
  process.exit(1);
});
