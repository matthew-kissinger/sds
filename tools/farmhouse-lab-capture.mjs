// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Stills of the Kiln farmhouse from the asset lab, for the owner's look review.
//
//   node tools/farmhouse-lab-capture.mjs [--label NAME] [--backend webgl|webgpu|both]
//                                        [--subject kiln-house|house|both]
//                                        [--views 04,09]  (view id prefixes)
//
// It starts the lab's own dev server (vite.lab.config.ts) on a private port,
// drives the lab's real panel - the subject buttons and the turntable sliders,
// nothing injected - and writes one PNG per view under
// captures/farmhouse/<label>/<backend>/<subject>/. `captures/` is gitignored, so
// the stills are evidence for a review and never committed.
//
// THE LAB CANNOT CLOSE A GATE (spec/13). These frames are for iterating on the
// recipe and for the owner's look review; acceptance comes from the production
// build. `kiln-house` mounts the baked GLB whatever FARMHOUSE_SOURCE says, and
// `house` is the procedural house at the same target and frame, for context
// only: the Kiln house is graded against spec/05, not against it.
//
// The bearings below are worked from the house's yaw (farmhouse/plan.ts, 1.1
// rad): the lab orbits at (sin b, cos b) around the target, and the house's
// front (-z in its own frame) faces the world at b = -2.04.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  launchBrowser,
  removeDir,
  repo,
  reachable,
  scratchDir,
  stopServer,
  stubHarnessNetwork,
} from './probe-lib.mjs';
import { spawn } from 'node:child_process';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const label = arg('label', new Date().toISOString().slice(0, 10));
const backends = arg('backend', 'webgl') === 'both' ? ['webgl', 'webgpu'] : [arg('backend', 'webgl')];
const subjects = arg('subject', 'both') === 'both' ? ['kiln-house', 'house'] : [arg('subject', 'both')];
const port = Number(arg('port', '5231'));

const SUBJECT_LABEL = { 'kiln-house': 'House (Kiln)', house: 'House (procedural)' };

/** The standard views. `bearing` in radians, `distance` and `height` in metres. */
const VIEWS = [
  { id: '01-front', bearing: -2.04, distance: 26, height: 6 },
  { id: '02-front-west', bearing: -1.3, distance: 30, height: 9 },
  { id: '03-front-east', bearing: -2.8, distance: 30, height: 9 },
  { id: '04-porch', bearing: -2.25, distance: 13, height: 3.2 },
  { id: '05-east-gable', bearing: 2.4, distance: 28, height: 8 },
  { id: '06-back-west', bearing: 0.4, distance: 30, height: 10 },
  // The line every gameplay camera takes: from the field, at about ninety
  // metres, looking down near the Classic rig's 22.5 degrees.
  { id: '07-from-field', bearing: -2.76, distance: 90, height: 37 },
  { id: '08-silhouette', bearing: -1.3, distance: 30, height: 9, view: 'Silhouette' },
  // Through the open front door onto the hall floor, which stands on the pad:
  // the one place a floor coplanar with the terrain can be seen fighting it.
  // The door is 5.76 m from the house's centre at bearing -2.70.
  { id: '09-doorway', bearing: -2.45, distance: 9.5, height: 2.4 },
  // Standing in the hall, looking across the floor to the back wall: the whole
  // deck in frame, for judging it against the terrain under it.
  { id: '10-hall', bearing: -2.04, distance: 2.2, height: 1.7 },
];
const only = arg('views', '');
const views = only ? VIEWS.filter((view) => only.split(',').some((id) => view.id.startsWith(id))) : VIEWS;

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

async function capture(browser, backend, subject) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await stubHarnessNetwork(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const url = `http://localhost:${port}/${backend === 'webgl' ? '?debug=webgl' : ''}`;
  await page.goto(url);
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.getByRole('button', { name: SUBJECT_LABEL[subject], exact: true }).click();
  await settle(page, 4000);
  const out = join(repo, 'captures', 'farmhouse', label, backend, subject);
  mkdirSync(out, { recursive: true });
  const reported = await page.locator('dt:text-is("Backend") + dd').textContent();
  for (const view of views) {
    await page.getByRole('button', { name: view.view ?? 'Lit', exact: true }).click();
    // Flat black against flat black judges nothing: the silhouette view is
    // taken with the ground unmounted, as the lab's own note on it says.
    const alone = view.view === 'Silhouette';
    if (alone) await page.getByRole('button', { name: 'Terrain and grass', exact: true }).click();
    await slide(page, 'Bearing', view.bearing);
    await slide(page, 'Distance', view.distance);
    await slide(page, 'Height', view.height);
    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await settle(page, 1500);
    await page.screenshot({ path: join(out, `${view.id}.png`) });
    await page.getByRole('button', { name: 'Panel', exact: true }).click();
    if (alone) await page.getByRole('button', { name: 'Subject alone', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Lit', exact: true }).click();
  await context.close();
  console.log(`${backend} ${subject}: ${views.length} views (${reported}) -> ${out}`);
  if (errors.length > 0) console.log(`  console errors:\n  ${errors.join('\n  ')}`);
}

const profile = scratchDir('farmhouse-lab');
let server;
let browser;
try {
  server = await startLab();
  browser = await launchBrowser(profile);
  for (const backend of backends) {
    for (const subject of subjects) await capture(browser, backend, subject);
  }
} finally {
  await browser?.close();
  stopServer(server);
  removeDir(profile);
}
