// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 90 Phase 8: NSL visual survey - ground color, shadows, water, lighting.
// Captures full-res cells for eyeball diagnosis (not SSIM). Home Field cells
// are the shadow control (its +-220m sun frustum covers the whole pasture, so
// shadows visible there but missing on NSL implicates the static frustum).
//
// Pose-based: cinema.setCameraPose anchored to the live dog position; the
// CameraController chip modes are not scriptable enough for repeatable shots.
// ToD is pinned by stopping the DayNightCycle BEFORE setTimeOfDay - the
// survival dayLoop tick re-applies the (now frozen) t harmlessly.
//
// Usage: node tools/cycle90-visual-survey.mjs --outdir=cycle90-validation/visual-survey/before
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = 'http://localhost:4173/';
const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox'];

// Offsets are dog-relative: pose = dog + offset, target = dog + lookOffset.
const CELLS = [
    { id: 'nsl-noon-ground', scene: 'newsheepdogland', mode: 'survival', t: 0.5, offset: [6, 4, 6], lookOffset: [0, 0.5, 0] },
    { id: 'nsl-noon-vista', scene: 'newsheepdogland', mode: 'survival', t: 0.5, offset: [0, 5, 14], lookOffset: [0, 2, -60] },
    { id: 'nsl-noon-coast', scene: 'newsheepdogland', mode: 'survival', t: 0.5, offset: [0, 10, 40], lookOffset: [0, -2, -220] },
    { id: 'nsl-goldenhour-ground', scene: 'newsheepdogland', mode: 'survival', t: 0.68, offset: [6, 4, 6], lookOffset: [0, 0.5, 0] },
    // Origin-area cell: the +-220m shadow frustum is centered here, so this is
    // the one place NSL shadows can exist today - and a black-spot suspect.
    { id: 'nsl-noon-origin', scene: 'newsheepdogland', mode: 'survival', t: 0.5, absolute: [30, 25, 30], lookAt: [0, 0, 0] },
    { id: 'field-noon-ground', scene: 'field', mode: 'practice', t: 0.5, offset: [6, 4, 6], lookOffset: [0, 0.5, 0] },
];

const outdir = resolve(ROOT, (process.argv.find((a) => a.startsWith('--outdir=')) ?? '--outdir=cycle90-validation/visual-survey').split('=')[1]);
await mkdir(outdir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: GPU_ARGS });
try {
    for (const cell of CELLS) {
        console.log(`[C90-SURVEY] capturing ${cell.id}`);
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await context.newPage();
        try {
            const url = new URL(BASE_URL);
            url.searchParams.set('scene', cell.scene);
            url.searchParams.set('mode', cell.mode);
            url.searchParams.set('autostart', '1');
            url.searchParams.set('cinematic', '1');
            url.searchParams.set('perfMode', '1');
            url.searchParams.set('ui', 'off');
            await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
            await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
            if (cell.scene === 'newsheepdogland') {
                await page.waitForFunction(() => (window.__sdsFoliageStreaming?.completedAt ?? 0) > 0, null, { timeout: 120_000 });
            }
            await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 60_000 });
            await page.evaluate(({ t, offset, lookOffset, absolute, lookAt }) => {
                const cinema = window.__sdsCinema;
                cinema.pauseSimulation();
                const atm = window.gameInstance?.atmosphere;
                atm?.dayNight?.setRunning?.(false);
                cinema.setSun(t);
                let pos; let target;
                if (absolute) {
                    const gy = cinema.getTerrainY?.(absolute[0], absolute[2]) ?? 0;
                    pos = { x: absolute[0], y: gy + absolute[1], z: absolute[2] };
                    const ty = cinema.getTerrainY?.(lookAt[0], lookAt[2]) ?? 0;
                    target = { x: lookAt[0], y: ty + (lookAt[1] ?? 0), z: lookAt[2] };
                } else {
                    // The sim dog position is 2D (x, z); ground the camera via the
                    // heightfield - a NaN camera Y silently kills rendering and the
                    // snapshot returns the last good frame.
                    const dog = cinema?.gameState?.getSheepdog?.();
                    const p = dog?.position ?? { x: 0, z: 0 };
                    const gy = cinema.getTerrainY?.(p.x, p.z) ?? 0;
                    pos = { x: p.x + offset[0], y: gy + offset[1], z: p.z + offset[2] };
                    target = { x: p.x + lookOffset[0], y: gy + lookOffset[1], z: p.z + lookOffset[2] };
                }
                cinema.setCameraPose(pos, target);
                cinema.syncAtmosphereToCamera();
            }, cell);
            await page.evaluate(() => new Promise((r) => {
                let n = 0;
                const step = () => (++n >= 10 ? r() : requestAnimationFrame(step));
                requestAnimationFrame(step);
            }));
            const dataUrl = await page.evaluate(() => {
                const canvas = document.querySelector('#canvas-container canvas') ?? document.querySelector('canvas');
                if (!canvas) throw new Error('game canvas not found');
                return canvas.toDataURL('image/png');
            });
            await writeFile(resolve(outdir, `${cell.id}.png`), Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
        } finally {
            await page.close().catch(() => {});
            await context.close().catch(() => {});
        }
    }
} finally {
    await browser.close().catch(() => {});
}
console.log(`[C90-SURVEY] wrote ${CELLS.length} captures to ${outdir}`);
