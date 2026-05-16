import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const execFileAsync = promisify(execFile);
const DEFAULT_OUT = 'cycle36-validation/runtime/production-webgpu-boot-scout.json';
const DEFAULT_OUT_DIR = 'cycle36-validation/runtime/production-webgpu-boot-scout';
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:4173/',
    scene: 'field',
    out: DEFAULT_OUT,
    outDir: DEFAULT_OUT_DIR,
    sceneBody: false,
    loop: false,
    raf: false,
    gameplay: false,
    channel: null,
  };

  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = match[2];
  }

  return args;
}

function wantsSceneBody(args) {
  return args.sceneBody === true || args.sceneBody === '1' || args.sceneBody === 'true';
}

function wantsLoop(args) {
  return args.loop === true || args.loop === '1' || args.loop === 'true';
}

function wantsRaf(args) {
  return args.raf === true || args.raf === '1' || args.raf === 'true';
}

function wantsGameplay(args) {
  return args.gameplay === true || args.gameplay === '1' || args.gameplay === 'true';
}

function buildUrl(baseUrl, sceneId, { sceneBody = false, loop = false, raf = false, gameplay = false } = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('diagnostic', '1');
  url.searchParams.set('konveyorProductionBootScout', '1');
  if (!gameplay) {
    url.searchParams.set('testNoCanvas', '1');
  }
  url.searchParams.set('scene', sceneId);
  if (gameplay) {
    url.searchParams.set('konveyorProductionGameplayScout', '1');
    url.searchParams.set('autostart', '1');
    url.searchParams.set('mode', 'classic');
  }
  if (sceneBody || gameplay) {
    url.searchParams.set('konveyorProductionSceneBody', '1');
    url.searchParams.set('konveyorAtmosphere', '1');
    url.searchParams.set('konveyorEffects', '1');
    url.searchParams.set('konveyorMaterials', '1');
    url.searchParams.set('konveyorRocks', '1');
    url.searchParams.set('konveyorGrass', '1');
    url.searchParams.set('konveyorWater', '1');
    url.searchParams.set('konveyorTerrain', '1');
    url.searchParams.set('konveyorSheep', '1');
    url.searchParams.set('konveyorImpostors', '1');
    url.searchParams.set('konveyorNativeInstancing', '1');
    if (loop) {
      url.searchParams.set('konveyorProductionLoopScout', '1');
    }
    if (raf) {
      url.searchParams.set('konveyorProductionRafScout', '1');
    }
  }
  return url.href;
}

function luma(r, g, b) {
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

async function inspectScreenshot(path) {
  const image = sharp(path);
  const metadata = await image.metadata();
  const { data } = await image
    .resize({ width: 64, height: 36, fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minLuma = Infinity;
  let maxLuma = -Infinity;
  const buckets = new Set();
  for (let offset = 0; offset < data.length; offset += 4) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const y = luma(r, g, b);
    minLuma = Math.min(minLuma, y);
    maxLuma = Math.max(maxLuma, y);
    buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }

  return {
    dimensions: {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
    },
    lumaRange: Number((maxLuma - minLuma).toFixed(2)),
    coarseColorBuckets: buckets.size,
    nonBlank: maxLuma - minLuma >= 10 && buckets.size >= 4,
  };
}

async function closeLocalhostBrowserProcesses() {
  if (process.platform !== 'win32') return;
  const script = `
$matches = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match '^(chrome|msedge|chromium)\\.exe$' -and
  $_.CommandLine -match '127\\.0\\.0\\.1:(3000|4173)'
}
foreach ($process in $matches) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}
`;
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true })
    .catch(() => {});
}

async function run() {
  const args = parseArgs(process.argv);
  const requestedSceneBody = wantsSceneBody(args);
  const loop = wantsLoop(args);
  const raf = wantsRaf(args);
  const gameplay = wantsGameplay(args);
  const sceneBody = requestedSceneBody || gameplay;
  if (gameplay && args.out === DEFAULT_OUT) {
    args.out = 'cycle36-validation/runtime/production-webgpu-gameplay-scout.json';
  }
  if (gameplay && args.outDir === DEFAULT_OUT_DIR) {
    args.outDir = 'cycle36-validation/runtime/production-webgpu-gameplay-scout';
  }
  const outDir = resolve(ROOT, args.outDir);
  await mkdir(outDir, { recursive: true });
  const launchOptions = { args: CHROMIUM_GPU_ARGS };
  if (args.channel) launchOptions.channel = args.channel;
  const browser = await chromium.launch(launchOptions);
  let context = null;
  try {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

    const url = buildUrl(args.baseUrl, args.scene, { sceneBody, loop, raf, gameplay });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => {
      const scout = window.__sdsG?.productionBootScout;
      return scout && (scout.ok === true || scout.error);
    }, null, { timeout: 45_000 });

    const state = await page.evaluate(() => ({
      rendererMode: window.__sdsRendererMode ?? null,
      diagnosticBoot: window.__sdsG?.r === true,
      productionBootScout: window.__sdsG?.productionBootScout ?? null,
      currentSceneId: window.__currentSceneId ?? null,
      sceneManagerExposed: !!window.__sds?.sceneManagerRef,
      terrainBuilderExposed: !!window.__sds?.terrainBuilderRef,
    }));

    let screenshot = null;
    let screenshotProof = null;
    if (sceneBody || gameplay) {
      screenshot = gameplay ? 'production-webgpu-gameplay-start.png' : 'production-webgpu-scene-body.png';
      const screenshotPath = resolve(outDir, screenshot);
      await page.locator('#canvas-container canvas[data-konveyor-production-boot-scout="1"]').screenshot({ path: screenshotPath });
      screenshotProof = await inspectScreenshot(screenshotPath);
    }

    const manifest = {
      capturedAt: new Date().toISOString(),
      contract: 'konveyor-production-webgpu-boot-scout',
      url,
      sceneId: args.scene,
      sceneBody,
      loop,
      raf,
      gameplay,
      channel: args.channel ?? 'playwright-chromium',
      chromiumArgs: CHROMIUM_GPU_ARGS,
      screenshotDir: sceneBody || gameplay ? args.outDir : null,
      screenshot,
      ...state,
      screenshotProof,
      consoleErrors,
      pageErrors,
    };
    const scout = manifest.productionBootScout;
    const bootShellOk = manifest.rendererMode?.effective === 'webgpu-production-boot-scout'
      && manifest.diagnosticBoot === false
      && scout?.ok === true
      && scout?.bootShellOk === true
      && (gameplay ? scout?.testNoCanvas === false : scout?.testNoCanvas === true)
      && scout?.rendererReady === true
      && scout?.rendererIsWebGpu === true
      && scout?.rendererSetup?.rendererMode === 'non-webgl'
      && scout?.renderStatus?.mode === 'async'
      && scout?.renderStatus?.rendererReady === true
      && scout?.renderStatus?.rendererReadyError === null
      && manifest.currentSceneId === args.scene
      && manifest.sceneManagerExposed === true
      && manifest.terrainBuilderExposed === true
      && consoleErrors.length === 0
      && pageErrors.length === 0;
    const sceneBodyOk = !(sceneBody || gameplay) || (
      scout?.sceneBodyRequested === true
      && scout?.factorySupply?.ok === true
      && scout?.webGpuLightingBridge?.ok === true
      && scout?.sceneBody?.ok === true
      && scout?.nativeInstancingRequested === true
      && scout?.sceneBody?.checks?.webglOnlyInstancedMesh2Suppressed === true
      && scout?.sceneBody?.checks?.nativeTreeInstancing === true
      && scout?.sceneBody?.checks?.nativeRockInstancing === true
      && scout?.sceneBody?.checks?.terrainFactoryApplied === true
      && scout?.sceneBody?.checks?.grassFactoryApplied === true
      && scout?.sceneBody?.checks?.sheepFactoryApplied === true
      && screenshotProof?.nonBlank === true
    );
    const sceneLoopOk = !loop || (
      scout?.sceneLoopRequested === true
      && scout?.sceneLoop?.ok === true
      && scout?.sceneLoop?.checks?.asyncRender === true
      && scout?.sceneLoop?.checks?.framesRendered === true
      && scout?.sceneLoop?.checks?.grassAdvanced === true
      && scout?.sceneLoop?.checks?.noFrameErrors === true
      && scout?.sceneLoop?.checks?.sharedFrameStep === true
    );
    const sceneRafLoopOk = !raf || (
      scout?.rafLoopRequested === true
      && scout?.sceneRafLoop?.ok === true
      && scout?.sceneRafLoop?.checks?.asyncRender === true
      && scout?.sceneRafLoop?.checks?.framesRendered === true
      && scout?.sceneRafLoop?.checks?.grassAdvanced === true
      && scout?.sceneRafLoop?.checks?.noFrameErrors === true
      && scout?.sceneRafLoop?.checks?.sharedFrameStep === true
      && scout?.sceneRafLoop?.checks?.rafScheduler === true
      && scout?.sceneRafLoop?.checks?.monotonicTimestamps === true
    );
    const gameplayStartOk = !gameplay || (
      scout?.gameplayStartRequested === true
      && scout?.gameplayStart?.ok === true
      && scout?.gameplayStart?.checks?.testNoCanvasDisabled === true
      && scout?.gameplayStart?.checks?.initialized === true
      && scout?.gameplayStart?.checks?.menuGameStarted === true
      && scout?.gameplayStart?.checks?.soloModeStarted === true
      && scout?.gameplayStart?.checks?.normalAnimationLoopAdvanced === true
      && scout?.gameplayStart?.checks?.frameTimingSampled === true
      && scout?.gameplayStart?.checks?.asyncRender === true
      && scout?.gameplayStart?.checks?.canvasAttached === true
      && screenshotProof?.nonBlank === true
    );
    manifest.ok = bootShellOk && sceneBodyOk && sceneLoopOk && sceneRafLoopOk && gameplayStartOk;
    manifest.checks = {
      bootShellOk,
      sceneBodyOk,
      sceneLoopOk,
      sceneRafLoopOk,
      gameplayStartOk,
      noConsoleErrors: consoleErrors.length === 0,
      noPageErrors: pageErrors.length === 0,
    };

    const outPath = resolve(ROOT, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    if (!manifest.ok) {
      throw new Error('production WebGPU boot scout did not satisfy manifest gates');
    }
  } finally {
    await context?.close().catch(() => {});
    await browser.close().catch(() => {});
    await closeLocalhostBrowserProcesses();
  }
}

run().catch((error) => {
  console.error('[KONVEYOR-PRODUCTION-BOOT-SCOUT] fatal:', error);
  process.exit(1);
});
