// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Production-only boot attribution. This leaves the app untouched and patches
// browser WebGPU prototypes before navigation so the serial renderer gates can
// be separated: device creation, first configured canvas frame, timestamped
// fill probe, tier commit, and the all-scene warm frame.

import {
  READOUT,
  SEED,
  launchBrowser,
  removeDir,
  scratchDir,
  startPreviewServer,
  stopServer,
} from './probe-lib.mjs';
import { MID_MOBILE_PROFILE } from './playtest-profile-lib.mjs';

const port = Number(process.argv.find((arg) => arg.startsWith('--port='))?.slice(7) ?? 5342);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`bad port ${port}`);

function first(events, kind) {
  return events.find((event) => event.kind === kind) ?? null;
}

function lastBefore(events, kind, beforeMs) {
  return events.filter((event) => event.kind === kind && event.atMs <= beforeMs).at(-1) ?? null;
}

function duration(from, to) {
  return from && to ? Math.round((to.atMs - from.atMs) * 10) / 10 : null;
}

function summarize(events) {
  const navigation = { kind: 'navigation', atMs: 0 };
  const domContentLoaded = first(events, 'dom-content-loaded');
  const adapterStart = first(events, 'request-adapter:start');
  const adapterReady = first(events, 'request-adapter:resolved');
  const deviceStart = first(events, 'request-device:start');
  const deviceReady = first(events, 'request-device:resolved');
  const configure = first(events, 'canvas-configure');
  const canvasFrames = events.filter((event) => event.kind === 'canvas-current-texture');
  const firstCanvasFrame = canvasFrames[0] ?? null;
  const fillVisible = first(events, 'dom-fill-receipt');
  const ready = first(events, 'dom-ready') ?? first(events, 'external-ready');
  const warmCanvasFrame = ready
    ? lastBefore(events, 'canvas-current-texture', ready.atMs)
    : null;
  const fillMaps = events.filter((event) => event.kind === 'buffer-map:resolved'
    && (!fillVisible || event.atMs <= fillVisible.atMs));
  const fillSettled = fillMaps.at(-1) ?? null;
  const firstMapStart = first(events, 'buffer-map:start');
  const submits = events.filter((event) => event.kind === 'queue-submit');
  const pipelineCalls = events.filter((event) => event.kind.startsWith('pipeline:'));
  const longTasks = events
    .filter((event) => event.kind === 'long-task')
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 12);
  const frameGaps = events
    .filter((event) => event.kind === 'raf-gap')
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 12);

  return {
    milestones: {
      domContentLoadedMs: domContentLoaded?.atMs ?? null,
      adapterStartMs: adapterStart?.atMs ?? null,
      adapterReadyMs: adapterReady?.atMs ?? null,
      deviceStartMs: deviceStart?.atMs ?? null,
      deviceReadyMs: deviceReady?.atMs ?? null,
      canvasConfigureMs: configure?.atMs ?? null,
      firstCanvasFrameMs: firstCanvasFrame?.atMs ?? null,
      fillSettledMs: fillSettled?.atMs ?? null,
      fillReceiptVisibleMs: fillVisible?.atMs ?? null,
      warmCanvasFrameMs: warmCanvasFrame?.atMs ?? null,
      readyMs: ready?.atMs ?? null,
    },
    serialStagesMs: {
      navigationToDomContentLoaded: duration(navigation, domContentLoaded),
      domContentLoadedToAdapter: duration(domContentLoaded, adapterStart),
      adapter: duration(adapterStart, adapterReady),
      device: duration(deviceStart, deviceReady),
      deviceToConfigure: duration(deviceReady, configure),
      configureToFirstCanvasFrame: duration(configure, firstCanvasFrame),
      firstCanvasFrameToFillSettled: duration(firstCanvasFrame, fillSettled),
      fillSettledToReceiptVisible: duration(fillSettled, fillVisible),
      receiptVisibleToWarmCanvasFrame: duration(fillVisible, warmCanvasFrame),
      warmCanvasFrameToReady: duration(warmCanvasFrame, ready),
    },
    countsBeforeReady: {
      canvasFrames: ready ? canvasFrames.filter((event) => event.atMs <= ready.atMs).length : canvasFrames.length,
      queueSubmits: ready ? submits.filter((event) => event.atMs <= ready.atMs).length : submits.length,
      timestampMaps: fillMaps.length,
      pipelineCalls: ready
        ? pipelineCalls.filter((event) => event.atMs <= ready.atMs).length
        : pipelineCalls.length,
    },
    pipelineClusters: {
      beforeFirstTimestampWait: {
        count: firstMapStart
          ? pipelineCalls.filter((event) => event.atMs <= firstMapStart.atMs).length
          : 0,
        firstMs: pipelineCalls[0]?.atMs ?? null,
        lastMs: firstMapStart
          ? lastBefore(pipelineCalls, pipelineCalls.at(-1)?.kind ?? '', firstMapStart.atMs)?.atMs ?? null
          : null,
        labels: firstMapStart
          ? pipelineCalls.filter((event) => event.atMs <= firstMapStart.atMs).map((event) => event.label)
          : [],
      },
      afterTimestampWaitBeforeReady: {
        count: fillSettled && ready
          ? pipelineCalls.filter((event) => event.atMs > fillSettled.atMs && event.atMs <= ready.atMs).length
          : 0,
        firstMs: fillSettled
          ? pipelineCalls.find((event) => event.atMs > fillSettled.atMs)?.atMs ?? null
          : null,
        lastMs: ready
          ? pipelineCalls.filter((event) => event.atMs <= ready.atMs).at(-1)?.atMs ?? null
          : null,
        labels: fillSettled && ready
          ? pipelineCalls
            .filter((event) => event.atMs > fillSettled.atMs && event.atMs <= ready.atMs)
            .map((event) => event.label)
          : [],
      },
    },
    queueSubmitClusters: {
      beforeFirstTimestampWait: firstMapStart
        ? submits.filter((event) => event.atMs <= firstMapStart.atMs).length
        : 0,
      duringFirstTimestampWait: firstMapStart && fillMaps[0]
        ? submits.filter((event) => event.atMs > firstMapStart.atMs && event.atMs <= fillMaps[0].atMs).length
        : 0,
      afterFillBeforeReady: fillSettled && ready
        ? submits.filter((event) => event.atMs > fillSettled.atMs && event.atMs <= ready.atMs).length
        : 0,
    },
    timestampMaps: events
      .filter((event) => event.kind.startsWith('buffer-map:'))
      .map((event) => ({ kind: event.kind, atMs: event.atMs, durationMs: event.durationMs })),
    longTasks,
    frameGaps,
  };
}

async function measure(spec) {
  let browser = null;
  let profileRoot = null;
  try {
    profileRoot = scratchDir(`herd-boot-stage-${port}-${spec.name}`);
    browser = await launchBrowser(profileRoot);
    const context = await browser.newContext({
      viewport: spec.viewport,
      deviceScaleFactor: spec.mobile ? 2 : 1,
      ...(spec.mobile ? { isMobile: true, hasTouch: true } : {}),
    });
    await context.addInitScript(() => {
      const events = [];
      Object.defineProperty(globalThis, '__herdBootStageEvents', { value: events });
      const rounded = (value) => Math.round(value * 1000) / 1000;
      const record = (kind, atMs = performance.now(), detail = {}) => {
        events.push({ kind, atMs: rounded(atMs), ...detail });
      };
      const recordOnce = (() => {
        const seen = new Set();
        return (kind, detail = {}) => {
          if (seen.has(kind)) return;
          seen.add(kind);
          record(kind, performance.now(), detail);
        };
      })();
      record('init-script');
      addEventListener('DOMContentLoaded', () => recordOnce('dom-content-loaded'));
      addEventListener('load', () => recordOnce('window-load'));

      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            record('long-task', entry.startTime, { durationMs: rounded(entry.duration) });
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        // Long-task observation is diagnostic-only; WebGPU boundaries remain.
      }

      const originalRaf = globalThis.requestAnimationFrame.bind(globalThis);
      let previousFrame = performance.now();
      const sampleFrames = (atMs) => {
        const gap = atMs - previousFrame;
        if (gap > 20) record('raf-gap', atMs, { durationMs: rounded(gap) });
        previousFrame = atMs;
        originalRaf(sampleFrames);
      };
      originalRaf(sampleFrames);

      const inspectDom = () => {
        const canvas = document.querySelector('canvas');
        if (canvas) recordOnce('dom-canvas', { width: canvas.width, height: canvas.height });
        const readout = document.querySelector('[data-testid="debug-readout"]');
        const backend = readout?.getAttribute('data-backend');
        if (backend && backend !== 'pending') recordOnce('dom-backend', { backend });
        const fillMs = readout?.getAttribute('data-fill-ms');
        if (fillMs) recordOnce('dom-fill-receipt', { fillMs: Number(fillMs) });
        if (document.querySelector('.herd-boot[data-ready="true"]')) recordOnce('dom-ready');
        originalRaf(inspectDom);
      };
      originalRaf(inspectDom);

      const promisePatch = (prototype, name, prefix) => {
        const original = prototype?.[name];
        if (typeof original !== 'function') return;
        prototype[name] = function patchedPromiseMethod(...args) {
          const started = performance.now();
          record(`${prefix}:start`, started);
          let result;
          try {
            result = original.apply(this, args);
          } catch (error) {
            record(`${prefix}:throw`, started, { durationMs: rounded(performance.now() - started) });
            throw error;
          }
          Promise.resolve(result).then(
            () => record(`${prefix}:resolved`, performance.now(), {
              durationMs: rounded(performance.now() - started),
            }),
            () => record(`${prefix}:rejected`, performance.now(), {
              durationMs: rounded(performance.now() - started),
            }),
          );
          return result;
        };
      };
      promisePatch(globalThis.GPU?.prototype, 'requestAdapter', 'request-adapter');
      promisePatch(globalThis.GPUAdapter?.prototype, 'requestDevice', 'request-device');
      promisePatch(globalThis.GPUBuffer?.prototype, 'mapAsync', 'buffer-map');

      const syncPatch = (prototype, name, kind, detail) => {
        const original = prototype?.[name];
        if (typeof original !== 'function') return;
        prototype[name] = function patchedSyncMethod(...args) {
          const started = performance.now();
          const result = original.apply(this, args);
          record(kind, started, {
            durationMs: rounded(performance.now() - started),
            ...(detail?.(args[0]) ?? {}),
          });
          return result;
        };
      };
      syncPatch(globalThis.GPUCanvasContext?.prototype, 'configure', 'canvas-configure', (descriptor) => ({
        format: descriptor?.format ?? '',
      }));
      syncPatch(globalThis.GPUCanvasContext?.prototype, 'getCurrentTexture', 'canvas-current-texture');
      syncPatch(globalThis.GPUQueue?.prototype, 'submit', 'queue-submit', (commandBuffers) => ({
        commandBuffers: commandBuffers?.length ?? 0,
      }));
      syncPatch(globalThis.GPUDevice?.prototype, 'createRenderPipeline', 'pipeline:create', (descriptor) => ({
        label: descriptor?.label ?? '',
      }));
      const createPipelineAsync = globalThis.GPUDevice?.prototype?.createRenderPipelineAsync;
      if (typeof createPipelineAsync === 'function') {
        globalThis.GPUDevice.prototype.createRenderPipelineAsync = function patchedPipelineAsync(descriptor) {
          const started = performance.now();
          const result = createPipelineAsync.call(this, descriptor);
          record('pipeline:create-async-start', started, { label: descriptor?.label ?? '', durationMs: 0 });
          Promise.resolve(result).then(
            () => record('pipeline:create-async-resolved', performance.now(), {
              label: descriptor?.label ?? '',
              durationMs: rounded(performance.now() - started),
            }),
            () => record('pipeline:create-async-rejected', performance.now(), {
              label: descriptor?.label ?? '',
              durationMs: rounded(performance.now() - started),
            }),
          );
          return result;
        };
      }
    });
    await context.route('**/api/lobbies', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"lobbies":[]}',
    }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console:${message.text()}`);
    });
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
    await page.goto(`http://localhost:${port}/?seed=${SEED}&debug=readout`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForFunction(() => {
      const play = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.trim() === 'Play');
      return play instanceof HTMLButtonElement && !play.disabled;
    }, undefined, { timeout: 60_000, polling: 10 });
    const readyObservedMs = await page.evaluate(() => performance.now());
    await page.waitForTimeout(100);
    const events = await page.evaluate(() => globalThis.__herdBootStageEvents ?? []);
    events.push({ kind: 'external-ready', atMs: readyObservedMs });
    const readout = await page.locator(READOUT).evaluate((node) => ({ ...node.dataset }));
    const result = {
      profile: spec.name,
      errors,
      readout: {
        backend: readout.backend,
        renderTier: readout.renderTier,
        fillMs: readout.fillMs,
        canvasWidth: readout.canvasWidth,
        canvasHeight: readout.canvasHeight,
        drawCalls: readout.drawCalls,
      },
      ...summarize(events),
    };
    await page.close();
    await context.close();
    return result;
  } finally {
    if (browser) await browser.close().catch(() => {});
    removeDir(profileRoot);
  }
}

let server = null;
const results = [];
try {
  server = await startPreviewServer(port);
  for (const spec of [
    { name: 'desktop', viewport: { width: 1440, height: 900 } },
    { name: 'mid-mobile-4g', viewport: { width: 390, height: 844 }, mobile: true },
  ]) {
    results.push(await measure(spec));
  }
} finally {
  stopServer(server);
}

console.log(JSON.stringify({ tool: 'tools/boot-stage-profile.mjs', results }, null, 2));
