#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import {
  buildCompleteCases,
  buildModeCases,
  buildSmokeCases,
} from './play-start-matrix.mjs';
import {
  buildPlayStartUrl,
  findSettledAt,
  percentile,
  resolvePlayStartBudgets,
} from './play-start-metrics.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const execFileAsync = promisify(execFile);
const DEFAULT_BASE_URL = 'http://127.0.0.1:4173/';
const WEBGPU_ARGS = [
  '--use-angle=d3d11',
  '--enable-gpu',
  '--enable-unsafe-webgpu',
  '--ignore-gpu-blocklist',
];
const WEBGL_ARGS = process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu'] : [];

const PROFILES = {
  desktop: {
    context: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    budgets: {
      coverPaintedMs: 200,
      coldInputResponsiveMs: 3500,
      warmInputResponsiveMs: 2250,
      coldSettledMs: 6000,
      warmSettledMs: 4500,
      maxPostPlayableLongTaskMs: 250,
      settledFrameP95Ms: 33,
      stressColdInputResponsiveMs: 4000,
      stressWarmInputResponsiveMs: 2500,
      stressColdSettledMs: 6500,
      stressWarmSettledMs: 5000,
      stressSettledFrameP95Ms: 50,
    },
  },
  phone: {
    context: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    },
    budgets: {
      coverPaintedMs: 150,
      coldInputResponsiveMs: 5000,
      warmInputResponsiveMs: 2000,
      coldSettledMs: 8000,
      warmSettledMs: 4000,
      maxPostPlayableLongTaskMs: 500,
      settledFrameP95Ms: 50,
    },
  },
};

function parseArgs(argv) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    matrix: 'smoke',
    renderer: 'webgl',
    profile: 'desktop',
    input: null,
    cache: 'cold',
    runs: 1,
    case: null,
    out: null,
    artifactDir: null,
    observeMs: 15_000,
    includeDiagnostic: false,
    enforce: false,
    gpuProbe: false,
    perfMode: false,
    collisionProbe: false,
    trace: false,
    requireQuiescent: null,
  };
  for (const raw of argv.slice(2)) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (!match) continue;
    const [, key, value] = match;
    const normalized = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const target = normalized === 'observe' ? 'observeMs' : normalized === 'output' ? 'out' : normalized;
    if (value === undefined) args[target] = true;
    else if (['runs', 'observeMs'].includes(target)) args[target] = Number(value);
    else if (['enforce', 'includeDiagnostic', 'gpuProbe', 'perfMode', 'collisionProbe', 'trace', 'requireQuiescent', 'restart'].includes(target)) args[target] = value !== '0' && value !== 'false';
    else args[target] = value;
  }
  return args;
}

async function sampleMachineState() {
  if (process.platform !== 'win32') return { cpuPercent: null, externalHeadlessBrowsers: 0 };
  const script = [
    "$cpu=(Get-CimInstance Win32_Processor | Measure-Object LoadPercentage -Average).Average",
    "$headless=@(Get-Process chrome-headless-shell -ErrorAction SilentlyContinue).Count",
    "[pscustomobject]@{cpuPercent=$cpu;externalHeadlessBrowsers=$headless}|ConvertTo-Json -Compress",
  ].join(';');
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script]);
  return JSON.parse(stdout.trim());
}

async function waitForQuiescence() {
  const samples = [];
  let consecutive = 0;
  const deadline = Date.now() + 120_000;
  let attempt = 0;
  while (Date.now() < deadline) {
    const sample = await sampleMachineState();
    samples.push({ ...sample, at: new Date().toISOString() });
    const quiet = sample.externalHeadlessBrowsers === 0
      && (sample.cpuPercent == null || sample.cpuPercent <= 50);
    consecutive = quiet ? consecutive + 1 : 0;
    if (consecutive >= 2) return samples;
    if (attempt > 0 && attempt % 15 === 0) {
      console.log(`[PLAYSTART] waiting for quiescence cpu=${sample.cpuPercent ?? 'n/a'} headless=${sample.externalHeadlessBrowsers}`);
    }
    attempt += 1;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
  }
  throw new Error(`machine did not become quiescent: ${JSON.stringify(samples.slice(-5))}`);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, '-');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stageDurations(events) {
  const stages = {};
  for (let i = 0; i < events.length - 1; i += 1) {
    const current = events[i];
    const next = events[i + 1];
    stages[current.label] = (stages[current.label] ?? 0) + (next.at - current.at);
  }
  return stages;
}

function duplicateUrls(resources) {
  const counts = new Map();
  for (const resource of resources) counts.set(resource.name, (counts.get(resource.name) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([url, count]) => ({ url, count }));
}

function evaluateBudgets(result, budgets) {
  const prefix = result.cacheState === 'warm' || result.cacheState === 'restart' ? 'warm' : 'cold';
  const inputBudget = budgets[`${prefix}InputResponsiveMs`];
  const settledBudget = budgets[`${prefix}SettledMs`];
  const failures = [];
  if (result.case.coverRequired !== false
      && (result.durations.coverPaintedMs == null || result.durations.coverPaintedMs > budgets.coverPaintedMs)) {
    failures.push(`coverPainted ${result.durations.coverPaintedMs ?? 'missing'}ms > ${budgets.coverPaintedMs}ms`);
  }
  if (result.durations.inputResponsiveMs == null || result.durations.inputResponsiveMs > inputBudget) {
    failures.push(`inputResponsive ${result.durations.inputResponsiveMs ?? 'missing'}ms > ${inputBudget}ms`);
  }
  if (result.durations.settledMs == null || result.durations.settledMs > settledBudget) {
    failures.push(`settled ${result.durations.settledMs ?? 'missing'}ms > ${settledBudget}ms`);
  }
  if (result.longTasks.postPlayableMaxMs > budgets.maxPostPlayableLongTaskMs) {
    failures.push(`maxPostPlayableLongTask ${result.longTasks.postPlayableMaxMs.toFixed(1)}ms > ${budgets.maxPostPlayableLongTaskMs}ms`);
  }
  if (result.frames.settledP95Ms == null || result.frames.settledP95Ms > budgets.settledFrameP95Ms) {
    failures.push(`settledFrameP95 ${result.frames.settledP95Ms ?? 'missing'}ms > ${budgets.settledFrameP95Ms}ms`);
  }
  if (result.console.errors.length || result.console.pageErrors.length) {
    failures.push(`browser errors ${result.console.errors.length + result.console.pageErrors.length}`);
  }
  if (result.probeErrors.length) failures.push(`probe errors ${result.probeErrors.length}`);
  const expectedSheep = result.case.gameMode === 'counting' ? 1 : result.case.sheepCount;
  if (result.game.active !== true) failures.push('game is not active');
  if (result.game.sceneId !== result.case.sceneId) {
    failures.push(`scene ${result.game.sceneId ?? 'missing'} != ${result.case.sceneId}`);
  }
  if (result.game.mode !== result.case.gameMode) {
    failures.push(`mode ${result.game.mode ?? 'missing'} != ${result.case.gameMode}`);
  }
  if (result.game.sheepCount !== expectedSheep) {
    failures.push(`active sheep ${result.game.sheepCount ?? 'missing'} != ${expectedSheep}`);
  }
  if (result.game.dog?.type !== result.case.dogId) {
    failures.push(`dog ${result.game.dog?.type ?? 'missing'} != ${result.case.dogId}`);
  }
  if (result.network.failed.length) failures.push(`failed requests ${result.network.failed.length}`);
  if (result.audio.duplicateResources.length) failures.push(`duplicate audio resources ${result.audio.duplicateResources.length}`);
  const nonselectedBarks = result.audio.resources.filter((resource) => (
    /dog_bark_/i.test(resource.name)
    && !resource.name.includes(`dog_bark_${result.case.dogId}.mp3`)
  ));
  if (nonselectedBarks.length) failures.push(`nonselected dog barks ${nonselectedBarks.length}`);
  return failures;
}

async function assertProductionPreview(baseUrl) {
  const response = await fetch(baseUrl);
  if (!response.ok) throw new Error(`preview unavailable at ${baseUrl} (${response.status})`);
  const html = await response.text();
  if (html.includes('/@vite/client') || !/\/assets\/[^"']+\.js/.test(html)) {
    throw new Error(`${baseUrl} is not a production preview; run npm run build and npm run preview`);
  }
}

async function installPageProbe(page, gpuProbe) {
  await page.addInitScript(({ enableGpuProbe }) => {
    const probe = {
      playAccepted: null,
      coverPainted: null,
      sceneFirstFrame: null,
      inputResponsive: null,
      stageEvents: [],
      longTasks: [],
      gpuCalls: [],
      methodSpans: [],
      probeErrors: [],
    };
    window.__sdsPlayStartProbe = probe;

    let loadStep = null;
    Object.defineProperty(window, '__sdsLoadStep', {
      configurable: true,
      get: () => loadStep,
      set: (label) => {
        loadStep = label;
        probe.stageEvents.push({ label: label ?? 'unknown', at: performance.now() });
      },
    });

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          probe.longTasks.push({ startTime: entry.startTime, duration: entry.duration, name: entry.name });
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch (error) {
      probe.probeErrors.push(`longtask observer: ${error?.message ?? error}`);
    }

    const wrapGpu = (methodName, asynchronous) => {
      try {
        const proto = globalThis.GPUDevice?.prototype;
        const original = proto?.[methodName];
        if (typeof original !== 'function' || original.__sdsPlayStartWrapped) return;
        const wrapped = function (...args) {
          const started = performance.now();
          try {
            const value = original.apply(this, args);
            if (asynchronous && value?.then) {
              return value.then((result) => {
                probe.gpuCalls.push({ method: methodName, started, duration: performance.now() - started, ok: true });
                return result;
              }, (error) => {
                probe.gpuCalls.push({ method: methodName, started, duration: performance.now() - started, ok: false, error: String(error) });
                throw error;
              });
            }
            probe.gpuCalls.push({ method: methodName, started, duration: performance.now() - started, ok: true });
            return value;
          } catch (error) {
            probe.gpuCalls.push({ method: methodName, started, duration: performance.now() - started, ok: false, error: String(error) });
            throw error;
          }
        };
        wrapped.__sdsPlayStartWrapped = true;
        proto[methodName] = wrapped;
      } catch (error) {
        probe.probeErrors.push(`${methodName} wrapper: ${error?.message ?? error}`);
      }
    };
    if (enableGpuProbe) {
      wrapGpu('createShaderModule', false);
      wrapGpu('createRenderPipeline', false);
      wrapGpu('createRenderPipelineAsync', true);
      wrapGpu('createComputePipeline', false);
      wrapGpu('createComputePipelineAsync', true);
    }
  }, { enableGpuProbe: gpuProbe });
}

async function armRuntimeMethodSpans(page, omit = '') {
  await page.evaluate((omitValue) => {
    const probe = window.__sdsPlayStartProbe;
    const terrain = window.gameInstance?.terrainBuilder;
    const structures = window.gameInstance?.structureBuilder;
    if (!probe || !terrain) return;
    const omitted = new Set(String(omitValue).split(',').map((value) => value.trim()).filter(Boolean));
    const wrap = (owner, method, label) => {
      const original = owner?.[method];
      if (typeof original !== 'function' || original.__sdsPlayStartWrapped) return;
      const wrapped = function (...args) {
        const started = performance.now();
        const detail = args[0]?.key ?? args[0]?.id ?? null;
        const record = (ok, error = null) => probe.methodSpans.push({
          label,
          detail,
          started,
          duration: performance.now() - started,
          ok,
          error: error ? String(error?.message ?? error) : null,
        });
        try {
          const value = original.apply(this, args);
          if (value?.then) return value.then((result) => { record(true); return result; }, (error) => { record(false, error); throw error; });
          record(true);
          return value;
        } catch (error) {
          record(false, error);
          throw error;
        }
      };
      wrapped.__sdsPlayStartWrapped = true;
      owner[method] = wrapped;
    };
    wrap(terrain, 'createTrees', 'trees:create');
    wrap(terrain, 'addHomesteadPlayfieldProps', 'homestead:all');
    wrap(terrain, '_loadHomesteadPlayfieldProp', 'homestead:load');
    wrap(terrain, '_fitHomesteadPlayfieldProp', 'homestead:fit');
    wrap(terrain, '_measureHomesteadPlayfieldProp', 'homestead:measure');
    wrap(structures, 'buildSinglePlayerStructures', 'structures:all');
    wrap(structures, '_surfaceToTerrain', 'structures:surface');
    wrap(structures, '_instanceFenceSegments', 'structures:instance-all');
    wrap(structures, '_buildInstancedFenceSegment', 'structures:instance-segment');
    wrap(structures?.fenceConfigBuilder, 'buildSinglePlayerFences', 'structures:layout');
    if (omitted.has('trees')) terrain.createTrees = async () => [];
    if (omitted.has('homestead')) terrain.addHomesteadPlayfieldProps = async () => [];
    if (omitted.has('grass')) terrain.createGrass = async () => null;
    if (omitted.has('structures') && structures) {
      structures.loadModels = async () => {};
      structures.buildSinglePlayerStructures = () => {};
    }
  }, omit);
}

async function armWorld(page, worldName) {
  const current = page.locator('#react-overlay .sds-ent-world-name');
  const next = page.getByRole('button', { name: /Next world/i });
  await current.waitFor({ state: 'visible', timeout: 30_000 });
  for (let i = 0; i < 8; i += 1) {
    const text = (await current.textContent())?.trim() ?? '';
    if (text.startsWith(worldName)) return;
    await next.dispatchEvent('click');
    await page.waitForTimeout(100);
  }
  throw new Error(`could not arm world ${worldName}`);
}

async function configureCase(page, entry) {
  await armWorld(page, entry.worldName);
  const summary = page.locator('#react-overlay .sds-ent-summary');
  await summary.dispatchEvent('click');
  const picker = page.locator('#react-overlay [data-sds-picker]');
  await picker.waitFor({ state: 'visible', timeout: 15_000 });

  if (entry.familyName) {
    const family = picker.getByRole('button', { name: entry.familyName, exact: true });
    if (await family.isVisible().catch(() => false)) await family.dispatchEvent('click');
  }

  const more = picker.getByRole('button', { name: /Show \d+ more/ });
  if (await more.isVisible().catch(() => false)) await more.dispatchEvent('click');

  const rungPattern = entry.gameMode === 'counting'
    ? new RegExp(`^${escapeRegex(entry.rungName)}\\b`, 'i')
    : new RegExp(`^${escapeRegex(entry.rungName)}\\s+${escapeRegex(entry.sheepCount.toLocaleString('en-US'))}\\s+sheep$`, 'i');
  const rung = picker.getByRole('button', { name: rungPattern });
  await rung.waitFor({ state: 'visible', timeout: 15_000 });
  await rung.dispatchEvent('click');

  const dog = picker.getByRole('button', { name: `Play as ${entry.dogName}`, exact: true });
  await dog.waitFor({ state: 'visible', timeout: 15_000 });
  await dog.dispatchEvent('click');
}

async function startPlay(page) {
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await play.waitFor({ state: 'visible', timeout: 15_000 });
  await armStartProbe(page);
  await play.dispatchEvent('click');
}

async function resetStartProbe(page) {
  await page.evaluate(() => {
    const probe = window.__sdsPlayStartProbe;
    probe.playAccepted = null;
    probe.coverPainted = null;
    probe.sceneFirstFrame = null;
    probe.inputResponsive = null;
    probe.stageEvents.length = 0;
    probe.longTasks.length = 0;
    probe.gpuCalls.length = 0;
    probe.methodSpans.length = 0;
    probe.probeErrors.length = 0;
    performance.clearResourceTimings();
  });
}

async function armStartProbe(page) {
  await page.evaluate(() => {
    const probe = window.__sdsPlayStartProbe;
    probe.playAccepted = performance.now();
    const recordPaint = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (probe.coverPainted == null) probe.coverPainted = performance.now();
    }));
    if (document.querySelector('[data-sds-loading-screen="true"]')) recordPaint();
    else {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('[data-sds-loading-screen="true"]')) return;
        observer.disconnect();
        recordPaint();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  });
}

async function startModeFlow(page, entry) {
  if (entry.flow === 'sandbox') {
    const start = page.getByRole('button', { name: /^Start Game \(/ });
    await start.waitFor({ state: 'visible', timeout: 30_000 });
    await armStartProbe(page);
    await start.dispatchEvent('click');
    return;
  }
  if (entry.flow === 'local') {
    await page.getByRole('button', { name: 'More', exact: true }).dispatchEvent('click');
    await page.getByRole('button', { name: '2-player', exact: true }).dispatchEvent('click');
    const mode = page.getByRole('button', { name: new RegExp(`^${escapeRegex(entry.localModeLabel)}\\b`) });
    await mode.waitFor({ state: 'visible', timeout: 15_000 });
    await mode.dispatchEvent('click');
    const start = page.getByRole('button', { name: 'Start Game', exact: true });
    await start.waitFor({ state: 'visible', timeout: 15_000 });
    await armStartProbe(page);
    await start.dispatchEvent('click');
    return;
  }
  throw new Error(`unsupported mode flow ${entry.flow}`);
}

async function markFirstSceneFrame(page) {
  await page.waitForFunction(() => (
    window.gameInstance?.gameState?.gameActive === true
    && !document.querySelector('[data-sds-loading-screen="true"]')
  ), null, { timeout: 180_000 });
  return page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.__sdsPlayStartProbe.sceneFirstFrame = performance.now();
      resolve(window.__sdsPlayStartProbe.sceneFirstFrame);
    }));
  }));
}

async function waitForDogMovement(page, before) {
  await page.waitForFunction(({ x, z }) => {
    const position = window.gameInstance?.gameState?.getSheepdog?.()?.position;
    if (!position) return false;
    const dx = position.x - x;
    const dz = position.z - z;
    return dx * dx + dz * dz > 0.0001;
  }, before, { timeout: 15_000 });
}

async function verifyInputResponse(page, inputMode) {
  const before = await page.evaluate(() => {
    const position = window.gameInstance?.gameState?.getSheepdog?.()?.position;
    return position ? { x: position.x, z: position.z } : null;
  });
  if (!before) throw new Error('selected sheepdog position unavailable');
  if (inputMode === 'keyboard') {
    await page.keyboard.down('w');
    try {
      await waitForDogMovement(page, before);
    } finally {
      await page.keyboard.up('w');
    }
  } else if (inputMode === 'touch') {
    const joystick = page.locator('#joystick-zone');
    await joystick.waitFor({ state: 'visible', timeout: 15_000 });
    const box = await joystick.boundingBox();
    if (!box) throw new Error('touch joystick bounds unavailable');
    const pointer = {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2 - box.height * 0.4,
    };
    await joystick.dispatchEvent('pointerdown', pointer);
    try {
      await waitForDogMovement(page, before);
    } finally {
      await page.evaluate((detail) => window.dispatchEvent(new PointerEvent('pointerup', detail)), pointer);
    }
  } else if (inputMode === 'gamepad') {
    await page.evaluate(() => {
      const pad = {
        axes: [0, -1, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        connected: true,
        id: 'Play-start virtual standard gamepad',
        index: 0,
        mapping: 'standard',
        timestamp: performance.now(),
      };
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
      const event = new Event('gamepadconnected');
      Object.defineProperty(event, 'gamepad', { value: pad });
      window.dispatchEvent(event);
    });
    await waitForDogMovement(page, before);
  } else {
    throw new Error(`unknown input mode ${inputMode}`);
  }
  return page.evaluate(() => {
    window.__sdsPlayStartProbe.inputResponsive = performance.now();
    return window.__sdsPlayStartProbe.inputResponsive;
  });
}

async function observeFrames(page, observeMs) {
  return page.evaluate((durationMs) => new Promise((resolve) => {
    const frames = [];
    let previous = null;
    const started = performance.now();
    const tick = (at) => {
      if (previous != null) frames.push({ at, duration: at - previous });
      previous = at;
      if (at - started >= durationMs) resolve(frames);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), observeMs);
}

async function collectPageState(page) {
  return page.evaluate(() => {
    const renderer = window.__sdsRenderer
      ?? window.gameInstance?.sceneManager?.getRenderer?.()
      ?? window.gameInstance?.sceneManager?.renderer
      ?? null;
    const dog = window.gameInstance?.gameState?.getSheepdog?.();
    const sheepSystem = window.gameInstance?.gameState?.optimizedSheepSystem;
    const resources = performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      startTime: entry.startTime,
      duration: entry.duration,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    }));
    return {
      timeOrigin: performance.timeOrigin,
      probe: window.__sdsPlayStartProbe,
      bootTimeline: window.__sdsBootTimeline ?? null,
      renderer: {
        effective: window.__sdsRendererMode?.effective ?? null,
        fallbackReason: window.__sdsRendererMode?.fallbackReason ?? null,
        hasNavigatorGpu: Boolean(navigator.gpu),
        isWebGpuRenderer: renderer?.isWebGPURenderer === true,
        info: renderer?.info ? {
          render: { ...renderer.info.render },
          memory: { ...renderer.info.memory },
          programs: renderer.info.programs?.length ?? null,
        } : null,
      },
      canvas: (() => {
        const canvas = document.querySelector('canvas');
        return canvas ? {
          cssWidth: canvas.getBoundingClientRect().width,
          cssHeight: canvas.getBoundingClientRect().height,
          width: canvas.width,
          height: canvas.height,
          dpr: devicePixelRatio,
        } : null;
      })(),
      game: {
        active: window.gameInstance?.gameState?.gameActive === true,
        mode: window.gameInstance?.gameMode ?? null,
        singlePlayerMode: window.gameInstance?.singlePlayerMode ?? null,
        sceneId: window.gameInstance?.currentScene?.id ?? null,
        sheepCount: sheepSystem?.activeCount ?? window.gameInstance?.gameState?.sheep?.length ?? null,
        dog: dog ? { type: dog.dogType ?? null, x: dog.position?.x ?? null, z: dog.position?.z ?? null } : null,
      },
      performance: {
        collision: sheepSystem?.getCollisionProfile?.() ?? null,
        cost: window.__perfHarness?.getCostReport?.() ?? null,
      },
      environment: {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        deviceMemory: navigator.deviceMemory ?? null,
      },
      resources,
    };
  });
}

async function measureCase({ context, entry, args, cacheState, artifactRoot, retainArtifacts, runNumber }) {
  const page = await context.newPage();
  const consoleEntries = [];
  const pageErrors = [];
  const requests = [];
  const requestFailures = [];
  const artifactName = `${safeName(entry.id)}-${args.renderer}-${args.profile}-${args.input}-${cacheState}-run-${runNumber}`;
  const caseDir = resolve(artifactRoot, artifactName);
  let tracing = false;
  let result = null;
  page.on('console', (message) => {
    consoleEntries.push({ type: message.type(), text: message.text(), at: Date.now() });
  });
  page.on('pageerror', (error) => pageErrors.push({ message: error.message, stack: error.stack ?? null, at: Date.now() }));
  page.on('request', (request) => requests.push({
    url: request.url(),
    method: request.method(),
    resourceType: request.resourceType(),
    startedAt: Date.now(),
  }));
  page.on('requestfailed', (request) => requestFailures.push({
    url: request.url(),
    resourceType: request.resourceType(),
    error: request.failure()?.errorText ?? 'unknown',
    at: Date.now(),
  }));

  try {
    if (retainArtifacts) {
      await mkdir(caseDir, { recursive: true });
    }
    if (args.trace) {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
      tracing = true;
    }
    await installPageProbe(page, args.gpuProbe);
    await context.addInitScript(() => {
      localStorage.setItem('playerIdentity', JSON.stringify({
        persistentId: 'play_start_probe',
        displayName: 'PlayStartProbe',
        fullName: 'PlayStartProbe#0001',
        discriminator: '0001',
        nameType: 'custom',
        createdAt: 0,
        isRegistered: false,
      }));
      localStorage.setItem('sds:tutorialDone', '1');
    });

    const url = buildPlayStartUrl(args.baseUrl, args, entry);

    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(() => typeof window.__sdsBootTimeline?.firstInteractive === 'number', null, { timeout: 120_000 });
    await page.waitForFunction(() => Boolean(window.gameInstance?.terrainBuilder), null, { timeout: 30_000 });
    await armRuntimeMethodSpans(page, args.omit);

    if (entry.diagnostic) {
      await page.evaluate(() => { window.__sdsPlayStartProbe.playAccepted = performance.now(); });
    } else if (entry.flow === 'sandbox' || entry.flow === 'local') {
      await startModeFlow(page, entry);
    } else {
      const dismiss = page.getByRole('button', { name: 'No thanks' });
      if (await dismiss.isVisible({ timeout: 500 }).catch(() => false)) await dismiss.dispatchEvent('click');
      await configureCase(page, entry);
      if (args.prefetch === 'idle') await page.waitForTimeout(2500);
      await startPlay(page);
    }

    if (args.restart) {
      if (entry.flow !== 'entrance' || entry.diagnostic) throw new Error('restart lane supports entrance cases only');
      await markFirstSceneFrame(page);
      await verifyInputResponse(page, args.input);
      await page.evaluate(() => window.gameInstance.restartToMenu());
      await page.getByRole('button', { name: 'Play', exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
      await resetStartProbe(page);
      await configureCase(page, entry);
      await startPlay(page);
    }

    await page.waitForFunction(() => window.__sdsPlayStartProbe.coverPainted != null || window.gameInstance?.gameState?.gameActive === true, null, { timeout: 180_000 });
    const sceneFirstFrame = await markFirstSceneFrame(page);
    const inputResponsive = await verifyInputResponse(page, args.input);
    if (args.collisionProbe) {
      await page.evaluate(() => window.gameInstance?.gameState?.optimizedSheepSystem?.setCollisionProbeEnabled?.(true));
    }
    const frames = await observeFrames(page, args.observeMs);
    const state = await collectPageState(page);

    if (args.renderer === 'webgpu' && (!state.renderer.hasNavigatorGpu || !state.renderer.isWebGpuRenderer || state.renderer.effective === 'webgl')) {
      throw new Error(`WebGPU did not engage: ${JSON.stringify(state.renderer)}`);
    }
    if (args.renderer === 'webgl' && state.renderer.isWebGpuRenderer) {
      throw new Error(`WebGL was requested but WebGPU engaged: ${JSON.stringify(state.renderer)}`);
    }

    const probe = state.probe;
    const acceptedEpoch = state.timeOrigin + probe.playAccepted;
    const postAcceptedRequests = requests.filter((request) => request.startedAt >= acceptedEpoch);
    const postAcceptedResources = state.resources.filter((resource) => resource.startTime >= probe.playAccepted);
    const postAcceptedLongTasks = probe.longTasks.filter((task) => task.startTime >= probe.playAccepted);
    const caseBudgets = resolvePlayStartBudgets(args.budgets, entry);
    const settled = findSettledAt({ frames, longTasks: postAcceptedLongTasks, inputResponsive, budgets: caseBudgets });
    const audioResources = postAcceptedResources.filter((resource) => /\.(?:mp3|ogg|wav|m4a|webm)(?:\?|$)/i.test(resource.name));

    const postPlayableLongTasks = postAcceptedLongTasks.filter((task) => task.startTime >= sceneFirstFrame);
    result = {
      case: entry,
      renderer: args.renderer,
      profile: args.profile,
      input: args.input,
      cacheState,
      capturedAt: new Date().toISOString(),
      marks: {
        navigationFirstInteractive: state.bootTimeline?.firstInteractive ?? null,
        playAccepted: probe.playAccepted,
        coverPainted: probe.coverPainted,
        sceneFirstFrame,
        inputResponsive,
        settled: settled?.at ?? null,
      },
      durations: {
        coverPaintedMs: probe.coverPainted == null ? null : probe.coverPainted - probe.playAccepted,
        sceneFirstFrameMs: sceneFirstFrame - probe.playAccepted,
        inputResponsiveMs: inputResponsive - probe.playAccepted,
        settledMs: settled ? settled.at - probe.playAccepted : null,
      },
      stages: {
        events: probe.stageEvents,
        durations: stageDurations(probe.stageEvents),
        methodSpans: probe.methodSpans,
      },
      longTasks: {
        count: postAcceptedLongTasks.length,
        totalMs: postAcceptedLongTasks.reduce((sum, task) => sum + task.duration, 0),
        maxMs: postAcceptedLongTasks.reduce((max, task) => Math.max(max, task.duration), 0),
        afterSceneFirstFrame: postPlayableLongTasks,
        postPlayableMaxMs: postPlayableLongTasks.reduce((max, task) => Math.max(max, task.duration), 0),
        entries: postAcceptedLongTasks,
      },
      frames: {
        observationMs: args.observeMs,
        count: frames.length,
        p50Ms: percentile(frames.map((frame) => frame.duration), 50),
        p95Ms: percentile(frames.map((frame) => frame.duration), 95),
        p99Ms: percentile(frames.map((frame) => frame.duration), 99),
        maxMs: frames.reduce((max, frame) => Math.max(max, frame.duration), 0),
        settledP95Ms: settled?.p95 ?? null,
        samples: frames,
      },
      gpu: {
        callCount: probe.gpuCalls.length,
        totalMs: probe.gpuCalls.reduce((sum, call) => sum + call.duration, 0),
        maxMs: probe.gpuCalls.reduce((max, call) => Math.max(max, call.duration), 0),
        calls: probe.gpuCalls,
      },
      network: {
        requestCount: postAcceptedRequests.length,
        transferBytes: postAcceptedResources.reduce((sum, resource) => sum + (resource.transferSize || 0), 0),
        decodedBytes: postAcceptedResources.reduce((sum, resource) => sum + (resource.decodedBodySize || 0), 0),
        duplicateResources: duplicateUrls(postAcceptedResources),
        failed: requestFailures,
        resources: postAcceptedResources,
      },
      audio: {
        requestCount: audioResources.length,
        transferBytes: audioResources.reduce((sum, resource) => sum + (resource.transferSize || 0), 0),
        duplicateResources: duplicateUrls(audioResources),
        resources: audioResources,
      },
      rendererState: state.renderer,
      canvas: state.canvas,
      game: state.game,
      performance: state.performance,
      environment: state.environment,
      instrumentation: {
        tracing: args.trace,
        gpuProbe: args.gpuProbe,
        perfMode: args.perfMode,
        collisionProbe: args.collisionProbe,
        budgetClass: entry.diagnostic ? 'diagnostic-autostart' : (entry.cpuStress ? 'cpu-stress' : 'release'),
      },
      console: {
        errors: consoleEntries.filter((entry) => entry.type === 'error'),
        warnings: consoleEntries.filter((entry) => entry.type === 'warning'),
        pageErrors,
      },
      probeErrors: probe.probeErrors,
    };
    result.failures = evaluateBudgets(result, caseBudgets);

    if (retainArtifacts || result.failures.length || pageErrors.length || requestFailures.length) {
      await mkdir(caseDir, { recursive: true });
      await page.screenshot({ path: resolve(caseDir, 'gameplay.png'), fullPage: true });
      await writeFile(resolve(caseDir, 'console.json'), JSON.stringify(consoleEntries, null, 2));
      await writeFile(resolve(caseDir, 'result.json'), JSON.stringify(result, null, 2));
      if (tracing) {
        await context.tracing.stop({ path: resolve(caseDir, 'trace.zip') });
        tracing = false;
      }
    } else if (tracing) {
      await context.tracing.stop();
      tracing = false;
    }
    return result;
  } catch (error) {
    await mkdir(caseDir, { recursive: true });
    await page.screenshot({ path: resolve(caseDir, 'failure.png'), fullPage: true }).catch(() => {});
    const failure = {
      case: entry,
      renderer: args.renderer,
      profile: args.profile,
      input: args.input,
      cacheState,
      capturedAt: new Date().toISOString(),
      fatal: error?.stack ?? String(error),
      console: consoleEntries,
      pageErrors,
      requestFailures,
    };
    await writeFile(resolve(caseDir, 'failure.json'), JSON.stringify(failure, null, 2));
    if (tracing) {
      await context.tracing.stop({ path: resolve(caseDir, 'trace.zip') }).catch(() => {});
      tracing = false;
    }
    return { ...failure, failures: [error?.message ?? String(error)] };
  } finally {
    if (tracing) await context.tracing.stop().catch(() => {});
    await page.close().catch(() => {});
  }
}

async function run() {
  const args = parseArgs(process.argv);
  const profile = PROFILES[args.profile];
  if (!profile) throw new Error(`unknown profile ${args.profile}; expected ${Object.keys(PROFILES).join(', ')}`);
  args.input = args.input ?? (args.profile === 'phone' ? 'touch' : 'keyboard');
  if (!['keyboard', 'touch', 'gamepad'].includes(args.input)) throw new Error(`unknown input ${args.input}`);
  if (!['webgpu', 'webgl'].includes(args.renderer)) throw new Error(`unknown renderer ${args.renderer}`);
  if (!['cold', 'warm', 'both'].includes(args.cache)) throw new Error(`unknown cache state ${args.cache}`);
  args.baseUrl = new URL(args.baseUrl).toString();
  args.budgets = profile.budgets;
  args.prefetch = args.prefetch ?? 'immediate';
  args.requireQuiescent = args.requireQuiescent ?? args.enforce;
  await assertProductionPreview(args.baseUrl);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactRoot = resolve(ROOT, args.artifactDir ?? `cycle124-validation/play-start/${stamp}`);
  const outPath = resolve(ROOT, args.out ?? `${artifactRoot}/summary.json`);
  await mkdir(artifactRoot, { recursive: true });

  let cases;
  if (args.matrix === 'complete') cases = buildCompleteCases({ includeDiagnostic: args.includeDiagnostic });
  else if (args.matrix === 'modes') cases = buildModeCases();
  else cases = buildSmokeCases();
  if (args.case) {
    const pattern = new RegExp(args.case, 'i');
    cases = cases.filter((entry) => pattern.test(entry.id));
  }
  if (!cases.length) throw new Error('case filter selected no play-start cases');

  const results = [];
  const quiescenceSamples = [];
  for (const entry of cases) {
    for (let runIndex = 0; runIndex < Math.max(1, args.runs); runIndex += 1) {
      if (args.requireQuiescent) quiescenceSamples.push(await waitForQuiescence());
      const browser = await chromium.launch({
        channel: 'chrome',
        headless: args.renderer === 'webgpu' ? false : args.headed !== true,
        args: args.renderer === 'webgpu' ? WEBGPU_ARGS : WEBGL_ARGS,
      });
      try {
        const context = await browser.newContext(profile.context);
        try {
          if (args.cache === 'warm') {
            await measureCase({
              context,
              entry,
              args,
              cacheState: 'warmup',
              artifactRoot,
              retainArtifacts: false,
              runNumber: runIndex + 1,
            });
            if (args.requireQuiescent) quiescenceSamples.push(await waitForQuiescence());
          }
          const states = args.restart ? ['restart'] : (args.cache === 'both' ? ['cold', 'warm'] : [args.cache]);
          for (const cacheState of states) {
            if (cacheState === 'warm' && args.cache === 'both') {
              // The cold measurement above populated this context's HTTP cache,
              // service worker, decoded assets, and persisted entrance state.
            }
            const result = await measureCase({
              context,
              entry,
              args,
              cacheState,
              artifactRoot,
              retainArtifacts: args.artifacts === 'all',
              runNumber: runIndex + 1,
            });
            result.run = runIndex + 1;
            results.push(result);
            await writeFile(resolve(artifactRoot, 'checkpoint.json'), JSON.stringify({
              capturedAt: new Date().toISOString(),
              completedCases: results.length,
              results,
            }, null, 2));
            const status = result.failures?.length ? 'FAIL' : 'PASS';
            console.log(
              `[PLAYSTART] ${status} ${entry.id} ${args.renderer}/${args.profile}/${cacheState}`
              + ` cover=${result.durations?.coverPaintedMs?.toFixed?.(0) ?? 'n/a'}ms`
              + ` frame=${result.durations?.sceneFirstFrameMs?.toFixed?.(0) ?? 'n/a'}ms`
              + ` input=${result.durations?.inputResponsiveMs?.toFixed?.(0) ?? 'n/a'}ms`
              + ` settled=${result.durations?.settledMs?.toFixed?.(0) ?? 'n/a'}ms`
              + ` postTask=${result.longTasks?.postPlayableMaxMs?.toFixed?.(0) ?? 'n/a'}ms`
              + ` rawMaxTask=${result.longTasks?.maxMs?.toFixed?.(0) ?? 'n/a'}ms`,
            );
            if (result.failures?.length) console.log(`  ${result.failures.join('; ')}`);
          }
        } finally {
          await context.close().catch(() => {});
        }
      } finally {
        await browser.close().catch(() => {});
      }
    }
  }

  const successful = results.filter((result) => result.durations);
  const summary = {
    capturedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    matrix: args.matrix,
    renderer: args.renderer,
    profile: args.profile,
    input: args.input,
    cache: args.restart ? 'restart' : args.cache,
    restart: args.restart === true,
    processIsolation: 'fresh-browser-per-run',
    quiescenceRequired: args.requireQuiescent,
    quiescenceSamples,
    runs: args.runs,
    observeMs: args.observeMs,
    budgets: args.budgets,
    totals: {
      cases: results.length,
      passed: results.filter((result) => result.failures?.length === 0).length,
      failed: results.filter((result) => result.failures?.length > 0).length,
    },
    medians: {
      coverPaintedMs: median(successful.map((result) => result.durations.coverPaintedMs).filter(Number.isFinite)),
      sceneFirstFrameMs: median(successful.map((result) => result.durations.sceneFirstFrameMs).filter(Number.isFinite)),
      inputResponsiveMs: median(successful.map((result) => result.durations.inputResponsiveMs).filter(Number.isFinite)),
      settledMs: median(successful.map((result) => result.durations.settledMs).filter(Number.isFinite)),
      maxLongTaskMs: median(successful.map((result) => result.longTasks.maxMs).filter(Number.isFinite)),
      maxPostPlayableLongTaskMs: median(successful.map((result) => result.longTasks.postPlayableMaxMs).filter(Number.isFinite)),
    },
    results,
  };
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(summary, null, 2));
  console.log(`[PLAYSTART] wrote ${outPath}`);

  if (args.enforce && summary.totals.failed > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error('[PLAYSTART] fatal:', error);
  process.exitCode = 2;
});
