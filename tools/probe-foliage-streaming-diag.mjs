// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Probe: play Newsheepdogland against a local dev server, wait for foliage
// streaming to complete, and dump window.__sdsFoliageStreaming (per-wave
// scatter/build timings) as JSON. Feeds the impostor-first cold-path spike.
//
// Expects a server already listening. Dev (http://localhost:3000):
//   SDS_SUPPRESS_BROWSER_OPEN=1 npm run dev:client
// Production preview (the representative consolidated WebGPU path):
//   npm run build && npm run preview   (http://localhost:4173)
//
// Run: node tools/probe-foliage-streaming-diag.mjs [baseUrl]
//   e.g. node tools/probe-foliage-streaming-diag.mjs http://localhost:4173

import { chromium } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://localhost:3000';

// Real-GPU launch recipe (matches tools/cycle38-phase2-pc-captures.mjs):
// system Chrome + unsafe-webgpu args so the boot lands on webgpu-production
// instead of soft-falling to WebGL. Pass --headed if headless still loses
// the adapter on this host.
const gpuArgs = process.platform === 'win32'
    ? ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer']
    : ['--enable-unsafe-webgpu'];
const headed = process.argv.includes('--headed');
const browser = await chromium.launch({ channel: 'chrome', headless: !headed, args: gpuArgs });
const context = await browser.newContext();
await context.addInitScript(() => {
    localStorage.setItem('playerIdentity', JSON.stringify({
        persistentId: 'player_probe_foliage_diag',
        displayName: 'DiagProbe',
        fullName: 'DiagProbe#0001',
        discriminator: '0001',
        nameType: 'custom',
        createdAt: Date.now(),
        isRegistered: false,
    }));
});
const page = await context.newPage();

try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await play.waitFor({ state: 'visible', timeout: 30_000 });
    await play.dispatchEvent('click');
    await page.locator('#canvas-container canvas').waitFor({ state: 'attached', timeout: 90_000 });

    const deadline = Date.now() + 120_000;
    let diag = null;
    while (Date.now() < deadline) {
        diag = await page.evaluate(() => window.__sdsFoliageStreaming ?? null);
        if (diag?.completedAt > 0 || diag?.error || diag?.aborted) break;
        await new Promise((r) => setTimeout(r, 1000));
    }
    const context2 = await page.evaluate(() => ({
        rendererMode: window.__sdsRendererMode ?? null,
        treeSummary: (() => {
            const s = window.__sds?.terrainBuilderRef?.webgpuNativeTreeInstancingSummary;
            if (!s) return null;
            return { applied: s.applied, ok: s.ok, route: s.route, lod: s.lod, treeInstances: s.treeInstances, renderedInstanceMeshes: s.renderedInstanceMeshes };
        })(),
        coldCoverage: window.__sdsFoliageColdCoverage ?? null,
    }));
    console.log(JSON.stringify({ ...context2, diag }, null, 2));
} finally {
    await context.close();
    await browser.close();
}
