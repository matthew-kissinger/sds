// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Stills of the Kiln barn from the asset lab, for the owner's look review.
//
//   node tools/barn-lab-capture.mjs [--label NAME] [--backend webgl|webgpu|both]
//                                   [--subject kiln-barn|barn|both]
//                                   [--views 01,03]  (view id prefixes)
//
// The farmhouse's capture tool (tools/farmhouse-lab-capture.mjs) with the barn's
// subjects and views: it starts the lab's own dev server (vite.lab.config.ts) on
// a private port, drives the lab's real panel - the subject buttons and the
// turntable sliders, nothing injected - and writes one PNG per view under
// captures/barn/<label>/<backend>/<subject>/. `captures/` is gitignored, so the
// stills are evidence for a review and never committed. Folding the two tools
// into one that takes a subject table is a follow-up.
//
// THE LAB CANNOT CLOSE A GATE (spec/13). These frames are for iterating on the
// recipe and for the owner's look review; acceptance comes from the production
// build. `kiln-barn` mounts the baked GLB whatever BARN_SOURCE says, and `barn`
// is the procedural barn at the same target and frame, for context only.
//
// The bearings are worked from the barn's yaw (farmhouse/plan.ts, 0.14 rad): the
// lab orbits at (sin b, cos b) around the target, so the cart-door front (-z in
// the barn's own frame) faces the camera at b = -3.00, the west gable at
// b = -1.43 and the east gable at b = 1.71. The camera's height is above the
// ground under it, and it aims at the barn's centre a quarter of that height up
// (at most 6 m): lab/src/LabCamera.tsx.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import {
  launchBrowser,
  removeDir,
  repo,
  reachable,
  scratchDir,
  stopServer,
  stubHarnessNetwork,
} from './probe-lib.mjs';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const label = arg('label', new Date().toISOString().slice(0, 10));
const backends = arg('backend', 'webgpu') === 'both' ? ['webgpu', 'webgl'] : [arg('backend', 'webgpu')];
const subjects = arg('subject', 'both') === 'both' ? ['kiln-barn', 'barn'] : [arg('subject', 'both')];
const port = Number(arg('port', '5247'));

const SUBJECT_LABEL = { 'kiln-barn': 'Barn (Kiln)', barn: 'Barn (procedural)' };

/** The standard views. `bearing` in radians, `distance` and `height` in metres. */
const VIEWS = [
  // The line the Classic camera takes from the field: due south of the barn,
  // ninety metres out, looking down near the rig's 22.5 degrees.
  { id: '01-classic', bearing: -3.0, distance: 90, height: 37 },
  // South-west: the cart-door front and the sunlit west gable with its hay door.
  { id: '02-three-quarter', bearing: -2.25, distance: 30, height: 9 },
  // Square on to the cart doors, standing on the apron's edge, looking in.
  { id: '03-cart-doors', bearing: -3.0, distance: 12, height: 2.4 },
  // South-east, high: the lit loft window in the east gable and the cupola.
  { id: '04-loft-cupola', bearing: 2.35, distance: 20, height: 16 },
  // South-east at the three-quarter's distance: the shaded gable and the roof.
  { id: '05-three-quarter-east', bearing: 2.45, distance: 30, height: 9 },
  { id: '06-silhouette', bearing: -2.25, distance: 30, height: 9, view: 'Silhouette' },
  // The west gable whole, from high enough to see over the verge: the hay door
  // with its leaf swung out, and the hood over it out to the pulley.
  { id: '07-hay-door', bearing: -1.6, distance: 24, height: 20 },
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
  const out = join(repo, 'captures', 'barn', label, backend, subject);
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

const profile = scratchDir('barn-lab');
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
