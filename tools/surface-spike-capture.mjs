// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Stills of the atlas spike from the asset lab, the same camera on each panel.
//
//   node tools/surface-spike-capture.mjs [--label NAME] [--backend webgpu|webgl|both]
//                                        [--variants a,b,bplus,all] [--port 5241]
//
// Starts the lab's dev server on a private port, opens it once per variant
// with `?spike=<variant>` so that one panel stands at the subject's target,
// drives the lab's real panel (subject button, turntable sliders, Hide) and
// writes one PNG per view under captures/spike/<label>/<backend>/<variant>/.
// `all` mounts the three panels in a row for the side-by-side overview.
// `captures/` is gitignored: these are evidence for the spike note, never
// committed. Frame timings from this machine are not evidence either; the
// tool records the lab's own counters per variant only so the hub run has the
// same shape to fill in.
//
// Views: the Classic approach distance (90 m, from the rig's 22.5 degrees),
// a 20 m three-quarter, and 3 m close-ups straight on and oblique, where the
// texel density (256 a metre) meets the screen's.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import {
  launchBrowser,
  reachable,
  removeDir,
  repo,
  scratchDir,
  stopServer,
  stubHarnessNetwork,
} from './probe-lib.mjs';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const label = arg('label', new Date().toISOString().slice(0, 10));
const backendArg = arg('backend', 'both');
const backends = backendArg === 'both' ? ['webgpu', 'webgl'] : [backendArg];
const variants = arg('variants', 'a,b,bplus,all').split(',');
const port = Number(arg('port', '5241'));

/** `bearing` radians, `distance` and `height` metres. */
const VIEWS = [
  { id: '01-classic-90m', bearing: 0, distance: 90, height: 37 },
  { id: '02-mid-20m', bearing: 0.35, distance: 20, height: 5 },
  { id: '03-close-3m', bearing: 0, distance: 3, height: 1.6 },
  { id: '04-close-3m-oblique', bearing: 0.9, distance: 3, height: 1.6 },
  { id: '05-close-1.5m', bearing: 0, distance: 1.5, height: 1.4 },
];
const OVERVIEW = [
  { id: '00-overview-30m', bearing: 0, distance: 30, height: 6 },
  { id: '01-classic-90m', bearing: 0, distance: 90, height: 37 },
];

async function startLab() {
  const vite = join(repo, 'node_modules', 'vite', 'bin', 'vite.js');
  if (await reachable(`http://localhost:${port}/`)) throw new Error(`port ${port} is in use`);
  const child = spawn(process.execPath, [vite, '--config', 'vite.lab.config.ts', '--port', String(port), '--strictPort'], {
    cwd: repo,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await reachable(`http://localhost:${port}/`)) return child;
    if (child.exitCode !== null) throw new Error(`lab exited early (${child.exitCode})`);
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('lab did not answer within 60 s');
}

/** Move one turntable slider the way a hand would: the input event React reads. */
async function slide(page, name, value) {
  await page.evaluate(({ name, value }) => {
    const labels = [...document.querySelectorAll('label')];
    const input = labels.find((node) => node.textContent?.startsWith(name))?.querySelector('input');
    if (!input) throw new Error(`no slider named ${name}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { name, value });
}

const settle = (page, ms) => page.waitForTimeout(ms);

async function counters(page) {
  return page.evaluate(() => {
    const read = (name) => document.querySelector(`dt:has(+ dd)`) && [...document.querySelectorAll('dt')]
      .find((dt) => dt.textContent?.trim() === name)?.nextElementSibling?.textContent?.trim();
    return { backend: read('Backend'), drawCalls: read('Draw calls'), triangles: read('Triangles'), textures: read('Textures'), frameMs: read('Frame') };
  });
}

async function capture(browser, backend, variant) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await stubHarnessNetwork(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const params = new URLSearchParams();
  if (variant !== 'all') params.set('spike', variant);
  if (backend === 'webgl') params.set('debug', 'webgl');
  const query = params.toString();
  await page.goto(`http://localhost:${port}/${query ? `?${query}` : ''}`);
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await settle(page, 5000);
  await page.getByRole('button', { name: 'Surface spike', exact: true }).click();
  await settle(page, 5000);
  const out = join(repo, 'captures', 'spike', label, backend, variant);
  mkdirSync(out, { recursive: true });
  const views = variant === 'all' ? OVERVIEW : VIEWS;
  for (const view of views) {
    await slide(page, 'Bearing', view.bearing);
    await slide(page, 'Distance', view.distance);
    await slide(page, 'Height', view.height);
    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await settle(page, 1500);
    await page.screenshot({ path: join(out, `${view.id}.png`) });
    await page.getByRole('button', { name: 'Panel', exact: true }).click();
  }
  const read = await counters(page);
  writeFileSync(join(out, 'counters.json'), `${JSON.stringify({ backend, variant, ...read, errors }, null, 2)}\n`);
  await context.close();
  console.log(`${backend} ${variant}: ${views.length} views, backend ${read.backend}, draws ${read.drawCalls}, textures ${read.textures} -> ${out}`);
  if (errors.length > 0) console.log(`  console errors:\n  ${errors.join('\n  ')}`);
}

const profile = scratchDir('surface-spike');
let server;
let browser;
try {
  server = await startLab();
  browser = await launchBrowser(profile);
  for (const backend of backends) {
    for (const variant of variants) await capture(browser, backend, variant);
  }
} finally {
  await browser?.close();
  stopServer(server);
  removeDir(profile);
}
