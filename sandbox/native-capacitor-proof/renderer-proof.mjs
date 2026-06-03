// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const outDir = resolve(repoRoot, 'cycle53-validation/native/capacitor-android');
const resultPath = resolve(outDir, 'capacitor-android-renderers.json');
const defaultAppId = 'com.sheepdogsim.nativeproof';
const defaultActivity = `${defaultAppId}/.MainActivity`;

function parseArgs(argv) {
  const args = {
    appId: defaultAppId,
    activity: defaultActivity,
    cdpPort: '9223',
  };
  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
    if (!match) continue;
    args[match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = match[2];
  }
  return args;
}

function commandStatus(command, args = []) {
  const run = spawnSync(command, args, { encoding: 'utf8' });
  return {
    command: [command, ...args].join(' '),
    ok: run.status === 0,
    status: run.status,
    stdout: run.stdout?.trim() || '',
    stderr: run.stderr?.trim() || '',
    error: run.error ? String(run.error.message || run.error) : '',
  };
}

function findAndroidSdkRoot() {
  return process.env.ANDROID_HOME
    || process.env.ANDROID_SDK_ROOT
    || (process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA, 'Android/Sdk') : '');
}

function findAdb() {
  const binary = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const sdkRoot = findAndroidSdkRoot();
  const candidate = sdkRoot ? resolve(sdkRoot, 'platform-tools', binary) : '';
  return candidate && existsSync(candidate) ? candidate : 'adb';
}

function connectedDevice(adbCommand) {
  const devices = commandStatus(adbCommand, ['devices']);
  const device = devices.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .find((line) => /\tdevice$/.test(line));
  return { devices, deviceId: device ? device.split(/\s+/)[0] : null };
}

function findWebViewSocket(adbCommand, deviceId) {
  const procNetUnix = commandStatus(adbCommand, ['-s', deviceId, 'shell', 'cat', '/proc/net/unix']);
  const sockets = procNetUnix.stdout
    .split(/\r?\n/)
    .map((line) => line.match(/@(webview_devtools_remote_\d+)/)?.[1])
    .filter(Boolean);
  return { procNetUnix, socket: sockets.at(-1) ?? null, sockets };
}

async function wait(ms) {
  await new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function fetchTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`WebView CDP target list returned ${response.status}`);
  return await response.json();
}

async function waitForPageTarget(port) {
  let lastError = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const targets = await fetchTargets(port);
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch (err) {
      lastError = err;
    }
    await wait(500);
  }
  throw new Error(`No WebView page CDP target found. ${lastError?.message ?? ''}`.trim());
}

async function connectPage(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve: resolvePending, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) {
      reject(new Error(JSON.stringify(msg.error)));
    } else {
      resolvePending(msg.result);
    }
  });

  await new Promise((resolveOpen, reject) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  function call(method, params = {}) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveCall, reject) => pending.set(id, { resolve: resolveCall, reject }));
  }

  await call('Runtime.enable');
  await call('Page.enable');
  return { ws, call };
}

async function evaluateState(call) {
  const expression = `
(async () => {
  await new Promise((resolve) => {
    const deadline = Date.now() + 120000;
    const tick = () => {
      const mode = window.__sdsRendererMode;
      const production = window.__sdsG?.productionWebGpu;
      const sceneManager = window.__sds?.sceneManagerRef;
      const renderer = sceneManager?.getRenderer?.();
      const productionSettled = !production || production.ok === true || !!production.error;
      if (mode?.effective && renderer && productionSettled) {
        resolve(true);
        return;
      }
      if (Date.now() > deadline) {
        resolve(false);
        return;
      }
      setTimeout(tick, 500);
    };
    tick();
  });

  const sceneManager = window.__sds?.sceneManagerRef ?? null;
  const renderer = sceneManager?.getRenderer?.() ?? null;
  let adapter = null;
  let adapterError = null;
  try {
    adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
  } catch (err) {
    adapterError = String(err?.message || err);
  }
  return {
    url: location.href,
    title: document.title,
    secureContext: window.isSecureContext,
    userAgent: navigator.userAgent,
    rendererMode: window.__sdsRendererMode ?? null,
    productionWebGpu: window.__sdsG?.productionWebGpu ?? null,
    currentSceneId: window.__currentSceneId ?? null,
    renderer: {
      className: renderer?.constructor?.name ?? null,
      isWebGLRenderer: renderer?.isWebGLRenderer === true,
      isWebGPURenderer: renderer?.isWebGPURenderer === true,
      dataProductionWebGpu: renderer?.domElement?.dataset?.konveyorProductionWebGpu === '1',
      renderStatus: sceneManager?.getRenderStatus?.() ?? null
    },
    webgpu: {
      navigatorGpu: !!navigator.gpu,
      adapter: !!adapter,
      adapterError,
      features: adapter ? Array.from(adapter.features).sort() : [],
      limits: adapter ? {
        maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
        maxBindGroups: adapter.limits.maxBindGroups,
        maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage
      } : null,
      info: adapter?.info ? { ...adapter.info } : null
    },
    overlayText: document.querySelector('#react-overlay')?.textContent || ''
  };
})()`;

  const result = await call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  }
  return result.result.value;
}

async function navigateAndCapture(call, renderer) {
  const url = `https://localhost/?nativeProof=capacitor-renderer&renderer=${renderer}`;
  await call('Page.navigate', { url });
  await wait(1000);
  const state = await evaluateState(call);
  const checks = renderer === 'webgl'
    ? {
        requestedWebGl: state.rendererMode?.requested === 'webgl',
        effectiveWebGl: state.rendererMode?.effective === 'webgl',
        noFallback: state.rendererMode?.fallbackReason == null,
        rendererWebGl: state.renderer?.isWebGLRenderer === true
          && state.renderer?.isWebGPURenderer !== true,
      }
    : {
        requestedWebGpu: state.rendererMode?.requested === 'webgpu',
        trueProductionWebGpu: state.rendererMode?.effective === 'webgpu-production'
          && state.productionWebGpu?.ok === true
          && state.renderer?.isWebGPURenderer === true,
        gracefulWebGlFallback: state.rendererMode?.effective === 'webgl'
          && state.renderer?.isWebGLRenderer === true
          && !!state.rendererMode?.fallbackReason,
        webgpuApiAvailable: state.rendererMode?.webgpuApiAvailable === true,
      };
  return {
    requestedRenderer: renderer,
    ...state,
    checks,
    ok: renderer === 'webgl'
      ? Object.values(checks).every(Boolean)
      : checks.requestedWebGpu
        && checks.webgpuApiAvailable
        && (checks.trueProductionWebGpu || checks.gracefulWebGlFallback),
  };
}

async function run() {
  const args = parseArgs(process.argv);
  await mkdir(outDir, { recursive: true });
  const adbCommand = findAdb();
  const { devices, deviceId } = connectedDevice(adbCommand);
  if (!deviceId) throw new Error(`No connected Android device. adb devices:\n${devices.stdout || devices.stderr}`);

  const launch = commandStatus(adbCommand, ['-s', deviceId, 'shell', 'am', 'start', '-n', args.activity]);
  await wait(2000);
  const { procNetUnix, socket, sockets } = findWebViewSocket(adbCommand, deviceId);
  if (!socket) {
    throw new Error(`No WebView devtools socket found. /proc/net/unix:\n${procNetUnix.stdout}`);
  }
  const forward = commandStatus(adbCommand, ['-s', deviceId, 'forward', `tcp:${args.cdpPort}`, `localabstract:${socket}`]);
  if (!forward.ok) throw new Error(forward.stderr || forward.error || 'adb forward failed');

  const target = await waitForPageTarget(args.cdpPort);
  const page = await connectPage(target.webSocketDebuggerUrl);
  try {
    const webgl = await navigateAndCapture(page.call, 'webgl');
    const webgpu = await navigateAndCapture(page.call, 'webgpu');
    const result = {
      capturedAt: new Date().toISOString(),
      shell: 'capacitor-android',
      appId: args.appId,
      activity: args.activity,
      adbCommand,
      deviceId,
      cdpPort: Number(args.cdpPort),
      webViewSocket: socket,
      webViewSockets: sockets,
      launch,
      forward,
      renderers: { webgl, webgpu },
      ok: webgl.ok && webgpu.ok,
      trueWebGpuSupported: webgpu.checks.trueProductionWebGpu === true,
      webGpuFallbackReason: webgpu.rendererMode?.fallbackReason ?? null,
    };
    await writeFile(resultPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    page.ws.close();
  }
}

run().catch(async (err) => {
  await mkdir(outDir, { recursive: true });
  const result = {
    capturedAt: new Date().toISOString(),
    shell: 'capacitor-android',
    ok: false,
    error: String(err?.stack || err),
  };
  await writeFile(resultPath, JSON.stringify(result, null, 2));
  console.error(result.error);
  process.exit(1);
});
