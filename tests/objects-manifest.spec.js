/**
 * Cycle 50 P1: object-manifest schema + source-existence guard.
 *
 * Asserts assets/objects.manifest.json parses, declares tree1/tree2 as
 * impostor-enabled trees, references only defined layout presets, and that
 * every object's source GLB exists on disk. The manifest replaces the hardcoded
 * tree list in tools/bake-tree-impostors.mjs, so this is the schema gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'assets/objects.manifest.json'), 'utf8'));

describe('object manifest', () => {
  it('parses with a version, objects array, and layoutPresets', () => {
    expect(manifest.version).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(manifest.objects)).toBe(true);
    expect(typeof manifest.layoutPresets).toBe('object');
    expect(manifest.layoutPresets['latlon-hemi-y']).toBeTruthy();
  });

  it('declares tree1 and tree2 as impostor-enabled trees', () => {
    for (const id of ['tree1', 'tree2']) {
      const obj = manifest.objects.find((o) => o.id === id);
      expect(obj, `object ${id}`).toBeTruthy();
      expect(obj.category).toBe('tree');
      expect(obj.impostor.enabled).toBe(true);
      expect(obj.impostor.layouts).toContain('latlon-hemi-y');
      expect(obj.impostor.variants.some((v) => v.default)).toBe(true);
    }
  });

  it('every object source GLB exists on disk', () => {
    for (const obj of manifest.objects) {
      expect(existsSync(resolve(root, obj.source)), `source for ${obj.id}: ${obj.source}`).toBe(true);
    }
  });

  it('every impostor-enabled object references a defined layout preset', () => {
    for (const obj of manifest.objects) {
      if (!obj.impostor?.enabled) continue;
      for (const layout of obj.impostor.layouts) {
        expect(manifest.layoutPresets[layout], `layout ${layout} for ${obj.id}`).toBeTruthy();
      }
    }
  });

  it('object ids are unique', () => {
    const ids = manifest.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
