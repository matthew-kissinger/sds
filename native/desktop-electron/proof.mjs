// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { _electron as electron } from 'playwright';
import { expect } from '@playwright/test';
import electronPath from 'electron';
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const shellRoot = __dirname;
const repoRoot = resolve(shellRoot, '..', '..');
const packagePath = resolve(shellRoot, 'package.json');
const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
const appVersion = packageJson.version;
const workerBase = (process.env.SDS_WORKER_BASE || 'https://sds-worker.matt-m-kissinger.workers.dev').replace(/\/+$/, '');
const validationRoot = resolve(repoRoot, 'cycle54-validation/desktop-electron');
const artifactRoot = resolve(validationRoot, 'artifacts');
const reportRoot = resolve(validationRoot, 'reports');
const rendererArgRaw = process.argv.find((arg) => arg.startsWith('--renderer='))?.slice('--renderer='.length)
  || process.env.SDS_DESKTOP_RENDERER
  || 'webgl';
const rendererArg = ['webgl', 'webgpu', 'default'].includes(rendererArgRaw) ? rendererArgRaw : 'webgl';
const packagedFlag = process.argv.includes('--packaged');
const explicitExe = process.argv.find((arg) => arg.startsWith('--executable='))?.slice('--executable='.length);
const resultPath = resolve(reportRoot, `desktop-electron-proof-${rendererArg}.json`);
const screenshotPath = resolve(reportRoot, `desktop-electron-gameplay-${rendererArg}.png`);
const preInputPath = resolve(reportRoot, `desktop-electron-input-before-${rendererArg}.png`);
const postInputPath = resolve(reportRoot, `desktop-electron-input-after-${rendererArg}.png`);
let activePage = null;
let activeFatalErrors = [];
let activeUserData = null;

function rel(path) {
  return relative(repoRoot, path).replace(/\\/g, '/');
}

async function walkFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    const info = await stat(full);
    if (info.isDirectory()) out.push(...await walkFiles(full));
    else out.push({ path: full, name, size: info.size });
  }
  return out;
}

function buildNativeUrl(renderer) {
  const url = new URL('sds://app/index.html');
  url.searchParams.set('nativeShell', 'electron-desktop');
  url.searchParams.set('scene', 'field');
  url.searchParams.set('perfMode', '1');
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

async function waitForRuntimeReady(page, renderer) {
  await expect(async () => {
    const state = await page.evaluate((requestedRenderer) => {
      const mode = window.__sdsRendererMode ?? null;
      const production = window.__sdsG?.productionWebGpu ?? null;
      const gameReady = !!window.__sds?.sceneManagerRef;
      const webGpuReady = requestedRenderer !== 'webgpu'
        || mode?.effective !== 'webgpu-production'
        || production?.devicePreflight?.ok === true;
      return { gameReady, webGpuReady, mode, production };
    }, renderer);

    expect(state.gameReady).toBe(true);
    expect(state.webGpuReady).toBe(true);
  }).toPass({ timeout: renderer === 'webgpu' ? 90_000 : 30_000 });
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

async function screenshotDiff(a, b) {
  const [left, right] = await Promise.all([
    sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  ]);
  const count = Math.min(left.data.length, right.data.length);
  let sumAbs = 0;
  let changed = 0;
  for (let i = 0; i < count; i += 1) {
    const delta = Math.abs(left.data[i] - right.data[i]);
    sumAbs += delta;
    if (delta > 8) changed += 1;
  }
  return {
    meanAbs: sumAbs / count,
    changedRatio: changed / count
  };
}

async function collectArtifacts() {
  const files = await walkFiles(artifactRoot);
  const expectedSetup = `SheepDogSimulator-${appVersion}-setup-x64.exe`;
  const expectedPortable = `SheepDogSimulator-${appVersion}-portable-x64.exe`;
  const unpackedExe = resolve(artifactRoot, 'win-unpacked', 'Sheep Dog Simulator.exe');
  return {
    root: rel(artifactRoot),
    fileCount: files.length,
    expectedSetup,
    expectedPortable,
    setup: files.find((f) => basename(f.path) === expectedSetup) ?? null,
    portable: files.find((f) => basename(f.path) === expectedPortable) ?? null,
    blockmaps: files.filter((f) => extname(f.path) === '.blockmap'),
    unpackedExe,
    unpackedExeExists: existsSync(unpackedExe),
    files: files.map((f) => ({ path: rel(f.path), size: f.size }))
  };
}

function signingPosture() {
  const certPresent = !!(
    process.env.CSC_LINK
    || process.env.WIN_CSC_LINK
    || process.env.WINDOWS_SIGNING_CERT_FILE
    || process.env.AZURE_TENANT_ID
  );
  return {
    mode: certPresent ? 'explicit-signing-credentials-present' : 'unsigned-local-signing-ready',
    forceCodeSigning: packageJson.build?.win?.forceCodeSigning === true,
    signAndEditExecutable: packageJson.build?.win?.signAndEditExecutable !== false,
    appId: packageJson.build?.appId,
    author: packageJson.author,
    certEnvPresent: certPresent,
    localScriptsDisableAutoDiscovery: true
  };
}

async function collectRuntimeSnapshot(page) {
  return await page.evaluate(() => {
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
      overlayHasHud: /\d+\s*\/\s*200/.test(overlayText),
      overlayHasPlayControl: /\bPlay\b/.test(overlayText),
      overlayText: overlayText.replace(/\s+/g, ' ').trim().slice(0, 1000),
      bodyText: document.body?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 1000) ?? '',
      buttons: Array.from(document.querySelectorAll('button')).map((button) => ({
        text: button.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120) ?? '',
        disabled: button.disabled,
        visible: button.offsetParent !== null
      })).slice(0, 20),
      canvasAttached: !!document.querySelector('#canvas-container canvas')
    };
  });
}

async function writeFailure(err, context = {}) {
  const diagnostics = activePage
    ? await collectRuntimeSnapshot(activePage).catch((diagErr) => ({ error: String(diagErr?.message || diagErr) }))
    : null;
  const userData = activeUserData ?? context.userData ?? null;
  const result = {
    capturedAt: new Date().toISOString(),
    shell: 'electron-builder-desktop',
    packaged: context.validatingPackaged ?? null,
    executable: context.executable ? rel(context.executable) : null,
    requestedRenderer: rendererArg,
    artifacts: await collectArtifacts().catch((artifactErr) => ({ error: String(artifactErr?.message || artifactErr) })),
    signing: signingPosture(),
    protocol: 'sds://app',
    url: activePage?.url?.() ?? null,
    runtimeSnapshot: diagnostics,
    logs: userData ? {
      userData: rel(userData),
      logPath: rel(resolve(userData, 'logs/sds-desktop.log')),
      crashDumpDir: rel(resolve(userData, 'crash-dumps')),
      logExists: existsSync(resolve(userData, 'logs/sds-desktop.log')),
      crashDumpDirExists: existsSync(resolve(userData, 'crash-dumps'))
    } : null,
    fatalErrors: activeFatalErrors,
    ok: false,
    error: String(err?.stack || err)
  };
  await mkdir(reportRoot, { recursive: true });
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  console.error(result.error);
}

async function proveWebSocket(page) {
  return await page.evaluate(async ({ workerBase }) => {
    const registerRes = await fetch(`${workerBase}/api/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        display_name: `DesktopProof${Date.now().toString().slice(-6)}`,
        name_type: 'custom'
      })
    });
    const registerText = await registerRes.text();
    const register = JSON.parse(registerText);
    if (!registerRes.ok) {
      return { ok: false, registerStatus: registerRes.status, register };
    }

    const roomRes = await fetch(`${workerBase}/api/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token: register.token,
        playerName: 'DesktopProof',
        dogType: 'jep',
        roomSettings: {
          maxPlayers: 2,
          isPublic: false,
          name: 'Desktop Proof Room',
          gameMode: 'cooperative',
          sceneId: 'field',
          sheepCount: 30
        }
      })
    });
    const roomText = await roomRes.text();
    const room = JSON.parse(roomText);
    if (!roomRes.ok) {
      return { ok: false, registerStatus: registerRes.status, roomStatus: roomRes.status, room };
    }

    const wsBase = workerBase.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
    const playerId = room.playerId || room.sessionId;
    const url = `${wsBase}/r/${encodeURIComponent(room.roomCode)}/ws?playerId=${encodeURIComponent(playerId)}&ticket=${encodeURIComponent(room.wsTicket)}`;
    const messages = [];
    const socketResult = await new Promise((resolve) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      const timeout = setTimeout(() => {
        try { ws.close(1000, 'desktop proof timeout'); } catch {}
        resolve({ open: false, timeout: true, messages: messages.length });
      }, 10000);
      ws.addEventListener('open', () => {
        clearTimeout(timeout);
        setTimeout(() => {
          try { ws.close(1000, 'desktop proof complete'); } catch {}
          resolve({ open: true, timeout: false, messages: messages.length });
        }, 500);
      });
      ws.addEventListener('message', (event) => {
        messages.push({
          type: typeof event.data,
          bytes: event.data?.byteLength ?? event.data?.length ?? 0
        });
      });
      ws.addEventListener('error', () => {
        clearTimeout(timeout);
        resolve({ open: false, timeout: false, error: 'websocket error', messages: messages.length });
      });
    });

    return {
      ok: socketResult.open === true,
      registerStatus: registerRes.status,
      roomStatus: roomRes.status,
      roomCode: room.roomCode,
      playerId,
      wsTicketPresent: !!room.wsTicket,
      socket: socketResult
    };
  }, { workerBase });
}

async function installVirtualGamepad(page) {
  return await page.evaluate(() => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'SDS Desktop Proof Virtual Gamepad',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: performance.now(),
      axes: [0, -1, 0, 0, 0, 0, 0, 1],
      buttons
    };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad, null, null, null]
    });
    const event = new Event('gamepadconnected');
    Object.defineProperty(event, 'gamepad', { value: pad });
    window.dispatchEvent(event);
    window.__sdsDesktopProofGamepad = pad;
    return {
      apiAvailable: typeof navigator.getGamepads === 'function',
      id: pad.id,
      axes: pad.axes.slice(),
      buttons: pad.buttons.length
    };
  });
}

async function run() {
  await mkdir(reportRoot, { recursive: true });

  const distRoot = resolve(repoRoot, 'dist');
  if (!existsSync(resolve(distRoot, 'index.html'))) {
    throw new Error('dist/index.html is missing. Run npm run build:native first.');
  }

  const artifacts = await collectArtifacts();
  const executable = explicitExe
    ? resolve(shellRoot, explicitExe)
    : (packagedFlag ? artifacts.unpackedExe : electronPath);
  const validatingPackaged = packagedFlag || !!explicitExe;
  if (validatingPackaged && !existsSync(executable)) {
    throw new Error(`Packaged executable is missing: ${executable}`);
  }

  const userDataRun = new Date().toISOString().replace(/[:.]/g, '-');
  const userData = resolve(validationRoot, `userdata-${rendererArg}-${userDataRun}`);
  activeUserData = userData;
  await mkdir(userData, { recursive: true });

  const app = await electron.launch({
    executablePath: executable,
    args: validatingPackaged ? [] : [shellRoot],
    env: {
      ...process.env,
      SDS_DESKTOP_USER_DATA: userData,
      SDS_DESKTOP_SHOW: process.env.SDS_DESKTOP_SHOW || '1',
      SDS_DESKTOP_RENDERER: rendererArg,
      SDS_DESKTOP_URL: buildNativeUrl(rendererArg),
      ...(validatingPackaged ? {} : { SDS_DESKTOP_DIST: distRoot })
    }
  });

  const fatalErrors = [];
  activeFatalErrors = fatalErrors;
  try {
    const page = await app.firstWindow();
    activePage = page;
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
        persistentId: `player_desktop_electron_${Date.now()}`,
        displayName: 'DesktopProof',
        fullName: 'DesktopProof#0001',
        discriminator: '0001',
        nameType: 'custom',
        createdAt: Date.now(),
        isRegistered: false
      };
      localStorage.setItem('playerIdentity', JSON.stringify(identity));
      localStorage.setItem('camera-mode-field', 'classic');
      localStorage.setItem('sds-desktop-proof-token', 'before-reload');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    const storage = await page.evaluate(() => {
      const before = localStorage.getItem('sds-desktop-proof-token');
      localStorage.setItem('sds-desktop-proof-token', 'after-reload');
      return { beforeReloadValue: before, afterWriteValue: localStorage.getItem('sds-desktop-proof-token') };
    });

    await expect(page).toHaveTitle(/Sheep Dog Sim/i);
    const classic = page.getByRole('button', { name: /Classic/i });
    await expect(classic).toBeVisible({ timeout: 30_000 });
    await classic.click({ force: true });

    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(play).toBeVisible({ timeout: 15_000 });
    await waitForRuntimeReady(page, rendererArg);
    await play.evaluate((button) => button.click());
    if (rendererArg === 'webgpu') {
      await page.waitForTimeout(20_000);
    }

    const canvas = page.locator('#canvas-container canvas');
    await expect(canvas).toBeAttached({ timeout: 90_000 });
    await expect(play).toBeHidden({ timeout: 120_000 });
    await expect(page.getByText(/\d+\s*\/\s*200/).first()).toBeVisible({
      timeout: rendererArg === 'webgpu' ? 120_000 : 30_000
    });
    await expect(async () => {
      const state = await page.evaluate(() => {
        const c = document.querySelector('#canvas-container canvas');
        return c ? { width: c.width, height: c.height } : null;
      });
      expect(state).not.toBeNull();
      expect(state.width).toBeGreaterThan(100);
      expect(state.height).toBeGreaterThan(100);
    }).toPass({ timeout: 60_000 });

    const browserWindowState = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setFullScreen(true);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const entered = win.isFullScreen();
      win.setFullScreen(false);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return {
        entered,
        exited: !win.isFullScreen(),
        bounds: win.getBounds(),
        appName: win.getTitle()
      };
    });

    const unlockProof = page.evaluate(() => new Promise((resolve) => {
      const canvas = document.querySelector('#canvas-container canvas');
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        resolve(result);
      };
      const run = async () => {
        const pointerLock = { supported: !!canvas?.requestPointerLock, locked: false, error: null };
        const audio = { supported: !!AudioContextCtor, state: null, resumed: false, error: null };
        try {
          if (canvas?.requestPointerLock) {
            await canvas.requestPointerLock();
            pointerLock.locked = document.pointerLockElement === canvas;
            document.exitPointerLock?.();
          }
        } catch (err) {
          pointerLock.error = String(err?.message || err);
        }
        try {
          if (AudioContextCtor) {
            const ctx = new AudioContextCtor();
            await ctx.resume();
            audio.state = ctx.state;
            audio.resumed = ctx.state === 'running';
            await ctx.close();
          }
        } catch (err) {
          audio.error = String(err?.message || err);
        }
        finish({ pointerLock, audio });
      };
      document.addEventListener('click', run, { once: true });
      setTimeout(() => finish({
        pointerLock: { supported: !!canvas?.requestPointerLock, locked: false, error: 'activation-timeout' },
        audio: { supported: !!AudioContextCtor, state: null, resumed: false, error: 'activation-timeout' }
      }), 5000);
    }));
    await page.mouse.click(640, 360);
    const { pointerLock, audio } = await unlockProof;

    const gamepad = await installVirtualGamepad(page);
    await page.screenshot({ path: preInputPath, fullPage: false });
    await page.keyboard.down('Shift');
    await page.keyboard.down('w');
    await page.mouse.move(680, 360);
    await page.waitForTimeout(900);
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
    await page.evaluate(() => {
      if (window.__sdsDesktopProofGamepad) {
        window.__sdsDesktopProofGamepad.axes[0] = 0.8;
        window.__sdsDesktopProofGamepad.axes[1] = -0.8;
      }
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: postInputPath, fullPage: false });
    await page.screenshot({ path: screenshotPath, fullPage: false });

    const stats = await screenshotStats(screenshotPath);
    const inputDiff = await screenshotDiff(preInputPath, postInputPath);
    const perf = await page.evaluate(async () => {
      if (!window.__perfHarness) return null;
      window.__perfHarness.reset();
      window.__perfHarness.startSampling(3000);
      await new Promise((resolve) => setTimeout(resolve, 3200));
      return {
        summary: window.__perfHarness.getSummary?.() ?? null,
        metrics: window.__perfHarness.getMetrics?.() ?? null
      };
    });
    const workerHealth = await page.evaluate(async (base) => {
      try {
        const res = await fetch(`${base}/healthz`, { cache: 'no-store' });
        return { ok: res.ok, status: res.status };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    }, workerBase);
    const webSocket = await proveWebSocket(page);
    const gameplayState = await collectRuntimeSnapshot(page);
    const logs = {
      userData: rel(userData),
      logPath: rel(resolve(userData, 'logs/sds-desktop.log')),
      crashDumpDir: rel(resolve(userData, 'crash-dumps')),
      logExists: existsSync(resolve(userData, 'logs/sds-desktop.log')),
      crashDumpDirExists: existsSync(resolve(userData, 'crash-dumps'))
    };
    const requestedRendererChecks = rendererChecks(rendererArg, gameplayState);
    const artifactsAfterLaunch = await collectArtifacts();
    const signing = signingPosture();

    const result = {
      capturedAt: new Date().toISOString(),
      shell: 'electron-builder-desktop',
      packaged: validatingPackaged,
      executable: validatingPackaged ? rel(executable) : executable,
      appIdentity: {
        appId: packageJson.build?.appId,
        productName: packageJson.build?.productName,
        version: appVersion,
        executableName: packageJson.build?.win?.executableName,
        author: packageJson.author
      },
      artifacts: artifactsAfterLaunch,
      signing,
      protocol: 'sds://app',
      requestedRenderer: rendererArg,
      url: page.url(),
      storage,
      fullscreen: browserWindowState,
      pointerLock,
      audio,
      gamepad,
      input: {
        keyboardMouseVisualDiff: inputDiff,
        changedEnough: inputDiff.meanAbs > 0.2 || inputDiff.changedRatio > 0.005
      },
      performance: perf,
      canvasAttached: true,
      screenshot: rel(screenshotPath),
      screenshotStats: stats,
      screenshotNonblank: stats.stddev > 8,
      gameplayState,
      requestedRendererChecks,
      workerHealth,
      webSocket,
      logs,
      fatalErrors,
      ok: stats.stddev > 8
        && gameplayState.overlayHasHud
        && !gameplayState.overlayHasPlayControl
        && Object.values(requestedRendererChecks).every(Boolean)
        && storage.beforeReloadValue === 'before-reload'
        && browserWindowState.entered
        && browserWindowState.exited
        && pointerLock.supported
        && pointerLock.locked
        && audio.supported
        && audio.resumed
        && gamepad.apiAvailable
        && inputDiff.changedRatio > 0.001
        && workerHealth.ok
        && webSocket.ok
        && logs.logExists
        && logs.crashDumpDirExists
        && (!validatingPackaged || (
          artifactsAfterLaunch.unpackedExeExists
          && !!artifactsAfterLaunch.setup
          && !!artifactsAfterLaunch.portable
        ))
        && fatalErrors.length === 0
    };

    await writeFile(resultPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (err) {
    await writeFailure(err, { validatingPackaged, executable, userData });
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

run().catch(async (err) => {
  await writeFailure(err);
  process.exit(1);
});
