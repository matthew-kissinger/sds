// Cycle 91 Phase 5: capture NSL cold-load time on the local preview. The
// [LOAD] stage summary is DEV-only, so this measures the comparable
// end-to-end proxy instead: performance.now() at first-interactive
// (isInitialized + flock spawned), fresh context per run. Run N times
// (default 3), print each + the median. Used for the pre/post Phase 5
// comparison (acceptance: post <= 85% of pre).
import { chromium } from 'playwright';

const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
const URL = 'http://localhost:4173/?scene=newsheepdogland&mode=survival&autostart=1';
const RUNS = Number(process.argv[2] ?? 3);
// --throttle: emulate a 20 Mbps / 30 ms-RTT connection via CDP so fetch
// sequencing differences (the Phase 5 target) actually show; the warm local
// preview serves everything in ~0ms otherwise.
const THROTTLE = process.argv.includes('--throttle');

const totals = [];
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
try {
    for (let i = 0; i < RUNS; i++) {
        const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
        const page = await context.newPage();
        if (THROTTLE) {
            const cdp = await context.newCDPSession(page);
            await cdp.send('Network.enable');
            await cdp.send('Network.emulateNetworkConditions', {
                offline: false,
                latency: 30,
                downloadThroughput: (20 * 1024 * 1024) / 8,
                uploadThroughput: (5 * 1024 * 1024) / 8,
            });
        }
        await page.goto(URL, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.gameInstance?.isInitialized
            && (window.gameInstance?.gameState?.sheep?.length ?? 0) > 0, null, { timeout: 180000 });
        const total = Math.round(await page.evaluate(() => performance.now()));
        totals.push(total);
        console.log(`run ${i + 1}: first-interactive at ${total}ms`);
        await page.close();
        await context.close();
    }
} finally {
    await browser.close();
}
const sorted = [...totals].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
console.log(JSON.stringify({ totals, medianMs: median }));
