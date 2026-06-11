// Cycle 91 Phase 2: canopy caster A/B - same frame with the shadow-only
// casters toggled on/off, so the canopy shadow contribution is isolated.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
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
    // Let waves land so trees stand near the camera, then freeze the day.
    await page.waitForTimeout(20000);
    await page.evaluate(() => {
        window.gameInstance.atmosphere?.dayNight?.setRunning?.(false);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(OUT_DIR, 'ab-canopy-on.png') });
    await page.evaluate(() => {
        for (const entry of window.gameInstance.terrainBuilder._treeCullRegistry.values()) {
            if (entry.shadowCaster) entry.shadowCaster.visible = false;
        }
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: resolve(OUT_DIR, 'ab-canopy-off.png') });
    await page.evaluate(() => {
        for (const entry of window.gameInstance.terrainBuilder._treeCullRegistry.values()) {
            if (entry.shadowCaster) entry.shadowCaster.visible = true;
        }
    });
    console.log('[CANOPY-AB] wrote ab-canopy-on/off.png');
} finally {
    await page.close();
    await browser.close();
}
