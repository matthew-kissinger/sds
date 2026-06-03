// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = Object.fromEntries(
  process.argv.slice(2).filter((arg) => arg.startsWith('--')).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? true];
  })
);

const BASE_URL = args.baseUrl ?? args['base-url'] ?? 'http://127.0.0.1:4173/';
const OUT_PATH = resolve(ROOT, args.out ?? 'cycle38-validation/runtime/desktop-webgpu-visual-recovery-proof.json');
const SCREENSHOT_DIR = resolve(ROOT, args.screenshotDir ?? 'cycle38-validation/screenshots/desktop-webgpu-visual-recovery');
const CHANNEL = args.channel ?? 'chrome';
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const CHROMIUM_GPU_ARGS = process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu'] : [];

function relative(path) {
  return path.startsWith(ROOT) ? path.slice(ROOT.length + 1).replace(/\\/g, '/') : path;
}

function pathFor(name) {
  return resolve(SCREENSHOT_DIR, name);
}

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function analyzeImage(path) {
  const image = sharp(path);
  const [stats, metadata, raw] = await Promise.all([
    image.stats(),
    image.metadata(),
    image.ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const channels = stats.channels.slice(0, 3);
  const mean = channels.reduce((sum, channel) => sum + channel.mean, 0) / channels.length;
  const stdev = channels.reduce((sum, channel) => sum + channel.stdev, 0) / channels.length;
  let clippedWhite = 0;
  let warmBright = 0;
  let maxLuma = 0;
  for (let offset = 0; offset < raw.data.length; offset += 4) {
    const r = raw.data[offset];
    const g = raw.data[offset + 1];
    const b = raw.data[offset + 2];
    if (r >= 248 && g >= 248 && b >= 248) clippedWhite++;
    if (r >= 220 && g >= 110 && b <= 150) warmBright++;
    maxLuma = Math.max(maxLuma, luma(r, g, b));
  }
  const pixels = (metadata.width ?? 0) * (metadata.height ?? 0);
  return {
    width: metadata.width,
    height: metadata.height,
    mean: +mean.toFixed(3),
    stdev: +stdev.toFixed(3),
    maxLuma: +maxLuma.toFixed(3),
    clippedWhitePct: pixels > 0 ? +(clippedWhite / pixels * 100).toFixed(4) : 0,
    warmBrightPct: pixels > 0 ? +(warmBright / pixels * 100).toFixed(4) : 0,
    nonBlank: stdev > 2,
  };
}

async function crop(input, output, box) {
  await sharp(input).extract(box).png().toFile(output);
  return {
    path: relative(output),
    box,
    stats: await analyzeImage(output),
  };
}

function sceneUrl(scene) {
  const url = new URL(BASE_URL);
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('perfMode', '1');
  url.searchParams.set('autostart', '1');
  url.searchParams.set('mode', 'classic');
  url.searchParams.set('scene', scene);
  url.searchParams.set('cinematic', '1');
  url.searchParams.set('ui', 'off');
  url.searchParams.set('grassInteractionProof', '1');
  return url.href;
}

async function openScene(context, scene, errors) {
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  page.on('pageerror', (err) => errors.push(`${scene}: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`${scene}: ${msg.text()}`);
  });
  await page.goto(sceneUrl(scene), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__sdsCinema?.setCameraPose), null, { timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__sdsGrassProof?.setSheepPose), null, { timeout: 60_000 });
  await page.evaluate(async () => {
    window.__sdsCinema.pauseSimulation();
    window.__sdsGrassProof.setPauseState(true);
    await window.__sdsGrassProof.renderOnce();
  });
  return page;
}

async function renderStable(page) {
  await page.evaluate(async () => {
    await window.__sdsGrassProof?.renderOnce?.();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function captureSunScene(context, scene, camera, errors) {
  const page = await openScene(context, scene, errors);
  try {
    const file = pathFor(`sun-${scene}.png`);
    await page.evaluate(async ({ camera }) => {
      window.__perfHarness.setSystemIsolation('full');
      window.__sdsCinema.setCameraPose(camera.position, camera.target);
      await window.__sdsGrassProof.renderOnce();
    }, { camera });
    await renderStable(page);
    await page.screenshot({ path: file, fullPage: true });
    const visualProbe = await page.evaluate(() => window.__perfHarness.getVisualProbe());
    return {
      scene,
      path: relative(file),
      stats: await analyzeImage(file),
      visualProbe,
      checks: {
        rendererWebGpu: String(visualProbe?.renderer ?? '').startsWith('webgpu'),
        nonBlank: (await analyzeImage(file)).nonBlank,
      },
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function captureSheepViews(context, errors) {
  const page = await openScene(context, 'rolling-hills', errors);
  const views = [
    {
      id: 'side',
      camera: { position: { x: -7.5, y: 2.6, z: -30 }, target: { x: 0, y: 0.9, z: -30 } },
      pose: { facingDirection: Math.PI * 0.5, walkCycle: 0.0 },
    },
    {
      id: 'front',
      camera: { position: { x: 0, y: 2.5, z: -22 }, target: { x: 0, y: 0.85, z: -30 } },
      pose: { facingDirection: 0, walkCycle: 0.8 },
    },
    {
      id: 'three-quarter',
      camera: { position: { x: -5.5, y: 2.8, z: -23 }, target: { x: 0, y: 0.9, z: -30 } },
      pose: { facingDirection: Math.PI * 0.18, walkCycle: 1.45 },
    },
  ];
  const captures = [];

  try {
    await page.evaluate(async () => {
      window.__perfHarness.setSystemIsolation('full');
      window.__sdsGrassProof.setActorVisibility({ dog: false, sheep: true, sheepCount: 1 });
      await window.__sdsGrassProof.renderOnce();
    });
    for (const view of views) {
      const full = pathFor(`sheep-${view.id}-fixed-phase-full.png`);
      const cropPath = pathFor(`sheep-${view.id}-fixed-phase-crop.png`);
      await page.evaluate(async ({ view }) => {
        window.__sdsGrassProof.setSheepPose({
          index: 0,
          x: 0,
          z: -30,
          animationPhase: 0,
          speed: 1,
          bounce: 0.15,
          ...view.pose,
        });
        window.__sdsCinema.setCameraPose(view.camera.position, view.camera.target);
        await window.__sdsGrassProof.renderOnce();
      }, { view });
      await renderStable(page);
      await page.screenshot({ path: full, fullPage: true });
      const cropEvidence = await crop(full, cropPath, { left: 390, top: 130, width: 500, height: 440 });
      captures.push({
        id: view.id,
        full: relative(full),
        crop: cropEvidence,
      });
    }
    const visualProbe = await page.evaluate(() => window.__perfHarness.getVisualProbe());
    return {
      scene: 'rolling-hills',
      captures,
      visualProbe,
      checks: {
        rendererWebGpu: String(visualProbe?.renderer ?? '').startsWith('webgpu'),
        constrainedLegMotion: visualProbe?.sheep?.animationContract?.legMotion === 'lower-leg-weighted-fore-aft-constrained-lift',
        woolBodyOnly: visualProbe?.sheep?.woolContract?.bodyOnlyWoolShading === true
          && visualProbe?.sheep?.woolContract?.bodyOnlyWoolDisplacement === true
          && visualProbe?.sheep?.materialSummary?.applied === true,
        cropsNonBlank: captures.every((item) => item.crop.stats.nonBlank),
      },
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function captureWaterAndTrees(context, errors) {
  const page = await openScene(context, 'open-country', errors);
  try {
    const water = pathFor('open-country-shoreline-glint.png');
    const trees = pathFor('open-country-tree-occluded.png');

    await page.evaluate(async () => {
      window.__perfHarness.setSystemIsolation('full');
      window.__perfHarness.setCameraPose('shoreline-glint');
      await window.__sdsGrassProof.renderOnce();
    });
    await renderStable(page);
    await page.screenshot({ path: water, fullPage: true });
    const waterProbe = await page.evaluate(() => window.__perfHarness.getVisualProbe());

    await page.evaluate(async () => {
      window.__perfHarness.setSystemIsolation('full');
      window.__perfHarness.setCameraPose('tree-occluded');
      await window.__sdsGrassProof.renderOnce();
    });
    await renderStable(page);
    await page.screenshot({ path: trees, fullPage: true });
    const treeProbe = await page.evaluate(() => window.__perfHarness.getVisualProbe());

    return {
      scene: 'open-country',
      water: {
        path: relative(water),
        stats: await analyzeImage(water),
        visualProbe: waterProbe,
        checks: {
          rendererWebGpu: String(waterProbe?.renderer ?? '').startsWith('webgpu'),
          waterPresent: waterProbe?.water?.present === true,
          sunCameraGlint: waterProbe?.water?.sunCameraGlint === true,
          nonBlank: (await analyzeImage(water)).nonBlank,
        },
      },
      trees: {
        path: relative(trees),
        stats: await analyzeImage(trees),
        visualProbe: treeProbe,
        checks: {
          rendererWebGpu: String(treeProbe?.renderer ?? '').startsWith('webgpu'),
          materialApplied: treeProbe?.trees?.materialSummary?.applied === true,
          groundingSamplePresent: Array.isArray(treeProbe?.trees?.groundingSample)
            && treeProbe.trees.groundingSample.length > 0,
          nonBlank: (await analyzeImage(trees)).nonBlank,
        },
      },
    };
  } finally {
    await page.close().catch(() => {});
  }
}

await mkdir(dirname(OUT_PATH), { recursive: true });
await mkdir(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ channel: CHANNEL, args: CHROMIUM_GPU_ARGS });
const context = await browser.newContext({ viewport: VIEWPORT });
const errors = [];

const sunScenes = await Promise.all([
  captureSunScene(context, 'field', {
    position: { x: -26, y: 22, z: -48 },
    target: { x: 0, y: 6, z: -2 },
  }, errors),
  captureSunScene(context, 'rolling-hills', {
    position: { x: -48, y: 24, z: -72 },
    target: { x: 0, y: 6, z: -5 },
  }, errors),
  captureSunScene(context, 'open-country', {
    position: { x: -110, y: 30, z: -150 },
    target: { x: 0, y: 5, z: 0 },
  }, errors),
]);
const sheep = await captureSheepViews(context, errors);
const waterAndTrees = await captureWaterAndTrees(context, errors);

await context.close();
await browser.close();

const result = {
  capturedAt: new Date().toISOString(),
  url: BASE_URL,
  channel: CHANNEL,
  sunScenes,
  sheep,
  water: waterAndTrees.water,
  trees: waterAndTrees.trees,
  mobileDeferred: {
    reason: 'phone not connected',
    accepted: false,
  },
  errors,
};

result.ok = errors.length === 0
  && sunScenes.every((scene) => scene.checks.rendererWebGpu && scene.stats.nonBlank && scene.stats.clippedWhitePct < 12)
  && sheep.checks.rendererWebGpu
  && sheep.checks.constrainedLegMotion
  && sheep.checks.woolBodyOnly
  && sheep.checks.cropsNonBlank
  && result.water.checks.rendererWebGpu
  && result.water.checks.waterPresent
  && result.water.checks.sunCameraGlint
  && result.water.checks.nonBlank
  && result.trees.checks.rendererWebGpu
  && result.trees.checks.materialApplied
  && result.trees.checks.groundingSamplePresent
  && result.trees.checks.nonBlank;

await writeFile(OUT_PATH, JSON.stringify(result, null, 2));

if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: result.ok,
  out: relative(OUT_PATH),
  sun: sunScenes.map((scene) => ({
    scene: scene.scene,
    clippedWhitePct: scene.stats.clippedWhitePct,
    warmBrightPct: scene.stats.warmBrightPct,
    path: scene.path,
  })),
  sheep: sheep.captures.map((capture) => ({
    id: capture.id,
    crop: capture.crop.path,
  })),
  water: result.water.path,
  trees: result.trees.path,
  mobileDeferred: result.mobileDeferred,
}, null, 2));
