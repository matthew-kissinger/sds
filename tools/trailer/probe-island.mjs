// SPDX-License-Identifier: AGPL-3.0-or-later
// One-off: ASCII-map Newsheepdogland's landmass via __sdsCinema.getTerrainY
// so the trailer flight path can hug real coastline. Prints a grid where
// '.' = sea, digits = terrain height band (0-9 ~ 0-120m+).

import { chromium } from 'playwright';

const BASE_URL = process.argv[2] ?? 'http://127.0.0.1:4173/';
const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox', '--hide-scrollbars'];

const url = new URL(BASE_URL);
url.searchParams.set('renderer', 'webgpu');
url.searchParams.set('scene', 'newsheepdogland');
url.searchParams.set('cinematic', '1');
url.searchParams.set('ui', 'off');

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForFunction(() => Boolean(window.__sdsCinema), null, { timeout: 90_000 });
await page.evaluate(() => window.__sdsCinema.waitReady?.(90_000));
await page.waitForTimeout(2000);

const grid = await page.evaluate(() => {
    const c = window.__sdsCinema;
    const N = 56, HALF = 1650;
    const rows = [];
    for (let zi = N - 1; zi >= 0; zi--) { // +z (north) at top
        let row = '';
        for (let xi = 0; xi < N; xi++) {
            const x = -HALF + (xi / (N - 1)) * 2 * HALF;
            const z = -HALF + (zi / (N - 1)) * 2 * HALF;
            const y = c.getTerrainY(x, z);
            row += y <= 0.5 ? '.' : String(Math.min(9, Math.floor(y / 13)));
        }
        rows.push(row);
    }
    return rows.join('\n');
});
console.log('north (+z) at top, west (-x) at left, 1650m half-extent, 60m cells');
console.log(grid);
await page.close();
await browser.close();
