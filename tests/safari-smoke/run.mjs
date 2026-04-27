#!/usr/bin/env node
/**
 * Cycle 9 Phase 3 — real macOS Safari smoke runner.
 *
 * Drives Safari via safaridriver (no Playwright; Playwright's bundled WebKit
 * is not real Safari). For each scene, we:
 *   1. navigate to ?scene=<id>&debug=gl
 *   2. wait for the canvas to render and for `window.__sdsDiag` to be set
 *      by the in-page diagnostic probe
 *   3. capture a screenshot + dump the diag JSON
 *
 * The artifacts are uploaded by the workflow so a human (or follow-up agent)
 * can diff against a Chromium baseline.
 *
 * Runs only on macOS (it's the whole point). On other platforms it exits 0
 * with a skip message so it can be invoked locally without errors.
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

try {
  for (const sceneId of scenes) {
    const url = sceneId === 'field'
      ? `${baseUrl}/?debug=gl`
      : `${baseUrl}/?scene=${encodeURIComponent(sceneId)}&debug=gl`;
    console.log(`\n[safari-smoke] ${sceneId} -> ${url}`);

    const sceneOut = { url, status: 'pending' };
    try {
      await driver.get(url);

      // Wait for canvas to mount (start screen has a 3D background canvas
      // already; the gameplay canvas is conditionally rendered).
      await driver.wait(until.elementLocated(By.css('canvas')), 30_000);

      // Give the page ~6 seconds for shaders to compile, terrain to mesh,
      // sky/water/atmosphere to bind. Real fixes use an explicit ready
      // signal; this is the smoke baseline.
      await driver.sleep(6000);

      // Pull __sdsDiag if the page set it.
      const diagJson = await driver.executeScript(
        'return JSON.stringify(window.__sdsDiag || null);'
      );
      sceneOut.diag = JSON.parse(diagJson);

      // Pull the canvas size + the renderer info if available.
      const rendererInfo = await driver.executeScript(`
        const el = document.querySelector('canvas');
        if (!el) return null;
        const gl = el.getContext('webgl2') || el.getContext('webgl');
        if (!gl) return { width: el.width, height: el.height, gl: null };
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          width: el.width,
          height: el.height,
          gl: gl.getParameter ? {
            vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
            renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
            extensions: gl.getSupportedExtensions(),
          } : null,
        };
      `);
      sceneOut.renderer = rendererInfo;

      // Screenshot.
      const png = await driver.takeScreenshot();
      const shotPath = path.join(OUT, `${sceneId}.png`);
      await fs.writeFile(shotPath, Buffer.from(png, 'base64'));
      sceneOut.screenshot = path.basename(shotPath);
      sceneOut.status = 'ok';
    } catch (err) {
      sceneOut.status = 'error';
      sceneOut.error = String(err?.stack || err);
      console.error(`[safari-smoke] ${sceneId} failed:`, err);
    }
    summary.scenes[sceneId] = sceneOut;
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
if (failed.length > 0) process.exit(1);
