// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 123 Phase 3: Home Field gets an evening, and D25 closes.
 *
 * Cycle 115 built the dusk lamp and bound it to the one public scene with no
 * day loop, so its ramp has been correct and unreachable ever since. This
 * captures the round AND the entrance backdrop at several times of day, and
 * reads `emissiveIntensity` off the live material rather than trusting that
 * the ramp fires.
 *
 * Requires a dev server on :3000. Genuine WebGPU via headed Chrome; the
 * Cycle 103 lesson is that headless has no navigator.gpu and silently demotes.
 *
 *   node tools/validation/home-field-evening.mjs --out=cycle123-validation
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = 'http://localhost:3000/';
const LAUNCH_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];

function parseArgs(argv) {
    const out = {};
    for (const a of argv.slice(2)) {
        const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
        if (m) out[m[1]] = m[2] ?? true;
    }
    return out;
}

const args = parseArgs(process.argv);
const OUT = String(args.out || 'cycle123-validation');
const TIMES = [
    { t: 0.5, label: 'noon' },
    { t: 0.75, label: 'sundown' },
    { t: 0.78, label: 'dusk' },
    { t: 0.85, label: 'night' }
];

/** Read the dusk lamp's live emissive intensity, plus the grass factor. */
const probe = async (page) => page.evaluate(async () => {
    const cinema = window.__sdsCinema;
    const rig = window.__sds?.sceneManager?.sceneLightingRig ?? null;
    const mod = await import('/js/world/grassLighting.js');
    const lights = mod.lightsFromRig(rig);

    // The dusk lamps are the materials Atmosphere ramps; read them off the
    // scene rather than off a cached list, so this measures what is drawn.
    let lampPeak = null;
    let lampLive = null;
    cinema?.scene?.traverse?.((o) => {
        const m = o.material;
        const mats = Array.isArray(m) ? m : (m ? [m] : []);
        for (const mat of mats) {
            const peak = mat?.userData?.duskLampPeakIntensity;
            if (Number.isFinite(peak)) {
                lampPeak = peak;
                lampLive = mat.emissiveIntensity;
            }
        }
    });

    return {
        sunIntensity: rig?.sun?.intensity ?? null,
        elevationDeg: cinema?.atmosphere?.sun?.getElevation
            ? (cinema.atmosphere.sun.getElevation() * 180) / Math.PI
            : null,
        daylight: lights?.daylight ?? null,
        grassFactor: lights ? mod.grassLightFactor(lights).g : null,
        lampPeak,
        lampLive
    };
});

async function main() {
    mkdirSync(OUT, { recursive: true });
    mkdirSync(join(OUT, 'browser'), { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: LAUNCH_ARGS });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const rows = [];

    try {
        // Two surfaces: the ROUND (cinematic, ui off) and the ENTRANCE, which
        // renders the same live scene behind its panel. Phase 3 moved both,
        // because DEFAULT_SCENE_ID is `field`.
        for (const surface of ['round', 'entrance']) {
            for (const { t, label } of TIMES) {
                const url = new URL(BASE_URL);
                url.searchParams.set('cinematic', '1');
                url.searchParams.set('probeRender', '1');
                url.searchParams.set('renderer', 'webgpu');
                url.searchParams.set('scene', 'field');
                url.searchParams.set('sun', String(t));
                if (surface === 'round') url.searchParams.set('ui', 'off');

                await page.goto(url.toString(), { waitUntil: 'load', timeout: 90_000 });
                await page.waitForFunction(() => !!window.__sdsCinema, null, { timeout: 60_000 });
                await page.evaluate(() => window.__sdsCinema.waitReady(90_000));

                if (surface === 'round') {
                    await page.evaluate(() => {
                        window.__sdsCinema.pauseSimulation();
                        window.__sdsCinema.startSolo('jep', 'classic');
                    });
                }
                await page.evaluate((tt) => {
                    window.__sdsCinema.setSun(tt);
                    window.__sdsCinema.pauseSimulation();
                }, t);
                await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

                const engaged = await page.evaluate(() => !!navigator.gpu);
                const sample = await probe(page);
                const file = join(OUT, 'browser', `field-${surface}__${label}.png`);
                await page.screenshot({ path: file });

                rows.push({ surface, t, label, webgpu: engaged, ...sample });
                console.log(
                    `${surface.padEnd(9)} ${label.padEnd(8)} t=${String(t).padEnd(5)} ` +
                    `elev=${String((sample.elevationDeg ?? NaN).toFixed(1)).padStart(6)}deg  ` +
                    `gate=${sample.daylight === null ? ' n/a' : sample.daylight.toFixed(3)}  ` +
                    `grass=${sample.grassFactor === null ? ' n/a' : sample.grassFactor.toFixed(4)}  ` +
                    `lamp=${sample.lampLive === null ? 'not found' : sample.lampLive.toFixed(4)}` +
                    `${sample.lampPeak === null ? '' : ` / peak ${sample.lampPeak}`}`
                );
            }
        }
    } finally {
        await page.close();
        await context.close();
        await browser.close();
    }

    writeFileSync(join(OUT, 'home-field-evening.json'), JSON.stringify({ rows }, null, 2) + '\n', 'utf8');
    console.log(`\nwrote ${join(OUT, 'home-field-evening.json')}`);

    const lampNoon = rows.find((r) => r.surface === 'round' && r.label === 'noon')?.lampLive;
    const lampNight = rows.find((r) => r.surface === 'round' && r.label === 'night')?.lampLive;
    console.log(`D25: dusk lamp noon=${lampNoon} night=${lampNight}` +
        (Number.isFinite(lampNight) && Number.isFinite(lampNoon) && lampNight > lampNoon
            ? '  -> LAMP FIRES'
            : '  -> LAMP DID NOT FIRE'));
}

main().catch((err) => {
    console.error(err);
    process.exit(2);
});
