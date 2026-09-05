# Treeline asset source and recipe

The active tree family is an original, procedurally authored sculpted oak.
Seven overlapping opaque crown masses form an uneven spreading silhouette over
a tapered trunk and thirteen branch segments. Smooth crown normals preserve
soft volume while the shared TSL material supplies the game's cel-shaded light.
Four instance profiles provide wide, upright, balanced and windswept trees.

`tools/bake-sculpted-trees.mjs` is the editable, deterministic source recipe,
authored for this repository under AGPL-3.0-or-later. It writes
`assets/treeline/sculpted-oak-family.json`; both files are pinned by SHA-256 in
`procedural-manifest.json`. The generated geometry also records its recipe
digest, author and license. No third-party tree geometry is used by this family.

Rebuild the geometry from the repository root:

```bash
node tools/bake-sculpted-trees.mjs
```

Verify a rebuild without writing files:

```bash
node tools/bake-sculpted-trees.mjs --check
```

After an intentional recipe change, review the geometry and update its source
and generated digests and triangle counts in `procedural-manifest.json`.
The tests and release probe reject stale provenance receipts.

The existing `manifest.json` placement remains unchanged: 139 trees outside
the fence, no understory shrubs and no exposed root runs. The closest
conservative same-belt crown gap remains 2.6049 metres. Inactive shrub source
and its geometry contract remain available, with zero runtime instances.

Each tree has 560 crown and 364 wood triangles. The field submits three
instanced geometry draws and 128,436 triangles before pooled shadows. It uses
no textures, transparent leaf cards, external model fetches or runtime geometry
generation. Mobile performance and visual acceptance are measured in the
running production build; these geometry counts alone are not an acceptance.

The earlier CC0 Fox Trees Pack OBJ/MTL sources, their license snapshot under
`sources/`, the old baking tool and `fox-hybrid-family.json` are retained as
historical reference. They are not inputs to the active sculpted oak recipe or
the runtime tree family. Their attribution remains with those source files.

Use `docs/art-review.md` for production-build comparison captures and
`tests/treeline-assets.spec.ts` for provenance, deterministic bake, geometry,
placement, opaque-material and no-shrub contracts.
