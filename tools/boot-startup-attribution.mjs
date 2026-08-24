// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// One bounded production diagnostic for the cold boot and the first 300 ticks.
// It patches browser renderer entry points before navigation and correlates
// pipeline work with rAF gaps without adding a debug path to the shipped app.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  READOUT,
  SEED,
  launchBrowser,
  removeDir,
  repo,
  scratchDir,
  startPreviewServer,
  stopServer,
} from './probe-lib.mjs';
import { MID_MOBILE_PROFILE } from './playtest-profile-lib.mjs';
import {
  collectBuildReceipt,
  sameBuildReceipt,
} from './playtest-profile-receipt.mjs';

const argv = process.argv.slice(2);

function flag(name, fallback) {
  const value = argv.find((argument) => argument.startsWith(`--${name}=`));
  return value === undefined ? fallback : value.slice(name.length + 3);
}

const port = Number(flag('port', '5394'));
const label = flag('label', 'boot-startup-attribution-final');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`bad port ${port}`);
if (!/^[a-zA-Z0-9._-]+$/.test(label)) throw new Error(`bad label ${label}`);

const outputDir = join(repo, 'captures', 'profiling', label);
const targetTick = 300;
const scenarios = [
  {
    name: 'desktop-webgpu',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  {
    name: 'desktop-webgl2',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    forceWebGL: true,
  },
  {
    name: 'mobile-webgpu',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    mobile: true,
  },
];

function round(value) {
  return Math.round(value * 10) / 10;
}

function summarize(events, readyMs, clickMs) {
  const gaps = events
    .filter((event) => event.kind === 'raf-gap')
    .sort((a, b) => b.durationMs - a.durationMs);
  const pipelines = events.filter((event) => event.kind.startsWith('pipeline:'));
  const longTasks = events
    .filter((event) => event.kind === 'long-task')
    .sort((a, b) => b.durationMs - a.durationMs);
  const nearestPipelines = (gap) => pipelines.filter((event) => {
    const start = event.startMs ?? event.atMs;
    const end = event.atMs;
    return start <= gap.atMs + 300 && end >= gap.atMs - 300;
  });
  const decorate = (gap) => ({
    ...gap,
    nearbyPipelines: nearestPipelines(gap),
  });
  const firstPipeline = pipelines[0] ?? null;
  const lastPipeline = pipelines.at(-1) ?? null;
  return {
    readyMs: round(readyMs),
    clickMs: round(clickMs),
    pipelineWindow: firstPipeline && lastPipeline ? {
      startMs: firstPipeline.startMs ?? firstPipeline.atMs,
      endMs: lastPipeline.atMs,
      durationMs: round(lastPipeline.atMs - (firstPipeline.startMs ?? firstPipeline.atMs)),
      calls: pipelines.length,
    } : null,
    pipelinesBeforeReady: pipelines.filter((event) => event.atMs <= readyMs).length,
    pipelinesAfterClick: pipelines.filter((event) => event.atMs >= clickMs).length,
    largestBootGaps: gaps.filter((event) => event.atMs <= readyMs).slice(0, 8).map(decorate),
    largestEarlyPlayGaps: gaps.filter((event) => event.atMs > clickMs).slice(0, 8).map(decorate),
    longTasks: longTasks.slice(0, 12),
  };
}

async function runScenario(base, spec) {
  const profileRoot = scratchDir(`herd-boot-startup-${spec.name}`);
  let browser = null;
  try {
    browser = await launchBrowser(profileRoot);
    const context = await browser.newContext({
      viewport: spec.viewport,
      deviceScaleFactor: spec.deviceScaleFactor,
      ...(spec.mobile ? { isMobile: true, hasTouch: true } : {}),
    });
    if (spec.mobile) {
      const cdp = await context.newCDPSession(await context.newPage());
      await cdp.detach();
    }
    const page = context.pages()[0] ?? await context.newPage();
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
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: MID_MOBILE_PROFILE.cpuSlowdown });
    }
    await context.addInitScript(() => {
      const events = [];
      Object.defineProperty(globalThis, '__herdBootStartupEvents', { value: events });
      const rounded = (value) => Math.round(value * 1000) / 1000;
      const state = () => {
        const data = document.querySelector('[data-testid="debug-readout"]')?.dataset;
        return {
          phase: data?.gamePhase ?? 'boot',
          tick: Number(data?.tick ?? -1),
          ready: document.querySelector('.herd-boot')?.getAttribute('data-ready') ?? 'missing',
        };
      };
      const record = (kind, atMs = performance.now(), detail = {}) => {
        events.push({ kind, atMs: rounded(atMs), ...state(), ...detail });
      };

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            record('long-task', entry.startTime, { durationMs: rounded(entry.duration) });
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        // Renderer calls and rAF gaps still provide the required attribution.
      }

      const nativeRaf = globalThis.requestAnimationFrame.bind(globalThis);
      let previousFrame = performance.now();
      const frame = (atMs) => {
        const durationMs = atMs - previousFrame;
        if (durationMs > 20) record('raf-gap', atMs, { durationMs: rounded(durationMs) });
        previousFrame = atMs;
        nativeRaf(frame);
      };
      nativeRaf(frame);

      const patchPromise = (prototype, name, kind, detail) => {
        const original = prototype?.[name];
        if (typeof original !== 'function') return;
        prototype[name] = function patchedPromiseMethod(...args) {
          const started = performance.now();
          const fields = detail?.(args[0]) ?? {};
          record(`${kind}:start`, started, fields);
          let promise;
          try {
            promise = original.apply(this, args);
          } catch (error) {
            record(`${kind}:throw`, performance.now(), {
              ...fields,
              startMs: rounded(started),
              durationMs: rounded(performance.now() - started),
              error: String(error),
            });
            throw error;
          }
          Promise.resolve(promise).then(
            () => record(`${kind}:resolved`, performance.now(), {
              ...fields,
              startMs: rounded(started),
              durationMs: rounded(performance.now() - started),
            }),
            (error) => record(`${kind}:rejected`, performance.now(), {
              ...fields,
              startMs: rounded(started),
              durationMs: rounded(performance.now() - started),
              error: String(error),
            }),
          );
          return promise;
        };
      };
      const pipelineDetail = (descriptor) => ({
        label: descriptor?.label ?? '',
        colorFormats: descriptor?.fragment?.targets?.map((target) => target?.format ?? '') ?? [],
        sampleCount: descriptor?.multisample?.count ?? 1,
        depthFormat: descriptor?.depthStencil?.format ?? '',
      });
      patchPromise(globalThis.GPU?.prototype, 'requestAdapter', 'adapter');
      patchPromise(globalThis.GPUAdapter?.prototype, 'requestDevice', 'device');
      patchPromise(globalThis.GPUDevice?.prototype, 'createRenderPipelineAsync', 'pipeline:async', pipelineDetail);

      const renderPipeline = globalThis.GPUDevice?.prototype?.createRenderPipeline;
      if (typeof renderPipeline === 'function') {
        globalThis.GPUDevice.prototype.createRenderPipeline = function patchedPipeline(descriptor) {
          const started = performance.now();
          const result = renderPipeline.call(this, descriptor);
          record('pipeline:sync', performance.now(), {
            ...pipelineDetail(descriptor),
            startMs: rounded(started),
            durationMs: rounded(performance.now() - started),
          });
          return result;
        };
      }

      const glPrototype = globalThis.WebGL2RenderingContext?.prototype;
      const getProgramParameter = glPrototype?.getProgramParameter;
      if (typeof getProgramParameter === 'function') {
        glPrototype.getProgramParameter = function patchedProgramParameter(program, parameter) {
          const started = performance.now();
          const result = getProgramParameter.call(this, program, parameter);
          if (parameter === this.LINK_STATUS) {
            record('pipeline:webgl-link', performance.now(), {
              startMs: rounded(started),
              durationMs: rounded(performance.now() - started),
            });
          }
          return result;
        };
      }
    });
    await context.route('**/api/lobbies', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"lobbies":[]}',
    }));

    const errors = [];
    page.on('crash', () => errors.push('page crashed'));
    page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console:${message.text()}`);
    });
    const debug = ['driver', 'readout', ...(spec.forceWebGL ? ['webgl'] : [])].join(',');
    await page.goto(`${base}/?seed=${SEED}&debug=${debug}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForFunction(() => {
      const play = document.querySelector('.herd-title-actions > .herd-button--primary');
      return play instanceof HTMLButtonElement && !play.disabled;
    }, undefined, { timeout: 60_000, polling: 10 });
    const readyMs = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: '200', exact: true }).click();
    const clickMs = await page.evaluate(() => performance.now());
    await page.locator('.herd-title-actions > .herd-button--primary').click();
    await page.waitForFunction(({ selector, target }) => {
      const data = document.querySelector(selector)?.dataset;
      return data?.gamePhase === 'playing' && Number(data.tick) >= target;
    }, { selector: READOUT, target: targetTick }, { timeout: 90_000, polling: 20 });
    await page.waitForTimeout(200);

    const data = await page.evaluate(() => ({
      events: globalThis.__herdBootStartupEvents ?? [],
      resources: performance.getEntriesByType('resource').map((entry) => ({
        path: new URL(entry.name).pathname,
        startMs: Math.round(entry.startTime),
        endMs: Math.round(entry.responseEnd),
        durationMs: Math.round(entry.duration),
        transferBytes: entry.transferSize || 0,
        decodedBytes: entry.decodedBodySize || 0,
      })),
    }));
    const readout = await page.locator(READOUT).evaluate((node) => ({ ...node.dataset }));
    const result = {
      name: spec.name,
      viewport: spec.viewport,
      deviceScaleFactor: spec.deviceScaleFactor,
      emulation: spec.mobile ? MID_MOBILE_PROFILE : null,
      backend: readout.backend,
      renderTier: readout.renderTier,
      fillMs: Number(readout.fillMs),
      finalTick: Number(readout.tick),
      errors,
      resources: data.resources,
      summary: summarize(data.events, readyMs, clickMs),
      events: data.events,
    };
    await context.close();
    return result;
  } finally {
    await browser?.close().catch(() => {});
    removeDir(profileRoot);
  }
}

mkdirSync(outputDir, { recursive: true });
const buildBefore = collectBuildReceipt(repo);
const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
let server = null;
const results = [];
try {
  server = await startPreviewServer(port);
  for (const scenario of scenarios) results.push(await runScenario(`http://localhost:${port}`, scenario));
} finally {
  stopServer(server);
}
const buildAfter = collectBuildReceipt(repo);
const report = {
  tool: 'tools/boot-startup-attribution.mjs',
  generatedAt: new Date().toISOString(),
  source: { gitHead },
  build: {
    stableDuringProbe: sameBuildReceipt(buildBefore, buildAfter),
    before: buildBefore,
    after: buildAfter,
  },
  targetTick,
  results,
};
writeFileSync(join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  source: report.source,
  stableBuild: report.build.stableDuringProbe,
  results: results.map((result) => ({
    name: result.name,
    backend: result.backend,
    renderTier: result.renderTier,
    fillMs: result.fillMs,
    finalTick: result.finalTick,
    errors: result.errors,
    summary: result.summary,
  })),
  report: join(outputDir, 'report.json'),
}, null, 2));
