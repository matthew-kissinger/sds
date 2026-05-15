import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_SCENES = ['field', 'rolling-hills', 'open-country'];
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];
const KONVEYOR_FLAGS = [
  'konveyorAtmosphere',
  'konveyorEffects',
  'konveyorGrass',
  'konveyorImpostors',
  'konveyorMaterials',
  'konveyorRocks',
  'konveyorSheep',
  'konveyorTerrain',
  'konveyorWater',
];

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:4173/',
    out: 'cycle36-validation/runtime/production-flag-fallback-proof.json',
    scenes: DEFAULT_SCENES.join(','),
    channel: null,
  };

  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = match[2];
  }

  return {
    ...args,
    sceneIds: args.scenes.split(',').map((scene) => scene.trim()).filter(Boolean),
  };
}

function buildUrl(baseUrl, sceneId) {
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('scene', sceneId);
  url.searchParams.set('probeRender', '1');
  for (const flag of KONVEYOR_FLAGS) {
    url.searchParams.set(flag, '1');
  }
  return url.href;
}

async function captureScene({ context, baseUrl, sceneId }) {
  const page = await context.newPage();
  const url = buildUrl(baseUrl, sceneId);
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => {
      const terrain = window.__sds?.terrainBuilderRef;
      const sceneManager = window.__sds?.sceneManagerRef;
      const wantsWater = terrain?.sceneDef?.boundary?.kind === 'island';
      return !!window.__sdsRendererMode
        && !!sceneManager?.getRenderer?.()
        && !!terrain?.terrainMesh
        && terrain?.modelsLoaded === true
        && (!wantsWater || !!sceneManager?.waterBundle?.water);
    }, null, { timeout: 90_000 });
    await page.waitForTimeout(500);

    const state = await page.evaluate(() => {
      const terrain = window.__sds?.terrainBuilderRef ?? null;
      const grass = terrain?.grassSystem ?? null;
      const sceneManager = window.__sds?.sceneManagerRef ?? null;
      const renderer = sceneManager?.getRenderer?.() ?? null;
      const water = sceneManager?.waterBundle?.water ?? null;
      return {
        rendererMode: window.__sdsRendererMode ?? null,
        diagnosticBoot: window.__sdsG?.r === true,
        currentSceneId: window.__currentSceneId ?? null,
        renderer: {
          className: renderer?.constructor?.name ?? null,
          isWebGLRenderer: renderer?.isWebGLRenderer === true,
          isWebGPURenderer: renderer?.isWebGPURenderer === true,
          calls: renderer?.info?.render?.calls ?? null,
          triangles: renderer?.info?.render?.triangles ?? null,
        },
        summaries: {
          treeRockMaterial: terrain?.konveyorTreeRockMaterialSummary ?? null,
          rockPlacement: terrain?.konveyorRockPlacementSummary ?? null,
          terrainMaterial: terrain?.konveyorTerrainMaterialSummary ?? null,
          grassBladeMaterial: grass?.konveyorGrassBladeMaterialSummary ?? null,
          meadowQuadMaterial: grass?.konveyorMeadowQuadMaterialSummary ?? null,
          waterMaterial: water?.konveyorWaterMaterialSummary ?? null,
          atmosphereMaterial: window.__sdsKonveyorAtmosphereMaterialAdapter ?? null,
          effectMaterial: window.__sdsKonveyorEffectMaterialAdapter ?? null,
        },
      };
    });

    return {
      sceneId,
      url,
      ...state,
      consoleErrors,
      pageErrors,
      ok: state.rendererMode?.effective === 'webgl'
        && state.rendererMode?.fallbackReason === 'diagnostic-flag-required'
        && state.diagnosticBoot === false
        && state.renderer?.isWebGLRenderer === true
        && state.renderer?.isWebGPURenderer === false
        && state.summaries?.rockPlacement?.applied === true
        && consoleErrors.length === 0
        && pageErrors.length === 0,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function run() {
  const args = parseArgs(process.argv);
  const launchOptions = { args: CHROMIUM_GPU_ARGS, headless: true };
  if (args.channel) launchOptions.channel = args.channel;

  const browser = await chromium.launch(launchOptions);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    try {
      const scenes = [];
      for (const sceneId of args.sceneIds) {
        scenes.push(await captureScene({ context, baseUrl: args.baseUrl, sceneId }));
      }
      const manifest = {
        capturedAt: new Date().toISOString(),
        contract: 'konveyor-production-flag-fallback-proof',
        baseUrl: args.baseUrl,
        channel: args.channel ?? 'playwright-chromium',
        chromiumArgs: CHROMIUM_GPU_ARGS,
        flags: KONVEYOR_FLAGS,
        ok: scenes.every((scene) => scene.ok),
        scenes,
      };

      const outPath = resolve(ROOT, args.out);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, JSON.stringify(manifest, null, 2));
      console.log(JSON.stringify(manifest, null, 2));
      if (!manifest.ok) {
        throw new Error('production flag fallback proof did not satisfy manifest gates');
      }
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error('[PRODUCTION-FLAG-FALLBACK] fatal:', error);
  process.exit(1);
});
