import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

function parseArgs(argv) {
  const args = { url: 'http://localhost:3000/?scene=field&perfMode=1', out: null, channel: null };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--(\w+)=(.*)$/);
    if (!m) continue;
    args[m[1]] = m[2];
  }
  return args;
}

async function loadPackageState() {
  const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return {
    three: deps.three ?? null,
    tauri: deps['@tauri-apps/api'] ?? deps['@tauri-apps/cli'] ?? null,
    electron: deps.electron ?? null,
    capacitor: deps['@capacitor/core'] ?? null,
  };
}

async function loadThreeWebGpuState() {
  try {
    const mod = await import('three/webgpu');
    return {
      ok: true,
      hasWebGpuRenderer: typeof mod.WebGPURenderer === 'function',
      exportedRendererKeys: Object.keys(mod).filter((key) => key.includes('Renderer')).sort(),
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function run() {
  const args = parseArgs(process.argv);
  const launchOptions = { args: CHROMIUM_GPU_ARGS };
  if (args.channel) launchOptions.channel = args.channel;
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  const browserProbe = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas') || document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    let adapter = null;
    let adapterError = null;
    let device = null;
    let deviceError = null;

    try {
      adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
    } catch (err) {
      adapterError = String(err?.message || err);
    }

    try {
      device = adapter ? await adapter.requestDevice() : null;
    } catch (err) {
      deviceError = String(err?.message || err);
    }

    return {
      userAgent: navigator.userAgent,
      secureContext: window.isSecureContext,
      navigatorGpu: !!navigator.gpu,
      adapter: {
        ok: !!adapter,
        error: adapterError,
        features: adapter ? Array.from(adapter.features).sort() : [],
        limits: adapter ? {
          maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
          maxBindGroups: adapter.limits.maxBindGroups,
          maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
        } : null,
        info: adapter?.info ? { ...adapter.info } : null,
      },
      device: {
        ok: !!device,
        error: deviceError,
        features: device ? Array.from(device.features).sort() : [],
      },
      webgl: {
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
        version: gl ? gl.getParameter(gl.VERSION) : null,
      },
    };
  });

  let diagnostic = null;
  if (args.url.includes('diagnostic=1')) {
    try {
      await page.waitForFunction(() => {
        const state = window.__sdsWebGpuDiagnostic;
        return state && (state.ok || state.error);
      }, null, { timeout: 20_000 });

      diagnostic = await page.evaluate(() => {
        const { dispose, ...state } = window.__sdsWebGpuDiagnostic || {};
        return state;
      });
    } catch (err) {
      diagnostic = { ok: false, error: `diagnostic wait failed: ${String(err?.message || err)}` };
    }
  }

  await browser.close();

  const result = {
    capturedAt: new Date().toISOString(),
    url: args.url,
    platform: process.platform,
    channel: args.channel ?? 'playwright-chromium',
    chromiumArgs: CHROMIUM_GPU_ARGS,
    threeRevision: THREE.REVISION,
    packageState: await loadPackageState(),
    threeWebGpu: await loadThreeWebGpuState(),
    browser: browserProbe,
    diagnostic,
  };

  console.log(JSON.stringify(result, null, 2));

  if (args.out) {
    const outPath = resolve(ROOT, args.out);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(result, null, 2));
  }
}

run().catch((err) => {
  console.error('[WEBGPU-PROBE] fatal:', err);
  process.exit(1);
});
