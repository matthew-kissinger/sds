// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Shared plumbing for the browser probes in tools/ (spec/09 layer 4). Both
// tools/herding-probe.mjs and tools/beauty-shots.mjs drive the REAL app through
// its normal path - open the page, press the real Play button, read the numbers
// off the debug readout node - so the boot handshake, the GPU flags and the
// dev-server lifecycle belong in one place rather than in each probe.
//
// Everything here takes a port. Several agents run probes at once during the
// phase 3 fan-out, so nothing may assume a single well-known port, a single
// browser profile, or a shared temp path.

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The pinned probe seed. Same seed, same field, always (spec/09). */
export const SEED = 20260821;

/** Chromium needs to be told twice that a headless machine may use its GPU. */
export const GPU_ARGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-angle=default',
  '--ignore-gpu-blocklist',
];

/** The debug-only DOM node the app publishes probe numbers on. No globals. */
export const READOUT = '[data-testid="debug-readout"]';

// --- the dev server ---------------------------------------------------------

export async function reachable(url) {
  try {
    const response = await fetch(url, { redirect: 'manual' });
    return response.status < 500;
  } catch {
    return false;
  }
}

/** Start a Vite dev server on `port` and resolve once it answers. */
export async function startServer(port) {
  const vite = join(repo, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) throw new Error(`vite not found at ${vite}`);
  // Refuse to silently probe somebody else's server: a stale one can be serving
  // a different tree, and the result would be a lie rather than a failure.
  if (await reachable(`http://localhost:${port}/`)) {
    throw new Error(`port ${port} is already in use. Stop it, or pass --url to use it on purpose.`);
  }
  const child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], {
    cwd: repo,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await reachable(`http://localhost:${port}/`)) return child;
    if (child.exitCode !== null) throw new Error(`vite exited early (${child.exitCode})`);
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`vite did not answer on port ${port} within 60 s`);
}

/** Start the built production preview on `port` and resolve once it answers. */
export async function startPreviewServer(port) {
  const vite = join(repo, 'node_modules', 'vite', 'bin', 'vite.js');
  const dist = join(repo, 'dist', 'index.html');
  if (!existsSync(vite)) throw new Error(`vite not found at ${vite}`);
  if (!existsSync(dist)) throw new Error('dist missing; run npm run build first');
  if (await reachable(`http://localhost:${port}/`)) {
    throw new Error(`port ${port} is already in use. Stop it, or pass --url to use it on purpose.`);
  }
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(port), '--strictPort'], {
    cwd: repo,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await reachable(`http://localhost:${port}/`)) return child;
    if (child.exitCode !== null) throw new Error(`preview exited early (${child.exitCode})`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`preview did not answer on port ${port} within 60 s`);
}

export function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

// --- the browser ------------------------------------------------------------

/** A private scratch directory. Concurrent probes never share one. */
export function scratchDir(prefix) {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

export function removeDir(path) {
  if (!path) return;
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // A browser that has not finished exiting can hold a lock; the OS temp
    // sweeper gets it later. Never fail a probe on cleanup.
  }
}

/**
 * The new headless chromium, not the headless shell: the shell has no GPU and
 * WebGPURenderer would silently land on the WebGL2 backend for every run.
 *
 * Playwright rejects a `--user-data-dir` argument on `launch()` - it allocates
 * its own unique profile per launch instead, under the OS temp root. Pointing
 * that root at `profileRoot` is therefore how concurrent probes stay out of each
 * other's profile AND how a probe can guarantee it removes the one it made:
 * the shared system temp dir is exactly the collision this avoids.
 */
export function launchBrowser(profileRoot, extraArgs = []) {
  // Scope Chromium's scratch-root override to its child process. Mutating the
  // probe process environment made later tools inherit a deleted temp path
  // after removeDir(profileRoot), which could strand unrelated probe output.
  const env = profileRoot
    ? { ...process.env, TMPDIR: profileRoot, TEMP: profileRoot, TMP: profileRoot }
    : undefined;
  return chromium.launch({ channel: 'chromium', args: [...GPU_ARGS, ...extraArgs], env });
}

// --- reading the app --------------------------------------------------------

export async function readout(page) {
  return page.$eval(READOUT, (node) => ({ ...node.dataset }));
}

/**
 * Boot-to-interactive. The renderer is created asynchronously, and everything
 * inside the Canvas - the frame loop, the input resolver, the scripted dog -
 * mounts only once it resolves. Pressing Play before that lands on a title whose
 * keyboard listener does not exist yet, and a held key is a level, not an edge:
 * the press is simply lost. Title deliberately freezes the gameplay sim, so a
 * probe waits for a named backend and the scene-ready contract instead of a
 * positive tick before it touches anything.
 */
export async function waitForLive(page) {
  // Attached, not visible: the readout is a zero-size node on purpose.
  await page.waitForSelector(READOUT, { state: 'attached', timeout: 60_000 });
  await page.waitForFunction(
    (selector) => {
      const data = document.querySelector(selector)?.dataset;
      const app = document.querySelector('.herd-app');
      return data !== undefined && data.backend !== 'pending' &&
        app instanceof HTMLElement && app.dataset.ready === 'true';
    },
    READOUT,
    { timeout: 60_000, polling: 100 },
  );
}

/**
 * Press the real Play button on the real title, optionally picking a flock size
 * first (the title's 25 / 75 / 200 buttons are labelled with the number).
 */
export async function pressPlay(page, { flockSize } = {}) {
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await waitForLive(page);
  if (flockSize) {
    // Keep startup profiling out of Chromium's accessibility-tree rebuild.
    // The exact matrix samples rAF while this helper runs; a role lookup here
    // produced 150-215 ms gaps after the field was already compiled, while a
    // DOM-scoped locator exercises the same real button without that probe cost.
    const choice = page.locator('.herd-size').filter({ hasText: String(flockSize) });
    await choice.waitFor({ state: 'visible', timeout: 60_000 });
    await choice.click();
  }
  // A stable CSS locator avoids rebuilding Chromium's accessibility tree in
  // the throttled startup sample. Accessibility is tested separately by the
  // UI probe; this path measures the game rather than locator overhead.
  const play = page.locator('.herd-title-actions > .herd-button--primary');
  await play.waitFor({ state: 'visible', timeout: 60_000 });
  await play.click();
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.dataset.gamePhase === 'playing',
    READOUT,
    { timeout: 30_000 },
  );
}

/**
 * Wait for the run to reach `tick`. This is the probe's deterministic moment:
 * the sim is fixed-step and fixed-seed, so a tick names a world state.
 *
 * The phase is part of the predicate on purpose. The dev server reloads the page
 * whenever a module it cannot hot-swap changes, which during a parallel build
 * fan-out happens while a capture is in flight; a reload drops the app back to
 * the title with the field still ticking behind it. Requiring `playing` turns
 * that into a timeout the caller reports, instead of a gallery full of title
 * screens that look like a camera bug.
 */
export async function waitForTick(page, tick, timeout) {
  await page.waitForFunction(
    ({ selector, target }) => {
      const data = document.querySelector(selector)?.dataset;
      return data?.gamePhase === 'playing' && Number(data.tick) >= target;
    },
    { selector: READOUT, target: tick },
    { timeout, polling: 100 },
  );
}

export async function shot(page, file) {
  await page.screenshot({ path: file });
  return file;
}

// --- frame times ------------------------------------------------------------

export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

/** Watch rAF from inside the page for `ms`, then report the deltas it saw. */
export async function sampleFrameTimes(page, ms) {
  const deltas = await page.evaluate(async (duration) => {
    const seen = [];
    await new Promise((done) => {
      let last = performance.now();
      const start = last;
      const tick = (now) => {
        seen.push(now - last);
        last = now;
        if (now - start >= duration) done();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return seen;
  }, ms);
  // Drop the first delta: it measures the gap to the sampler being installed.
  const sorted = deltas.slice(1).sort((a, b) => a - b);
  const total = sorted.reduce((sum, delta) => sum + delta, 0);
  return {
    frames: sorted.length,
    mean: sorted.length === 0 ? 0 : total / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
    over16_7: sorted.filter((delta) => delta > 16.7).length,
    over33_4: sorted.filter((delta) => delta > 33.4).length,
  };
}
