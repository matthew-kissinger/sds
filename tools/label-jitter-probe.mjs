// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// How still do the screen-anchored labels hold?
//
// Jitter is high-frequency positional noise, so the number that names it is
// the second difference of screen position: the frame-to-frame change in the
// frame-to-frame change. A label tracking a smooth camera has a small one. A
// label that holds still and then hops - because it is sampled slower than it
// is drawn, or because a transition keeps being retargeted - has a large one,
// and the owner sees that as the badge shivering.
//
//   node tools/label-jitter-probe.mjs --label=before
//   node tools/label-jitter-probe.mjs --label=after
//
// Both runs happen on this machine, so the comparison is like for like. The
// mobile case is reproduced with the repo's own mid-mobile CPU throttle rather
// than guessed at, because uneven frame pacing is the condition under which
// the defect is visible at all.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEED, launchBrowser, removeDir, repo, scratchDir,
  startPreviewServer, stopServer,
} from './probe-lib.mjs';
import { MID_MOBILE_PROFILE } from './playtest-profile-lib.mjs';

const label = process.argv.find((a) => a.startsWith('--label='))?.slice(8) ?? 'label-jitter';
if (!/^[a-z0-9_-]+$/i.test(label)) throw new Error('Invalid label');
const SAMPLE_FRAMES = 240;
// The repo's mid-mobile profile is the default. A faster workstation can sit
// under vsync even at 4x, in which case the throttle changes nothing that can
// be measured and the run says so in medianFrameMs; --cpu= raises it so the
// fix can be checked against frame pacing that is genuinely uneven.
const CPU_RATE = Number(process.argv.find((a) => a.startsWith('--cpu='))?.slice(6)
  ?? MID_MOBILE_PROFILE.cpuSlowdown);
if (!Number.isFinite(CPU_RATE) || CPU_RATE < 1 || CPU_RATE > 64) throw new Error('bad --cpu');

const output = join(repo, 'captures', 'jitter', label);
if (existsSync(output)) {
  throw new Error(`Capture already exists: ${output}. Use a fresh label to preserve evidence.`);
}
mkdirSync(output, { recursive: true });

/**
 * Record one element's translate3d for SAMPLE_FRAMES frames. Reading the
 * inline transform avoids getComputedStyle's matrix round-trip, and these
 * elements are written as translate3d by the code under test.
 */
async function sampleTransform(page, selector, frames) {
  return page.evaluate(
    ([sel, count]) => new Promise((resolve) => {
      const samples = [];
      // Both spellings, because the code under test is what changed: the cue
      // wrote a 2D translate before this work and a composited translate3d
      // after it, and a probe that only knew the new one would score the old
      // one as no samples rather than as the thing it is measuring.
      const parse = (node) => {
        const m = /translate(?:3d)?\(\s*([-\d.]+)px,\s*([-\d.]+)px/
          .exec(node?.style.transform ?? '');
        return m ? { x: Number.parseFloat(m[1]), y: Number.parseFloat(m[2]) } : null;
      };
      // A hard frame budget. Without it an element that never matches leaves
      // the rAF chain spinning and the run hangs instead of reporting.
      let waited = 0;
      const tick = (t) => {
        const node = document.querySelector(sel);
        const at = parse(node);
        const visible = !!node && !node.hidden && node.style.display !== 'none';
        if (at) samples.push({ t, x: at.x, y: at.y, visible });
        waited += 1;
        if (samples.length >= count || waited >= count * 4) resolve(samples);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }),
    [selector, frames],
  );
}

/** Mean absolute second difference, in CSS pixels per frame squared. */
function jerk(samples, axis) {
  const v = samples.map((s) => s[axis]);
  if (v.length < 3) return null;
  let total = 0;
  for (let i = 1; i < v.length - 1; i++) total += Math.abs(v[i + 1] - 2 * v[i] + v[i - 1]);
  return total / (v.length - 2);
}

/** How many frames did not move at all? A sampled-slower-than-drawn label
 *  holds still between its updates, and that shows up here before anywhere. */
function stalledFraction(samples) {
  let stalled = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].x === samples[i - 1].x && samples[i].y === samples[i - 1].y) stalled++;
  }
  return samples.length > 1 ? stalled / (samples.length - 1) : 0;
}

function summarise(name, samples) {
  // fewer than the requested frames means the element stopped being written,
  // not that it held perfectly still; the caller prints this alongside.

  const intervals = samples.slice(1).map((s, i) => s.t - samples[i].t).sort((a, b) => a - b);
  return {
    element: name,
    frames: samples.length,
    jerkX: jerk(samples, 'x'),
    jerkY: jerk(samples, 'y'),
    stalledFrames: stalledFraction(samples),
    medianFrameMs: intervals.length ? intervals[Math.floor(intervals.length / 2)] : null,
  };
}

const server = await startPreviewServer(5331);
const results = [];
let failure;
try {
  for (const mobile of [false, true]) {
    const profile = scratchDir(`jitter-${mobile ? 'mobile' : 'desktop'}`);
    let browser;
    try {
      browser = await launchBrowser(profile);
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1600, height: 900 },
      });
      await context.route('**/api/**', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'local-review', authSecret: 'local-review', entries: [],
          playerProfile: { persistentId: 'local-review', displayName: 'Review', fullName: 'Review' },
        }),
      }));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));

      if (mobile) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE });
      }

      // probe-lib's pressPlay first waits on a debug readout element the app
      // no longer renders, so this waits on the contract that is actually
      // observable: the title card is revealed only once the field has
      // compiled and presented a frame, which is the same gate Play is on.
      await page.goto(`http://localhost:5331/?seed=${SEED}`);
      await page.waitForSelector('canvas', { timeout: 60_000 });
      await page.waitForFunction(
        () => document.querySelector('.herd-boot')?.dataset.ready === 'true',
        null, { timeout: 120_000, polling: 100 },
      );
      const play = page.locator('.herd-title-actions > .herd-button--primary');
      await play.waitFor({ state: 'visible', timeout: 60_000 });
      await play.click();
      await page.waitForSelector('.herd-gate-cue', { state: 'attached' });

      // The cue is driven by the camera, so the camera has to be turning for
      // the whole sample and not merely before it. A run that turns first and
      // then samples a settled camera measures a stationary badge, which any
      // implementation holds still; the defect only exists while the projected
      // point is sweeping. Run and turn together, throughout.
      await page.keyboard.down('KeyW');
      await page.keyboard.down('KeyA');
      await page.waitForTimeout(600);
      const gate = await sampleTransform(page, '.herd-gate-cue', SAMPLE_FRAMES);
      await page.keyboard.up('KeyA');

      // The nameplate needs a pointer resting on an animal. Park the cursor at
      // the centre of the frame, where the flock sits on this seed, and keep
      // running so the animal under it is moving relative to the camera.
      const box = page.viewportSize();
      await page.mouse.move(box.width / 2, box.height / 2);
      await page.waitForTimeout(500);
      const plate = await sampleTransform(page, '#herd-nameplate-anchor', SAMPLE_FRAMES);
      await page.keyboard.up('KeyW');

      await page.screenshot({ path: join(output, `${mobile ? 'mobile' : 'desktop'}.png`) });
      assert.deepEqual(errors, [], `Page errors during ${mobile ? 'mobile' : 'desktop'} run`);

      results.push({
        case: mobile ? `mid-mobile (${CPU_RATE}x CPU, 390x844)` : 'desktop (1600x900)',
        gate: gate.length ? summarise('.herd-gate-cue', gate) : { element: '.herd-gate-cue', frames: 0 },
        nameplate: plate.length
          ? summarise('#herd-nameplate-anchor', plate)
          : { element: '#herd-nameplate-anchor', frames: 0, note: 'never anchored; no animal under the pointer' },
      });
    } finally {
      if (browser) await browser.close();
      removeDir(profile);
    }
  }
} catch (error) {
  failure = error;
} finally {
  stopServer(server);
}

const receipt = { label, sampleFrames: SAMPLE_FRAMES, cpuThrottleRate: CPU_RATE, results, failure: failure ? String(failure) : null };
writeFileSync(join(output, 'jitter.json'), `${JSON.stringify(receipt, null, 2)}\n`);

for (const r of results) {
  console.log(`\n${r.case}`);
  for (const part of [r.gate, r.nameplate]) {
    if (!part.frames) { console.log(`  ${part.element}: ${part.note ?? 'no samples'}`); continue; }
    console.log(
      `  ${part.element.padEnd(24)} jerk x ${part.jerkX.toFixed(3)} px  y ${part.jerkY.toFixed(3)} px`
      + `  stalled ${(part.stalledFrames * 100).toFixed(1)}%  frame ${part.medianFrameMs.toFixed(1)} ms`,
    );
  }
}
console.log(`\nReceipt: ${join('captures', 'jitter', label, 'jitter.json')}`);
if (failure) throw failure;
