import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OCTA_DIR = resolve(__dirname, '../assets/models/trees/octahedral');
const TREES = ['tree1', 'tree2'];

function loadSidecar(name) {
  const path = resolve(OCTA_DIR, `${name}.imposter.json`);
  expect(existsSync(path), `sidecar missing: ${path}`).toBe(true);
  expect(statSync(path).size, `sidecar empty: ${path}`).toBeGreaterThan(0);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function expectPng(name, suffix) {
  const path = resolve(OCTA_DIR, `${name}.imposter${suffix}.png`);
  expect(existsSync(path), `atlas missing: ${path}`).toBe(true);
  expect(statSync(path).size, `atlas empty: ${path}`).toBeGreaterThan(0);
}

describe('Kiln v2 octahedral tree impostor lab contract', () => {
  describe.each(TREES)('%s.imposter', (name) => {
    it('keeps v2 octahedral sidecar metadata explicit and lab-only', () => {
      const m = loadSidecar(name);

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

    it('commits albedo, normal, and depth atlases beside the v2 sidecar', () => {
      expectPng(name, '');
      expectPng(name, '.normal');
      expectPng(name, '.depth');
    });
  });
});
