// Cycle 91 Phase 7: wolf survey capture via the standalone ?wolf=1 harness.
// Usage: node tools/cycle91-wolf-capture.mjs <outName.png>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = resolve(ROOT, 'cycle91-validation/asset-survey');
mkdirSync(OUT_DIR, { recursive: true });
const outName = process.argv[2] ?? 'wolf.png';

const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
try {
    await page.goto('http://localhost:4173/?wolf=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__wolfHarness?.ready === true, null, { timeout: 120000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: resolve(OUT_DIR, outName) });
    console.log(`[WOLF-CAPTURE] wrote ${outName}`);
} finally {
    await page.close();
    await browser.close();
}
