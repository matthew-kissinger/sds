// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CHROMIUM_GPU_ARGS = process.platform === 'win32'
  ? ['--use-angle=d3d11', '--enable-gpu']
  : [];

function parseArgs(argv) {
  const args = {
    baseUrl: 'http://127.0.0.1:3000/',
    out: 'cycle38-validation/runtime/webgpu-impostor-lab-proof.json',
    screenshotDir: 'cycle38-validation/screenshots/webgpu-impostor-lab',
    screenshots: '1',
    channel: 'chrome',
    scene: 'rolling-hills',
  };

  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = match[2];
  }

  return args;
}

function buildUrl(baseUrl, scene) {
  const url = new URL(baseUrl);
  url.searchParams.set('renderer', 'webgpu');
  url.searchParams.set('diagnostic', '1');
  url.searchParams.set('konveyorScene', scene);
  return url.href;
}

function relativeArtifactPath(filePath) {
  return filePath.replace(`${ROOT}\\`, '').replace(`${ROOT}/`, '').replaceAll('\\', '/');
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

async function inspectScreenshot(filePath) {
  const image = sharp(filePath);
  const metadata = await image.metadata();
  const { data } = await image
    .resize(96, 54, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let min = 255;
  let max = 0;
  let alphaPixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    const luma = (0.2126 * data[i]) + (0.7152 * data[i + 1]) + (0.0722 * data[i + 2]);
    min = Math.min(min, luma);
    max = Math.max(max, luma);
    if (data[i + 3] > 0) alphaPixels += 1;
  }
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    nonBlank: alphaPixels > 0 && (max - min) >= 8,
    lumaRange: Number((max - min).toFixed(2)),
  };
}

function directionFromPose({ yawDeg, pitchDeg }) {
  const yaw = yawDeg * Math.PI / 180;
  const pitch = pitchDeg * Math.PI / 180;
  const planar = Math.cos(pitch);
  return {
    x: Number((Math.sin(yaw) * planar).toFixed(4)),
    y: Number(Math.sin(pitch).toFixed(4)),
    z: Number((Math.cos(yaw) * planar).toFixed(4)),
  };
}

async function run() {
  const args = parseArgs(process.argv);
  const outPath = resolve(ROOT, args.out);
  const screenshotDir = resolve(ROOT, args.screenshotDir);
  await mkdir(dirname(outPath), { recursive: true });
  if (args.screenshots === '1') await mkdir(screenshotDir, { recursive: true });

  const launchOptions = { args: CHROMIUM_GPU_ARGS };
  if (args.channel) launchOptions.channel = args.channel;
  const browser = await chromium.launch(launchOptions);
  const consoleErrors = [];
  const pageErrors = [];

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    try {
      const page = await context.newPage();
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

      const url = buildUrl(args.baseUrl, args.scene);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForFunction(() => window.__sdsG?.ok === true || !!window.__sdsG?.error, null, { timeout: 60_000 });
      await page.waitForFunction(() => (window.__sdsG?.frames ?? 0) >= 3, null, { timeout: 60_000 });

      const initial = await page.evaluate(() => ({
        rendererMode: window.__sdsRendererMode ?? null,
        diagnosticOk: window.__sdsG?.ok === true,
        diagnosticError: window.__sdsG?.error ?? null,
        frames: window.__sdsG?.frames ?? 0,
        lab: window.__sdsG?.kilnImpostorOrbitLab ?? null,
      }));

      const poses = initial.lab?.report?.layouts?.['latlon-hemi-y']?.samples
        ?.map((sample) => ({
          id: sample.id,
          yawDeg: sample.yawDeg,
          pitchDeg: sample.pitchDeg,
          direction: sample.direction ?? directionFromPose(sample),
        })) ?? [];

      const appliedSamples = [];
      const screenshots = [];
      for (let i = 0; i < poses.length; i++) {
        const pose = poses[i];
        const sample = await page.evaluate(({ direction }) => (
          window.__sdsG?.kilnImpostorOrbitLab?.applyDirection?.(direction, 'latlon-hemi-y') ?? null
        ), { direction: pose.direction });
        appliedSamples.push({ poseId: pose.id, yawDeg: pose.yawDeg, pitchDeg: pose.pitchDeg, ...sample });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

        if (args.screenshots === '1' && i % 3 === 0) {
          const screenshotPath = resolve(screenshotDir, `${String(i).padStart(2, '0')}-${safeName(pose.id)}.png`);
          await page.locator('canvas').first().screenshot({ path: screenshotPath });
          screenshots.push({
            poseId: pose.id,
            path: relativeArtifactPath(screenshotPath),
            proof: await inspectScreenshot(screenshotPath),
          });
        }
      }

      const finalLab = await page.evaluate(() => window.__sdsG?.kilnImpostorOrbitLab ?? null);
      await page.close().catch(() => {});

      const uniqueAppliedDominantTiles = new Set(
        appliedSamples.map((sample) => `${sample.tiles?.[0]?.[0] ?? 0}:${sample.tiles?.[0]?.[1] ?? 0}`)
      );
      const checks = {
        rendererDiagnostic: initial.rendererMode?.effective === 'webgpu-diagnostic',
        diagnosticOk: initial.diagnosticOk === true,
        labPresent: !!initial.lab,
        materialDynamicUniformLab: initial.lab?.materialSelectionMode?.mode === 'dynamic-uniform-lab',
        controlsAvailable: initial.lab?.controlsAvailable === true,
        sidecarIsLatLonHemiY: initial.lab?.report?.checks?.sidecarIsCurrentLatLonKiln === true,
        latLonTilesVary: initial.lab?.report?.checks?.latLonTilesVary === true,
        octahedralSelectorVary: initial.lab?.report?.checks?.octahedralSelectorVary === true,
        appliedEveryPose: appliedSamples.length >= 8 && appliedSamples.every((sample) => sample.appliedToMaterial === true),
        appliedTilesVary: uniqueAppliedDominantTiles.size >= 4,
        weightsNormalized: appliedSamples.every((sample) => Math.abs((sample.weightsSum ?? 0) - 1) <= 0.001),
        screenshotsNonBlank: screenshots.every((screenshot) => screenshot.proof.nonBlank === true),
        consoleClean: consoleErrors.length === 0 && pageErrors.length === 0,
        productionReadyFalse: finalLab?.report?.productionReady === false,
      };

      const manifest = {
        capturedAt: new Date().toISOString(),
        source: 'SDS Cycle 38 WebGPU impostor orbit lab proof',
        url,
        channel: args.channel,
        chromiumArgs: CHROMIUM_GPU_ARGS,
        scene: args.scene,
        rendererMode: initial.rendererMode,
        frames: initial.frames,
        lab: {
          treeType: initial.lab?.treeType ?? null,
          materialName: initial.lab?.materialName ?? null,
          materialSelectionMode: initial.lab?.materialSelectionMode ?? null,
          controlsAvailable: initial.lab?.controlsAvailable ?? false,
          report: initial.lab?.report ?? null,
          appliedSamples,
          finalAppliedCount: finalLab?.appliedSamples?.length ?? 0,
        },
        screenshots,
        consoleErrors,
        pageErrors,
        checks,
        ok: Object.values(checks).every(Boolean),
      };

      await writeFile(outPath, JSON.stringify(manifest, null, 2));
      console.log(JSON.stringify(manifest, null, 2));
      if (!manifest.ok) throw new Error('WebGPU impostor lab proof did not satisfy gates');
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error('[WEBGPU-IMPOSTOR-LAB] fatal:', error);
  process.exit(1);
});
