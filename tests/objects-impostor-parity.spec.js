import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadManifest,
  enabledImpostorTargets,
  impostorIdentity,
  withImpostorIdentity,
  serializeSidecar,
} from '../tools/bake-tree-impostors.mjs';

/**
 * Cycle 50 Phase 2 — object-impostor determinism golden.
 *
 * Mirrors tests/placement-manifest.spec.js: it guards that the committed
 * impostor artifacts are exactly reproducible from source. The catch: unlike
 * the pure-JS placement bake, the impostor bake needs the source GLBs
 * (assets/_originals/**, gitignored) and the Pixel Forge Kiln browser renderer —
 * neither is available on CI. So the CI-portable golden has two halves:
 *
 *   1. Sidecar determinism — re-stamping the committed sidecar with the manifest
 *      identity reproduces it byte-for-byte (pure JSON, runs anywhere). This is
 *      the part the baker re-runs after Kiln on a real bake, so byte-stability
 *      here means a re-bake's sidecar is byte-stable too.
 *   2. Atlas determinism — each committed PNG atlas matches a recorded sha256
 *      (objects-impostor-parity.hashes.json). A real re-bake that changes a
 *      single atlas byte trips this; regenerating the hashes is the explicit,
 *      reviewed act of accepting a new bake (see the cycle plan's hard stops).
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recordedHashes = JSON.parse(
  readFileSync(resolve(root, 'tests/objects-impostor-parity.hashes.json'), 'utf8'),
).atlases;

const targets = [...enabledImpostorTargets(loadManifest())];

const relPosix = (abs) => relative(root, abs).split('\\').join('/');
const atlasLayers = (atlasPath) => [
  atlasPath,
  atlasPath.replace(/\.png$/, '.normal.png'),
  atlasPath.replace(/\.png$/, '.depth.png'),
];

describe('object impostor parity — determinism golden', () => {
  it('has at least one impostor-enabled target to guard', () => {
    expect(targets.length).toBeGreaterThan(0);
  });

  describe.each(targets.map((t) => [`${t.obj.id}/${t.layoutId}/${t.variant.id}`, t]))('%s', (label, t) => {
    it('tile grid is internally consistent: tilesX * tilesY === angles', () => {
      const m = JSON.parse(readFileSync(t.sidecarPath, 'utf8'));
      expect(m.tilesX * m.tilesY).toBe(m.angles);
    });

    it('sidecar carries the manifest identity', () => {
      const m = JSON.parse(readFileSync(t.sidecarPath, 'utf8'));
      expect(m.objectId).toBe(t.obj.id);
      expect(m.category).toBe(t.obj.category);
      expect(m.variant).toBe(t.variant.id);
      expect(m.layoutId).toBe(t.layoutId);
    });

    it('re-stamping the committed sidecar is byte-identical (idempotent)', () => {
      const raw = readFileSync(t.sidecarPath, 'utf8');
      const restamped = serializeSidecar(
        withImpostorIdentity(JSON.parse(raw), impostorIdentity(t.obj, t.layoutId, t.variant)),
      );
      expect(restamped).toBe(raw);
    });

    it('every atlas layer has a recorded content-hash', () => {
      for (const layerPath of atlasLayers(t.atlasPath)) {
        const rel = relPosix(layerPath);
        expect(recordedHashes[rel], `no recorded hash for ${rel}`).toBeTruthy();
      }
    });
  });

  describe('committed atlases match recorded sha256 (a re-bake must reproduce these)', () => {
    it.each(Object.keys(recordedHashes))('%s', (rel) => {
      const abs = resolve(root, rel);
      expect(existsSync(abs), `atlas missing: ${rel}`).toBe(true);
      const hash = createHash('sha256').update(readFileSync(abs)).digest('hex');
      expect(hash).toBe(recordedHashes[rel]);
    });
  });
});
