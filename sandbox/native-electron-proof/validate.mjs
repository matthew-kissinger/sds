// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import electronPath from 'electron';
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const proofRoot = __dirname;
const distRoot = resolve(repoRoot, 'dist');
const outDir = resolve(repoRoot, 'cycle53-validation/native/electron');
const workerBase = process.env.SDS_WORKER_BASE || 'https://sds-worker.matt-m-kissinger.workers.dev';
const packagedArg = process.argv.find((arg) => arg.startsWith('--packaged='))?.slice('--packaged='.length);
const packagedExe = packagedArg ? resolve(__dirname, packagedArg) : null;
const validatedDist = packagedExe ? resolve(dirname(packagedExe), 'resources', 'dist') : distRoot;
const rendererArgRaw = process.argv.find((arg) => arg.startsWith('--renderer='))?.slice('--renderer='.length)
  || process.env.SDS_NATIVE_RENDERER
  || 'webgl';
const rendererArg = ['webgl', 'webgpu', 'default'].includes(rendererArgRaw) ? rendererArgRaw : 'webgl';
const rendererExplicit = process.argv.some((arg) => arg.startsWith('--renderer=')) || !!process.env.SDS_NATIVE_RENDERER;
const artifactSuffix = rendererExplicit ? `-${rendererArg}` : '';
const screenshotPath = resolve(outDir, `electron-field-classic${artifactSuffix}.png`);
const resultPath = resolve(outDir, `electron-proof${artifactSuffix}.json`);

function buildNativeUrl(renderer) {
  const url = new URL('sds://app/index.html');
  url.searchParams.set('nativeProof', 'electron');
  url.searchParams.set('scene', 'field');
  if (renderer !== 'default') {
    url.searchParams.set('renderer', renderer);
  }
  return url.href;
}

function rendererChecks(renderer, state) {
  const mode = state?.rendererMode ?? null;
  const production = state?.productionWebGpu ?? null;
  const rendererInfo = state?.renderer ?? null;

  if (renderer === 'webgpu') {
    return {
      requestedWebGpu: mode?.requested === 'webgpu',
      effectiveProductionWebGpu: mode?.effective === 'webgpu-production',
      noFallback: mode?.fallbackReason == null,
      productionStateOk: production?.ok === true,
      devicePreflightOk: production?.devicePreflight?.ok === true,
      rendererWebGpu: rendererInfo?.isWebGPURenderer === true
        || rendererInfo?.className === 'WebGPURenderer'
    };
  }

  if (renderer === 'webgl') {
    return {
      requestedWebGl: mode?.requested === 'webgl',
      effectiveWebGl: mode?.effective === 'webgl',
      noFallback: mode?.fallbackReason == null,
      notProductionWebGpu: mode?.productionWebGpu === false,
      noProductionState: production == null,
      rendererWebGl: rendererInfo?.isWebGLRenderer === true
        && rendererInfo?.isWebGPURenderer !== true
    };
  }

  return {
    rendererResolved: !!mode?.effective,
    rendererMatchesRuntime: String(mode?.effective || '').startsWith('webgpu')
      ? rendererInfo?.isWebGPURenderer === true || rendererInfo?.className === 'WebGPURenderer'
      : rendererInfo?.isWebGLRenderer === true
  };
}

const ignoredConsolePatterns = [
  /ServiceWorker/i,
  /geckos/i,
  /WebRTC/i,
  /Connection timeout/i,
  /\[NETWORK\]/i,
  /\[PLAYER\].*Server registration failed/i,
  /Mixed Content/i,
  /favicon/i
];

function ignored(text) {
  return ignoredConsolePatterns.some((re) => re.test(text));
}

async function screenshotStats(path) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let sumSq = 0;
  for (const value of data) {
    sum += value;
    sumSq += value * value;
  }
  const count = data.length;
  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  return { width: info.width, height: info.height, mean, stddev: Math.sqrt(variance) };
}

async function run() {
  await mkdir(outDir, { recursive: true });

  if (!packagedExe && !existsSync(resolve(distRoot, 'index.html'))) {
    throw new Error('dist/index.html is missing. Run npm run build:native first.');
  }
  if (packagedExe && !existsSync(packagedExe)) {
    throw new Error(`Packaged executable is missing: ${packagedExe}`);
  }

  const app = await electron.launch({
    executablePath: packagedExe || electronPath,
    args: packagedExe ? [] : [proofRoot],
      env: {
        ...process.env,
        ...(packagedExe ? {} : { SDS_NATIVE_DIST: distRoot }),
        SDS_NATIVE_SHOW: process.env.SDS_NATIVE_SHOW || '1',
        SDS_NATIVE_RENDERER: rendererArg,
        SDS_NATIVE_URL: buildNativeUrl(rendererArg)
      }
  });

  const fatalErrors = [];
  try {
    const page = await app.firstWindow();
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (!ignored(text)) fatalErrors.push(text);
    });
    page.on('pageerror', (err) => {
      const text = `pageerror: ${err.message}`;
      if (!ignored(text)) fatalErrors.push(text);
    });

    await page.evaluate(() => {
      const identity = {
        persistentId: `player_native_electron_${Date.now()}`,
        displayName: 'NativeProof',
        fullName: 'NativeProof#0001',
        discriminator: '0001',
        nameType: 'custom',
        createdAt: Date.now(),
        isRegistered: false
      };
      localStorage.setItem('playerIdentity', JSON.stringify(identity));
      localStorage.setItem('camera-mode-field', 'classic');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page).toHaveTitle(/Sheep Dog Sim/i);
    const classic = page.getByRole('button', { name: /Classic/i });
    await expect(classic).toBeVisible({ timeout: 30_000 });
    await classic.click({ force: true });

    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(play).toBeVisible({ timeout: 15_000 });
    await play.click({ force: true });

    const canvas = page.locator('#canvas-container canvas');
    await expect(canvas).toBeAttached({ timeout: 90_000 });
    await expect(play).toBeHidden({ timeout: 120_000 });
    await expect(page.getByText(/0\s*\/\s*200/)).toBeVisible({ timeout: 30_000 });
    await expect(async () => {
      const state = await page.evaluate(() => {
        const c = document.querySelector('#canvas-container canvas');
        if (!c) return null;
        return {
          width: c.width,
          height: c.height,
          overlayText: document.querySelector('#react-overlay')?.textContent || ''
        };
      });
      expect(state).not.toBeNull();
      expect(state.width).toBeGreaterThan(100);
      expect(state.height).toBeGreaterThan(100);
      expect(state.overlayText).not.toMatch(/\bPlay\b/);
    }).toPass({ timeout: 60_000 });

    await page.mouse.click(640, 360);
    await page.keyboard.down('w');
    await page.waitForTimeout(750);
    await page.keyboard.up('w');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const stats = await screenshotStats(screenshotPath);
    const workerHealth = await page.evaluate(async (base) => {
      try {
        const res = await fetch(`${base}/healthz`, { cache: 'no-store' });
        return { ok: res.ok, status: res.status };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    }, workerBase);
    const gameplayState = await page.evaluate(() => {
      const overlayText = document.querySelector('#react-overlay')?.textContent || '';
      const sceneManager = window.__sds?.sceneManagerRef ?? null;
      const renderer = sceneManager?.getRenderer?.() ?? null;
      return {
        sceneId: window.__currentSceneId || null,
        rendererMode: window.__sdsRendererMode ?? null,
        productionWebGpu: window.__sdsG?.productionWebGpu ?? null,
        renderer: {
          className: renderer?.constructor?.name ?? null,
          isWebGLRenderer: renderer?.isWebGLRenderer === true,
          isWebGPURenderer: renderer?.isWebGPURenderer === true,
          dataProductionWebGpu: renderer?.domElement?.dataset?.konveyorProductionWebGpu === '1',
          renderMode: sceneManager?.getRenderStatus?.()?.mode ?? null,
          rendererReady: sceneManager?.getRenderStatus?.()?.rendererReady ?? null,
          rendererReadyError: sceneManager?.getRenderStatus?.()?.rendererReadyError ?? null
        },
        overlayHasHud: /0\s*\/\s*200/.test(overlayText),
        overlayHasPlayControl: /\bPlay\b/.test(overlayText)
      };
    });
    const requestedRendererChecks = rendererChecks(rendererArg, gameplayState);

    const result = {
      capturedAt: new Date().toISOString(),
      shell: 'electron',
      packaged: !!packagedExe,
      executable: packagedExe,
      protocol: 'sds://app',
      dist: validatedDist,
      requestedRenderer: rendererArg,
      url: page.url(),
      canvasAttached: true,
      screenshot: screenshotPath.replace(repoRoot, '').replace(/^[\\/]/, ''),
      screenshotStats: stats,
      screenshotNonblank: stats.stddev > 8,
      gameplayState,
      requestedRendererChecks,
      workerHealth,
      fatalErrors,
      ok: stats.stddev > 8
        && gameplayState.overlayHasHud
        && !gameplayState.overlayHasPlayControl
        && Object.values(requestedRendererChecks).every(Boolean)
        && fatalErrors.length === 0
    };

    await writeFile(resultPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

run().catch(async (err) => {
  const result = {
    capturedAt: new Date().toISOString(),
    shell: 'electron',
    ok: false,
    error: String(err?.stack || err)
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  console.error(result.error);
  process.exit(1);
});
