# Treeline assets and placement

The shipped treeline is original procedural work licensed with the code under
AGPL-3.0-or-later. No foliage model or texture is fetched at runtime.

`procedural-manifest.json` is the source ledger. It names the geometry,
material, assembly, placement and concept-reference files that reproduce the
runtime field. The geometry recipes build one interlocking-lobe crown, one low hedgerow
form, rooted wood and pooled ground shadows. The placement recipe gives those
shared forms four tree proportions and two shrub colour families:

- broad rooted oak
- rounded elm
- airy ash
- field oak
- hawthorn
- blackthorn

The concept under `assets/concepts/v3-original-foliage-reference.png` guided the
family language. It is an authoring reference only and is never imported by the
game. Its provider, prompt and purpose are recorded in
`assets/concepts/README.md`.

## Reproducing the field

The committed placement manifest is produced deterministically:

```powershell
npm run bake:placement
```

The runtime geometry needs no binary bake. It is constructed directly from the
committed TypeScript recipes listed in `procedural-manifest.json`. Tests verify
the mesh bounds, normals, triangle counts, family coverage, deterministic
placement and four-draw field budget.

The current field contains 209 crowns, 153 shrubs and 791 rooted wood
instances. Before pooled shadows it submits 311,222 triangles in three
instanced draws. Shadows add the fourth treeline draw. The foliage uses no
textures and no external models.
