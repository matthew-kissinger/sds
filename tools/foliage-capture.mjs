// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** Capture the shipped procedural foliage from real solo play without the
 * deferred debug driver or readout UI. */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeScreenshot } from './screenshot-analysis.mjs';
import {
  SEED,
  launchBrowser,
  percentile,
  removeDir,
  repo,
  scratchDir,
} from './probe-lib.mjs';

const argv = process.argv.slice(2);
const flag = (name, fallback = '') => {
  const hit = argv.find((argument) => argument.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const base = flag('url').replace(/\/$/, '');
const label = flag('label', 'original-procedural-foliage');
const onlyScenario = flag('scenario');
const boundaryHero = argv.includes('--boundary-hero');
if (!base) throw new Error('--url=<production-preview-url> is required');
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(label)) throw new Error('invalid label');

const outputDir = join(repo, 'captures', 'gallery', label);
const sourceLedger = JSON.parse(
  readFileSync(join(repo, 'assets', 'treeline', 'procedural-manifest.json'), 'utf8'),
);
const scenarios = [
  { name: 'follow', camera: 'follow', width: 1600, height: 1000, dpr: 1, debug: '', followAfterMove: true, route: [{ keys: ['KeyA'], moveMs: 750 }, { keys: ['KeyW'], moveMs: 2_500 }] },
  { name: 'hero-fixed', camera: 'follow', width: 1600, height: 1000, dpr: 1, debug: '', flockSize: 25, followAfterMove: true, route: [{ keys: ['KeyA'], moveMs: 750 }, { keys: ['KeyW'], moveMs: 2_500 }], motionSequence: true },
  { name: 'phone', camera: 'classic', width: 390, height: 844, dpr: 3, debug: '', mobile: true, route: [{ keys: ['KeyA'], moveMs: 750 }, { keys: ['KeyW'], moveMs: 2_500 }] },
  // Prime the WebGPU pipeline with the lower cameras before the high Classic
  // view. Some native Chrome runs otherwise return one clear-color canvas for
  // the first post-auto-tier screenshot even though later frames are healthy.
  { name: 'classic', camera: 'classic', width: 1600, height: 1000, dpr: 1, debug: '', route: [{ keys: ['KeyA'], moveMs: 750 }, { keys: ['KeyW'], moveMs: 2_500 }] },
  { name: 'classic-webgl2', camera: 'classic', width: 1600, height: 1000, dpr: 1, debug: 'webgl', route: [{ keys: ['KeyA'], moveMs: 750 }, { keys: ['KeyW'], moveMs: 2_500 }] },
];
const boundaryRoute = [
  { keys: ['KeyD', 'KeyW'], moveMs: 8_000 },
  { keys: ['KeyW'], moveMs: 8_000 },
  { keys: ['KeyA'], moveMs: 1_500 },
  { keys: ['KeyW'], moveMs: 1_000 },
];
const routedScenarios = boundaryHero
  ? scenarios.map((scenario) => ({ ...scenario, route: boundaryRoute }))
  : scenarios;
const selectedScenarios = onlyScenario
  ? routedScenarios.filter((scenario) => scenario.name === onlyScenario)
  : routedScenarios;
if (onlyScenario && selectedScenarios.length === 0) {
  throw new Error(`unknown scenario: ${onlyScenario}`);
}

function summary(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50: Number(percentile(sorted, 0.5).toFixed(2)),
    p95: Number(percentile(sorted, 0.95).toFixed(2)),
    p99: Number(percentile(sorted, 0.99).toFixed(2)),
    max: Number((sorted.at(-1) ?? 0).toFixed(2)),
  };
}

async function capture(browser, scenario) {
  const context = await browser.newContext({
    viewport: { width: scenario.width, height: scenario.height },
    deviceScaleFactor: scenario.dpr,
    ...(scenario.mobile ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) => failedRequests.push({
    url: request.url(),
    error: request.failure()?.errorText ?? 'request failed',
  }));

  try {
    const query = new URLSearchParams({ seed: String(SEED) });
    if (scenario.debug) query.set('debug', scenario.debug);
    await page.goto(`${base}/?${query}`, {
      waitUntil: 'load',
      timeout: 60_000,
    });
    await page.waitForSelector('canvas', { timeout: 60_000 });
    await page.waitForFunction(() => {
      const app = document.querySelector('.herd-app');
      const play = document.querySelector('.herd-button--primary');
      return app instanceof HTMLElement && app.dataset.ready === 'true'
        && play instanceof HTMLButtonElement && !play.disabled;
    }, { timeout: 90_000, polling: 100 });
    const flockSize = scenario.flockSize ?? 200;
    await page.locator('.herd-size').filter({ hasText: String(flockSize) }).click();
    await page.locator('.herd-button--primary').click();
    await page.waitForSelector('.herd-app[data-phase="playing"]', { timeout: 30_000 });
    if (scenario.follow) await page.keyboard.press('KeyC');
    if (scenario.sprint !== false) await page.keyboard.down('ShiftLeft');
    const route = scenario.route ?? [{ keys: scenario.keys, moveMs: scenario.moveMs }];
    for (const segment of route) {
      for (const key of segment.keys) await page.keyboard.down(key);
      await page.waitForTimeout(segment.moveMs);
      for (const key of segment.keys) await page.keyboard.up(key);
    }
    if (scenario.sprint !== false) await page.keyboard.up('ShiftLeft');
    if (scenario.followAfterMove) await page.keyboard.press('KeyC');
    await page.waitForTimeout(1_000);

    const motionFiles = [];
    if (scenario.motionSequence) {
      for (let frame = 0; frame < 3; frame++) {
        const file = `hero-sway-${frame}.png`;
        await page.screenshot({ path: join(outputDir, file) });
        motionFiles.push({ file, elapsedMs: frame * 650 });
        if (frame < 2) await page.waitForTimeout(650);
      }
    }

    const runtime = await page.evaluate(async () => {
      const deltas = [];
      const longTasks = [];
      let observer = null;
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push(entry.duration);
        });
        observer.observe({ type: 'longtask', buffered: true });
      } catch {
        observer = null;
      }
      await new Promise((resolve) => {
        const started = performance.now();
        let previous = started;
        const frame = (now) => {
          deltas.push(now - previous);
          previous = now;
          if (now - started >= 5_000) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      observer?.disconnect();
      const canvas = document.querySelector('canvas');
      const rect = canvas?.getBoundingClientRect();
      let webgpu = false;
      let webgl2 = false;
      if (canvas) {
        try { webgpu = canvas.getContext('webgpu') !== null; } catch {}
        try { webgl2 = canvas.getContext('webgl2') !== null; } catch {}
      }
      return {
        deltas: deltas.slice(1),
        longTasks,
        backend: webgpu ? 'webgpu' : webgl2 ? 'webgl2' : 'unknown',
        canvas: canvas && rect ? {
          cssWidth: Math.round(rect.width),
          cssHeight: Math.round(rect.height),
          bufferWidth: canvas.width,
          bufferHeight: canvas.height,
        } : null,
        renderTier: document.querySelector('.herd-app')?.dataset.renderTier ?? '',
        treeline: JSON.parse(document.body.dataset.treelineAssets ?? 'null'),
        resources: performance.getEntriesByType('resource').map((entry) =>
          new URL(entry.name).pathname),
      };
    });

    let png;
    let pixels;
    for (let attempt = 0; attempt < 3; attempt++) {
      png = await page.screenshot({ path: join(outputDir, `${scenario.name}.png`) });
      pixels = await analyzeScreenshot(page, png);
      if (pixels.nonblank) break;
      await page.waitForTimeout(500);
    }
    return {
      scenario: scenario.name,
      file: `${scenario.name}.png`,
      camera: scenario.camera,
      motionFiles,
      seed: SEED,
      flockSize,
      viewport: { width: scenario.width, height: scenario.height },
      deviceScaleFactor: scenario.dpr,
      backend: runtime.backend,
      renderTier: runtime.renderTier,
      canvas: runtime.canvas,
      frames: summary(runtime.deltas),
      longTasks: summary(runtime.longTasks),
      runtimeTreeline: runtime.treeline,
      treelineSource: {
        id: sourceLedger.id,
        license: sourceLedger.license,
        runtime: sourceLedger.runtime,
        geometry: sourceLedger.geometry,
        field: sourceLedger.field,
      },
      glbRequests: runtime.resources.filter((path) => path.toLowerCase().endsWith('.glb')),
      pixels,
      errors: [...new Set(errors)],
      failedRequests,
    };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

mkdirSync(outputDir, { recursive: true });
const profile = scratchDir(`herd-foliage-${label}`);
let browser = null;
const results = [];
let failed = false;
try {
  browser = await launchBrowser(profile);
  // Native WebGPU can return the clear colour for the first isolated context
  // while its auto-tier renderer is being replaced. Exercise that disposable
  // first context before recording production evidence.
  await capture(browser, { ...selectedScenarios[0], name: 'warmup', motionSequence: false })
    .catch(() => {});
  rmSync(join(outputDir, 'warmup.png'), { force: true });
  for (const scenario of selectedScenarios) {
    try {
      const result = await capture(browser, scenario);
      results.push(result);
      console.log(JSON.stringify(result));
      if (!result.pixels.nonblank || result.errors.length > 0 || result.failedRequests.length > 0) {
        failed = true;
      }
    } catch (error) {
      failed = true;
      const result = { scenario: scenario.name, error: String(error) };
      results.push(result);
      console.error(JSON.stringify(result));
    }
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  removeDir(profile);
}

writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify({
  tool: 'tools/foliage-capture.mjs',
  generatedAt: new Date().toISOString(),
  results,
}, null, 2)}\n`);
process.exit(failed ? 1 : 0);
