#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 9 Phase 3 — real macOS Safari smoke runner.
 *
 * Drives Safari via safaridriver (no Playwright; Playwright's bundled WebKit
 * is not real Safari). This catches the class of rendering bugs that
 * ANGLE-on-Metal exposes (terrain shader FBM precision, water render-target
 * alloc, sky shader) which the bundled WebKit does not, since it doesn't use
 * Metal.
 *
 * Flow (Cycle 58 update — was stale since the Cycle 51 entrance rework):
 *   1. Boot ONCE through the world-first entrance. Identity is deferred (no
 *      name gate), so the armed-world panel is the first interactive surface;
 *      its `Play` button commits and builds the current entrance flagship.
 *      We seed a player identity defensively so no identity surface can
 *      intercept. `?debug=gl` installs window.__sdsDiag + the sampler.
 *   2. For each requested scene, swap to it IN-ENGINE via window.__sdsSwapTo
 *      (always installed on the first scene build, js/boot/debugProbes.js).
 *      Each swap runs disposeScene + rebuildScene + _buildSceneBody, so it
 *      fully re-exercises that biome's terrain / water / sky / grass render
 *      path — exactly what this smoke exists to verify on real Metal.
 *   3. After each swap, assert window.__sdsSwapProbe().scene landed, let the
 *      shaders/atmosphere/water settle, trigger the framebuffer sample, and
 *      capture the in-game render + diag (`<scene>-inGame.png`).
 *
 * Why no `?scene=` deep-link and no "Solo Play -> Confirm -> Classic Mode"
 * click chain any more: the Cycle 51 world-first entrance removed those
 * buttons and always lands on the current entrance flagship regardless of the
 * URL. Driving the in-engine swap harness is both robust (no per-biome label differences, no
 * next-world click counting) and a stronger render exercise than the old
 * start-screen sample, since the entrance is now a static image, not a live
 * 3D scene.
 *
 * Runs only on macOS. On other platforms it exits 0 with a skip message so it
 * can be invoked locally without errors.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';

if (platform() !== 'darwin') {
  console.log('[safari-smoke] Skipping: only runs on macOS.');
  process.exit(0);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
await fs.mkdir(OUT, { recursive: true });

const scenesArg = process.env.SCENES || 'field,rolling-hills,open-country';
const scenes = scenesArg.split(',').map(s => s.trim()).filter(Boolean);
const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

const { Builder, By, until } = await import('selenium-webdriver');
const safari = await import('selenium-webdriver/safari.js');

const summary = {
  startedAt: new Date().toISOString(),
  baseUrl,
  scenes: {},
};

const driver = await new Builder()
  .forBrowser('safari')
  .setSafariOptions(new safari.Options())
  .build();

// __sdsSwapTo awaits a full scene rebuild; give the async script room on a
// cold Metal context before selenium's default 30s script timeout trips.
await driver.manage().setTimeouts({ script: 60_000 });

// Identity is deferred in the Cycle 51 entrance (no name gate), so this is
// belt-and-suspenders: it guarantees no first-run identity surface can sit in
// front of the armed-world panel.
const SEED_IDENTITY_SCRIPT = `
  const identity = {
    persistentId: 'player_safari_smoke_' + Date.now(),
    displayName: 'SafariSmoke',
    fullName: 'SafariSmoke#0001',
    discriminator: '0001',
    nameType: 'custom',
    createdAt: Date.now(),
    isRegistered: false,
  };
  localStorage.setItem('playerIdentity', JSON.stringify(identity));
`;

async function takeScreenshotTo(filename) {
  const png = await driver.takeScreenshot();
  const out = path.join(OUT, filename);
  await fs.writeFile(out, Buffer.from(png, 'base64'));
  return path.basename(out);
}

async function pullDiag() {
  const json = await driver.executeScript(
    'return JSON.stringify(window.__sdsDiag || null);'
  );
  return JSON.parse(json);
}

async function pullRendererInfo() {
  return driver.executeScript(`
    const el = document.querySelector('canvas');
    if (!el) return null;
    const gl = el.getContext('webgl2') || el.getContext('webgl');
    if (!gl) return { width: el.width, height: el.height, gl: null };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      width: el.width,
      height: el.height,
      gl: {
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
        extensions: gl.getSupportedExtensions(),
      },
    };
  `);
}

/** Poll a JS truthiness expression until it holds or the timeout elapses. */
async function waitForJs(expr, timeoutMs, label) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await driver.executeScript(`return !!(${expr});`);
      if (ok) return true;
    } catch (e) {
      lastErr = e;
    }
    await driver.sleep(500);
  }
  throw new Error(`timeout (${timeoutMs}ms) waiting for ${label || expr}` + (lastErr ? ` (last: ${lastErr.message})` : ''));
}

/**
 * Swap to a scene in-engine and return the scene the probe reports landing on
 * (or an 'ERROR:<msg>' string). Uses executeAsyncScript because the swap is a
 * promise (full dispose + rebuild).
 */
async function swapTo(sceneId) {
  return driver.executeAsyncScript(function () {
    var id = arguments[0];
    var done = arguments[arguments.length - 1];
    if (typeof window.__sdsSwapTo !== 'function') { done('ERROR:no-swap-harness'); return; }
    Promise.resolve(window.__sdsSwapTo(id)).then(function () {
      var probe = window.__sdsSwapProbe ? window.__sdsSwapProbe() : null;
      done(probe ? probe.scene : id);
    }).catch(function (e) {
      done('ERROR:' + (e && e.message ? e.message : String(e)));
    });
  }, sceneId);
}

async function pullSwapProbe() {
  const json = await driver.executeScript(
    'return JSON.stringify(window.__sdsSwapProbe ? window.__sdsSwapProbe() : null);'
  );
  return JSON.parse(json);
}

/**
 * Click the entrance Play button. The button is `<Icon/> Play`; the Icon svg
 * is aria-hidden with no text node, so the button's text value is exactly
 * "Play". An exact match avoids "Just Play" (a difficulty chip), "Play online"
 * (a secondary way), and "Playing as ..." (the name affordance).
 */
async function clickPlay(timeoutMs = 30_000) {
  const xpath = '//button[normalize-space(.)="Play"]';
  const el = await driver.wait(until.elementLocated(By.xpath(xpath)), timeoutMs);
  await driver.wait(until.elementIsVisible(el), timeoutMs);
  await el.click();
}

try {
  // ---- Boot once through the entrance into gameplay. ----
  const bootUrl = `${baseUrl}/?debug=gl`;
  console.log(`[safari-smoke] boot -> ${bootUrl}`);
  // Seed identity BEFORE the real navigation so no identity surface renders.
  // localStorage needs an established origin first, hence the priming get().
  await driver.get(baseUrl);
  await driver.executeScript(SEED_IDENTITY_SCRIPT);
  await driver.get(bootUrl);

  // Commit the default armed world. This builds the
  // first scene, which is where __sdsSwapTo + the GL canvas come up.
  await clickPlay();

  await driver.wait(until.elementLocated(By.css('#canvas-container canvas')), 60_000);
  await waitForJs("typeof window.__sdsSwapTo === 'function'", 120_000, 'swap harness install');
  await waitForJs("window.__sdsSwapProbe && window.__sdsSwapProbe().sheep && window.__sdsSwapProbe().sheep.count > 0", 30_000, 'flock populate');

  // ---- Per-scene: swap in-engine, settle, capture. ----
  for (const sceneId of scenes) {
    console.log(`\n[safari-smoke] ${sceneId}: swap + capture`);
    const sceneOut = { status: 'pending', stages: {} };

    try {
      const landed = await swapTo(sceneId);
      if (typeof landed === 'string' && landed.startsWith('ERROR:')) {
        throw new Error(`__sdsSwapTo failed: ${landed.slice(6)}`);
      }
      if (landed !== sceneId) {
        throw new Error(`swap landed on '${landed}', expected '${sceneId}'`);
      }

      // Let shaders/atmosphere/water bind on the freshly built scene. RH and
      // OC's heightfield + water init takes longer than Field's flat setup; 8s
      // covers both. rAF is throttled to ~30fps under safaridriver, so we wait
      // on wall time rather than frame counts.
      await driver.sleep(8_000);

      // Trigger the framebuffer sample explicitly (the 240-frame auto-sample
      // timing is unreliable under safaridriver's throttled rAF).
      await driver.executeScript(
        "window.__sdsCaptureSample && window.__sdsCaptureSample(arguments[0]);",
        sceneId,
      );

      sceneOut.stages.inGame = {
        screenshot: await takeScreenshotTo(`${sceneId}-inGame.png`),
        renderer: await pullRendererInfo(),
        probe: await pullSwapProbe(),
      };
      sceneOut.diag = await pullDiag();
      sceneOut.status = 'ok';
    } catch (err) {
      sceneOut.status = 'error';
      sceneOut.error = String(err?.stack || err);
      // Pull whatever diag/probe exists for partial telemetry.
      try { sceneOut.diag = await pullDiag(); } catch {}
      try { sceneOut.probe = await pullSwapProbe(); } catch {}
      try {
        sceneOut.stages.errorScreenshot = await takeScreenshotTo(`${sceneId}-error.png`);
      } catch {}
      console.error(`[safari-smoke] ${sceneId} failed:`, err);
    }

    summary.scenes[sceneId] = sceneOut;
  }
} catch (bootErr) {
  // A boot failure (entrance never came up, Play never resolved, harness never
  // installed) marks every requested scene as failed so the job goes red.
  console.error('[safari-smoke] boot failed:', bootErr);
  summary.bootError = String(bootErr?.stack || bootErr);
  try {
    summary.bootScreenshot = await takeScreenshotTo('boot-error.png');
  } catch {}
  for (const sceneId of scenes) {
    if (!summary.scenes[sceneId]) {
      summary.scenes[sceneId] = { status: 'error', error: 'boot failed before scene swap' };
    }
  }
} finally {
  await driver.quit();
}

summary.finishedAt = new Date().toISOString();
await fs.writeFile(
  path.join(OUT, 'summary.json'),
  JSON.stringify(summary, null, 2),
);

const failed = Object.values(summary.scenes).filter(s => s.status !== 'ok');
console.log(`\n[safari-smoke] Done. ok=${scenes.length - failed.length} fail=${failed.length}`);
if (failed.length > 0 || summary.bootError) process.exit(1);
