// Cycle 91 (Phase 2.5 item 4 + Phase 3): consolidated LOD-chain probe.
// Loads NSL survival on the local preview, waits past full foliage streaming,
// then snapshots the consolidated controller registry: controller count
// (acceptance <= 8), per-controller diag (type, role, used/capacity, near
// gate state), and far-impostor activation. Captures near + far survey shots
// for the silhouette review. Probe hygiene: closes everything it opens;
// preview server is expected to already be running on 4173.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = resolve(ROOT, 'cycle91-validation/lod-chain-probe');
mkdirSync(OUT_DIR, { recursive: true });

const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
const URL = 'http://localhost:4173/?scene=newsheepdogland&mode=survival&autostart=1&perfMode=1';

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const logs = [];
page.on('console', (msg) => {
    const t = msg.text();
    if (t.includes('[FOLIAGE]') || t.includes('[TERRAIN]')) logs.push(t);
});
try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120000 });
    // Wait for streaming to complete (warmup + all waves + far-impostor enable).
    await page.waitForFunction(
        () => window.__sdsFoliageStreaming?.completedAt > 0,
        null, { timeout: 180000 },
    );
    await page.waitForTimeout(4000);

    const state = await page.evaluate(() => {
        const gi = window.gameInstance ?? window.__sds?.gameInstance ?? null;
        const tb = gi?.terrainBuilder ?? null;
        const ctrls = tb?._treeCullControllers ?? [];
        const registry = tb?._treeCullRegistry ?? null;
        const regSummary = [];
        if (registry) {
            for (const [type, entry] of registry) {
                regSummary.push({
                    type,
                    used: entry.used,
                    capacity: entry.capacity,
                    lod0Controllers: entry.lod0.length,
                    farActive: !!entry.far,
                    lod0Gates: entry.lod0.map((s) => s.controller.diag.lodEnabled),
                });
            }
        }
        return {
            controllerCount: ctrls.length,
            controllers: ctrls.map((c) => ({
                treeType: c.diag.treeType ?? null,
                meshName: c.diag.meshName ?? null,
                lodRole: c.diag.lodRole ?? null,
                lodDistance: c.diag.lodDistance ?? null,
                lodEnabled: c.diag.lodEnabled ?? null,
                used: c.diag.used,
                capacity: c.diag.capacity,
                error: c.diag.error,
            })),
            registry: regSummary,
            streaming: window.__sdsFoliageStreaming ? {
                planned: window.__sdsFoliageStreaming.planned,
                wavesDone: window.__sdsFoliageStreaming.wavesDone,
                totalStreamedTrees: window.__sdsFoliageStreaming.totalStreamedTrees,
                error: window.__sdsFoliageStreaming.error,
            } : null,
            coldCoverage: window.__sdsFoliageColdCoverage ? {
                trees: window.__sdsFoliageColdCoverage.trees,
                farImpostorTypes: window.__sdsFoliageColdCoverage.farImpostorTypes ?? null,
                error: window.__sdsFoliageColdCoverage.error,
            } : null,
        };
    });

    writeFileSync(resolve(OUT_DIR, 'lod-chain-state.json'), JSON.stringify(state, null, 2));
    console.log(JSON.stringify(state, null, 2));

    // Survey shots: default gameplay view, then a pulled-back far-silhouette view.
    await page.screenshot({ path: resolve(OUT_DIR, 'nsl-gameplay-view.png') });
    await page.evaluate(() => {
        const gi = window.gameInstance ?? window.__sds?.gameInstance ?? null;
        gi?.cameraController?.cycleMode?.();
    });
    await page.mouse.move(800, 450);
    await page.mouse.wheel(0, 2400); // zoom out for the far ring
    await page.waitForTimeout(1500);
    await page.screenshot({ path: resolve(OUT_DIR, 'nsl-far-silhouette.png') });

    writeFileSync(resolve(OUT_DIR, 'console-foliage.log'), logs.join('\n'));

    const pass = state.controllerCount <= 8
        && state.registry.every((r) => r.farActive && r.lod0Gates.every(Boolean))
        && state.controllers.every((c) => !c.error);
    console.log(`[LOD-CHAIN-PROBE] controllers=${state.controllerCount} (<=8: ${state.controllerCount <= 8}) `
        + `farActive=${state.registry.map((r) => `${r.type}:${r.farActive}`).join(',')} -> ${pass ? 'PASS' : 'FAIL'}`);
    process.exitCode = pass ? 0 : 1;
} finally {
    await page.close();
    await browser.close();
}
