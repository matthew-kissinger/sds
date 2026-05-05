import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Cycle 20 Phase 1 Layer D — Kiln impostor sidecar contract.
 *
 * Each baked tree owns four committed artifacts:
 *   <name>.imposter.png         — albedo atlas
 *   <name>.imposter.normal.png  — capture-view-space normal atlas
 *   <name>.imposter.depth.png   — depth atlas
 *   <name>.imposter.json        — Kiln sidecar
 *
 * The runtime LOD2 shader reads the sidecar to size the billboard quad
 * (worldSize, yOffset), pick + blend tiles (azimuths[], elevations[]),
 * and decode normals (normalSpace). If any field drifts from the Phase 0
 * spec, the runtime breaks silently (impostor pops, ghost edges, wrong
 * lighting). This spec pins the contract so a re-bake can't ship a
 * mismatched sidecar without flagging here first.
 *
 * The committed bytes ARE the production contract — Phase 1 verdict was
 * 16 hemi-y at 512px tiles (see cycle20-validation/phase0/AUDIT.md for
 * Q2 reasoning). Schema reference:
 *   ../../pixel-forge/packages/core/src/kiln/imposter/schema.ts
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const TREES_DIR = resolve(__dirname, '../assets/models/trees');
const TREES = ['tree1', 'tree2', 'pine'];

function loadSidecar(name) {
  const path = resolve(TREES_DIR, `${name}.imposter.json`);
  expect(existsSync(path), `sidecar missing: ${path}`).toBe(true);
  const bytes = statSync(path).size;
  expect(bytes, `sidecar empty: ${path}`).toBeGreaterThan(0);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function expectAuxLayerExists(name, layer) {
  const path = resolve(TREES_DIR, `${name}.imposter.${layer}.png`);
  expect(existsSync(path), `${layer} aux missing: ${path}`).toBe(true);
  expect(statSync(path).size, `${layer} aux empty: ${path}`).toBeGreaterThan(0);
}

describe('Kiln impostor sidecar contract', () => {
  describe.each(TREES)('%s.imposter', (name) => {
    it('sidecar matches Cycle 20 Phase 0 verdict (16 hemi-y, 4×4, 512px tiles, baseColor)', () => {
      const m = loadSidecar(name);

      // Schema version pin — bumps mean the runtime shader contract changed.
      expect(m.version).toBe(1);

      // Q2 verdict (Phase 0 AUDIT.md): 16 hemi-y for production.
      expect(m.angles).toBe(16);
      expect(m.axis).toBe('hemi-y');
      expect(m.hemi).toBe(true);
      expect(m.layout).toBe('latlon');

      // Pixel Forge resolveLayout pins 16 hemi-y to 4×4. Defensive — catches
      // a layout-table change in upstream pixel-forge that would silently
      // re-shape the atlas without updating sidecar references.
      expect(m.tilesX).toBe(4);
      expect(m.tilesY).toBe(4);
      expect(m.tilesX * m.tilesY).toBe(m.angles);

      // 512px square tiles → 2048×2048 atlas.
      expect(m.tileSize).toBe(512);
      expect(m.atlasWidth).toBe(m.tilesX * m.tileSize);
      expect(m.atlasHeight).toBe(m.tilesY * m.tileSize);

      // Phase 2 shader assumptions: arrays must be non-empty + per-axis lengths
      // match the grid dimensions.
      expect(Array.isArray(m.azimuths)).toBe(true);
      expect(Array.isArray(m.elevations)).toBe(true);
      expect(m.azimuths.length).toBe(m.tilesX);
      expect(m.elevations.length).toBe(m.tilesY);

      // Sized billboard quad needs a positive worldSize. EZ-Tree GLBs are
      // unit-bounded (~1m) and the runtime instance scale lifts to real size.
      expect(m.worldSize).toBeGreaterThan(0);
      expect(m.bbox.min[1]).toBeLessThan(m.bbox.max[1]);

      // Production color contract — Phase 2 needs unlit baseColor + normal
      // aux + depth aux (parallax + depth-discard ghost suppression).
      expect(m.colorLayer).toBe('baseColor');
      expect(m.normalSpace).toBe('capture-view');
      expect(m.bgColor).toBe('transparent');
      expect(m.auxLayers).toEqual(expect.arrayContaining(['albedo', 'normal', 'depth']));

      // Edge bleed required at transparent boundaries to prevent magenta-
      // halo when sampler bilinear-interpolates across alpha cutoffs.
      expect(m.edgeBleedPx).toBeGreaterThanOrEqual(2);
    });

    it('all four committed artifacts exist + non-empty', () => {
      const albedo = resolve(TREES_DIR, `${name}.imposter.png`);
      expect(existsSync(albedo), `albedo missing: ${albedo}`).toBe(true);
      expect(statSync(albedo).size, `albedo empty: ${albedo}`).toBeGreaterThan(0);
      expectAuxLayerExists(name, 'normal');
      expectAuxLayerExists(name, 'depth');
    });
  });
});
