// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Stills of the Kiln oak from the asset lab, for the owner's look review.
//
//   node tools/treeline-lab-capture.mjs [--label NAME] [--backend webgl|webgpu|both]
//                                       [--subject kiln-tree|tree|both]
//                                       [--views 01,05]  (view id prefixes)
//                                       [--freeze]  (hold the wind still)
//
// --freeze pins the page's clock, so every still is taken at the same instant
// of the wind. The sway and the grass move on TSL `time`, which three advances
// from `performance.now()` each frame; with the clock pinned they hold one pose.
// A before and after comparison of an asset change needs this: without it the
// diff is mostly the wind. Two runs of one build then give the same pixels in
// every view but two: some grass near the camera in 07-follow-far, and a few
// pixels of far grass in 02-sun-side, differ from run to run by themselves, so
// compare those two against a second run of the same build.
//
// The barn's capture tool (tools/barn-lab-capture.mjs) with the tree's
// subjects and views: it starts the lab's own dev server (vite.lab.config.ts)
// on a private port, drives the lab's real panel - the subject buttons and the
// turntable sliders, nothing injected - and writes one PNG per view under
// captures/treeline/<label>/<backend>/<subject>/. `captures/` is gitignored, so
// the stills are evidence for a review and never committed.
//
// THE LAB CANNOT CLOSE A GATE (spec/13). These frames are for iterating on the
// recipe and the materials and for the owner's look review; acceptance comes
// from the production build. `kiln-tree` mounts the baked oak whatever
// TREE_SOURCE says, and `tree` is the procedural oak at the same target and
// frame, for context only.
//
// Both subjects aim at stand 18 (lab/src/subjects.ts), in the north of the ring.
// The lab orbits at (sin b, cos b) around the target, so the field side of that
// stand is b = 2.84, the camera stands with the sun behind the crown at
// b = 2.44 (the sun is 8 degrees up in the north-west: tsl/palette.ts), and with
// the sun behind the camera at b = -0.70. The camera's height is above the
// ground under it, and it aims at the stand's foot a quarter of that height up
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
const subjects = arg('subject', 'both') === 'both' ? ['kiln-tree', 'tree'] : [arg('subject', 'both')];
const port = Number(arg('port', '5263'));
const freeze = process.argv.includes('--freeze');

const SUBJECT_LABEL = { 'kiln-tree': 'Tree (Kiln)', tree: 'Tree (procedural)' };

/** The standard views. `bearing` in radians, `distance` and `height` in metres. */
const VIEWS = [
  // From the field, close: the three-quarter a player walking up to the ring gets.
  { id: '01-field-side', bearing: 2.84, distance: 34, height: 5 },
  // The sun behind the camera: the lit side, every band in play.
  { id: '02-sun-side', bearing: -0.7, distance: 34, height: 5 },
  // Looking into the sun past the crown: the backlit edge.
  { id: '03-into-sun', bearing: 2.44, distance: 26, height: 3 },
  // The foot of the bole, from the field side.
  { id: '04-bole-foot', bearing: 2.84, distance: 12, height: 1.6 },
  // The Follow camera's read: low, with the ring a hundred-odd metres out.
  { id: '05-follow', bearing: 2.84, distance: 110, height: 2.2 },
  // The Classic camera's read: from height, down at the ring.
  { id: '06-classic', bearing: 2.84, distance: 120, height: 45 },
  // The far side of the field, in the haze.
  { id: '07-follow-far', bearing: 2.84, distance: 190, height: 2.2 },
  { id: '08-silhouette', bearing: 2.84, distance: 34, height: 5, view: 'Silhouette' },
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
  if (freeze) await context.addInitScript(() => { performance.now = () => 1000; });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const url = `http://localhost:${port}/${backend === 'webgl' ? '?debug=webgl' : ''}`;
  await page.goto(url);
  await page.waitForSelector('canvas', { timeout: 60_000 });
  await page.getByRole('button', { name: SUBJECT_LABEL[subject], exact: true }).click();
  await settle(page, 5000);
  const out = join(repo, 'captures', 'treeline', label, backend, subject);
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

const profile = scratchDir('treeline-lab');
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
