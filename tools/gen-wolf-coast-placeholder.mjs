#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 64 stopgap: a dusk-gradient placeholder for the Wolf Coast entrance
 * card, so the carousel's idle-prefetch does not 404 before a real hero capture
 * exists. Matches the WORLDS gradient in js/components/entrance/worlds.ts. A
 * proper close-eye scene capture (Matt's media pass) should replace this.
 *
 * Run: node tools/gen-wolf-coast-placeholder.mjs
 */
import sharp from 'sharp';

const svg = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#b9a98c"/>
      <stop offset="45%" stop-color="#8f8a86"/>
      <stop offset="78%" stop-color="#6a6f8c"/>
      <stop offset="100%" stop-color="#3f4a63"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#g)"/>
</svg>`;

await sharp(Buffer.from(svg))
  .webp({ quality: 82 })
  .toFile('assets/scenes/entrance/wolf-coast.webp');

console.log('Wrote assets/scenes/entrance/wolf-coast.webp (1920x1080 dusk gradient placeholder)');
