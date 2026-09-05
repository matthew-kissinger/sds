// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Integrated playtest profiler. It drives the normal title -> Play -> herding
// path and records boot, rendering, motion/grounding diagnostics, resource
// timing, errors and an active-play screenshot. Production preview is the
// default; --url deliberately reuses an already-running server for iteration.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  READOUT,
  SEED,
  launchBrowser,
  percentile,
  pressPlay,
  readout,
  removeDir,
  repo,
  scratchDir,
  startPreviewServer,
  stopServer,
} from './probe-lib.mjs';
import {
  MID_MOBILE_PROFILE,
  drawCallsWithinBudget,
  evaluateFramePacing,
  failureCollectionsAreEmpty,
  requestedBackendMatches,
} from './playtest-profile-lib.mjs';
import {
  collectBuildReceipt,
  sameBuildReceipt,
} from './playtest-profile-receipt.mjs';
import { analyzeScreenshot } from './screenshot-analysis.mjs';
import { installArtRenderCounters } from './art-render-counters.mjs';

const argv = process.argv.slice(2);

function flag(name, fallback) {
  const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
}

function numberFlag(name, fallback) {
  const value = Number(flag(name, String(fallback)));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`bad --${name}=${value}`);
  return value;
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function stats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    samples: sorted.length,
    mean: sorted.length > 0 ? round(total / sorted.length) : 0,
    p50: round(percentile(sorted, 0.5)),
    // Gate the exact percentile. Rounding 16.704 to 16.7 must not convert a
    // miss into a pass at the 16.7 ms desktop ceiling.
    p95: percentile(sorted, 0.95),
    p99: round(percentile(sorted, 0.99)),
    // Keep the exact maximum: rounding 100.004 to 100 would let a gap above
    // the absolute freeze ceiling pass.
    max: sorted.at(-1) ?? 0,
    over16_7: sorted.filter((value) => value > 16.7).length,
    over33_4: sorted.filter((value) => value > 33.4).length,
  };
}

const port = numberFlag('port', 5320);
// spec/08 requires a scripted 60 s performance run. Iteration probes can keep
// using --seconds without weakening the authoritative default.
const seconds = numberFlag('seconds', 60);
const sampleTick = numberFlag('ticks', 300);
const flockSize = numberFlag('flock', 200);
if (![25, 75, 200].includes(flockSize)) throw new Error('--flock must be 25, 75 or 200');

const urlFlag = flag('url', '');
const base = urlFlag ? urlFlag.replace(/\/$/, '') : `http://localhost:${port}`;
const label = flag('label', new Date().toISOString().replace(/[:.]/g, '-'));
if (!/^[a-zA-Z0-9._-]+$/.test(label)) throw new Error('--label may contain letters, numbers, dot, dash and underscore');
const outputDir = join(repo, 'captures', 'profiling', label);

const SCENARIOS = {
  'art-classic-webgpu': {
    viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1,
    quality: 'high', bootBudgetMs: 2_000, frameBudgetMs: 16.7,
  },
  'art-follow-webgpu': {
    viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1,
    quality: 'high', followCamera: true, bootBudgetMs: 2_000, frameBudgetMs: 16.7,
  },
  'art-follow-webgl2': {
    viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1,
    quality: 'high', followCamera: true, forceWebGL: true, bootBudgetMs: 2_000, frameBudgetMs: 16.7,
  },
  'art-phone-high-webgpu': {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, mobile: true,
    quality: 'high', followCamera: true, bootBudgetMs: 5_000, frameBudgetMs: 16.7,
  },
  'art-phone-low-webgl2': {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, mobile: true,
    quality: 'low', forceWebGL: true, bootBudgetMs: 5_000, frameBudgetMs: 33.4,
  },
  'art-landscape-low-webgl2': {
    viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, mobile: true,
    quality: 'low', followCamera: true, forceWebGL: true, bootBudgetMs: 5_000, frameBudgetMs: 33.4,
  },
  'desktop-webgpu': {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    bootBudgetMs: 2_000,
    frameBudgetMs: 16.7,
  },
  'desktop-hidpi-webgpu': {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    bootBudgetMs: 2_000,
    frameBudgetMs: 16.7,
  },
  'desktop-high-webgpu': {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    quality: 'high',
    bootBudgetMs: 2_000,
    frameBudgetMs: 16.7,
  },
  'desktop-webgl2': {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    forceWebGL: true,
    bootBudgetMs: 2_000,
    frameBudgetMs: 16.7,
  },
  'desktop-world-webgpu': {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    beautyCamera: true,
    bootBudgetMs: 2_000,
    frameBudgetMs: 16.7,
  },
  'desktop-world-webgl2': {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    forceWebGL: true,
    beautyCamera: true,
    bootBudgetMs: 2_000,
    frameBudgetMs: 16.7,
  },
  'mobile-webgpu': {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    mobile: true,
    bootBudgetMs: 5_000,
    frameBudgetMs: 33.4,
  },
};

const requested = flag('scenarios', Object.keys(SCENARIOS).filter((name) => !name.startsWith('art-')).join(',')).split(',').filter(Boolean);
for (const name of requested) {
  if (!(name in SCENARIOS)) throw new Error(`unknown scenario ${name}`);
}

async function sampleRuntime(page, durationMs, selector = READOUT) {
  return page.evaluate(async ({ durationMs, selector }) => {
    const deltas = [];
    const renderer = [];
    const diagnostics = [];
    const longTasks = [];
    const started = performance.now();
    let observer = null;
    if ('PerformanceObserver' in window) {
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          }
        });
        observer.observe({ type: 'longtask' });
      } catch {
        observer = null;
      }
    }

    await new Promise((resolve) => {
      let last = performance.now();
      let frame = 0;
      const sample = (now) => {
        deltas.push(now - last);
        last = now;
        const node = document.querySelector(selector);
        if (node instanceof HTMLElement && frame % 8 === 0) {
          const data = { ...node.dataset };
          renderer.push({
            frame,
            drawCalls: Number(data.drawCalls),
            triangles: Number(data.triangles),
            geometries: Number(data.geometries),
            textures: Number(data.textures),
          });
          diagnostics.push({
            sheepFootErrorMax: Number(data.sheepFootErrorMax),
            sheepAirborne: Number(data.sheepAirborne),
            sheepTurnStepMax: Number(data.sheepTurnStepMax),
            dogTurnStep: Number(data.dogTurnStep),
            treeGroundErrorMax: Number(data.treeGroundErrorMax),
            treeSupportGapMax: Number(data.treeSupportGapMax),
            treeUnsupported: Number(data.treeUnsupported),
            treeVerticalDriftMax: Number(data.treeVerticalDriftMax),
          });
        }
        frame += 1;
        if (now - started >= durationMs) resolve();
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    for (const entry of observer?.takeRecords() ?? []) {
      longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    }
    observer?.disconnect();
    const ended = performance.now();
    return {
      deltas,
      renderer,
      diagnostics,
      longTasks: longTasks.filter((entry) => (
        entry.startTime >= started && entry.startTime <= ended
      )),
      sampleWindow: { startedAtMs: started, endedAtMs: ended },
    };
  }, { durationMs, selector });
}

/**
 * Sample browser responsiveness from immediately after DOMContentLoaded,
 * through the real Play action, and through the pre-sample tick. Starting
 * before scene-ready and ending where steady-state sampling begins keeps title
 * initialization, flock selection, click-to-playing and early-play stalls in
 * one gated window.
 */
async function sampleStartup(page, timeoutMs, targetTick) {
  return page.evaluate(async ({ selector, timeoutMs: timeout, targetTick: target }) => {
    const deltas = [];
    const gaps = [];
    const longTasks = [];
    const started = performance.now();
    let timedOut = false;
    let observer = null;
    if ('PerformanceObserver' in window) {
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasks.push({ startTime: entry.startTime, duration: entry.duration });
          }
        });
        observer.observe({ type: 'longtask' });
      } catch {
        observer = null;
      }
    }
    await new Promise((resolve) => {
      let last = started;
      const sample = (now) => {
        const delta = now - last;
        deltas.push(delta);
        last = now;
        const node = document.querySelector(selector);
        if (delta > 33.4) {
          gaps.push({
            atMs: Math.round(now),
            deltaMs: Number(delta.toFixed(2)),
            phase: node?.dataset.gamePhase ?? '',
            tick: Number(node?.dataset.tick),
          });
        }
        // Continue through the pre-sample active-play warmup. Ending at the
        // Play edge would leave ticks 1..target unobserved and let an early
        // first-seen pipeline freeze hide between the two sampling windows.
        if (node?.dataset.gamePhase === 'playing' && Number(node.dataset.tick) >= target) resolve();
        else if (now - started >= timeout) {
          timedOut = true;
          resolve();
        } else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    for (const entry of observer?.takeRecords() ?? []) {
      longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    }
    observer?.disconnect();
    const ended = performance.now();
    return {
      deltas,
      gaps,
      longTasks: longTasks.filter((entry) => (
        entry.startTime >= started && entry.startTime <= ended
      )),
      durationMs: ended - started,
      sampleWindow: { startedAtMs: started, endedAtMs: ended },
      timedOut,
    };
  }, { selector: READOUT, timeoutMs, targetTick });
}

function diagnosticSummary(samples) {
  const keys = [
    'sheepFootErrorMax',
    'sheepAirborne',
    'sheepTurnStepMax',
    'dogTurnStep',
    'treeGroundErrorMax',
    'treeSupportGapMax',
    'treeUnsupported',
    'treeVerticalDriftMax',
  ];
  return Object.fromEntries(keys.map((key) => {
    const values = samples.map((sample) => sample[key]).filter(Number.isFinite);
    return [key, values.length > 0 ? round(Math.max(...values), 4) : null];
  }));
}

async function runScenario(browser, name, spec) {
  const context = await browser.newContext({
    serviceWorkers: 'block',
    viewport: spec.viewport,
    deviceScaleFactor: spec.deviceScaleFactor,
    ...(spec.mobile ? { isMobile: true, hasTouch: true } : {}),
  });
  if (name.startsWith('art-')) await context.addInitScript(installArtRenderCounters);
  if (spec.quality !== undefined) {
    await context.addInitScript((quality) => {
      const key = 'herd.settings.v1';
      let stored = {};
      try {
        stored = JSON.parse(localStorage.getItem(key) ?? '{}');
      } catch {
        stored = {};
      }
      localStorage.setItem(key, JSON.stringify({ ...stored, quality }));
    }, spec.quality);
  }
  const page = await context.newPage();
  if (spec.mobile) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: MID_MOBILE_PROFILE.latencyMs,
      downloadThroughput: (MID_MOBILE_PROFILE.downloadMbps * 1024 * 1024) / 8,
      uploadThroughput: (MID_MOBILE_PROFILE.uploadMbps * 1024 * 1024) / 8,
      connectionType: 'cellular4g',
    });
    await cdp.send('Emulation.setCPUThrottlingRate', {
      rate: MID_MOBILE_PROFILE.cpuSlowdown,
    });
  }
  const errors = [];
  const failedRequests = [];
  const failedResponses = [];
  let collectingFailures = true;
  const remember = (list, value) => {
    if (!collectingFailures) return;
    if (list.length < 20 && !list.some((item) => JSON.stringify(item) === JSON.stringify(value))) list.push(value);
  };
  page.on('crash', () => remember(errors, 'page crashed'));
  page.on('pageerror', (error) => remember(errors, String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') remember(errors, message.text());
  });
  page.on('requestfailed', (request) => remember(failedRequests, {
    url: request.url(),
    error: request.failure()?.errorText ?? '',
  }));
  page.on('response', (response) => {
    if (response.status() >= 400) remember(failedResponses, { status: response.status(), url: response.url() });
  });
  await context.route('**/api/lobbies', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"lobbies":[]}',
  }));
  // Local art iteration must never create production identities or scores.
  if (name.startsWith('art-')) await context.route('**/api/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      token: 'local-art-review', authSecret: 'local-art-review', entries: [],
      playerProfile: { persistentId: 'local-art-review', displayName: 'Art Review', fullName: 'Art Review' },
    }),
  }));

  try {
    const debug = [
      'driver',
      'readout',
      ...(spec.forceWebGL ? ['webgl'] : []),
      ...(spec.beautyCamera ? ['beauty'] : []),
    ].join(',');
    await page.goto(`${base}/?seed=${SEED}&debug=${debug}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    const startupPromise = name.startsWith('art-') ? Promise.resolve(null) : sampleStartup(page, 90_000, sampleTick);
    // If boot fails and the page is closed before the sampler resolves, keep
    // that rejection from becoming an unrelated unhandled-promise warning.
    void startupPromise.catch(() => {});
    const play = page.locator('.herd-title-actions > .herd-button--primary');
    await play.waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForFunction(() => {
      const button = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.trim() === 'Play');
      return button instanceof HTMLButtonElement && !button.disabled;
    }, undefined, { timeout: 60_000, polling: 25 });
    const interactiveMs = await page.evaluate(() => performance.now());
    const boot = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByName('first-contentful-paint')[0];
      const resources = performance.getEntriesByType('resource');
      return {
        domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
        loadMs: navigation?.loadEventEnd ?? 0,
        firstContentfulPaintMs: paint?.startTime ?? null,
        transferBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
        decodedBytes: resources.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0),
        slowest: resources
          .map((entry) => ({
            path: new URL(entry.name).pathname,
            durationMs: Math.round(entry.duration),
            transferBytes: entry.transferSize || 0,
            decodedBytes: entry.decodedBodySize || 0,
          }))
          .sort((a, b) => b.durationMs - a.durationMs)
          .slice(0, 10),
      };
    });

    if (name.startsWith('art-')) {
      await page.locator('.herd-size').filter({ hasText: String(flockSize) }).click();
      await play.click();
      await play.waitFor({ state: 'hidden' });
      if (spec.followCamera) await page.keyboard.press('KeyC');
      await page.keyboard.down('KeyW');
      const runtime = await sampleRuntime(page, seconds * 1000, '[data-testid="render-readout"]');
      await page.keyboard.up('KeyW');
      const frameTimes = stats(runtime.deltas);
      const screenshot = join(outputDir, `${name}.png`);
      const png = await page.screenshot({ path: screenshot });
      const visual = await analyzeScreenshot(page, png);
      const motionScreenshots = [];
      for (let index = 0; index < 3; index += 1) {
        await page.waitForTimeout(650);
        const file = join(outputDir, `${name}-motion-${index}.png`);
        await page.screenshot({ path: file });
        motionScreenshots.push(file);
      }
      const surface = await page.locator('canvas').evaluate((canvas) => {
        const app = document.querySelector('.herd-app');
        const backend = app?.dataset.backend ?? 'unknown';
        const rect = canvas.getBoundingClientRect();
        return { backend, tier: app?.dataset.renderTier ?? 'unverified', canvas: { cssWidth: Math.round(rect.width), cssHeight: Math.round(rect.height), bufferWidth: canvas.width, bufferHeight: canvas.height } };
      });
      const requestedBackend = spec.forceWebGL ? 'webgl2' : 'webgpu';
      const drawCalls = runtime.renderer.length ? stats(runtime.renderer.map((sample) => sample.drawCalls)) : null;
      const triangles = runtime.renderer.length ? stats(runtime.renderer.map((sample) => sample.triangles)) : null;
      const checks = { boot: interactiveMs <= spec.bootBudgetMs,
        backend: surface.backend === requestedBackend, frames: frameTimes.p95 <= spec.frameBudgetMs,
        freezeFree: frameTimes.max <= 100, stablePage: failureCollectionsAreEmpty(errors, failedRequests, failedResponses),
        canvas: visual.nonblank, drawCalls: drawCalls !== null && drawCallsWithinBudget(drawCalls)
          && runtime.renderer.every((sample) => sample.drawCalls >= 0 && sample.triangles >= 0),
        beautyCameraAvailable: !spec.beautyCamera };
      // Optional composition evidence comes AFTER the timing sample, so a
      // screenshot or camera rehearsal cannot hide first-use compilation cost.
      const flockScreenshots = [];
      if (argv.includes('--flock-views')) {
        if (spec.followCamera) await page.keyboard.press('KeyC');
        // Start a fresh normal run: the timed approach has already split and
        // scattered the flock, so simply backing up does not frame its spawn.
        await page.locator('.herd-pause-button').click();
        await page.getByRole('button', { name: 'Title', exact: true }).click();
        await play.click();
        await page.keyboard.down('KeyW');
        await page.waitForTimeout(1600);
        await page.keyboard.up('KeyW');
        await page.waitForTimeout(1000);
        for (const camera of ['classic', 'follow']) {
          if (camera === 'follow') {
            await page.keyboard.press('KeyC');
            await page.waitForTimeout(1200);
          }
          const file = join(outputDir, `${name}-flock-${camera}.png`);
          await page.screenshot({ path: file });
          flockScreenshots.push(file);
        }
      }
      return { name, requestedBackend, ...surface,
        camera: spec.followCamera ? 'follow' : 'classic', cameraVerification: 'scripted-controls',
        viewport: spec.viewport, deviceScaleFactor: spec.deviceScaleFactor,
        emulation: spec.mobile ? MID_MOBILE_PROFILE : null, flockSize,
        quality: { requested: spec.quality ?? 'auto', tier: surface.tier },
        boot: { interactiveMs: Math.round(interactiveMs), budgetMs: spec.bootBudgetMs, ...boot },
        runtime: { seconds, frameBudgetMs: spec.frameBudgetMs, frameTimes, drawCalls, triangles, sampleWindow: runtime.sampleWindow },
        visual, screenshot, motionScreenshots, flockScreenshots, checks, pass: Object.values(checks).every(Boolean), errors, failedRequests, failedResponses,
        note: 'Browser rAF includes tools-only API instrumentation overhead; draw/triangle counts are instrumented API submissions, not native renderer statistics or GPU timing. Camera names describe scripted controls, not measured transforms. Production strips the deterministic driver, beauty camera and grounding diagnostics; this art workload uses real W input.',
      };
    }
    await pressPlay(page, { flockSize });
    const startupRuntime = await startupPromise;
    if (spec.followCamera) await page.keyboard.press('KeyC');
    const startupFrameTimes = stats(startupRuntime.deltas);
    const before = await readout(page);
    const runtime = await sampleRuntime(page, seconds * 1000);
    const after = await readout(page);
    const frameTimes = stats(runtime.deltas);
    // WebGPURenderer exposes both cumulative render-pass calls and the actual
    // draw count of its most recently completed frame. The debug readout emits
    // the latter directly; differencing the former produced the false value 2.
    const drawCalls = stats(runtime.renderer.map((sample) => sample.drawCalls));
    const triangles = stats(runtime.renderer.map((sample) => sample.triangles));
    const diagnostics = diagnosticSummary(runtime.diagnostics);
    const lateResources = await page.evaluate((interactiveAt) => performance
      .getEntriesByType('resource')
      .filter((entry) => entry.startTime >= interactiveAt)
      .map((entry) => ({
        path: new URL(entry.name).pathname,
        startMs: Math.round(entry.startTime),
        endMs: Math.round(entry.responseEnd),
        durationMs: Math.round(entry.duration),
        transferBytes: entry.transferSize || 0,
        decodedBytes: entry.decodedBodySize || 0,
      }))
      .sort((a, b) => a.startMs - b.startMs), interactiveMs);
    const screenshot = join(outputDir, `${name}.png`);
    const screenshotPng = await page.screenshot({ path: screenshot });
    const visual = await analyzeScreenshot(page, screenshotPng);
    const motionScreenshots = [];
    if (name.startsWith('art-')) {
      for (let index = 1; index <= 2; index++) {
        await page.waitForTimeout(650);
        const file = join(outputDir, `${name}-motion-${index}.png`);
        await page.screenshot({ path: file });
        motionScreenshots.push(file);
      }
    }
    const canvas = await page.locator('canvas').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        cssWidth: Math.round(rect.width),
        cssHeight: Math.round(rect.height),
        bufferWidth: element.width,
        bufferHeight: element.height,
      };
    });
    const instrumentationComplete = Object.values(diagnostics).every((value) => value !== null);
    const requestedBackend = spec.forceWebGL ? 'webgl2' : 'webgpu';
    const frameChecks = evaluateFramePacing(
      frameTimes,
      startupFrameTimes,
      spec.frameBudgetMs,
      startupRuntime.timedOut,
    );
    const checks = {
      boot: interactiveMs <= spec.bootBudgetMs,
      backend: requestedBackendMatches(requestedBackend, after.backend),
      ...frameChecks,
      drawCalls: drawCallsWithinBudget(drawCalls),
      stablePage: failureCollectionsAreEmpty(errors, failedRequests, failedResponses),
      canvas: canvas.bufferWidth > 0 && canvas.bufferHeight > 0 && visual.nonblank,
      diagnostics: instrumentationComplete,
      sheepGrounded: diagnostics.sheepFootErrorMax !== null
        && diagnostics.sheepFootErrorMax <= 0.03
        && diagnostics.sheepAirborne === 0,
      treesGrounded: diagnostics.treeGroundErrorMax !== null
        && diagnostics.treeGroundErrorMax <= 0.05
        && diagnostics.treeSupportGapMax !== null
        && diagnostics.treeSupportGapMax <= 0.15
        && diagnostics.treeUnsupported === 0
        && diagnostics.treeVerticalDriftMax === 0,
      turningStable: diagnostics.dogTurnStep !== null
        && diagnostics.dogTurnStep <= 0.2
        && diagnostics.sheepTurnStepMax !== null
        && diagnostics.sheepTurnStepMax <= 0.35,
    };
    return {
      name,
      requestedBackend,
      camera: spec.beautyCamera ? 'beauty' : spec.followCamera ? 'follow' : 'classic',
      backend: after.backend,
      viewport: spec.viewport,
      deviceScaleFactor: spec.deviceScaleFactor,
      emulation: spec.mobile ? MID_MOBILE_PROFILE : null,
      canvas,
      visual,
      flockSize: Number(after.flockSize),
      tick: { before: Number(before.tick), after: Number(after.tick) },
      quality: {
        requested: spec.quality ?? 'auto',
        tier: after.renderTier,
        fillMs: finite(after.fillMs),
      },
      boot: {
        interactiveMs: Math.round(interactiveMs),
        budgetMs: spec.bootBudgetMs,
        ...boot,
      },
      runtime: {
        seconds,
        frameBudgetMs: spec.frameBudgetMs,
        frameTimes,
        drawCalls,
        triangles,
        renderer: {
          geometries: finite(after.geometries),
          textures: finite(after.textures),
        },
        longTasks: stats(runtime.longTasks.map((entry) => entry.duration)),
        longTaskTimeline: runtime.longTasks.map((entry) => ({
          startMs: Math.round(entry.startTime),
          durationMs: Math.round(entry.duration),
        })),
        sampleWindow: runtime.sampleWindow,
        lateResources,
      },
      startup: {
        durationMs: Math.round(startupRuntime.durationMs),
        throughTick: sampleTick,
        frameTimes: startupFrameTimes,
        gapTimeline: startupRuntime.gaps,
        longTasks: stats(startupRuntime.longTasks.map((entry) => entry.duration)),
        longTaskTimeline: startupRuntime.longTasks.map((entry) => ({
          startMs: Math.round(entry.startTime),
          durationMs: Math.round(entry.duration),
        })),
        sampleWindow: startupRuntime.sampleWindow,
        timedOut: startupRuntime.timedOut,
      },
      diagnostics,
      checks,
      pass: Object.values(checks).every(Boolean),
      errors,
      failedRequests,
      failedResponses,
      screenshot,
      motionScreenshots,
    };
  } catch (error) {
    const screenshot = join(outputDir, `${name}-failure.png`);
    await page.screenshot({ path: screenshot, timeout: 5_000 }).catch(() => {});
    return { name, pass: false, error: String(error?.stack ?? error), screenshot, errors, failedRequests, failedResponses };
  } finally {
    // Closing the page may abort harmless in-flight work. Freeze the sampled
    // failure window before teardown so cleanup cannot mutate the receipt.
    collectingFailures = false;
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

mkdirSync(outputDir, { recursive: true });
let server = null;
const results = [];
let failed = false;
const buildBefore = collectBuildReceipt(repo);

try {
  if (!urlFlag) server = await startPreviewServer(port);
  for (const name of requested) {
    let browser = null;
    let profile = null;
    try {
      profile = scratchDir(`herd-playtest-profile-${port}-${name}`);
      browser = await launchBrowser(profile);
      const result = await runScenario(browser, name, SCENARIOS[name]);
      results.push(result);
      if (!result.pass) failed = true;
      console.log(JSON.stringify({ name, pass: result.pass, checks: result.checks }));
    } catch (error) {
      failed = true;
      results.push({ name, pass: false, error: String(error?.stack ?? error) });
      console.error(`${name} failed: ${error}`);
    } finally {
      if (browser) await browser.close().catch(() => {});
      removeDir(profile);
    }
  }
} finally {
  stopServer(server);
}

const buildAfter = collectBuildReceipt(repo);
const buildStable = sameBuildReceipt(buildBefore, buildAfter);
if (!buildStable) failed = true;

const report = {
  tool: 'tools/playtest-profile.mjs',
  base,
  label,
  seed: SEED,
  flockSize,
  sampleTick,
  generatedAt: new Date().toISOString(),
  source: { gitHead: buildAfter.gitHead },
  build: {
    stableDuringProbe: buildStable,
    before: buildBefore.files,
    after: buildAfter.files,
  },
  results,
  pass: !failed,
};
const reportPath = join(outputDir, 'report.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`report: ${reportPath}`);
process.exit(failed ? 1 : 0);
