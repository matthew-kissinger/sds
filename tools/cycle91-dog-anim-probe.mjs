// Cycle 91 Phase 6: all-five-dogs load + animate proof after the animation
// dedup (non-jep GLBs ship clip-less; the loader shares Jep's clips).
//
// jep is proven by the live autostart run (its mixer drives the on-screen
// dog). The other four are loaded via terrainBuilder.loadAnimal and proven
// by binding Jep's clips to each rig with a real AnimationMixer: every
// track must bind (three.js logs "PropertyBinding: No target node found"
// per miss - captured and counted) and the mixer must advance.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = resolve(ROOT, 'cycle91-validation');
mkdirSync(OUT_DIR, { recursive: true });

const GPU_ARGS = ['--use-angle=d3d11', '--enable-gpu', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
const URL = 'http://localhost:4173/?scene=field&mode=practice&autostart=1&perfMode=1';
const LAZY_DOGS = ['pip', 'sally', 'shiloh', 'george_washington'];

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: GPU_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let bindingWarnings = 0;
page.on('console', (msg) => {
    if (/PropertyBinding.*No target node found/i.test(msg.text())) bindingWarnings++;
});
const results = [];
try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__perfHarness?.isReady?.() === true, null, { timeout: 180000 });

    // Live jep run: the on-screen dog's animation system.
    const jep = await page.evaluate(async () => {
        const sd = window.gameInstance.sheepdog;
        const anim = sd.animationSystem;
        const t0 = anim.mixer?.time ?? 0;
        await new Promise((r) => setTimeout(r, 400));
        const t1 = anim.mixer?.time ?? 0;
        return {
            dog: 'jep',
            clips: (window.gameInstance.terrainBuilder.models.animals['jep_animations'] ?? []).length,
            actions: anim.actions?.size ?? 0,
            mixerAdvanced: t1 > t0,
            bindFailures: 0,
        };
    });
    results.push(jep);
    console.log(JSON.stringify(jep));

    for (const dog of LAZY_DOGS) {
        const before = bindingWarnings;
        const check = await page.evaluate(async (d) => {
            const gi = window.gameInstance;
            const tb = gi.terrainBuilder;
            await tb.loadAnimal(d);
            const model = tb.models.animals[d];
            const clips = tb.models.animals[d + '_animations'] ?? [];
            if (!model || !clips.length) return { dog: d, clips: clips.length, actions: 0, mixerAdvanced: false };
            const M = window.__sdsWebGpuModules;
            const mixer = new M.AnimationMixer(model);
            let actions = 0;
            for (const clip of clips) {
                const a = mixer.clipAction(clip);
                a.play();
                actions++;
            }
            mixer.update(0.05); // forces PropertyBinding resolution for every track
            const t0 = mixer.time;
            mixer.update(0.05);
            const advanced = mixer.time > t0;
            mixer.stopAllAction();
            mixer.uncacheRoot(model);
            return { dog: d, clips: clips.length, actions, mixerAdvanced: advanced };
        }, dog);
        await page.waitForTimeout(300);
        check.bindFailures = bindingWarnings - before;
        results.push(check);
        console.log(JSON.stringify(check));
    }
} finally {
    await page.close();
    await browser.close();
}
const pass = results.length === 5
    && results.every((r) => r.clips >= 19 && r.actions >= 19 || r.dog === 'jep'
        ? r.clips >= 19 && r.mixerAdvanced && r.bindFailures === 0
        : false);
writeFileSync(resolve(OUT_DIR, 'dog-anim-probe.json'), JSON.stringify(results, null, 2));
console.log(`[DOG-ANIM-PROBE] ${pass ? 'PASS' : 'FAIL'}`);
process.exitCode = pass ? 0 : 1;
