// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSceneFogHorizonProof } from '../js/diagnostics/konveyorSceneFogHorizonProof.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    out: 'cycle36-validation/runtime/scene-fog-horizon-proof.json',
  };

  for (const arg of argv.slice(2)) {
    const match = arg.match(/^--([A-Za-z0-9-]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = match[2];
  }

  return args;
}

async function run() {
  const args = parseArgs(process.argv);
  const proof = {
    capturedAt: new Date().toISOString(),
    ...createSceneFogHorizonProof(),
  };
  const outPath = resolve(ROOT, args.out);

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
}

run().catch((error) => {
  console.error('[SCENE-FOG-HORIZON-PROOF] fatal:', error);
  process.exit(1);
});
