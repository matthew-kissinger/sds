import { describe, it, expect } from 'vitest';
import { loadManifest } from '../tools/bake-tree-impostors.mjs';
import { manifestImpostorBase, resolveImpostorBase } from '../js/world/objectImpostorManifest.js';

/**
 * Cycle 50 Phase 3 — runtime impostor path resolution from the object manifest.
 *
 * Covers pure resolution (manifestImpostorBase) and the degrade-not-crash
 * fallback (resolveImpostorBase with no reachable manifest, as in the node test
 * env where fetch of a relative URL fails). The runtime route in
 * js/world/TreePlacement.js resolves through resolveImpostorBase instead of a
 * hardcoded `assets/models/trees/<type>` template.
 */

const manifest = loadManifest();

describe('object impostor manifest — path resolution', () => {
  it('resolves the latlon-hemi-y base for the production trees', () => {
    expect(manifestImpostorBase(manifest, 'tree1', 'latlon-hemi-y')).toBe('assets/models/trees/tree1.imposter');
    expect(manifestImpostorBase(manifest, 'tree2', 'latlon-hemi-y')).toBe('assets/models/trees/tree2.imposter');
  });

  it('resolves the octahedral base under the octahedral subdir', () => {
    expect(manifestImpostorBase(manifest, 'tree1', 'octahedral')).toBe('assets/models/trees/octahedral/tree1.imposter');
    expect(manifestImpostorBase(manifest, 'tree2', 'octahedral')).toBe('assets/models/trees/octahedral/tree2.imposter');
  });

  it('returns null for a non-impostor object or an unknown id/layout', () => {
    expect(manifestImpostorBase(manifest, 'rock1', 'latlon-hemi-y')).toBeNull();
    expect(manifestImpostorBase(manifest, 'nope', 'latlon-hemi-y')).toBeNull();
    expect(manifestImpostorBase(manifest, 'tree1', 'nope-layout')).toBeNull();
  });

  it('falls back to the legacy path without throwing when the manifest is unreachable', async () => {
    // In the node test env, fetch(relative-url) fails, so loadObjectManifest
    // resolves null and resolveImpostorBase returns the legacy hardcoded shape.
    await expect(resolveImpostorBase('tree1')).resolves.toBe('assets/models/trees/tree1.imposter');
    await expect(resolveImpostorBase('tree2', { octahedral: true }))
      .resolves.toBe('assets/models/trees/octahedral/tree2.imposter');
  });
});
