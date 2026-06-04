// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import pngToIco from 'png-to-ico';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const shellRoot = resolve(__dirname, '..');
const repoRoot = resolve(shellRoot, '..', '..');
const buildRoot = resolve(shellRoot, 'build');
const pngSource = resolve(repoRoot, 'assets/images/icons/icon-512.png');
const pngTarget = resolve(buildRoot, 'icon.png');
const icoTarget = resolve(buildRoot, 'icon.ico');

await mkdir(buildRoot, { recursive: true });
await copyFile(pngSource, pngTarget);
await writeFile(icoTarget, await pngToIco(pngSource));
console.log(`Prepared Electron desktop icons in ${buildRoot}`);
