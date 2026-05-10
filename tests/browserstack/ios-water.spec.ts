import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

type RgbaSample = {
  region: string;
  x: number;
  y: number;
  rgba?: number[];
  error?: string;
};

type WaterSample = {
  label: string;
  samples: RgbaSample[];
  avg: number[] | null;
  nearFoamWhite: boolean;
  foamWhiteRgb: number[];
};

const FOAM_WHITE_RGB = [0xea, 0xf6, 0xff];
const IOS_WATER_BASE_URL = process.env.IOS_WATER_BASE_URL || 'http://localhost:3000';
const ROLLING_HILLS_WATER_URL = new URL(
  '/?scene=rolling-hills&debug=gl&cinematic=1&ui=off&sun=0.55',
  IOS_WATER_BASE_URL
).toString();

function averageRgb(samples: number[][]) {
  if (samples.length === 0) return null;
  return samples
    .reduce((acc, sample) => [acc[0] + sample[0], acc[1] + sample[1], acc[2] + sample[2]], [0, 0, 0])
    .map((value) => Math.round(value / samples.length));
}

function nearFoamWhite(rgb: number[] | null, tolerance = 14) {
  return !!rgb && FOAM_WHITE_RGB.every((channel, index) => Math.abs(rgb[index] - channel) <= tolerance);
}

test('Rolling Hills water is not solid foam-white on real iOS Safari', async ({ page, context }, testInfo) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('sds:playerName', 'BrowserStack iOS');
    window.localStorage.setItem('sds:playerColor', '#2dd4bf');
  });

  await page.evaluate((url) => {
    window.location.assign(url);
  }, ROLLING_HILLS_WATER_URL);
  await page.waitForSelector('#canvas-container canvas', { timeout: 120_000 });
  await page.waitForFunction(() => Boolean((window as unknown as { __sdsCinema?: unknown }).__sdsCinema), null, {
    timeout: 120_000,
  });

  await page.evaluate(async () => {
    const cinema = (window as unknown as {
      __sdsCinema?: {
        waitReady: (timeoutMs?: number) => Promise<void>;
        startSolo: (dogBreed?: string, mode?: string) => boolean;
        hideUI: () => void;
        setCameraPose: (
          position: { x: number; y: number; z: number },
          target: { x: number; y: number; z: number }
        ) => void;
      };
    }).__sdsCinema;
    if (!cinema) throw new Error('__sdsCinema unavailable');
    await cinema.waitReady(90_000);
    cinema.startSolo('jep', 'classic');
    cinema.hideUI();
  });

  await page.waitForTimeout(6_000);
  await page.evaluate(async () => {
    const cinema = (window as unknown as {
      __sdsCinema?: {
        waitReady: (timeoutMs?: number) => Promise<void>;
        hideUI: () => void;
        setCameraPose: (
          position: { x: number; y: number; z: number },
          target: { x: number; y: number; z: number }
        ) => void;
      };
    }).__sdsCinema;
    if (!cinema) throw new Error('__sdsCinema unavailable');
    await cinema.waitReady(90_000);
    cinema.hideUI();
    cinema.setCameraPose({ x: 0, y: 26, z: 255 }, { x: 0, y: 2, z: 165 });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  await page.waitForTimeout(1_000);

  const screenshotPath = testInfo.outputPath('ios-water.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await testInfo.attach('ios-water.png', { path: screenshotPath, contentType: 'image/png' });

  const sample = await page.evaluate(() => {
    const foamWhite = [0xea, 0xf6, 0xff];
    const canvas = document.querySelector('#canvas-container canvas') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('game canvas unavailable');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) throw new Error('WebGL context unavailable');

    const points = [
      { region: 'water-center-lower', x: 0.50, y: 0.70 },
      { region: 'water-center-near', x: 0.50, y: 0.82 },
      { region: 'water-left-near', x: 0.34, y: 0.78 },
      { region: 'water-right-near', x: 0.66, y: 0.78 },
    ];
    const px = new Uint8Array(4);
    const samples = points.map(({ region, x, y }) => {
      const pxX = Math.floor(canvas.width * x);
      const pxY = Math.floor(canvas.height * (1 - y));
      try {
        gl.readPixels(pxX, pxY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return { region, x: pxX, y: pxY, rgba: [px[0], px[1], px[2], px[3]] };
      } catch (err) {
        return { region, x: pxX, y: pxY, error: String((err as Error)?.message || err) };
      }
    });
    const rgbSamples = samples.filter((s) => s.rgba).map((s) => s.rgba!.slice(0, 3));
    const avg = rgbSamples.length === 0
      ? null
      : rgbSamples
          .reduce((acc, rgb) => [acc[0] + rgb[0], acc[1] + rgb[1], acc[2] + rgb[2]], [0, 0, 0])
          .map((value) => Math.round(value / rgbSamples.length));
    const nearFoamWhite = Boolean(avg && foamWhite.every((channel, index) => Math.abs(avg[index] - channel) <= 14));

    return {
      label: 'browserstack-ios-water',
      samples,
      avg,
      nearFoamWhite,
      foamWhiteRgb: foamWhite,
    };
  }) as WaterSample;

  const samplePath = testInfo.outputPath('ios-water-sample.json');
  await writeFile(samplePath, `${JSON.stringify(sample, null, 2)}\n`, 'utf8');
  await testInfo.attach('ios-water-sample.json', { path: samplePath, contentType: 'application/json' });

  const rgbSamples = sample.samples.filter((s) => s.rgba).map((s) => s.rgba!.slice(0, 3));
  const avg = sample.avg ?? averageRgb(rgbSamples);
  const solidFoamWhite = sample.nearFoamWhite || nearFoamWhite(avg);

  expect(rgbSamples.length, 'water sample should include readable pixels').toBeGreaterThan(0);
  expect(solidFoamWhite, `water sample avg ${JSON.stringify(avg)} must not be near #eaf6ff`).toBe(false);
});
