// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 90 one-off: count live compute-cull controllers + submits/frame on NSL.
import { chromium } from 'playwright';

const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox'];

const context = await chromium.launchPersistentContext('', {
    channel: 'chrome', headless: false, args: GPU_ARGS,
    viewport: { width: 1600, height: 900 }, serviceWorkers: 'block',
});
const page = await context.newPage();
try {
    await page.goto('http://localhost:4173/?scene=newsheepdogland&mode=survival&autostart=1&perfMode=1', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
    await page.waitForFunction(() => (window.__sdsFoliageStreaming?.completedAt ?? 0) > 0, null, { timeout: 120_000 });
    const counts = await page.evaluate(() => {
        const tb = window.gameInstance?.terrainBuilder;
        const treeCtrls = tb?._treeCullControllers ?? [];
        const byKey = {};
        for (const c of treeCtrls) {
            const key = `${c.mesh?.userData?.webgpuTreeType ?? '?'}/${c.mesh?.userData?.webgpuNativeChunkKey ?? '?'}`;
            byKey[key] = (byKey[key] ?? 0) + 1;
        }
        const grass = tb?.grassSystem?._computeCullController ? 1 : 0;
        const streamed = tb?.grassSystem?._streamedCullController ? 1 : 0;
        const total = treeCtrls.length + grass + streamed;
        return {
            treeControllers: treeCtrls.length,
            grassControllers: grass + streamed,
            totalControllers: total,
            submitsPerFrame: total * 2,
            treeInstanceTotal: treeCtrls.reduce((s, c) => s + (c.diag?.count ?? 0), 0),
            byKey,
        };
    });
    console.log(JSON.stringify(counts, null, 2));
} finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
}
