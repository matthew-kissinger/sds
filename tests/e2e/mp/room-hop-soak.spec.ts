// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { test, expect, type Page } from '@playwright/test';

/**
 * [P3-SOAK] Room-hop / scene-swap memory soak.
 *
 * Validates the P3-LISTENER-AUDIT teardown work (commit 1859530): across
 * many in-process scene swaps the JS heap must not grow monotonically
 * beyond a bound. Drives window.__sdsSwapTo (the same in-page swap API
 * scene-swap-stability.spec.ts uses, installed by ?perfMode=1 via
 * js/boot/debugProbes.js) alternating field <-> rolling-hills, forces a
 * full GC via Playwright's page.requestGC() (CDP HeapProfiler.collectGarbage)
 * every cycle, and samples JSHeapUsedSize via CDP Performance.getMetrics.
 *
 * Heap-bound assertion: late-window average (last ~20% of cycles) vs
 * early-window average (cycles ~10-30%, after warmup). Bounds chosen from
 * a measured local run (2026-06-09, RTX 3070, dev server, 50 cycles in
 * 33s): initial post-boot heap 22.4 MB, early avg 29.6 MB, late avg
 * 30.8 MB, growth +1.2 MB (+4.2%). Per-scene heap oscillates ~3.5 MB
 * (field ~31-32 MB, rolling-hills ~27-29 MB) but each window averages an
 * equal mix of both scenes. Bound: fail when growth exceeds +25% of the
 * early average AND a 6 MB absolute noise floor. 25% (~7.5 MB here) is
 * 6x the measured window-to-window growth; the 6 MB floor (5x measured)
 * keeps small-heap jitter from tripping the relative bound. A real
 * per-swap leak (a retained scene graph per hop, the P3-LISTENER-AUDIT
 * leak class) accumulates tens of MB over 35 cycles and clears both.
 *
 * Scoping note (recorded per the phase doc): a literal multiplayer
 * room-hop (create/leave real rooms against wrangler) runs the existing
 * mp specs' ?testNoCanvas=1 path, which skips the 3D world entirely - it
 * would not exercise the scene-teardown leak class this task guards
 * (listeners, InstancedMesh GPU buffers, grass chunks). The scene-swap
 * soak drives the exact disposeScene/rebuild path the listener audit
 * fixed, so it is the right surface for the acceptance's intent.
 *
 * Iterations: SOAK_CYCLES env var, default 50 (the acceptance count).
 * Quick smoke: SOAK_CYCLES=10 npx playwright test --project=mp room-hop-soak
 *
 * @local-only - measured ~53s wall on a real GPU (RTX 3070), but on CI
 * swiftshader each rebuild costs ~90s (scene-swap-stability data), which
 * puts 50 cycles far past any sane CI budget. The deploy lane excludes
 * @local-only and also only runs --project=chromium (which testIgnores
 * mp/), so this never gates CI. Run locally after touching scene-swap,
 * dispose, or listener-registration code:
 *   npx playwright test --project=mp room-hop-soak
 */

const SOAK_CYCLES = Math.max(6, Number(process.env.SOAK_CYCLES ?? 50) || 50);

// Bounds (see header for the measured basis). Growth = lateAvg - earlyAvg.
// Fail only when BOTH trip: the relative bound is the detector, the
// absolute floor keeps small-heap jitter from tripping it.
const REL_GROWTH_BOUND = 0.25; // +25% over the early-window average
const ABS_GROWTH_FLOOR_MB = 6; // noise floor: 5x the measured +1.2 MB drift

const MB = 1024 * 1024;

async function seedIdentity(page: Page) {
  await page.context().addInitScript(() => {
    const identity = {
      persistentId: 'player_soak_' + Date.now(),
      displayName: 'Soak',
      fullName: 'Soak#0001',
      discriminator: '0001',
      nameType: 'custom',
      createdAt: Date.now(),
      isRegistered: false,
    };
    localStorage.setItem('playerIdentity', JSON.stringify(identity));
  });
}

// Same world-first entrance drive as scene-swap-stability.spec.ts: the
// entrance opens on Rolling Hills (Cycle 89 default); "Previous world" steps
// back to field, the cheapest scene to rebuild repeatedly.
async function bootSoloClassicOnField(page: Page) {
  await seedIdentity(page);
  await page.goto('/?perfMode=1', { waitUntil: 'domcontentloaded' });

  const play = page.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeVisible({ timeout: 30_000 });

  const prevBtn = page.getByRole('button', { name: /Previous world/i });
  await expect(prevBtn).toBeVisible({ timeout: 30_000 });
  await prevBtn.dispatchEvent('click');
  await page.waitForTimeout(200);

  const classic = page.getByRole('button', { name: /Classic\s+\d/i });
  await expect(classic).toBeVisible({ timeout: 15_000 });
  await classic.dispatchEvent('click');

  await expect(play).toBeVisible({ timeout: 15_000 });
  await play.dispatchEvent('click');

  await expect(page.locator('#canvas-container canvas')).toBeAttached({ timeout: 60_000 });
  await expect(async () => {
    const ready = await page.evaluate(() => typeof (window as any).__sdsSwapTo === 'function');
    expect(ready).toBe(true);
  }).toPass({ timeout: 150_000 });
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

test.describe('[P3-SOAK] scene-swap memory soak @local-only', () => {
  // Measured ~53s total on a real GPU; the ceiling covers a swiftshader
  // fallback (~90s/rebuild on CI-class hardware per scene-swap-stability).
  test.setTimeout(1_800_000);

  test(`heap stays bounded across ${SOAK_CYCLES} scene swaps @local-only`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'requestGC + CDP Performance.getMetrics are Chromium-only');

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');

    const sampleHeapMB = async (): Promise<number> => {
      // Two GC passes: the first can leave finalization work behind; the
      // second settles weak refs / FinalizationRegistry holds.
      await page.requestGC();
      await page.requestGC();
      const { metrics } = await cdp.send('Performance.getMetrics');
      const used = metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0;
      return used / MB;
    };

    await bootSoloClassicOnField(page);

    const initialMB = await sampleHeapMB();
    console.log(`[SOAK] post-boot heap: ${initialMB.toFixed(1)} MB (cycles=${SOAK_CYCLES})`);

    const samples: number[] = [];
    const t0 = Date.now();
    for (let i = 1; i <= SOAK_CYCLES; i++) {
      // Alternate the two cheapest scenes. Starting scene is field, so odd
      // cycles hop to rolling-hills, even cycles hop back.
      const target = i % 2 === 1 ? 'rolling-hills' : 'field';
      const landed = await page.evaluate(async (id) => {
        await (window as any).__sdsSwapTo(id);
        return (window as any).__sdsSwapProbe()?.scene ?? null;
      }, target);
      expect(landed, `cycle ${i} should land on ${target}`).toBe(target);

      // Let the post-swap frame settle before forcing GC, so transient
      // build allocations are not still referenced from the stack.
      await page.waitForTimeout(250);
      const heapMB = await sampleHeapMB();
      samples.push(heapMB);
      console.log(`[SOAK] cycle ${String(i).padStart(2)} -> ${target.padEnd(13)} heap=${heapMB.toFixed(1)} MB`);
    }
    const durationS = (Date.now() - t0) / 1000;

    // Early window: cycles in the 10-30% band (post-warmup; caches, shader
    // programs, and lazily-loaded chunks have stabilized). Late window: the
    // final 20%. For the default 50 cycles that is cycles 6-15 vs 41-50.
    const n = samples.length;
    const early = samples.slice(Math.floor(n * 0.1), Math.max(Math.floor(n * 0.3), Math.floor(n * 0.1) + 1));
    const late = samples.slice(Math.floor(n * 0.8));
    const earlyAvg = avg(early);
    const lateAvg = avg(late);
    const growthMB = lateAvg - earlyAvg;
    const growthPct = (growthMB / earlyAvg) * 100;

    console.log(
      `[SOAK] done in ${durationS.toFixed(0)}s | initial=${initialMB.toFixed(1)} MB ` +
      `earlyAvg=${earlyAvg.toFixed(1)} MB lateAvg=${lateAvg.toFixed(1)} MB ` +
      `growth=${growthMB >= 0 ? '+' : ''}${growthMB.toFixed(1)} MB (${growthPct.toFixed(1)}%)`,
    );

    const overRel = growthMB > earlyAvg * REL_GROWTH_BOUND;
    const overFloor = growthMB > ABS_GROWTH_FLOOR_MB;
    expect(
      overRel && overFloor,
      `heap grew ${growthMB.toFixed(1)} MB (${growthPct.toFixed(1)}%) from early-window avg ` +
      `${earlyAvg.toFixed(1)} MB to late-window avg ${lateAvg.toFixed(1)} MB across ${n} swaps; ` +
      `bound is >${REL_GROWTH_BOUND * 100}% with a >${ABS_GROWTH_FLOOR_MB} MB floor. ` +
      `Per-cycle series (MB): ${samples.map((s) => s.toFixed(0)).join(', ')}`,
    ).toBe(false);
  });
});
