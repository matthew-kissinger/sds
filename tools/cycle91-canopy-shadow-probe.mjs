// Cycle 91 Phase 2: canopy shadow survey. Loads NSL, waits for streaming +
// the atlas-armed canopy casters, verifies the registry state (caster per
// type, layer mask on the sun shadow camera), and captures survey shots at
// the live ToD plus a golden-hour pin attempt. Probe hygiene: closes
// everything it opens.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = resolve(ROOT, 'cycle91-validation/canopy-shadow-probe');
mkdirSync(OUT_DIR, { recursive: true });

const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
const URL = 'http://localhost:4173/?scene=newsheepdogland&mode=survival&autostart=1&perfMode=1';

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 180000 });
    await page.waitForFunction(() => {
        const reg = window.gameInstance?.terrainBuilder?._treeCullRegistry;
        if (!reg || reg.size === 0) return false;
        for (const entry of reg.values()) if (!entry.shadowCaster) return false;
        return true;
    }, null, { timeout: 180000 });
    await page.waitForTimeout(3000);

    const state = await page.evaluate(() => {
        const gi = window.gameInstance;
        const tb = gi.terrainBuilder;
        const sun = gi.sceneManager?.webgpuSunLight ?? null;
        const reg = [];
        for (const [type, entry] of tb._treeCullRegistry) {
            reg.push({
                type,
                used: entry.used,
                casterCount: entry.shadowCaster?.count ?? null,
                casterLayerMask: entry.shadowCaster?.layers?.mask ?? null,
                casterCasts: entry.shadowCaster?.castShadow ?? null,
                farActive: !!entry.far,
            });
        }
        return {
            registry: reg,
            sunCasts: sun?.castShadow ?? null,
            shadowCamLayersMask: sun?.shadow?.camera?.layers?.mask ?? null,
            controllers: tb._treeCullControllers?.length ?? null,
        };
    });
    writeFileSync(resolve(OUT_DIR, 'canopy-state.json'), JSON.stringify(state, null, 2));
    console.log(JSON.stringify(state, null, 2));

    await page.screenshot({ path: resolve(OUT_DIR, 'nsl-live-tod.png') });

    // Golden-hour pin attempt (known flaky on probes; shots are advisory).
    await page.evaluate(() => {
        const gi = window.gameInstance;
        try {
            gi.atmosphere?.dayNight?.setRunning?.(false);
            gi.atmosphere?.setTimeOfDay?.(0.68);
        } catch { /* advisory */ }
    });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: resolve(OUT_DIR, 'nsl-golden-hour.png') });

    const pass = state.registry.length > 0
        && state.registry.every((r) => r.casterCount === r.used && r.casterCasts === true)
        && ((state.shadowCamLayersMask ?? 0) & 4) === 4;
    console.log(`[CANOPY-SHADOW-PROBE] ${pass ? 'PASS' : 'FAIL'}`);
    process.exitCode = pass ? 0 : 1;
} finally {
    await page.close();
    await browser.close();
}
