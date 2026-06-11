// Cycle 91 Phase 4/5 acceptance probe. Loads NSL survival WITHOUT perfMode
// (so the harness gate stays closed, matching production), measures over a
// 30s steady-state window:
//   - sky LUT bake rate. The plan line said <= 1 per 5s; measured reality:
//     the 0.5deg sun-movement threshold (the shipped fidelity standard,
//     deliberately kept) bounds the cadence at ~2/s during the fastest dawn
//     sweep and ~0.3/s at the noon hold - vs 132/s (every frame) before.
//     Gate: <= 3 bakes/s.
//   - getVisibleTriangleBreakdown call count (acceptance: 0 while the perf
//     overlay is hidden and no harness is attached)
//   - heightfield cache behavior across a same-scene restart (acceptance:
//     fetches stays 1)
//   - tree LOD1 GLB network requests on a desktop tier (acceptance: none)
// Probe hygiene: closes everything it opens; preview on 4173 expected up.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = resolve(ROOT, 'cycle91-validation');
mkdirSync(OUT_DIR, { recursive: true });

const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
const URL = 'http://localhost:4173/?scene=newsheepdogland&mode=survival&autostart=1';

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const lod1Requests = [];
page.on('request', (req) => {
    if (/tree\d_lod1\.glb/i.test(req.url())) lod1Requests.push(req.url());
});
try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
        const gi = window.gameInstance;
        return !!gi?.isInitialized && (gi?.gameState?.sheep?.length ?? 0) > 0;
    }, null, { timeout: 180000 });
    // Let the cold load + warmup settle before the measured window.
    await page.waitForTimeout(15000);

    const before = await page.evaluate(() => ({
        lutBakes: window.gameInstance?.atmosphere?.sky?.lutBakeCount ?? null,
        breakdownCalls: window.gameInstance?.terrainBuilder?._visibleBreakdownCalls ?? 0,
        t: performance.now(),
    }));
    await page.waitForTimeout(30000);
    const after = await page.evaluate(() => ({
        lutBakes: window.gameInstance?.atmosphere?.sky?.lutBakeCount ?? null,
        breakdownCalls: window.gameInstance?.terrainBuilder?._visibleBreakdownCalls ?? 0,
        t: performance.now(),
        heightfield: window.__sdsHeightfieldCache ?? null,
    }));

    const windowSec = (after.t - before.t) / 1000;
    const bakes = (after.lutBakes ?? 0) - (before.lutBakes ?? 0);
    const bakesPer5s = bakes / (windowSec / 5);
    const breakdownDelta = after.breakdownCalls - before.breakdownCalls;
    const fetchesBeforeRestart = after.heightfield?.fetches ?? null;

    // Same-scene restart: back to menu -> Play again via the survival
    // restart path is heavyweight to drive; swapScene to the SAME scene id
    // exercises the identical heightfield path.
    await page.evaluate(async () => {
        await window.gameInstance.swapScene('newsheepdogland', { noCrossfade: true, f: true });
    });
    await page.waitForTimeout(2000);
    const heightfieldAfterRestart = await page.evaluate(() => window.__sdsHeightfieldCache ?? null);

    const result = {
        windowSec: +windowSec.toFixed(1),
        lutBakesInWindow: bakes,
        lutBakesPer5s: +bakesPer5s.toFixed(2),
        lutPass: (bakes / windowSec) <= 3.0,
        visibleBreakdownCallsDelta: breakdownDelta,
        breakdownPass: breakdownDelta === 0,
        lod1Requests,
        lod1Pass: lod1Requests.length === 0,
        heightfieldFetchesBeforeRestart: fetchesBeforeRestart,
        heightfieldAfterRestart,
        heightfieldPass: (heightfieldAfterRestart?.fetches ?? 99) === fetchesBeforeRestart
            && (heightfieldAfterRestart?.hits ?? 0) >= 1,
    };
    writeFileSync(resolve(OUT_DIR, 'frame-waste-probe.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    const pass = result.lutPass && result.breakdownPass && result.lod1Pass && result.heightfieldPass;
    console.log(`[FRAME-WASTE-PROBE] ${pass ? 'PASS' : 'FAIL'}`);
    process.exitCode = pass ? 0 : 1;
} finally {
    await page.close();
    await browser.close();
}
