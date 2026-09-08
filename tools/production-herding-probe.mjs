// SPDX-License-Identifier: AGPL-3.0-or-later
// Read the production sim via React's tools hook; send ordinary touch/keyboard
// input. Never mutate sim, advance its clock, or inject completion state.
import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, startPreviewServer, stopServer } from './probe-lib.mjs';
import { collectBuildReceipt, sameBuildReceipt } from './playtest-profile-receipt.mjs';
const flock = Number(process.argv.find(x => x.startsWith('--flock='))?.slice(8) ?? 25);
const scoreUnavailable = process.argv.includes('--score-unavailable');
const submissionUnavailable = process.argv.includes('--submission-unavailable');
const nearComplete = process.argv.includes('--near-complete');
if (scoreUnavailable && submissionUnavailable) throw new Error('Select one outage scenario');
if (![25, 75, 200].includes(flock)) throw new Error('Invalid flock');
const label = process.argv.find(x => x.startsWith('--label='))?.slice(8) ?? `production-herding${flock === 25 ? '' : `-${flock}`}`;
if (!/^[\w-]+$/.test(label)) throw new Error('Invalid label');
const out = join(repo, 'captures/stability', label);
mkdirSync(out, { recursive: true });
const driver = buildSync({ entryPoints: [join(repo, 'tests/helpers/herding-driver.ts')], bundle: true, write: false, format: 'iife', globalName: 'herdingDriver' }).outputFiles[0].text;
const cap = Number(process.argv.find(x => x.startsWith('--seconds='))?.slice(10) ?? 600);
if (!Number.isFinite(cap) || cap <= 0) throw new Error('Invalid duration');
let server; let browser; let failure; let cdp;
const report = { before: collectBuildReceipt(repo), flock, scoreUnavailable, submissionUnavailable, apiRequests: [], samples: [], errors: [], completed: false, limitation: 'Production functional herding, read-only sim observation, automated touch movement plus keyboard sprint. Not a physical-mobile or performance receipt.' };
try {
  server = await startPreviewServer(5364);
  browser = await chromium.launch({ channel: 'chrome', headless: false });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  page.on('pageerror', e => report.errors.push(String(e)));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const unavailable = scoreUnavailable || (submissionUnavailable && path === '/api/score');
    report.apiRequests.push({ path, method: route.request().method(), status: unavailable ? 503 : 200,
      ...(path === '/api/score' ? { payload: route.request().postDataJSON() } : {}) });
    return route.fulfill({ status: unavailable ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(unavailable ? { error: 'Probe service unavailable' } : { entries: [], token: 'probe', authSecret: 'probe', playerProfile: { persistentId: 'probe', displayName: 'Probe', fullName: 'Probe' } }) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('herd.settings.v1', JSON.stringify({ quality: 'low' }));
    const roots = new Map(); let id = 0;
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, inject: () => ++id,
      onCommitFiberRoot: (id, root) => roots.set(id, root), onCommitFiberUnmount: () => {} };
    globalThis.__findHerdingSim = () => {
      for (const root of roots.values()) {
        const stack = [root.current];
        while (stack.length) {
          const fiber = stack.pop();
          for (let hook = fiber.memoizedState; hook; hook = hook.next) {
            const value = hook.memoizedState;
            if (value?.state?.sheep && value?.dogPositions) return value;
          }
          if (fiber.child) stack.push(fiber.child);
          if (fiber.sibling) stack.push(fiber.sibling);
        }
      }
      throw new Error('Live sim not found in committed React hooks');
    };
  });
  await page.goto('http://localhost:5364/?seed=20260821&debug=webgl');
  await page.locator('.herd-app[data-ready="true"]').waitFor({ timeout: 60000 });
  await page.locator('.herd-size').filter({ hasText: String(flock) }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.addScriptTag({ content: driver });
  await page.evaluate(() => {
    globalThis.__herdingSim = globalThis.__findHerdingSim();
    const config = { ...herdingDriver.DEFAULT_DRIVER };
    const drive = herdingDriver.createHerdingDriver(config);
    globalThis.__herdingInput = state => {
      const active = state.sheep.filter(s => s.state === 'active').length;
      config.arcRadius = active > 25 ? 48 : 14;
      config.maxSpread = active > 25 ? 48 : 16;
      return drive(state);
    };
  });
  if (nearComplete) {
    report.limitation = 'Owner-approved tools-only near-completion fixture; synthetic elapsed time and all but one sheep penned. Normal final gate crossing, completion and requests; all API traffic mocked. Not full-run, live-score or performance proof.';
    report.fixture = await page.evaluate(() => {
      const state = globalThis.__herdingSim.state;
      state.tick = 6000;
      state.completed = false;
      state.pennedCount = state.sheep.length - 1;
      state.sheep.forEach((sheep, index) => {
        sheep.velocity.x = 0; sheep.velocity.z = 0;
        sheep.acceleration.x = 0; sheep.acceleration.z = 0;
        sheep.state = index === 0 ? 'active' : 'penned';
        sheep.position.x = index === 0 ? 0 : -24 + (index % 24) * 2;
        sheep.position.z = index === 0 ? 99.5 : 110 + Math.floor(index / 24) * 2;
      });
      state.sheep[0].velocity.z = 0.06;
      state.dogs[0].position.x = 0; state.dogs[0].position.z = 94;
      state.dogs[0].velocity.x = 0; state.dogs[0].velocity.z = 0;
      return { tick: state.tick, count: state.sheep.length, penned: state.pennedCount, completed: state.completed, lastSheep: { ...state.sheep[0].position } };
    });
  }
  cdp = await page.context().newCDPSession(page);
  const origin = { x: 110, y: 660 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...origin, id: 1 }] });
  const start = Date.now(); let sprint = false; let nextSample = 0;
  while (Date.now() - start < cap * 1000) {
    const value = await page.evaluate(() => {
      const state = globalThis.__herdingSim.state;
      return { input: globalThis.__herdingInput(state), tick: state.tick, penned: state.pennedCount, completed: state.completed, dog: { x: state.dogs[0].position.x, z: state.dogs[0].position.z }, phase: document.querySelector('.herd-app').dataset.phase };
    });
    if (Date.now() >= nextSample || value.completed) {
      report.samples.push({ elapsed: (Date.now() - start) / 1000, ...value });
      writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report.samples.at(-1)));
      nextSample = Date.now() + 15000;
    }
    if (value.completed && value.phase === 'complete') { report.completed = true; break; }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: origin.x - value.input.direction.x * 56, y: origin.y - value.input.direction.z * 56, id: 1 }] });
    if (sprint !== value.input.sprint) { sprint = value.input.sprint; await page.keyboard[sprint ? 'down' : 'up']('ShiftLeft'); }
    await page.waitForTimeout(100);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.keyboard.up('ShiftLeft');
  await page.screenshot({ path: join(out, report.completed ? 'completed.png' : 'unfinished.png') });
  if (report.completed) {
    if (scoreUnavailable || submissionUnavailable) await page.getByText('Your local time is safe. The online board is unavailable.').waitFor({ timeout: 15000 });
    if (submissionUnavailable && !report.apiRequests.some(request => request.path === '/api/score' && request.status === 503)) throw new Error('Submission failure scenario was not exercised');
    report.storedBests = await page.evaluate(() => JSON.parse(localStorage.getItem('herd.personal-bests.v1')));
    if (!Number.isFinite(report.storedBests?.[flock]) || report.storedBests[flock] <= 0) throw new Error('Completed best was not persisted');
    report.resultText = await page.locator('.herd-modal').innerText();
    await page.getByRole('button', { name: 'Play again', exact: true }).click();
    await page.locator('.herd-app[data-phase="playing"]').waitFor();
    await page.waitForTimeout(1000);
    report.replayCount = await page.locator('.herd-progress__count').innerText();
    if (report.replayCount.replace(/\s/g, '') !== `0/${flock}`) throw new Error('Replay flock did not reset');
    await page.screenshot({ path: join(out, 'replayed.png') });
    await page.reload();
    await page.locator('.herd-app[data-ready="true"][data-phase="title"]').waitFor({ timeout: 60000 });
    report.reloadedBests = await page.evaluate(() => JSON.parse(localStorage.getItem('herd.personal-bests.v1')));
    if (report.reloadedBests?.[flock] !== report.storedBests[flock]) throw new Error('Personal best changed on reload');
    await page.screenshot({ path: join(out, 'reloaded.png') });
  }
} catch (error) { failure = String(error.stack ?? error); }
finally { await cdp?.detach().catch(() => {}); await browser?.close(); stopServer(server); }
report.after = collectBuildReceipt(repo);
report.stable = sameBuildReceipt(report.before, report.after);
writeFileSync(join(out, 'report.json'), JSON.stringify({ ...report, failure }, null, 2));
console.log(JSON.stringify({ completed: report.completed, errors: report.errors, failure }));
if (failure || !report.stable || report.errors.length || !report.completed) process.exitCode = 1;
