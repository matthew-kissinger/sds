# Treeline asset source and recipe

The shipped treeline combines two complete trees from mehrasaur's
[Fox Trees Pack](https://opengameart.org/content/fox-trees-pack):
`tree-round` and `tree-spreading`. The source pack is CC0. The exact source
archive URL, archive digest, extracted-file digests and a local license
snapshot are recorded in `procedural-manifest.json` and `sources/`.

The committed OBJ and MTL pairs are editable source, not runtime downloads.
`tools/bake-sourced-tree-candidates.mjs` normalizes both trees, tucks their
foliage slightly over the branch junction and writes
`fox-hybrid-family.json`. Runtime code applies the game's TSL wood and canopy
materials and deterministic whole-tree variation.

Rebuild the derived family from the repository root:

```bash
node tools/bake-sourced-tree-candidates.mjs
```

The shipped placement is in `manifest.json`. It contains 139 trees, all
outside the fence, with no understory shrubs or exposed root runs. The four
profiles vary the two source silhouettes without changing their trunk and
crown proportions independently. The closest conservative same-belt crown
gap is 2.6049 metres.

The runtime submits three instanced geometry draws and 94,798 triangles before
pooled shadows. It uses no textures, external model fetches or opaque binary
assets. `tests/treeline-assets.spec.ts` verifies provenance, geometry,
placement and the no-shrub contract.
