// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// REGENERATION IS A RECORDED DECISION.
//
// The JSON files under tests/fixtures/ pin the sim's behaviour. A fixture diff
// means the sim changed. Read the diff, decide whether the change is intended,
// and if it is, say so in the same commit that regenerates: what changed, why,
// and which tuning constant or system moved. NEVER run this script to make a
// red test go green. That is the multiplayer-desync tripwire, and it is the one
// discipline sds got right and kept (spec/02).
//
// If the acceptance run (completion-run.json) stops finishing, the fix is in
// tests/helpers/herding-driver.ts, not in sim/.
//
//   node tools/record-fixtures.mjs            regenerate all fixtures
//   node tools/record-fixtures.mjs flock-drift dog-rotation   just these
//
// sim/ is TypeScript, so this bundles the trace producers with esbuild (the
// same wrangler-path bundler tools/determinism-crosscheck.mjs uses) and imports
// the result. The traces themselves come from tests/helpers/traces.ts, the very
// module the specs import, so the generator and the assertions cannot diverge.

import { build } from 'esbuild';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = join(repo, 'tests', 'fixtures');
const out = mkdtempSync(join(tmpdir(), 'herd-fixtures-'));

const bundle = join(out, 'traces.mjs');
await build({
  entryPoints: [join(repo, 'tests', 'helpers', 'traces.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  alias: { '@sim': join(repo, 'sim') },
});

const { FIXTURES } = await import(pathToFileURL(bundle).href);

const requested = process.argv.slice(2);
const names = requested.length > 0 ? requested : Object.keys(FIXTURES);

mkdirSync(fixturesDir, { recursive: true });
for (const name of names) {
  const producer = FIXTURES[name];
  if (!producer) {
    console.error(`unknown fixture "${name}". known: ${Object.keys(FIXTURES).join(', ')}`);
    process.exit(1);
  }
  const started = Date.now();
  const data = producer();
  const file = join(fixturesDir, `${name}.json`);
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`wrote tests/fixtures/${name}.json (${Date.now() - started} ms)`);
}
