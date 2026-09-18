// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Does a held thumb still steer, on a phone-shaped viewport.
 *
 * The movement basis used to be frozen for the length of a hold, so holding one
 * screen direction turned the dog once and then ran it in a straight line. It
 * now tracks the Follow bearing, and the ceiling on how fast a held direction
 * curves is the Follow turning rate, because that bearing is the only thing
 * being chased. Both halves of that need measuring rather than asserting, and
 * on touch rather than on a keyboard: the thumb is the device this change is
 * for, and portrait is the framing it happens under.
 *
 * So: hold the stick at one screen direction, sample the dog's heading every
 * frame, and report the rate it turns at and the total it covers. A frozen
 * basis reads as a rate that decays to zero and a total near one corner. A
 * tracking basis reads as a rate that SETTLES at the turning ceiling. An
 * unbounded loop - the failure this whole change risks reintroducing - reads as
 * a rate above that ceiling, which is the thing worth catching.
 *
 * Emulation, not a handset: trusted CDP touch on desktop Chromium at a phone
 * viewport. It is evidence about the control law and the portrait framing, and
 * it is not performance evidence or a substitute for a physical device.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, removeDir, repo, scratchDir } from './probe-lib.mjs';
import { STICK_RADIUS, createStick } from './touch-stick.mjs';

const urlArg = process.argv.find((arg) => arg.startsWith('--url='));
const url = urlArg?.slice('--url='.length) ?? 'http://localhost:4173/';
const turningArg = process.argv.find((arg) => arg.startsWith('--turning='));
const turning = turningArg?.slice('--turning='.length) ?? 'gentle';
// Emulates the OS-level setting, not the in-game toggle. A phone with Reduce
// motion on reaches the rig through `prefers-reduced-motion`, and seeding the
// stored value cannot stand in for it: the store only honours a stored value
// once the player has CHOSEN one, and falls back to the query otherwise.
const reduced = process.argv.includes('--reduced');

const outputDir = join(repo, 'captures', 'mobile-steering');
mkdirSync(outputDir, { recursive: true });
const profile = scratchDir('sds-mobile-steering');
const DEG = 180 / Math.PI;

const report = {
  turning,
  reduced,
  viewport: { width: 390, height: 844 },
  errors: [],
  limitation: 'Trusted CDP touch on desktop Chromium at a phone viewport.'
    + ' Control-law and portrait-framing evidence only: not a physical handset,'
    + ' and not performance evidence.',
};

let browser;
let context;
try {
  browser = await launchBrowser(profile);
  context = await browser.newContext({
    ...(reduced ? { reducedMotion: 'reduce' } : {}),
    viewport: report.viewport,
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.route('**/api/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"entries":[]}' }));

  await page.addInitScript(([followTurning]) => {
    localStorage.setItem('herd.settings.v1', JSON.stringify({
      quality: 'low', followTurning, reduceMotion: false,
    }));
    const roots = new Map();
    let id = 0;
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      inject: () => ++id,
      onCommitFiberRoot: (rootId, root) => roots.set(rootId, root),
      onCommitFiberUnmount: () => {},
    };
    globalThis.__steerDog = () => {
      for (const root of roots.values()) {
        const stack = [root.current];
        while (stack.length) {
          const fiber = stack.pop();
          for (let hook = fiber.memoizedState; hook; hook = hook.next) {
            const sim = hook.memoizedState;
            if (sim?.state?.sheep && sim?.dogPositions) {
              const dog = sim.state.dogs[0];
              return {
                x: dog.position.x,
                z: dog.position.z,
                vx: dog.velocity.x,
                vz: dog.velocity.z,
              };
            }
          }
          if (fiber.child) stack.push(fiber.child);
          if (fiber.sibling) stack.push(fiber.sibling);
        }
      }
      throw new Error('Live sim not found');
    };
  }, [turning]);

  await page.goto(`${url}?seed=20260918&debug=webgl`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('.herd-app[data-ready="true"]').waitFor({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(1200);

  // Enter Follow. The turning row only governs the Follow rig, and the basis
  // only tracks a bearing that is moving, so Classic would measure nothing.
  await page.getByRole('button', { name: /camera/i }).first().click().catch(() => {});
  await page.waitForTimeout(1400);

  const sample = () => page.evaluate(() => globalThis.__steerDog());
  const cdp = await context.newCDPSession(page);
  const stick = createStick(80, 660);

  // Run straight first, so the bearing is settled and the turn that follows is
  // the hold's own rather than the arrival of the first input.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: stick.origin.x, y: stick.origin.y, id: 1 }] });
  const up = stick.push(0, -STICK_RADIUS);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...up, id: 1 }] });
  await page.waitForTimeout(2500);

  // One screen direction, held. Left, at full deflection, and never moved
  // again: every degree the dog turns from here is the basis tracking, because
  // the thumb contributes nothing new.
  const left = stick.push(-STICK_RADIUS, 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...left, id: 1 }] });

  const track = [];
  const started = Date.now();
  let previous = await sample();
  let elapsed = 0;
  let total = 0;
  while (elapsed < 8000) {
    await page.waitForTimeout(100);
    const now = await sample();
    const at = Date.now() - started;
    const dt = (at - elapsed) / 1000;
    const a = Math.atan2(previous.vx, previous.vz);
    const b = Math.atan2(now.vx, now.vz);
    let delta = b - a;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    else if (delta < -Math.PI) delta += 2 * Math.PI;
    const speed = Math.hypot(now.vx, now.vz);
    if (speed > 1 && dt > 0) {
      total += Math.abs(delta);
      track.push({ t: +(at / 1000).toFixed(3), rate: +(Math.abs(delta) / dt * DEG).toFixed(3) });
    }
    previous = now;
    elapsed = at;
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  // The second half of the hold is the settled behaviour: the first is the dog
  // swinging onto the new screen direction, which is not what is being asked.
  const settled = track.filter((s) => s.t >= 4);
  report.samples = track.length;
  report.totalTurnedDeg = +(total * DEG).toFixed(2);
  report.peakRateDeg = +Math.max(...track.map((s) => s.rate)).toFixed(3);
  report.settledRateDeg = +(settled.reduce((sum, s) => sum + s.rate, 0) / settled.length).toFixed(3);
  report.stillTurningAtEnd = settled.slice(-8).every((s) => s.rate > 1);
  await page.screenshot({ path: join(outputDir, `portrait-${turning}-held-turn.png`) });
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  removeDir(profile);
}

writeFileSync(join(outputDir, `steering-${turning}.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
