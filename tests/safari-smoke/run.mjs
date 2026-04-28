#!/usr/bin/env node
/**
 * Cycle 9 Phase 3 — real macOS Safari smoke runner.
 *
 * Drives Safari via safaridriver (no Playwright; Playwright's bundled WebKit
 * is not real Safari). For each scene, we:
 *   1. navigate to ?scene=<id>&debug=gl with a seeded player identity in
 *      localStorage so the start-screen welcome modal is skipped
 *   2. capture the start-screen render + diag once shaders/atmosphere have
 *      had time to bind (`startScreen.png`, sample label='startScreen')
 *   3. click Solo Play -> Confirm Selection -> Classic Mode to enter
 *      gameplay, wait for the in-game canvas to settle, capture the
 *      in-game render + diag again (`inGame.png`, sample label='inGame')
 *
 * The first run on real Safari (artifact 25023642777) confirmed the
 * `white ground / no sun / no water` bug does NOT manifest at boot — the
 * start-screen background renders correctly. The bug is gated on the
 * gameplay transition, which is what this runner now exercises.
 *
 * Runs only on macOS. On other platforms it exits 0 with a skip message
 * so it can be invoked locally without errors.
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

/**
 * Click a button by its visible text. Uses XPath because Safari's
 * WebDriver doesn't support :has-text() pseudo-selector and React-rendered
 * buttons here have no test IDs.
 */
async function clickByText(text, timeoutMs = 15_000) {
  const xpath = `//button[contains(., ${JSON.stringify(text)})]`;
  const el = await driver.wait(until.elementLocated(By.xpath(xpath)), timeoutMs);
  await driver.wait(until.elementIsVisible(el), timeoutMs);
  await el.click();
}

try {
  for (const sceneId of scenes) {
    const url = sceneId === 'field'
      ? `${baseUrl}/?debug=gl`
      : `${baseUrl}/?scene=${encodeURIComponent(sceneId)}&debug=gl`;
    console.log(`\n[safari-smoke] ${sceneId} -> ${url}`);

    const sceneOut = { url, status: 'pending', stages: {} };

    try {
      // Seed identity BEFORE navigation so React's identity-setup branch
      // doesn't render. We have to navigate first to satisfy localStorage's
      // same-origin policy, then refresh.
      await driver.get(baseUrl);
      await driver.executeScript(SEED_IDENTITY_SCRIPT);
      await driver.get(url);

      await driver.wait(until.elementLocated(By.css('canvas')), 30_000);
      // Wait for shaders/atmosphere to bind. The probe samples at frame
      // 240 (~4s @60fps); we wait 6s to be safe.
      await driver.sleep(6_000);

      sceneOut.stages.startScreen = {
        screenshot: await takeScreenshotTo(`${sceneId}-startScreen.png`),
        renderer: await pullRendererInfo(),
      };

      // Click through to gameplay: Solo Play -> Confirm Selection -> Classic Mode.
      // ScenePicker may need to re-pick the scene; ?scene= URL is honored
      // pre-React-mount, so it's already loaded the right scene.
      try {
        await clickByText('Solo Play');
        await clickByText('Confirm Selection');
        await clickByText('Classic Mode');
      } catch (err) {
        sceneOut.stages.startScreen.clickError = String(err?.message || err);
        // Try a fallback path: maybe the ScenePicker is in front of the
        // mode selection on this layout.
        console.warn(`[safari-smoke] ${sceneId}: click chain failed at`, err?.message);
        throw err;
      }

      // The game canvas appears once the scene is ready. The probe samples
      // again at frame 240 after gameState.gameActive flips true; we wait
      // 8s to give terrain bake + sheep spawn time to settle.
      await driver.sleep(8_000);

      sceneOut.stages.inGame = {
        screenshot: await takeScreenshotTo(`${sceneId}-inGame.png`),
      };

      // Pull the FINAL diag (now includes both startScreen and inGame
      // framebuffer samples + any GL errors that fired in-game).
      sceneOut.diag = await pullDiag();
      sceneOut.status = 'ok';
    } catch (err) {
      sceneOut.status = 'error';
      sceneOut.error = String(err?.stack || err);
      // Try to pull whatever diag was captured before the error so we
      // still get partial telemetry.
      try { sceneOut.diag = await pullDiag(); } catch {}
      try {
        sceneOut.stages.errorScreenshot = await takeScreenshotTo(`${sceneId}-error.png`);
      } catch {}
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
