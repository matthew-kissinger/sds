// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, enabledImpostorTargets } from '../tools/bake-tree-impostors.mjs';
import { selectOctahedralImpostorTiles } from '../js/impostors/impostorTileSelection.js';

/**
 * Cycle 103 Phase 3 - octahedral selector round-trip correctness.
 *
 * pixel-forge bakes each octahedral tile at its CELL CENTER
 * (enumerateOctahedralTiles: u = ((i + 0.5) / tilesX) * 2 - 1). The runtime
 * selector must invert that with `* tilesX - 0.5`, not the vertex-centered
 * `* (tilesX - 1)` it used through Cycle 102 - which shifted the pick up to half
 * a tile and mis-selected ~10 of 64 directions at the steep-down fold seam.
 *
 * Headline guard: feed every committed tile-center direction back through
 * selectOctahedralImpostorTiles and assert the dominant (max-weight) tile is the
 * tile it was baked from - 64/64, fold seam included (the corner tiles are
 * lower-hemisphere directions, so this exercises the encode/decode fold too).
 * Because TSL cannot be evaluated on the CPU, a source-parity guard pins the
 * in-shader pick (js/webgpuKilnImpostorNodeMaterial.js) to the same cell-centered
 * inverse so the JS selector and the shader cannot drift.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const octaTargets = [...enabledImpostorTargets(loadManifest())]
  .filter((t) => t.layoutId === 'octahedral' && t.variant.default);

function loadSidecar(sidecarPath) {
  expect(existsSync(sidecarPath), `sidecar missing: ${sidecarPath}`).toBe(true);
  expect(statSync(sidecarPath).size, `sidecar empty: ${sidecarPath}`).toBeGreaterThan(0);
  return JSON.parse(readFileSync(sidecarPath, 'utf-8'));
}

function dominantTile(result) {
  let best = 0;
  for (let k = 1; k < result.weights.length; k++) {
    if (result.weights[k] > result.weights[best]) best = k;
  }
  return { tile: result.tiles[best], weight: result.weights[best] };
}

const asVec = (d) => ({ x: d[0], y: d[1], z: d[2] });
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('octahedral impostor selector round-trip (Cycle 103 P3)', () => {
  it('has at least one octahedral target to guard', () => {
    expect(octaTargets.length).toBeGreaterThan(0);
  });

  describe.each(octaTargets.map((t) => [t.obj.id, t]))('%s.imposter (octahedral)', (id, t) => {
    const sidecar = loadSidecar(t.sidecarPath);
    const { tilesX, tilesY, directions } = sidecar;

    it('carries the row-major directions the selector inverts', () => {
      expect(Array.isArray(directions)).toBe(true);
      expect(directions).toHaveLength(tilesX * tilesY);
    });

    it('every baked tile center selects its own tile (64/64, fold seam included)', () => {
      const misses = [];
      for (let idx = 0; idx < tilesX * tilesY; idx++) {
        const col = idx % tilesX;
        const rowIdx = Math.floor(idx / tilesX);
        const result = selectOctahedralImpostorTiles(asVec(directions[idx]), sidecar);
        const { tile } = dominantTile(result);
        if (tile[0] !== col || tile[1] !== rowIdx) {
          misses.push({ idx, expected: [col, rowIdx], got: tile });
        }
      }
      expect(misses, `mis-selected: ${JSON.stringify(misses)}`).toEqual([]);
    });

    it('a tile-center direction is a near-exact hit (negligible blend bleed)', () => {
      const col = Math.floor(tilesX / 2);
      const rowIdx = Math.floor(tilesY / 2);
      const idx = rowIdx * tilesX + col;
      const result = selectOctahedralImpostorTiles(asVec(directions[idx]), sidecar);
      const { tile, weight } = dominantTile(result);
      expect(tile).toEqual([col, rowIdx]);
      expect(weight).toBeGreaterThan(0.99);
    });

    it('blended selection reconstructs arbitrary upper-hemisphere directions', () => {
      // The convex blend of the 3 selected tiles' captured directions should
      // reconstruct each sampled input to well inside a tile's angular spacing
      // (8x8 octa ~ 14 deg/tile). A mis-selected quadrant would drop dot below
      // 0.5; assert > 0.85 to separate correct-from-broken with margin.
      for (let a = 0; a < 16; a++) {
        const az = (a / 16) * Math.PI * 2;
        for (const el of [0.2, 0.45, 0.7, 0.9]) {
          const ce = Math.sqrt(Math.max(0, 1 - el * el));
          const input = [Math.cos(az) * ce, el, Math.sin(az) * ce];
          const result = selectOctahedralImpostorTiles(asVec(input), sidecar);
          let rx = 0;
          let ry = 0;
          let rz = 0;
          result.tiles.forEach(([tx, ty], k) => {
            const d = directions[ty * tilesX + tx];
            rx += d[0] * result.weights[k];
            ry += d[1] * result.weights[k];
            rz += d[2] * result.weights[k];
          });
          const len = Math.hypot(rx, ry, rz) || 1;
          const cos = dot3(input, [rx / len, ry / len, rz / len]);
          expect(cos, `az=${az.toFixed(2)} el=${el}`).toBeGreaterThan(0.85);
        }
      }
    });
  });

  it('JS selector and the in-shader pick share the cell-centered inverse', () => {
    const js = readFileSync(resolve(root, 'js/impostors/impostorTileSelection.js'), 'utf-8');
    const shader = readFileSync(resolve(root, 'js/webgpuKilnImpostorNodeMaterial.js'), 'utf-8');
    // Cell-centered inverse present in both selection paths.
    expect(js).toContain('(ox * 0.5 + 0.5) * tilesX - 0.5');
    expect(js).toContain('(0.5 - oy * 0.5) * tilesY - 0.5');
    expect(shader).toContain('.mul(tilesX).sub(0.5)');
    expect(shader).toContain('.mul(tilesY).sub(0.5)');
    // The old vertex-centered selection form is gone (the clamp bounds still use
    // tilesX - 1 legitimately, so match the full selection expression, not just
    // the bare token).
    expect(js).not.toContain('(ox * 0.5 + 0.5) * (tilesX - 1)');
    expect(shader).not.toContain('.add(0.5).mul(tilesX - 1)');
  });
});
