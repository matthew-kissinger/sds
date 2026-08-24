// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

function filesUnder(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path));
    else files.push(path);
  }
  return files;
}

/** Exact identities for every file the production preview can serve. */
export function collectBuiltFiles(dist) {
  return filesUnder(dist)
    .map((path) => {
      const bytes = readFileSync(path);
      return {
        name: relative(dist, path).replaceAll('\\', '/'),
        byteSize: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function collectBuildReceipt(repo) {
  return {
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repo,
      encoding: 'utf8',
    }).trim(),
    files: collectBuiltFiles(join(repo, 'dist')),
  };
}

export function sameBuildReceipt(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
