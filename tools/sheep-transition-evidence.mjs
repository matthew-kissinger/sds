// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Owner-review evidence for the title-to-Play sheep transition. This drives the
// normal title buttons, observes the normal app through page-local module
// imports and a temporary Three prototype hook, and leaves no probe surface in
// shipped code. Two frames before each click and the first 30 composited frames
// after it become a fixed-crop contact sheet and a 6 fps review clip.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  GPU_ARGS,
  READOUT,
  SEED,
  startServer,
  stopServer,
  waitForLive,
} from './probe-lib.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PORT = 5324;
const VIEWPORT = { width: 1440, height: 900 };
const CROP = { x: 300, y: 150, width: 840, height: 560 };
const POST_CLICK_FRAMES = 30;
const PRE_CLICK_FRAMES = 2;
const MATRIX_PROBE = 'herd.transition.matrix-probe.v1';
const CAMERA_PROBE = 'herd.transition.camera-probe.v1';
const NUMERIC_EPSILON = 1e-12;
const FIRST_DRAW_POSITION_TOLERANCE_METRES = 0.1;

function option(name, fallback = null) {
  const at = process.argv.indexOf(name);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const port = Number(option('--port', String(DEFAULT_PORT)));
const externalUrl = option('--url');
const outputArg = option('--output');
const backendFilter = option('--backend');
const flockFilter = option('--flock');
const debugExtra = option('--debug-extra');
const generatedAt = new Date().toISOString();
const outputDir = outputArg
  ? resolve(repo, outputArg)
  : join(repo, 'captures', 'gallery', `sheep-transition-${generatedAt.replaceAll(':', '-')}`);
const frameTemp = mkdtempSync(join(tmpdir(), 'herd-sheep-transition-'));
const clipsDir = join(outputDir, 'clips');
const sheetsDir = join(outputDir, 'contact-sheets');

mkdirSync(clipsDir, { recursive: true });
mkdirSync(sheetsDir, { recursive: true });

function relativeToOutput(path) {
  return relative(outputDir, path).replaceAll('\\', '/');
}

function maxAbsDelta(a, b) {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}

function matrixScale(elements) {
  return [
    Math.hypot(elements[0], elements[1], elements[2]),
    Math.hypot(elements[4], elements[5], elements[6]),
    Math.hypot(elements[8], elements[9], elements[10]),
  ];
}

function matrixPosition(elements) {
  return [elements[12], elements[13], elements[14]];
}

function compareMatrices(before, after, prefixCount) {
  let matrixDeltaMax = 0;
  let positionDeltaMax = 0;
  let scaleDeltaMax = 0;
  for (let i = 0; i < prefixCount; i++) {
    const a = before.matrices[i];
    const b = after.matrices[i];
    if (!a || !b) return {
      compared: i,
      matrixDeltaMax: Number.POSITIVE_INFINITY,
      positionDeltaMax: Number.POSITIVE_INFINITY,
      scaleDeltaMax: Number.POSITIVE_INFINITY,
    };
    matrixDeltaMax = Math.max(matrixDeltaMax, maxAbsDelta(a, b));
    positionDeltaMax = Math.max(
      positionDeltaMax,
      maxAbsDelta(matrixPosition(a), matrixPosition(b)),
    );
    scaleDeltaMax = Math.max(scaleDeltaMax, maxAbsDelta(matrixScale(a), matrixScale(b)));
  }
  return { compared: prefixCount, matrixDeltaMax, positionDeltaMax, scaleDeltaMax };
}

function runFfmpeg(args, purpose) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    cwd: repo,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${purpose} failed: ${result.stderr || result.stdout}`);
  }
}

function buildMedia(tempDir, slug) {
  const input = join(tempDir, 'frame-%03d.jpg');
  const contactSheet = join(sheetsDir, `${slug}.jpg`);
  const clip = join(clipsDir, `${slug}.mp4`);
  const crop = `crop=${CROP.width}:${CROP.height}:${CROP.x}:${CROP.y}`;
  runFfmpeg([
    '-framerate', '6', '-i', input,
    '-vf', `${crop},scale=${CROP.width / 2}:${CROP.height / 2}:flags=lanczos,tile=4x8`,
    '-frames:v', '1', '-q:v', '2', contactSheet,
  ], `${slug} contact sheet`);
  runFfmpeg([
    '-framerate', '6', '-i', input,
    '-vf', crop,
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', clip,
  ], `${slug} slow-motion clip`);
  return {
    contactSheet: relativeToOutput(contactSheet),
    clip: relativeToOutput(clip),
    frameOrder: ['pre-click-02', 'pre-click-01', ...Array.from(
      { length: POST_CLICK_FRAMES },
      (_, frame) => `post-click-${String(frame).padStart(2, '0')}`,
    )],
  };
}

async function presentationSnapshot(page, prefixCount) {
  return page.evaluate(async (prefix) => {
    const { useGameStore } = await import('/src/state/store.ts');
    const {
      createFlockPresentationBuffers,
      resetFlockPresentationBuffers,
    } = await import('/src/scene/flock/presentationBuffers.ts');
    const state = useGameStore.getState();
    const buffers = createFlockPresentationBuffers();
    resetFlockPresentationBuffers(buffers, state.sim);
    const activeCount = state.sim.headings.length;
    const style = buffers.style.array;
    const motion = buffers.motion.array;
    const finiteActive =
      Array.from(style.slice(0, activeCount * 2)).every(Number.isFinite) &&
      Array.from(buffers.shape.slice(0, activeCount * 6)).every(Number.isFinite) &&
      Array.from(motion.slice(0, activeCount * 4)).every(Number.isFinite) &&
      Array.from(buffers.currentPositions.slice(0, activeCount * 2)).every(Number.isFinite);
    const positiveScaleCount = Array.from({ length: activeCount }, (_, index) => {
      const at = index * 6;
      return buffers.shape[at] > 0 && buffers.shape[at + 1] > 0 && buffers.shape[at + 2] > 0;
    }).filter(Boolean).length;
    return {
      phase: state.gamePhase,
      tick: state.sim.tick,
      activeCount,
      positions: Array.from(state.sim.positions.slice(0, prefix * 2)),
      style: Array.from(style.slice(0, prefix * 2)),
      shape: Array.from(buffers.shape.slice(0, prefix * 6)),
      motionIdentity: Array.from({ length: prefix }, (_, index) => [
        motion[index * 4],
        motion[index * 4 + 2],
      ]).flat(),
      finiteActive,
      positiveScaleCount,
    };
  }, prefixCount);
}

async function installMatrixProbe(page) {
  await page.evaluate(async (probeName) => {
    const resource = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => /three_webgpu\.js(?:\?|$)/.test(name));
    if (!resource) throw new Error('The app Three/WebGPU module URL was not observed');
    const THREE = await import(resource);
    const key = Symbol.for(probeName);
    const prototype = THREE.InstancedMesh.prototype;
    if (prototype[key]) return;
    const original = prototype.setMatrixAt;
    const probe = { phase: 'idle', expected: 0, records: new Map() };
    Object.defineProperty(prototype, key, { value: probe, configurable: true });
    prototype.setMatrixAt = function herdTransitionSetMatrixAt(index, matrix) {
      if (probe.phase !== 'idle' && this.count === probe.expected) {
        let record = probe.records.get(this.uuid);
        if (!record) {
          record = {
            count: this.count,
            geometryPositionCount: this.geometry?.attributes?.position?.count ?? -1,
            matrices: [],
            firstWriteAt: performance.now(),
          };
          probe.records.set(this.uuid, record);
        }
        if (record.matrices[index] === undefined) {
          record.matrices[index] = Array.from(matrix.elements);
        }
      }
      return original.call(this, index, matrix);
    };
  }, MATRIX_PROBE);
}

/**
 * Observation-only camera driver. It follows sheep zero from the normal scene
 * graph so the before/after frames compare one stable silhouette rather than
 * the title camera's authored travel across trees and the full flock.
 */
async function installCameraProbe(page) {
  await page.evaluate(async (probeName) => {
    const resource = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => /three_webgpu\.js(?:\?|$)/.test(name));
    if (!resource) throw new Error('The app Three/WebGPU module URL was not observed');
    const THREE = await import(resource);
    const { buildSheepGeometry } = await import('/src/scene/flock/sheepGeometry.ts');
    const bodyRecipe = buildSheepGeometry();
    const bodyVertexCount = bodyRecipe.getAttribute('position').count;
    bodyRecipe.dispose();
    const key = Symbol.for(probeName);
    const probe = {
      enabled: true,
      sheepIndex: 0,
      offset: { x: 2.8, y: 2.15, z: 3.25 },
      bodyVertexCount,
    };
    Object.defineProperty(THREE.InstancedMesh.prototype, key, {
      value: probe,
      configurable: true,
    });

    const wrap = (prototype, method) => {
      if (!prototype || typeof prototype[method] !== 'function') return;
      const originalKey = Symbol.for(`${probeName}.${method}`);
      if (prototype[originalKey]) return;
      const original = prototype[method];
      Object.defineProperty(prototype, originalKey, { value: original, configurable: true });
      prototype[method] = function herdTransitionTrackedRender(scene, camera, ...args) {
        const state = THREE.InstancedMesh.prototype[key];
        if (state?.enabled && camera?.isPerspectiveCamera && scene?.traverse) {
          let sheep = null;
          scene.traverse((object) => {
            if (!object?.isInstancedMesh || object.count <= state.sheepIndex) return;
            const geometry = object.geometry;
            if (!geometry?.getAttribute?.('uv1') || !geometry?.getAttribute?.('uv2')) return;
            const vertices = geometry.getAttribute('position')?.count ?? -1;
            if (vertices !== state.bodyVertexCount) return;
            const currentVertices = sheep?.geometry?.getAttribute('position')?.count ?? -1;
            if (vertices > currentVertices) sheep = object;
          });
          if (sheep) {
            // Keep the normal sheep body, outline and contact decal. Removing
            // unrelated instanced scenery from this observation-only frame
            // prevents a foreground trunk from reading as a stretched neck.
            // Use camera layers rather than visibility alone. WebGPU can retain
            // already-prepared draw state across an async render boundary, and
            // non-Mesh scene objects (smoke, sprites, helpers) do not pass an
            // isMesh filter. A dedicated observation layer guarantees that the
            // contact sheet contains only the three shipped sheep draws.
            scene.traverse((object) => {
              const sheepDraw = object.isInstancedMesh
                && object.instanceMatrix === sheep.instanceMatrix;
              object.layers?.set(sheepDraw ? 1 : 0);
            });
            camera.layers.set(1);
            const matrices = sheep.instanceMatrix.array;
            for (let i = 1; i < sheep.count; i++) matrices.fill(0, i * 16, i * 16 + 16);
            sheep.instanceMatrix.needsUpdate = true;
            const matrix = new THREE.Matrix4();
            const target = new THREE.Vector3();
            const rotation = new THREE.Quaternion();
            const scale = new THREE.Vector3();
            const cameraOffset = new THREE.Vector3(
              state.offset.x,
              state.offset.y,
              state.offset.z,
            );
            sheep.getMatrixAt(state.sheepIndex, matrix);
            matrix.decompose(target, rotation, scale);
            cameraOffset.applyQuaternion(rotation);
            camera.position.copy(target).add(cameraOffset);
            camera.fov = 31;
            camera.updateProjectionMatrix();
            camera.lookAt(target.x, target.y + 0.46, target.z);
            camera.updateMatrixWorld(true);
          }
        }
        return original.call(this, scene, camera, ...args);
      };
    };
    wrap(THREE.WebGPURenderer?.prototype, 'render');
    wrap(THREE.WebGPURenderer?.prototype, 'renderAsync');
    wrap(THREE.WebGLRenderer?.prototype, 'render');
  }, CAMERA_PROBE);
}

async function beginMatrixSample(page, phase, expected) {
  await page.evaluate(({ probeName, nextPhase, count }) => {
    const key = Symbol.for(probeName);
    const resource = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => /three_webgpu\.js(?:\?|$)/.test(name));
    if (!resource) throw new Error('The app Three/WebGPU module URL was not observed');
    return import(resource).then((THREE) => {
      const probe = THREE.InstancedMesh.prototype[key];
      if (!probe) throw new Error('matrix probe not installed');
      probe.phase = nextPhase;
      probe.expected = count;
      probe.records = new Map();
    });
  }, { probeName: MATRIX_PROBE, nextPhase: phase, count: expected });
}

async function readMatrixSample(page, expected, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await page.evaluate(async ({ probeName, count }) => {
      const resource = performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => /three_webgpu\.js(?:\?|$)/.test(name));
      if (!resource) return null;
      const THREE = await import(resource);
      const probe = THREE.InstancedMesh.prototype[Symbol.for(probeName)];
      if (!probe) return null;
      const candidates = Array.from(probe.records.values())
        .filter((record) => record.count === count && record.matrices.filter(Boolean).length === count)
        .sort((a, b) => b.geometryPositionCount - a.geometryPositionCount);
      const selected = candidates[0];
      if (!selected) return null;
      probe.phase = 'idle';
      const finiteEntries = selected.matrices.reduce(
        (total, matrix) => total + matrix.filter(Number.isFinite).length,
        0,
      );
      return {
        count: selected.count,
        geometryPositionCount: selected.geometryPositionCount,
        matrices: selected.matrices,
        finiteEntries,
        expectedFiniteEntries: count * 16,
        firstWriteAt: selected.firstWriteAt,
      };
    }, { probeName: MATRIX_PROBE, count: expected });
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  throw new Error(`No complete ${expected}-instance matrix submission within ${timeoutMs} ms`);
}

async function waitForFrameCount(frames, target, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (frames.length < target && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (frames.length < target) {
    throw new Error(`Screencast supplied ${frames.length}/${target} requested frames`);
  }
}

async function captureClickFrames(page, context, tempDir, action) {
  const client = await context.newCDPSession(page);
  const frames = [];
  let accepting = true;
  client.on('Page.screencastFrame', (event) => {
    if (accepting) {
      frames.push({ data: event.data, metadata: event.metadata });
    }
    void client.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
    everyNthFrame: 1,
  });
  await waitForFrameCount(frames, 3);
  const clickAt = frames.length;
  const actionReceipt = await action();
  await waitForFrameCount(frames, clickAt + POST_CLICK_FRAMES);
  accepting = false;
  await client.send('Page.stopScreencast');
  await client.detach();

  const selected = [
    ...frames.slice(Math.max(0, clickAt - PRE_CLICK_FRAMES), clickAt),
    ...frames.slice(clickAt, clickAt + POST_CLICK_FRAMES),
  ];
  if (selected.length !== PRE_CLICK_FRAMES + POST_CLICK_FRAMES) {
    throw new Error(`selected ${selected.length} transition frames, expected 32`);
  }
  mkdirSync(tempDir, { recursive: true });
  selected.forEach((frame, index) => {
    writeFileSync(join(tempDir, `frame-${String(index).padStart(3, '0')}.jpg`), Buffer.from(frame.data, 'base64'));
  });
  return {
    actionReceipt,
    screencast: {
      captured: selected.length,
      preClick: PRE_CLICK_FRAMES,
      postClick: POST_CLICK_FRAMES,
      sourceFramesSeen: frames.length,
      timestamps: selected.map((frame) => frame.metadata.timestamp ?? null),
    },
  };
}

async function clickPlayAndSnapshot(page) {
  return page.evaluate(async () => {
    const { useGameStore } = await import('/src/state/store.ts');
    const button = document.querySelector('.herd-title-actions > .herd-button--primary');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      throw new Error('real Play button is not actionable');
    }
    const before = useGameStore.getState();
    const beforePositions = Array.from(before.sim.positions.slice(0, 50));
    const beforeTick = before.sim.tick;
    button.click();
    const after = useGameStore.getState();
    return {
      beforePhase: before.gamePhase,
      afterPhase: after.gamePhase,
      beforeTick,
      afterTick: after.sim.tick,
      requestedCount: after.flockSize,
      activeCount: after.sim.headings.length,
      prefixPositionDeltaMax: beforePositions.reduce(
        (max, value, index) => Math.max(max, Math.abs(value - after.sim.positions[index])),
        0,
      ),
    };
  });
}

async function clickPlayAgainAndSnapshot(page) {
  return page.evaluate(async () => {
    const { useGameStore } = await import('/src/state/store.ts');
    const button = document.querySelector('[data-testid="completion"] .herd-button--primary');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      throw new Error('real Play again button is not actionable');
    }
    const before = useGameStore.getState();
    const prefix = Math.min(25, before.sim.headings.length);
    const beforePositions = Array.from(before.sim.positions.slice(0, prefix * 2));
    const beforeTick = before.sim.tick;
    button.click();
    const after = useGameStore.getState();
    return {
      beforePhase: before.gamePhase,
      afterPhase: after.gamePhase,
      beforeTick,
      afterTick: after.sim.tick,
      requestedCount: after.flockSize,
      activeCount: after.sim.headings.length,
      prefixPositionDeltaMax: beforePositions.reduce(
        (max, value, index) => Math.max(max, Math.abs(value - after.sim.positions[index])),
        0,
      ),
      resetExpected: true,
    };
  });
}

function presentationComparison(before, after, prefixCount) {
  return {
    prefixCount,
    sampledSimTravelMax: maxAbsDelta(before.positions, after.positions),
    styleDeltaMax: maxAbsDelta(before.style, after.style),
    shapeDeltaMax: maxAbsDelta(before.shape, after.shape),
    motionIdentityDeltaMax: maxAbsDelta(before.motionIdentity, after.motionIdentity),
    activeFinite: after.finiteActive,
    positiveScaleCount: after.positiveScaleCount,
    activeCount: after.activeCount,
  };
}

async function completeForReplay(page) {
  await page.evaluate(async () => {
    const { useGameStore } = await import('/src/state/store.ts');
    const state = useGameStore.getState();
    state.complete(state.sim.tick * 50, state.sim.tick);
  });
  await page.waitForSelector('[data-testid="completion"]', { state: 'visible', timeout: 10_000 });
  await page.addStyleTag({ content: '.herd-modal { opacity: 0 !important; }' });
}

async function captureScenario(browser, baseUrl, backend, flockSize) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('requestfailed', (request) => failedRequests.push({
    url: request.url(),
    error: request.failure()?.errorText ?? '',
  }));
  await context.route('**/api/lobbies', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{"lobbies":[]}',
  }));

  try {
    const debugParts = backend === 'webgl2' ? ['webgl', 'readout'] : ['readout'];
    if (debugExtra) debugParts.push(...debugExtra.split(',').filter(Boolean));
    const debug = debugParts.join(',');
    const url = `${baseUrl}?seed=${SEED}&debug=${debug}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForLive(page);
    const reportedBackend = await page.$eval(READOUT, (node) => node.dataset.backend);
    if (reportedBackend !== backend) {
      throw new Error(`requested ${backend}, app reported ${reportedBackend}`);
    }

    const titleTick0 = Number(await page.$eval(READOUT, (node) => node.dataset.tick));
    await page.waitForTimeout(750);
    const titleTick1 = Number(await page.$eval(READOUT, (node) => node.dataset.tick));
    const choice = page.locator('.herd-size').filter({ hasText: String(flockSize) });
    await choice.waitFor({ state: 'visible', timeout: 10_000 });
    await choice.click();
    const selected = await choice.getAttribute('aria-pressed');
    if (selected !== 'true') throw new Error(`${flockSize} title selection did not stick`);

    await installMatrixProbe(page);
    await installCameraProbe(page);
    await page.waitForTimeout(250);
    await beginMatrixSample(page, 'title-before', 25);
    const beforeMatrices = await readMatrixSample(page, 25);
    const beforePresentation = await presentationSnapshot(page, 25);
    await page.addStyleTag({
      content: '.herd-boot, .herd-modal { opacity: 0 !important; }',
    });

    const transitionTemp = join(frameTemp, `${backend}-${flockSize}-title`);
    await beginMatrixSample(page, 'title-play-first-draw', flockSize);
    const transitionFrames = await captureClickFrames(
      page,
      context,
      transitionTemp,
      () => clickPlayAndSnapshot(page),
    );
    const firstDrawMatrices = await readMatrixSample(page, flockSize);
    const afterPresentation = await presentationSnapshot(page, 25);
    const transitionMedia = buildMedia(transitionTemp, `${backend}-${flockSize}-title-to-play`);

    await completeForReplay(page);
    const replayBeforeMatricesCount = flockSize;
    await beginMatrixSample(page, 'complete-before-replay', replayBeforeMatricesCount);
    const replayBeforeMatrices = await readMatrixSample(page, replayBeforeMatricesCount);
    const replayBeforePresentation = await presentationSnapshot(page, Math.min(25, flockSize));
    const replayTemp = join(frameTemp, `${backend}-${flockSize}-replay`);
    await beginMatrixSample(page, 'play-again-first-draw', flockSize);
    const replayFrames = await captureClickFrames(
      page,
      context,
      replayTemp,
      () => clickPlayAgainAndSnapshot(page),
    );
    const replayAfterMatrices = await readMatrixSample(page, flockSize);
    const replayAfterPresentation = await presentationSnapshot(page, Math.min(25, flockSize));
    const replayMedia = buildMedia(replayTemp, `${backend}-${flockSize}-play-again`);

    const transitionMatrixComparison = compareMatrices(beforeMatrices, firstDrawMatrices, 25);
    const transitionPresentationComparison = presentationComparison(
      beforePresentation,
      afterPresentation,
      25,
    );
    const replayMatrixComparison = compareMatrices(
      replayBeforeMatrices,
      replayAfterMatrices,
      Math.min(25, flockSize),
    );
    const replayPresentationComparison = presentationComparison(
      replayBeforePresentation,
      replayAfterPresentation,
      Math.min(25, flockSize),
    );
    const transitionPass =
      titleTick0 === 0 && titleTick1 === 0 &&
      transitionFrames.actionReceipt.beforeTick === 0 &&
      transitionFrames.actionReceipt.afterTick === 0 &&
      transitionFrames.actionReceipt.prefixPositionDeltaMax === 0 &&
      transitionMatrixComparison.positionDeltaMax <= FIRST_DRAW_POSITION_TOLERANCE_METRES &&
      transitionMatrixComparison.scaleDeltaMax <= NUMERIC_EPSILON &&
      transitionPresentationComparison.styleDeltaMax === 0 &&
      transitionPresentationComparison.shapeDeltaMax === 0 &&
      transitionPresentationComparison.motionIdentityDeltaMax === 0 &&
      firstDrawMatrices.finiteEntries === firstDrawMatrices.expectedFiniteEntries &&
      transitionPresentationComparison.activeFinite &&
      transitionPresentationComparison.positiveScaleCount === flockSize;
    const replayPass =
      replayFrames.actionReceipt.afterTick === 0 &&
      replayMatrixComparison.scaleDeltaMax <= NUMERIC_EPSILON &&
      replayPresentationComparison.styleDeltaMax === 0 &&
      replayPresentationComparison.shapeDeltaMax === 0 &&
      replayPresentationComparison.motionIdentityDeltaMax === 0 &&
      replayAfterMatrices.finiteEntries === replayAfterMatrices.expectedFiniteEntries &&
      replayPresentationComparison.activeFinite &&
      replayPresentationComparison.positiveScaleCount === flockSize;

    return {
      backend,
      flockSize,
      url,
      title: { tickBeforeWait: titleTick0, tickAfter750Ms: titleTick1, selected },
      transition: {
        action: transitionFrames.actionReceipt,
        frames: transitionFrames.screencast,
        media: transitionMedia,
        matrices: {
          before: {
            count: beforeMatrices.count,
            finiteEntries: beforeMatrices.finiteEntries,
            expectedFiniteEntries: beforeMatrices.expectedFiniteEntries,
          },
          firstDraw: {
            count: firstDrawMatrices.count,
            finiteEntries: firstDrawMatrices.finiteEntries,
            expectedFiniteEntries: firstDrawMatrices.expectedFiniteEntries,
            newlyActiveFiniteMatrices: flockSize - 25,
          },
          comparison: transitionMatrixComparison,
        },
        presentation: transitionPresentationComparison,
        pass: transitionPass,
      },
      replay: {
        action: replayFrames.actionReceipt,
        frames: replayFrames.screencast,
        media: replayMedia,
        matrices: {
          firstDraw: {
            count: replayAfterMatrices.count,
            finiteEntries: replayAfterMatrices.finiteEntries,
            expectedFiniteEntries: replayAfterMatrices.expectedFiniteEntries,
          },
          comparison: replayMatrixComparison,
        },
        presentation: replayPresentationComparison,
        pass: replayPass,
      },
      errors: { console: consoleErrors, page: pageErrors, requests: failedRequests },
      pass: transitionPass && replayPass &&
        consoleErrors.length === 0 && pageErrors.length === 0 && failedRequests.length === 0,
    };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

function sourceReceipt() {
  const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const diff = execFileSync('git', [
    'diff', '--binary', 'HEAD', '--',
    'app/src/game/useGameLoop.ts',
    'app/src/state/store.ts',
    'app/src/scene/Flock.tsx',
    'app/src/scene/flock/presentationBuffers.ts',
    'app/src/scene/flock/sheepColor.ts',
    'app/src/scene/flock/sheepGeometry.ts',
    'app/src/scene/flock/sheepMaterial.ts',
    'app/src/scene/flock/sheepRamp.ts',
    'app/src/scene/flock/woolPuffs.ts',
  ], { cwd: repo });
  return {
    gitHead,
    transitionAndSheepDiffSha256: createHash('sha256').update(diff).digest('hex'),
    evidenceToolSha256: createHash('sha256')
      .update(readFileSync(fileURLToPath(import.meta.url)))
      .digest('hex'),
  };
}

function writeIndex(receipt) {
  const rows = receipt.scenarios.map((scenario) => `
    <tr>
      <td>${scenario.backend}</td><td>${scenario.flockSize}</td>
      <td>${scenario.transition.pass ? 'pass' : 'fail'}</td>
      <td>${scenario.transition.action.prefixPositionDeltaMax}</td>
      <td>${scenario.transition.matrices.comparison.positionDeltaMax}</td>
      <td>${scenario.transition.matrices.comparison.scaleDeltaMax}</td>
      <td>${scenario.transition.presentation.styleDeltaMax}</td>
      <td>${scenario.transition.matrices.firstDraw.finiteEntries}/${scenario.transition.matrices.firstDraw.expectedFiniteEntries}</td>
    </tr>`).join('');
  const galleries = receipt.scenarios.map((scenario) => `
    <section>
      <h2>${scenario.backend} ${scenario.flockSize}</h2>
      <p>Cells are row-major: two pre-click frames, then post-click frames 00 through 29.</p>
      <h3>Title to Play</h3>
      <img src="${scenario.transition.media.contactSheet}" alt="${scenario.backend} ${scenario.flockSize} title to Play contact sheet">
      <video controls muted loop src="${scenario.transition.media.clip}"></video>
      <h3>Play again</h3>
      <img src="${scenario.replay.media.contactSheet}" alt="${scenario.backend} ${scenario.flockSize} Play again contact sheet">
      <video controls muted loop src="${scenario.replay.media.clip}"></video>
    </section>`).join('');
  writeFileSync(join(outputDir, 'index.html'), `<!doctype html>
<html><head><meta charset="utf-8"><title>Herd sheep transition evidence</title>
<style>body{font:15px system-ui;background:#1b1714;color:#f4eadb;margin:24px}table{border-collapse:collapse}td,th{border:1px solid #675b4e;padding:6px 9px}img,video{display:block;max-width:100%;margin:8px 0 24px}section{border-top:1px solid #675b4e;padding-top:16px}</style>
</head><body><h1>Sheep title-to-Play continuity</h1>
<p>Generated ${receipt.generatedAt}. A tools-only observation camera tracks sheep 24 at a fixed offset. The media then applies fixed crop ${JSON.stringify(CROP)} from a ${VIEWPORT.width} by ${VIEWPORT.height} viewport.</p>
<table><thead><tr><th>Backend</th><th>Sheep</th><th>Transition</th><th>Synchronous position delta</th><th>First-draw position delta</th><th>Scale delta</th><th>Style delta</th><th>Finite matrix values</th></tr></thead><tbody>${rows}</tbody></table>
${galleries}</body></html>`, 'utf8');
}

let server = null;
let browser = null;
const scenarios = [];
try {
  const baseUrl = externalUrl ?? `http://localhost:${port}/`;
  if (!externalUrl) server = await startServer(port);
  browser = await chromium.launch({ channel: 'chrome', args: GPU_ARGS });
  const backends = backendFilter ? [backendFilter] : ['webgpu', 'webgl2'];
  const flockSizes = flockFilter ? [Number(flockFilter)] : [25, 75, 200];
  for (const backend of backends) {
    if (backend !== 'webgpu' && backend !== 'webgl2') {
      throw new Error(`Unsupported --backend ${backend}`);
    }
    for (const flockSize of flockSizes) {
      if (![25, 75, 200].includes(flockSize)) {
        throw new Error(`Unsupported --flock ${flockSize}`);
      }
      process.stdout.write(`capturing ${backend} ${flockSize}\n`);
      scenarios.push(await captureScenario(browser, baseUrl, backend, flockSize));
    }
  }
  const receipt = {
    tool: 'tools/sheep-transition-evidence.mjs',
    generatedAt,
    source: sourceReceipt(),
    viewport: VIEWPORT,
    fixedCrop: CROP,
    contract: {
      framesPerTransition: PRE_CLICK_FRAMES + POST_CLICK_FRAMES,
      preClickFrames: PRE_CLICK_FRAMES,
      postClickFrames: POST_CLICK_FRAMES,
      params: ['seed', 'debug'],
      windowGlobalsAdded: 0,
      appSourceProbeChanges: 0,
      numericEpsilon: NUMERIC_EPSILON,
      firstDrawPositionToleranceMetres: FIRST_DRAW_POSITION_TOLERANCE_METRES,
      observationCamera: 'Tools-only prototype observer tracks stable sheep index 0 at one fixed close overhead offset before Play and through the first 30 rendered frames.',
      observationIsolation: 'The observer hides unrelated scene meshes and zeroes non-target sheep matrices only after each normal app frame has submitted its measured transforms. The tracked body, outline and contact meshes remain on the shipped render path.',
      playAgainSetup: 'The tool calls the existing store complete action, then clicks the real Play again button.',
    },
    scenarios,
    pass: scenarios.every((scenario) => scenario.pass),
  };
  writeFileSync(join(outputDir, 'manifest.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  writeIndex(receipt);
  process.stdout.write(`${JSON.stringify({ outputDir, pass: receipt.pass }, null, 2)}\n`);
  if (!receipt.pass) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  stopServer(server);
  try {
    rmSync(frameTemp, { recursive: true, force: true });
  } catch {
    // Exact mkdtemp-owned scratch only. The OS temp sweeper can finish cleanup.
  }
}
