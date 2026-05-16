import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DEFAULT_SCENES = ['field', 'rolling-hills', 'open-country'];
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];
const TOP_CHROMA_TOLERANCE = 0.04;
const FOG_COLOR_TOLERANCE = 0.002;

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:4173/',
    out: 'cycle36-validation/runtime/production-atmosphere-parity-proof.json',
    outDir: 'cycle36-validation/runtime/production-atmosphere-parity-screenshots',
    diagnosticManifest: 'cycle36-validation/runtime/scene-sky-screenshots/manifest.json',
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

function buildProductionUrl(baseUrl, sceneId) {
  const url = new URL(baseUrl);
  url.searchParams.set('scene', sceneId);
  url.searchParams.set('probeRender', '1');
  url.searchParams.set('cinematic', '1');
  url.searchParams.set('ui', 'off');
  return url.href;
}

function round(value, digits = 4) {
  return Number(value.toFixed(digits));
}

function luma([r, g, b]) {
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

function chroma(rgb) {
  const total = rgb[0] + rgb[1] + rgb[2];
  if (total <= 0.0001) return [0, 0, 0];
  return rgb.map((channel) => channel / total);
}

function distance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
  return Math.hypot(...a.map((value, index) => value - b[index]));
}

function colorsNear(a, b, tolerance) {
  return distance(a, b) <= tolerance;
}

async function sampleRegion(imagePath, ratios) {
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const left = Math.max(0, Math.floor(width * ratios.left));
  const top = Math.max(0, Math.floor(height * ratios.top));
  const regionWidth = Math.max(1, Math.min(width - left, Math.floor(width * ratios.width)));
  const regionHeight = Math.max(1, Math.min(height - top, Math.floor(height * ratios.height)));
  const { data } = await sharp(imagePath)
    .extract({ left, top, width: regionWidth, height: regionHeight })
    .resize({ width: ratios.resizeWidth, height: ratios.resizeHeight, fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const total = [0, 0, 0];
  let minLuma = Infinity;
  let maxLuma = -Infinity;
  const buckets = new Set();
  let count = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const rgb = [data[offset], data[offset + 1], data[offset + 2]];
    total[0] += rgb[0];
    total[1] += rgb[1];
    total[2] += rgb[2];
    const y = luma(rgb);
    minLuma = Math.min(minLuma, y);
    maxLuma = Math.max(maxLuma, y);
    buckets.add(`${rgb[0] >> 4},${rgb[1] >> 4},${rgb[2] >> 4}`);
    count += 1;
  }

  const averageRgb = total.map((value) => round(value / count, 2));
  const averageChroma = chroma(averageRgb).map((value) => round(value, 5));

  return {
    averageRgb,
    averageChroma,
    averageLuma: round(luma(averageRgb), 2),
    lumaRange: round(maxLuma - minLuma, 2),
    coarseColorBuckets: buckets.size,
  };
}

async function sampleScreenshot(imagePath) {
  const metadata = await sharp(imagePath).metadata();
  const topSky = await sampleRegion(imagePath, {
    left: 0.25,
    top: 0.05,
    width: 0.5,
    height: 0.08,
    resizeWidth: 32,
    resizeHeight: 8,
  });
  const full = await sampleRegion(imagePath, {
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    resizeWidth: 64,
    resizeHeight: 36,
  });

  return {
    dimensions: {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
    },
    topSky,
    full,
    nonBlank: full.lumaRange >= 20 && full.coarseColorBuckets >= 16,
  };
}

async function loadDiagnosticManifest(path) {
  const fullPath = resolve(ROOT, path);
  const manifest = JSON.parse(await readFile(fullPath, 'utf8'));
  const scenes = new Map();
  for (const scene of manifest.scenes ?? []) {
    scenes.set(scene.sceneId, {
      ...scene,
      screenshotPath: resolve(dirname(fullPath), scene.screenshot),
    });
  }
  return {
    path,
    fullPath,
    manifest,
    scenes,
  };
}

async function captureProductionScene({ context, baseUrl, sceneId, outDir }) {
  const page = await context.newPage();
  const url = buildProductionUrl(baseUrl, sceneId);
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.addStyleTag({
      content: '#site-footer { visibility: hidden !important; }',
    }).catch(() => {});
    await page.waitForFunction(() => {
      const terrain = window.__sds?.terrainBuilderRef;
      const sceneManager = window.__sds?.sceneManagerRef;
      const atmosphere = window.__sds?.atmosphereRef;
      const wantsWater = terrain?.sceneDef?.boundary?.kind === 'island';
      return !!window.__sdsRendererMode
        && !!sceneManager?.getRenderer?.()
        && !!terrain?.terrainMesh
        && terrain?.modelsLoaded === true
        && !!atmosphere?.sky?.getMesh?.()
        && !!atmosphere?.cloudLayer?.getMesh?.()
        && (!wantsWater || !!sceneManager?.waterBundle?.water);
    }, null, { timeout: 90_000 });
    await page.waitForTimeout(600);

    const state = await page.evaluate(() => {
      const sceneManager = window.__sds?.sceneManagerRef ?? null;
      const renderer = sceneManager?.getRenderer?.() ?? null;
      const atmosphere = window.__sds?.atmosphereRef ?? null;
      const skyMesh = atmosphere?.sky?.getMesh?.() ?? null;
      const cloudMesh = atmosphere?.cloudLayer?.getMesh?.() ?? null;
      const fog = sceneManager?.getScene?.()?.fog ?? null;
      return {
        rendererMode: window.__sdsRendererMode ?? null,
        currentSceneId: window.__currentSceneId ?? null,
        renderer: {
          className: renderer?.constructor?.name ?? null,
          isWebGLRenderer: renderer?.isWebGLRenderer === true,
          isWebGPURenderer: renderer?.isWebGPURenderer === true,
          calls: renderer?.info?.render?.calls ?? null,
          triangles: renderer?.info?.render?.triangles ?? null,
        },
        atmosphere: {
          presetName: atmosphere?.getCurrentPresetName?.() ?? null,
          sky: {
            meshName: skyMesh?.name ?? null,
            materialName: skyMesh?.material?.name ?? null,
            materialType: skyMesh?.material?.type ?? null,
            isShaderMaterial: skyMesh?.material?.isShaderMaterial === true,
            isNodeMaterial: skyMesh?.material?.isNodeMaterial === true,
          },
          cloud: {
            meshName: cloudMesh?.name ?? null,
            materialName: cloudMesh?.material?.name ?? null,
            materialType: cloudMesh?.material?.type ?? null,
            visible: cloudMesh?.visible === true,
            coverage: atmosphere?.cloudLayer?.getCoverage?.() ?? null,
            edgeFade: atmosphere?.cloudLayer?.getEdgeFade?.() ?? null,
            isShaderMaterial: cloudMesh?.material?.isShaderMaterial === true,
            isNodeMaterial: cloudMesh?.material?.isNodeMaterial === true,
          },
          fog: fog ? {
            kind: fog.isFog ? 'Fog' : (fog.isFogExp2 ? 'FogExp2' : (fog.type ?? null)),
            color: fog.color?.toArray?.().slice(0, 3) ?? null,
            near: fog.near ?? null,
            far: fog.far ?? null,
            density: fog.density ?? null,
          } : null,
        },
      };
    });

    const screenshot = `${sceneId}.png`;
    const screenshotPath = resolve(outDir, screenshot);
    await page.locator('canvas').first().screenshot({ path: screenshotPath });
    const screenshotProof = await sampleScreenshot(screenshotPath);

    return {
      sceneId,
      url,
      screenshot,
      screenshotProof,
      ...state,
      consoleErrors,
      pageErrors,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function compareScene({ production, diagnostic }) {
  const diagnosticScreenshotProof = await sampleScreenshot(diagnostic.screenshotPath);
  const topChromaDistance = round(distance(
    production.screenshotProof.topSky.averageChroma,
    diagnosticScreenshotProof.topSky.averageChroma
  ), 5);
  const fogColorDistance = round(distance(
    production.atmosphere?.fog?.color,
    diagnostic.skyFog?.fogColor
  ), 5);
  const cloudCoverageDelta = round(Math.abs(
    (production.atmosphere?.cloud?.coverage ?? NaN) - (diagnostic.skyFog?.cloudCoverage ?? NaN)
  ), 5);
  const fogNearDelta = round(Math.abs(
    (production.atmosphere?.fog?.near ?? NaN) - (diagnostic.skyFog?.fogNear ?? NaN)
  ), 5);
  const fogFarDelta = round(Math.abs(
    (production.atmosphere?.fog?.far ?? NaN) - (diagnostic.skyFog?.fogFar ?? NaN)
  ), 5);

  const checks = {
    productionWebGl: production.rendererMode?.effective === 'webgl'
      && production.renderer?.isWebGLRenderer === true
      && production.renderer?.isWebGPURenderer === false,
    diagnosticWebGpu: diagnostic.rendererMode?.effective === 'webgpu-diagnostic',
    sceneMatches: production.currentSceneId === diagnostic.sceneId,
    presetMatches: production.atmosphere?.presetName === diagnostic.sceneBinding?.skyPresetName,
    fogKindIsLinear: production.atmosphere?.fog?.kind === 'Fog',
    fogColorMatchesPacket: fogColorDistance <= FOG_COLOR_TOLERANCE,
    fogNearMatchesPacket: fogNearDelta === 0,
    fogFarMatchesPacket: fogFarDelta === 0,
    cloudCoverageMatchesPacket: cloudCoverageDelta <= 0.001,
    productionUsesDefaultSkyShader: production.atmosphere?.sky?.materialName === 'HosekWilkieSky'
      && production.atmosphere?.sky?.isShaderMaterial === true
      && production.atmosphere?.sky?.isNodeMaterial === false,
    productionUsesDefaultCloudShader: production.atmosphere?.cloud?.materialName === 'CloudLayer'
      && production.atmosphere?.cloud?.isShaderMaterial === true
      && production.atmosphere?.cloud?.isNodeMaterial === false,
    productionScreenshotNonBlank: production.screenshotProof.nonBlank === true,
    diagnosticScreenshotNonBlank: diagnosticScreenshotProof.nonBlank === true,
    skyBandChromaMatches: topChromaDistance <= TOP_CHROMA_TOLERANCE,
    cleanConsole: production.consoleErrors.length === 0 && production.pageErrors.length === 0,
  };

  return {
    sceneId: production.sceneId,
    production,
    diagnostic: {
      sceneId: diagnostic.sceneId,
      screenshot: diagnostic.screenshot,
      rendererMode: diagnostic.rendererMode,
      sceneBinding: diagnostic.sceneBinding,
      skyFog: diagnostic.skyFog,
      screenshotProof: diagnosticScreenshotProof,
    },
    comparison: {
      topChromaDistance,
      fogColorDistance,
      cloudCoverageDelta,
      fogNearDelta,
      fogFarDelta,
    },
    checks,
    ok: Object.values(checks).every(Boolean),
  };
}

function lumaFor(scene) {
  return scene.production.screenshotProof.topSky.averageLuma;
}

function diagnosticLumaFor(scene) {
  return scene.diagnostic.screenshotProof.topSky.averageLuma;
}

async function run() {
  const args = parseArgs(process.argv);
  const diagnostic = await loadDiagnosticManifest(args.diagnosticManifest);
  const outDir = resolve(ROOT, args.outDir);
  await mkdir(outDir, { recursive: true });

  const launchOptions = { args: CHROMIUM_GPU_ARGS, headless: true };
  if (args.channel) launchOptions.channel = args.channel;
  const browser = await chromium.launch(launchOptions);

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    try {
      const scenes = [];
      for (const sceneId of args.sceneIds) {
        const diagnosticScene = diagnostic.scenes.get(sceneId);
        if (!diagnosticScene) {
          throw new Error(`missing diagnostic scene capture for ${sceneId}`);
        }
        const production = await captureProductionScene({
          context,
          baseUrl: args.baseUrl,
          sceneId,
          outDir,
        });
        scenes.push(await compareScene({ production, diagnostic: diagnosticScene }));
      }

      const byId = new Map(scenes.map((scene) => [scene.sceneId, scene]));
      const relativeToneChecks = {
        productionRollingHillsDarkerThanField: lumaFor(byId.get('rolling-hills')) < lumaFor(byId.get('field')),
        productionRollingHillsDarkerThanOpenCountry: lumaFor(byId.get('rolling-hills')) < lumaFor(byId.get('open-country')),
        diagnosticRollingHillsDarkerThanField: diagnosticLumaFor(byId.get('rolling-hills')) < diagnosticLumaFor(byId.get('field')),
        diagnosticRollingHillsDarkerThanOpenCountry: diagnosticLumaFor(byId.get('rolling-hills')) < diagnosticLumaFor(byId.get('open-country')),
      };
      const manifest = {
        capturedAt: new Date().toISOString(),
        contract: 'konveyor-production-atmosphere-scene-parity-proof',
        baseUrl: args.baseUrl,
        screenshotDir: args.outDir,
        diagnosticManifest: args.diagnosticManifest,
        channel: args.channel ?? 'playwright-chromium',
        chromiumArgs: CHROMIUM_GPU_ARGS,
        comparisonBasis: {
          topBand: 'centered upper-sky band',
          skyBandMetric: 'normalized RGB chroma, not luma, so exposure and tonemapping differences do not masquerade as hue drift',
          topChromaTolerance: TOP_CHROMA_TOLERANCE,
          fogColorTolerance: FOG_COLOR_TOLERANCE,
        },
        relativeToneChecks,
        ok: scenes.every((scene) => scene.ok) && Object.values(relativeToneChecks).every(Boolean),
        scenes,
      };

      const outPath = resolve(ROOT, args.out);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, JSON.stringify(manifest, null, 2));
      console.log(JSON.stringify(manifest, null, 2));
      if (!manifest.ok) {
        throw new Error('production atmosphere parity proof did not satisfy manifest gates');
      }
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error('[KONVEYOR-ATMOSPHERE-PARITY] fatal:', error);
  process.exit(1);
});
