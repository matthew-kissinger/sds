// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * One-shot Playwright screenshot harness for empirical visual review.
 * Drives Chromium against the live (or local) build, starts a Solo
 * Classic round in each scene at two sun positions, and captures a
 * 1280x720 PNG for each. Output goes to tools/playtest/<timestamp>/.
 *
 * Usage:
 *   node tools/playtest-screenshots.mjs                       # live site
 *   node tools/playtest-screenshots.mjs --baseUrl=http://localhost:3000
 *   node tools/playtest-screenshots.mjs --headed               # visual debug
 *
 * Uses __sdsCinema API (Cycle 11+13) so we can:
 *   - skip the React UI (?ui=off + cinematic=1)
 *   - start a Solo Classic round (startSolo)
 *   - settle the flock (waitForFlockSize)
 *   - control time of day (setSun: 0.5 = noon, 0.06 = dusk)
 *   - position the camera (setCameraPose)
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
    const args = {
        baseUrl: 'https://sheepdogsim.com',
        headed: false,
        outDir: null
    };
    for (const a of argv.slice(2)) {
        if (a.startsWith('--baseUrl=')) args.baseUrl = a.slice('--baseUrl='.length);
        else if (a === '--headed') args.headed = true;
        else if (a.startsWith('--out=')) args.outDir = a.slice('--out='.length);
    }
    return args;
}

const SHOTS = [
    {
        id: 'field-noon',
        scene: 'field',
        sun: 0.50,
        // Behind-dog, low-altitude wide shot. World origin sits at the
        // dog spawn for Field's classic mode, so a camera 30m back +
        // 12m up looking down at a slight pitch reads as "behind-dog
        // overlook of the play area + far trees + horizon."
        camera: { pos: { x: 0, y: 12, z: 30 }, target: { x: 0, y: 2, z: -20 } }
    },
    {
        id: 'field-sunset',
        scene: 'field',
        sun: 0.08,
        camera: { pos: { x: 0, y: 12, z: 30 }, target: { x: 0, y: 2, z: -20 } }
    },
    {
        id: 'rh-noon',
        scene: 'rolling-hills',
        sun: 0.50,
        // Rolling Hills has terrain. 25m up + 40m back gives a pleasing
        // "cresting a hill, looking across the valley" composition.
        camera: { pos: { x: -50, y: 25, z: 40 }, target: { x: 0, y: 5, z: 0 } }
    },
    {
        id: 'rh-sunset',
        scene: 'rolling-hills',
        sun: 0.08,
        camera: { pos: { x: -50, y: 25, z: 40 }, target: { x: 0, y: 5, z: 0 } }
    },
    {
        id: 'oc-noon',
        scene: 'open-country',
        sun: 0.50,
        // Open Country is an island disc with a portal pillar. Higher
        // overlook to take in the disc + surrounding water.
        camera: { pos: { x: 0, y: 30, z: 80 }, target: { x: 0, y: 5, z: 0 } }
    },
    {
        id: 'oc-sunset',
        scene: 'open-country',
        sun: 0.08,
        camera: { pos: { x: 0, y: 30, z: 80 }, target: { x: 0, y: 5, z: 0 } }
    }
];

async function captureShot(page, shot, baseUrl) {
    const url = `${baseUrl}/?scene=${shot.scene}&ui=off&cinematic=1`;
    console.log(`[SHOT] ${shot.id} → ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

    // Wait for the cinema API to be wired up. The full init flow
    // (heightfield fetch + GLB parse + grass + trees + scatter +
    // ~28 MB of fence GLBs) can take 90–120s under headless Chromium
    // on a cold dev/preview server; give it 180s headroom.
    await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 180000 });

    // Stamp the parameters before kicking off Solo so the first
    // rendered frame already has correct sun + camera.
    await page.evaluate(async (s) => {
        const c = window.__sdsCinema;
        c.setSun(s.sun);
        c.setCameraPose(s.camera.pos, s.camera.target);
    }, shot);

    // Start Solo Classic with a representative dog. Default to Jep
    // since it's always loaded (model.critical=true).
    await page.evaluate(async () => {
        await window.__sdsCinema.startSolo('jep', 'classic');
    });

    // Wait for ready state: cinema flag indicates init complete.
    await page.evaluate(async () => {
        await window.__sdsCinema.waitReady(20000);
    });

    // Re-apply camera + sun after startSolo (which can reset both).
    await page.evaluate(async (s) => {
        const c = window.__sdsCinema;
        c.setSun(s.sun);
        c.setCameraPose(s.camera.pos, s.camera.target);
        // Hide any UI that may have re-mounted.
        if (typeof c.hideUI === 'function') c.hideUI();
    }, shot);

    // Settle: a couple of seconds for sheep boid distribution and for
    // the atmosphere to converge on the requested sun position.
    await page.waitForTimeout(2500);

    return shot;
}

async function main() {
    const args = parseArgs(process.argv);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outDir = args.outDir || resolve(ROOT, `tools/playtest/${stamp}`);
    mkdirSync(outDir, { recursive: true });
    console.log(`[PLAYTEST] base=${args.baseUrl}  out=${outDir}`);

    const browser = await chromium.launch({ headless: !args.headed });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1
    });
    const page = await context.newPage();
    page.on('pageerror', err => console.error('[PAGE ERROR]', err.message));
    page.on('console', msg => {
        const t = msg.type();
        if (t === 'error' || t === 'warning') console.log(`[PAGE ${t}]`, msg.text());
    });
    page.on('requestfailed', req => {
        // Surface failed network requests (heightfield, GLB, etc.)
        console.log(`[NET FAIL] ${req.method()} ${req.url()} :: ${req.failure()?.errorText || ''}`);
    });

    try {
        for (const shot of SHOTS) {
            try {
                await captureShot(page, shot, args.baseUrl);
                const path = resolve(outDir, `${shot.id}.png`);
                await page.screenshot({ path, type: 'png', fullPage: false });
                console.log(`[OK]   ${shot.id}.png`);
            } catch (err) {
                console.error(`[FAIL] ${shot.id}: ${err.message}`);
            }
        }
    } finally {
        await browser.close();
    }

    console.log(`\n[DONE] screenshots saved to ${outDir}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
