// SPDX-License-Identifier: AGPL-3.0-or-later
// Functional receipts only. Run against npm run coop:built. No game hooks.
import { launchBrowser } from './probe-lib.mjs';
import { chromium } from 'playwright';
import { decode } from '@msgpack/msgpack';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const mobile = process.argv.includes('--mobile'), webgl = process.argv.includes('--webgl');
const players = process.argv.includes('--four') ? 4 : process.argv.includes('--three') ? 3 : 2;
const competitive = process.argv.includes('--competitive');
const start = competitive ? 'Start competitive' : 'Start co-op';
const suffix = webgl ? '?debug=webgl' : '';
const origin = process.argv.find(a => a.startsWith('--url='))?.slice(6) ?? 'http://localhost:5198';
const hub = process.argv.find(a => a.startsWith('--hub-cdp='))?.slice(10);
const staging = origin === 'https://staging.sheepdogsim.com';
const hosted = staging || origin === 'https://sheepdogsim.com';
if (hub && players !== 2) throw new Error('The PC/hub smoke uses two rendered clients.');
const passcode = staging ? JSON.parse(await readFile('.wrangler/staging/realtime-secrets.json', 'utf8')).STAGING_PASSCODE : null;
const output = `captures/multiplayer/${staging ? 'staging-coop' : hosted ? 'production-coop' : competitive ? 'local-competitive' : 'local-coop'}/${webgl ? 'webgl2' : 'webgpu'}-${mobile ? 'mobile' : 'desktop'}-${players}`; await mkdir(output, { recursive: true });
const browser = await launchBrowser(undefined, ['--disable-background-timer-throttling', '--disable-renderer-backgrounding']);
const hubBrowser = hub ? await chromium.connectOverCDP(hub) : null;
const errors = [], snapshots = Array.from({ length: players }, () => []);
const contexts = await Promise.all(Array.from({ length: players }, (_, i) => (i === 1 && hubBrowser ? hubBrowser : browser).newContext({ ...(competitive && i === 0 ? { recordVideo: { dir: `${output}/motion`, size: { width: 960, height: 600 } } } : {}), viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 } })));
const pages = await Promise.all(contexts.map(c => c.newPage()));
async function navigate(page, url) {
  await page.goto(url);
  if (passcode && await page.getByLabel('Staging passcode').isVisible()) {
    await page.getByLabel('Staging passcode').fill(passcode);
    await page.getByRole('button', { name: 'Enter staging' }).click();
  }
}
try {
  for (const [i, p] of pages.entries()) {
    await p.route('**/cloudflareinsights.com/**', route => route.abort());
    await p.route('**/static.cloudflareinsights.com/**', route => route.abort());
    p.on('pageerror', e => errors.includes(e.message) || errors.push(e.message));
    p.on('websocket', ws => ws.on('framereceived', event => {
      try { const frame = decode(event.payload); if (frame.type === 'snapshot') snapshots[i].push(frame); } catch { /* nonbinary */ }
    }));
  }
  const [host, guest] = pages;
  console.log('Opening built client');
  await navigate(host, origin + '/' + suffix);
  await host.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true', {}, { timeout: 90000 });
  await host.getByRole('button', { name: hosted ? 'Play multiplayer' : 'Play multiplayer locally', exact: true }).click();
  if (competitive) await host.getByLabel(/^Mode/).selectOption('competitive');
  await host.getByLabel('Visibility').selectOption('public');
  const emptyRoom = host.getByRole('button', { name: /^Co-op · 0\/4 · 25 sheep$/ });
  // An earlier aborted smoke may leave an empty waiting room for its 2-minute grace.
  // Reuse it through the public UI; never delete live state to make a probe pass.
  if (hosted && await emptyRoom.isVisible()) await emptyRoom.click();
  else await host.getByRole('button', { name: 'Create room' }).click();
  await host.getByRole('button', { name: start, exact: true }).waitFor({ timeout: 20000 });
  const link = await host.getByLabel('Invite link', { exact: true }).inputValue();
  console.log('Host waiting room created');
  await navigate(guest, link + suffix);
  await guest.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true', {}, { timeout: 90000 });
  await guest.getByRole('button', { name: 'Join room', exact: true }).click();
  await guest.getByRole('button', { name: 'Ready', exact: true }).waitFor({ timeout: 20000 });
  for (const extra of pages.slice(2)) {
    await navigate(extra, link + suffix);
    await extra.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true', {}, { timeout: 90000 });
    await extra.getByRole('button', { name: 'Join room', exact: true }).click();
    await extra.getByRole('button', { name: 'Ready', exact: true }).click();
  }
  await host.screenshot({ path: `${output}/waiting.png` });
  await host.getByRole('button', { name: 'Ready', exact: true }).click();
  await guest.getByRole('button', { name: 'Ready', exact: true }).click();
  await host.getByRole('button', { name: start, exact: true }).click();
  for (const p of pages) await p.waitForFunction(() => document.querySelector('.herd-app')?.dataset.phase === 'playing', {}, { timeout: 20000 });
  console.log('Both rendered clients playing');
  await host.keyboard.down('w'); await guest.keyboard.down('d');
  await host.waitForTimeout(1800); await host.keyboard.up('w'); await guest.keyboard.up('d');
  await host.keyboard.press('Space'); await guest.keyboard.press('Space');
  await host.waitForTimeout(1200);
  const newest = snapshots[0].at(-1); assert(newest?.tick > 60);
  assert.equal(newest.dogs.length, players); assert(newest.barks.some(b => b.slot === 0)); assert(newest.barks.some(b => b.slot === 1));
  // Different network paths can deliver the same broadcast at different times.
  const same = snapshots[1].find(s => snapshots[0].some(h => h.tick === s.tick && h.tick > 60));
  assert(same); assert.deepEqual(snapshots[0].find(s => s.tick === same.tick), same);
  assert.equal(await host.locator('[data-player-label][data-kind=dog]').count(), players);
  assert.equal(await host.locator('.herd-app').getAttribute('data-backend'), webgl ? 'webgl2' : 'webgpu');
  await host.screenshot({ path: `${output}/playing.png` });
  for (const [i, p] of pages.entries()) await p.screenshot({ path: `${output}/player-${i + 1}.png` });
  if (competitive) {
    const gateZ = players === 3 ? Math.sqrt(40000 / (2 * Math.sqrt(3))) : 100;
    await host.keyboard.down('Shift'); await host.keyboard.down('w');
    const end = Date.now() + 22000;
    while (Date.now() < end && snapshots[0].at(-1)?.dogs.find(d => d.slot === 0)?.z < gateZ - 12) await host.waitForTimeout(100);
    await host.keyboard.up('w'); await host.keyboard.up('Shift'); await host.waitForTimeout(500);
    await host.screenshot({ path: `${output}/pen-approach.png` });
    await host.keyboard.press('c'); await host.waitForTimeout(800);
    await host.screenshot({ path: `${output}/pen-follow.png` });
  }
  await guest.reload();
  await guest.waitForFunction(() => document.querySelector('.herd-app')?.dataset.ready === 'true', {}, { timeout: 90000 });
  await guest.getByRole('button', { name: 'Join room', exact: true }).click();
  await guest.waitForFunction(() => document.querySelector('.herd-app')?.dataset.phase === 'playing', {}, { timeout: 15000 });
  console.log('Reload reclaimed the same seat');
  await guest.keyboard.press('Escape');
  await guest.getByRole('button', { name: /^(Forfeit and leave|Leave room)$/, exact: true }).click();
  await host.waitForTimeout(1500);
  assert.equal(snapshots[0].at(-1).dogs.length, players - 1);
  assert.equal(await host.locator('.herd-app').getAttribute('data-phase'), competitive && players === 2 ? 'complete' : 'playing');
  for (const p of [...pages.slice(2), host]) { if (await p.locator('.herd-app').getAttribute('data-phase') === 'playing') await p.keyboard.press('Escape'); await p.getByRole('button', { name: /^(Forfeit and leave|Leave room)$/, exact: true }).click(); }
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(`${output}/receipt.json`, JSON.stringify({ functionalOnly: true, mode: competitive ? 'competitive' : 'coop', origin, clients: hub ? ['PC', 'hub'] : ['PC', 'PC'], players, mobileViewport: mobile, errors,
    backend: await host.locator('.herd-app').getAttribute('data-backend'), snapshots: snapshots.map(s => s.length),
    checks: [`${players} independent identities`, 'invite shell', 'ready barrier', 'movement', 'two barks', 'same-tick snapshot agreement', 'reload reconnect', competitive && players === 2 ? 'last eligible player wins by forfeit' : `leave continues with ${players - 1}`] }, null, 2));
  console.log(`PASS: ${competitive ? 'competitive' : 'co-op'} browser flow`);
} catch (error) {
  console.error('Browser errors:', errors);
  for (const [i, p] of pages.entries()) if (!p.isClosed()) {
    console.error(`Player ${i + 1}:`, (await p.locator('body').innerText()).slice(0,2000));
    await p.screenshot({ path: `${output}/failure-${i + 1}.png` }).catch(() => {});
  }
  throw error;
} finally { await Promise.all(contexts.map(c => c.close())); await hubBrowser?.close(); await browser.close(); }
