// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// The sheep name font recipe. Bakes Alice-Regular into an MSDF font.glb
// container for @pmndrs/glyph/three.
//
//   node tools/bake-font.mjs           rebake into app/public/fonts/sheep-font.font.glb
//   node tools/bake-font.mjs --check   verify the committed font is byte-identical

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fontSrc = resolve(root, 'assets/fonts/Alice-Regular.ttf');
const fontDst = resolve(root, 'app/public/fonts/sheep-font.font.glb');
const cliPath = resolve(root, 'node_modules/@pmndrs/glyph/dist/node/cli.js');

if (!existsSync(fontSrc)) {
  console.error('Source font missing at:', fontSrc);
  process.exit(1);
}

const isCheck = process.argv.includes('--check');

// Work in root directory to avoid CLI relative-path tmp bug on Windows
const tmpOutput = resolve(root, 'sheep-font.tmp.font.glb');

const args = [
  cliPath,
  'bake',
  '--input',
  fontSrc,
  '--output',
  'sheep-font.tmp.font.glb',
  '--unicodes',
  'U+0020-007E',
  '--bitmap',
  '16,32,64',
];

const res = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
if (res.status !== 0) {
  console.error('glyph bake failed with exit code', res.status);
  process.exit(1);
}

if (!existsSync(tmpOutput)) {
  console.error('Expected tmp output missing:', tmpOutput);
  process.exit(1);
}

if (isCheck) {
  if (!existsSync(fontDst)) {
    console.error('Committed font does not exist:', fontDst);
    rmSync(tmpOutput, { force: true });
    process.exit(1);
  }
  const currentBytes = readFileSync(fontDst);
  const newBytes = readFileSync(tmpOutput);
  rmSync(tmpOutput, { force: true });
  if (currentBytes.compare(newBytes) !== 0) {
    console.error('Font bake check failed: baked bytes differ from committed file');
    process.exit(1);
  }
  console.log(`font bake reproducible: ${currentBytes.length} bytes identical`);
  process.exit(0);
}

mkdirSync(dirname(fontDst), { recursive: true });
copyFileSync(tmpOutput, fontDst);
rmSync(tmpOutput, { force: true });
console.log(`Bake complete: ${fontDst} (${statSync(fontDst).size} bytes)`);
