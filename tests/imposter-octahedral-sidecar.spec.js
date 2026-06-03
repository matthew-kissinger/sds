// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { loadManifest, enabledImpostorTargets } from '../tools/bake-tree-impostors.mjs';

/**
 * Kiln v2 octahedral tree impostor lab contract.
 * Cycle 50 Phase 4 — generalized from a hardcoded ['tree1','tree2'] list to the
 * object manifest's octahedral targets, and extended to assert the Cycle 50
 * identity fields. Runtime octahedral stays lab-gated (behind
 * ?konveyorNativeTreeImpostors=octahedral); latlon-hemi-y is the production
 * default. This pins the v2 octahedral sidecar contract so the lab atlas can't
 * drift silently.
 */

const octaTargets = [...enabledImpostorTargets(loadManifest())]
  .filter((t) => t.layoutId === 'octahedral' && t.variant.default);

function loadSidecar(sidecarPath) {
  expect(existsSync(sidecarPath), `sidecar missing: ${sidecarPath}`).toBe(true);
  expect(statSync(sidecarPath).size, `sidecar empty: ${sidecarPath}`).toBeGreaterThan(0);
  return JSON.parse(readFileSync(sidecarPath, 'utf-8'));
}

function expectPng(atlasPath, suffix, label) {
  const path = atlasPath.replace(/\.png$/, `${suffix}.png`);
  expect(existsSync(path), `${label} missing: ${path}`).toBe(true);
  expect(statSync(path).size, `${label} empty: ${path}`).toBeGreaterThan(0);
}

describe('Kiln v2 octahedral tree impostor lab contract', () => {
  it('the manifest declares octahedral for the production trees', () => {
    const ids = octaTargets.map((t) => t.obj.id);
    expect(ids).toEqual(expect.arrayContaining(['tree1', 'tree2']));
  });

  describe.each(octaTargets.map((t) => [t.obj.id, t]))('%s.imposter (octahedral)', (id, t) => {
    it('keeps v2 octahedral sidecar metadata explicit and lab-only', () => {
      const m = loadSidecar(t.sidecarPath);

      expect(m.version).toBe(2);
      expect(m.layout).toBe('octahedral');
      expect(m.axis).toBe('octahedral');
      expect(m.hemi).toBe(false);
      expect(m.directionEncoding).toBe('octahedral');
      expect(m.angles).toBe(64);
      expect(m.tilesX).toBe(8);
      expect(m.tilesY).toBe(8);
      expect(m.tileSize).toBe(256);
      expect(m.atlasWidth).toBe(m.tilesX * m.tileSize);
      expect(m.atlasHeight).toBe(m.tilesY * m.tileSize);
      expect(m.directions).toHaveLength(m.tilesX * m.tilesY);
      for (const direction of m.directions) {
        expect(direction).toHaveLength(3);
        const len = Math.hypot(direction[0], direction[1], direction[2]);
        expect(len).toBeCloseTo(1, 4);
      }
      expect(m.colorLayer).toBe('baseColor');
      expect(m.normalSpace).toBe('capture-view');
      expect(m.bgColor).toBe('transparent');
      expect(m.auxLayers).toEqual(expect.arrayContaining(['albedo', 'normal', 'depth']));
      expect(m.edgeBleedPx).toBeGreaterThanOrEqual(2);
    });

    it('carries the Cycle 50 manifest identity (objectId/category/variant/layoutId)', () => {
      const m = loadSidecar(t.sidecarPath);
      expect(m.objectId).toBe(t.obj.id);
      expect(m.category).toBe(t.obj.category);
      expect(m.variant).toBe(t.variant.id);
      expect(m.layoutId).toBe('octahedral');
    });

    it('commits albedo, normal, and depth atlases beside the v2 sidecar', () => {
      expectPng(t.atlasPath, '', 'albedo');
      expectPng(t.atlasPath, '.normal', 'normal');
      expectPng(t.atlasPath, '.depth', 'depth');
    });
  });
});
