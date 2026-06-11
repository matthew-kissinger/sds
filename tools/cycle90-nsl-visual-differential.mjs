// SPDX-License-Identifier: AGPL-3.0-or-later
// Cycle 90: NSL zero-visual-change differential for the batched compute-cull fix.
//
// The durable golden matrix (tools/validation/screenshot-golden.mjs) has no NSL
// cells and its goldens are stale (BACKLOG), so this probe captures a small NSL
// matrix against the local preview build and SSIM-compares two capture dirs.
// Method (mirrors the Cycle 89 differential): capture HEAD twice for a noise
// floor (the survival flock wanders during load, so identical builds never
// score 1.0), then capture main HEAD; the fix is visually clean when
// head-vs-main lands within the head-vs-head noise floor.
//
// Usage:
//   node tools/cycle90-nsl-visual-differential.mjs capture --outdir=cycle90-validation/visdiff/head
//   node tools/cycle90-nsl-visual-differential.mjs compare --a=...head --b=...main
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = 'http://localhost:4173/';
const VIEWPORT = { width: 1280, height: 720 };
const COMPARE = { width: 320, height: 180 };
const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--no-sandbox'];

const CELLS = [
    { id: 'nsl__sun05__classic__zoom60', sun: 0.5, camera: 'classic', zoom: 60 },
    { id: 'nsl__sun05__follow__zoom25', sun: 0.5, camera: 'follow', zoom: 25 },
    { id: 'nsl__sun085__classic__zoom60', sun: 0.85, camera: 'classic', zoom: 60 },
];

function parseArgs(argv) {
    const args = { mode: argv[2] ?? 'capture' };
    for (const a of argv.slice(3)) {
        const m = a.match(/^--([a-z]+)=(.*)$/);
        if (m) args[m[1]] = m[2];
    }
    return args;
}

async function captureCell(browser, cell) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    try {
        const url = new URL(BASE_URL);
        url.searchParams.set('scene', 'newsheepdogland');
        url.searchParams.set('mode', 'survival');
        url.searchParams.set('autostart', '1');
        url.searchParams.set('cinematic', '1');
        url.searchParams.set('perfMode', '1');
        url.searchParams.set('visualGolden', '1');
        url.searchParams.set('ui', 'off');
        await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 90_000 });
        await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 120_000 });
        await page.waitForFunction(() => (window.__sdsFoliageStreaming?.completedAt ?? 0) > 0, null, { timeout: 120_000 });
        await page.evaluate(({ sun, camera, zoom }) => {
            const cinema = window.__sdsCinema;
            cinema.pauseSimulation();
            cinema.setSun(sun);
            cinema.setCameraMode?.(camera);
            cinema.setCameraZoom?.(zoom);
            const dog = cinema?.gameState?.getSheepdog?.();
            for (let i = 0; i < 120; i++) window.__sds?.sceneManager?.updateCamera?.(dog, 1 / 60);
        }, cell);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const dataUrl = await page.evaluate(() => {
            const canvas = document.querySelector('#canvas-container canvas') ?? document.querySelector('canvas');
            if (!canvas) throw new Error('game canvas not found');
            return canvas.toDataURL('image/png');
        });
        return Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
    } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
    }
}

async function decode(buf) {
    const sharp = (await import('sharp')).default;
    return sharp(buf).resize(COMPARE.width, COMPARE.height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
}

function ssimLuma(a, b, w, h) {
    const n = w * h;
    const la = new Float64Array(n);
    const lb = new Float64Array(n);
    let muA = 0; let muB = 0;
    for (let i = 0; i < n; i++) {
        la[i] = 0.299 * a[i * 4] + 0.587 * a[i * 4 + 1] + 0.114 * a[i * 4 + 2];
        lb[i] = 0.299 * b[i * 4] + 0.587 * b[i * 4 + 1] + 0.114 * b[i * 4 + 2];
        muA += la[i]; muB += lb[i];
    }
    muA /= n; muB /= n;
    let sigA2 = 0; let sigB2 = 0; let sigAB = 0;
    for (let i = 0; i < n; i++) {
        const da = la[i] - muA; const db = lb[i] - muB;
        sigA2 += da * da; sigB2 += db * db; sigAB += da * db;
    }
    sigA2 /= n; sigB2 /= n; sigAB /= n;
    const C1 = (0.01 * 255) ** 2;
    const C2 = (0.03 * 255) ** 2;
    return ((2 * muA * muB + C1) * (2 * sigAB + C2))
        / ((muA * muA + muB * muB + C1) * (sigA2 + sigB2 + C2));
}

const args = parseArgs(process.argv);
if (args.mode === 'capture') {
    const outdir = resolve(ROOT, args.outdir ?? 'cycle90-validation/visdiff/out');
    await mkdir(outdir, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', args: GPU_ARGS });
    try {
        for (const cell of CELLS) {
            console.log(`[C90-VISDIFF] capturing ${cell.id}`);
            const png = await captureCell(browser, cell);
            await writeFile(resolve(outdir, `${cell.id}.png`), png);
        }
    } finally {
        await browser.close().catch(() => {});
    }
    console.log(`[C90-VISDIFF] wrote ${CELLS.length} captures to ${outdir}`);
} else if (args.mode === 'compare') {
    const dirA = resolve(ROOT, args.a);
    const dirB = resolve(ROOT, args.b);
    const results = [];
    for (const cell of CELLS) {
        const a = await decode(await readFile(resolve(dirA, `${cell.id}.png`)));
        const b = await decode(await readFile(resolve(dirB, `${cell.id}.png`)));
        const score = ssimLuma(a, b, COMPARE.width, COMPARE.height);
        results.push({ id: cell.id, ssim: Number(score.toFixed(4)) });
        console.log(`[C90-VISDIFF] ${cell.id} ssim=${score.toFixed(4)}`);
    }
    console.log(JSON.stringify({ a: args.a, b: args.b, results }, null, 2));
} else {
    console.error('usage: capture --outdir=DIR | compare --a=DIR --b=DIR');
    process.exit(2);
}
