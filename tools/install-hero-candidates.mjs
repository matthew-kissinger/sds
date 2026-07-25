#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 112 Phase 8 - install captured hero candidates as the shipped art.
 *
 * Separate from tools/hero-capture-cycle112.mjs on purpose. The capture step is
 * safe to run at any time and writes only to the gitignored validation dir;
 * this one overwrites `assets/scenes/`, so it is an explicit, separate act.
 *
 * Dimensions and quality are matched to what is already shipped: 1920x1080 for
 * the entrance backdrop, 1200x630 for the og:image. Quality is chosen per file
 * to land near the existing byte sizes rather than fixed, because these frames
 * are mostly smooth sky and grass and compress differently from the originals.
 *
 * Usage:
 *   node tools/install-hero-candidates.mjs            # report only
 *   node tools/install-hero-candidates.mjs --write    # overwrite assets/scenes/
 */
import sharp from 'sharp';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SRC = resolve(process.cwd(), 'cycle112-validation', 'heroes');
const SCENES = ['field', 'rolling-hills', 'open-country', 'newsheepdogland'];
const TARGETS = [
  { aspect: 'entrance', dir: 'assets/scenes/entrance', w: 1920, h: 1080, quality: 82 },
  { aspect: 'social', dir: 'assets/scenes/social', w: 1200, h: 630, quality: 80 },
];

/**
 * Per-scene quality override. The entrance hero is on the critical path and
 * this cycle's whole point was a lighter front door, so a grass-heavy frame is
 * not allowed to arrive 190 KB larger than the one it replaces just because it
 * has more high-frequency detail. Measured at 1920x1080:
 *
 *   rolling-hills  q60 331 KB  q72 376 KB  q82 475 KB   (replacing 284 KB)
 *   open-country   q60 360 KB  q66 384 KB  q82 506 KB   (replacing 386 KB)
 *
 * Home Field and Newsheepdogland are smoother and already land at or under
 * their originals at the default, so they keep it.
 */
const SCENE_QUALITY = {
  'rolling-hills': { entrance: 62, social: 62 },
  'open-country': { entrance: 66, social: 66 },
};

const write = process.argv.includes('--write');
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

const files = new Set(await readdir(SRC).catch(() => []));
let missing = 0;

for (const scene of SCENES) {
  for (const t of TARGETS) {
    const src = `${scene}__${t.aspect}__${t.w}x${t.h}.png`;
    if (!files.has(src)) {
      console.warn(`[INSTALL] MISSING ${src} - run tools/hero-capture-cycle112.mjs first`);
      missing++;
      continue;
    }
    const dest = resolve(process.cwd(), t.dir, `${scene}.webp`);
    const before = await stat(dest).then((s) => s.size).catch(() => 0);
    const quality = SCENE_QUALITY[scene]?.[t.aspect] ?? t.quality;
    const buf = await sharp(resolve(SRC, src))
      .resize(t.w, t.h, { fit: 'cover' })
      .webp({ quality, effort: 6 })
      .toBuffer();
    console.log(
      `[INSTALL] ${t.dir}/${scene}.webp  q${quality}  ${kb(before)} -> ${kb(buf.length)}` +
      (write ? '' : '  (dry run, pass --write)'),
    );
    if (write) await writeFile(dest, buf);
  }
}

if (missing) {
  console.error(`[INSTALL] ${missing} candidate(s) missing; nothing was written for those.`);
  process.exit(1);
}
console.log(write ? '\n[INSTALL] wrote 8 files' : '\n[INSTALL] dry run complete');
