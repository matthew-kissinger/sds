// SPDX-License-Identifier: AGPL-3.0-or-later
// Phase 0 spike / CI job (spec/09 layer 5): bundle sim/ with esbuild (the
// wrangler path) and with Vite (the client path), run the same trace seed
// through both bundles in Node, and byte-compare the JSON output.
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'herd-crosscheck-'));

// Two traces, both byte-compared: the phase-0 spike (kept so the original
// cross-check keeps running) and the real sim behind the FlockSim buffers, so
// the thing that actually ships is the thing that is checked. The dog input is
// a fixed script rather than the test driver - drivers live in tests/, and this
// entry has to bundle from sim/ alone.
const entrySrc = `
import { spikeTrace } from '../sim/spike';
import { CpuDeterministicSim } from '../sim/FlockSim';
import { HOME_FIELD } from '../sim/field';
import { FIXED_DT } from '../sim/tuning';

function round4(v) { const r = Math.round(v * 1e4) / 1e4; return r === 0 ? 0 : r; }

function simTrace(seed, flockSize, ticks) {
  const sim = new CpuDeterministicSim(HOME_FIELD, flockSize, seed);
  const rows = [];
  for (let t = 1; t <= ticks; t++) {
    // A square-wave patrol: north for 90 ticks, then east, then south, then
    // west, sprinting on every fourth leg. No trig, no rng, no wall clock.
    const leg = (t / 90) | 0;
    const phase = leg & 3;
    const direction = phase === 0 ? { x: 0, z: 1 }
      : phase === 1 ? { x: 1, z: 0 }
      : phase === 2 ? { x: 0, z: -1 }
      : { x: -1, z: 0 };
    sim.step([{ direction, sprint: phase === 3, bark: t % 300 === 0 }], FIXED_DT);
    if (t % 60 === 0) {
      const row = [t, sim.pennedCount];
      for (let i = 0; i < sim.positions.length; i++) row.push(round4(sim.positions[i]));
      for (let i = 0; i < sim.headings.length; i++) row.push(round4(sim.headings[i]));
      for (let i = 0; i < sim.stateFlags.length; i++) row.push(sim.stateFlags[i]);
      rows.push(row);
    }
  }
  return rows;
}

export function run() {
  return JSON.stringify({
    spike: spikeTrace(20260821, 200, 600),
    sim: simTrace(20260821, 25, 1800),
  });
}
`;
// Entry lives inside the repo so both bundlers resolve ../sim relatively.
const entryPath = join(repo, 'tools', '.crosscheck-entry.ts');
writeFileSync(entryPath, entrySrc);

// esbuild (wrangler path)
await build({
  entryPoints: [entryPath],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: join(out, 'esbuild.mjs'),
});

// vite (client path)
await viteBuild({
  configFile: false,
  logLevel: 'error',
  build: {
    lib: { entry: entryPath, formats: ['es'], fileName: () => 'vite.mjs' },
    outDir: join(out, 'vite-out'),
    minify: false,
    target: 'es2022',
  },
});

const es = await import(pathToFileURL(join(out, 'esbuild.mjs')).href);
const vi = await import(pathToFileURL(join(out, 'vite-out', 'vite.mjs')).href);
const a = es.run();
const b = vi.run();

if (a !== b) {
  console.error('DETERMINISM CROSS-CHECK FAILED: esbuild and vite bundles diverge');
  process.exit(1);
}
console.log(`determinism cross-check OK: ${a.length} bytes identical across esbuild and vite bundles`);
