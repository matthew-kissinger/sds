# Fox full-tree candidates

## Decision

Keep both silhouettes for owner comparison. Candidate A, Spreading, is the
active field because its broad low crown is the stronger storybook oak. Round
is a viable narrower deciduous alternative. Rejected EZ-Tree, Kenney and
FabinhoSC experiments are not part of this change.

## Exact source

- Work: Fox - Trees Pack
- Author: mehrasaur, distributed as `@unkindfox` in the pack preview
- First-party page: https://opengameart.org/content/fox-trees-pack
- Exact archive: https://opengameart.org/sites/default/files/tree_pack_v_0_1.zip
- License: CC0 1.0
- Archive SHA-256: `f18e963af10d3b3f05205eff0907f7b5a3c2c06b846f8c3c8c31e94652adac7f`
- Archive size: 3,444,385 bytes
- Spreading OBJ SHA-256: `e1fb728c393a53c55b226df6ab434f8891bf517790a24712514ea145e6564441`
- Round OBJ SHA-256: `0185db4da9db2752de368af457044079e2185761bd687e02a177a3a7df20f81d`

The editable OBJ and MTL pairs plus a dated license snapshot are committed
under `assets/treeline/sources/`. `assets/treeline/procedural-manifest.json`
records every source, material and output hash.

## Deterministic adaptation

Run:

```powershell
node tools/bake-sourced-tree-candidates.mjs
npm run bake:placement
```

The bake separates source foliage and wood, keeps both in one normalized frame,
discards source materials and textures, and lowers only the foliage by 5% for
Spreading or 7.5% for Round. This buries the source fork without changing the
outer crown silhouette. Runtime uses Herd's shared TSL palette, base-pinned
canopy motion, fixed seed, instancing and proportional whole-tree variation.
There is no runtime generator, model loader, imported texture, URL flag, leaf
card, source wind hook or source LOD.

## Candidate A: Spreading

- Source: `tree-spreading.obj`
- Geometry: 160 foliage triangles and 164 wood triangles
- Hero envelope: 14.3 m wide, 10.5 m deep, 11.23 m grounded full-tree height
- Field: 209 full trees, 153 shrubs, 116,676 submitted triangles before shadows
- Read: low continuous umbrella, asymmetric shoulder, one short branch glimpse,
  quiet source flare with no separate root spikes

Evidence:

- `captures/gallery/sourced-fox-spreading-final-gallery/hero-fixed.png`
- `captures/gallery/sourced-fox-spreading-final-gallery/follow.png`
- `captures/gallery/sourced-fox-spreading-final-gallery/classic.png`
- `captures/gallery/sourced-fox-spreading-final-gallery/phone.png`
- `captures/gallery/sourced-fox-spreading-final-gallery/classic-webgl2.png`

## Candidate B: Round

- Source: `tree-round.obj`
- Geometry: 160 foliage triangles and 202 wood triangles
- Hero envelope: 10 m wide, 9.4 m deep, 11.53 m grounded full-tree height
- Field: 209 full trees, 153 shrubs, 124,618 submitted triangles before shadows
- Read: narrower rounded crown, preserved source lean, one short fork glimpse,
  connected foliage and no roots or exposed terminals

Evidence:

- `captures/gallery/sourced-fox-round-final-gallery/hero-fixed.png`
- `captures/gallery/sourced-fox-round-final-gallery/follow.png`
- `captures/gallery/sourced-fox-round-final-gallery/classic.png`
- `captures/gallery/sourced-fox-round-final-gallery/phone.png`
- `captures/gallery/sourced-fox-round-final-gallery/classic-webgl2.png`

## Variation and validation

`captures/source-review/fox-trees-contact.png` records all nine source shapes.
`captures/source-review/fox-candidate-variations.png` records three deterministic
whole-tree proportion and yaw variants for each chosen style. Runtime field
placements use the same full-tree transform rule.

Both final galleries used seed `20260821`. WebGPU and WebGL2 captures were
nonblank with no page errors, failed requests or GLB loads. Five-second frame
samples were 6.9 ms p50 and 7.0 to 7.1 ms p95. The active field remains four
treeline draws, zero textures and zero runtime model loads. The production build
is 2,245.10 kB raw and 616.74 kB gzip for the main JavaScript chunk.

Focused source-chain tests pass 6 of 6 and world-placement tests pass 6 of 6.
Lint, TypeScript and the production build pass. Placement diagnostics report
zero unsupported crowns, zero exposed diagnostic terminals and zero vertical
drift. The full suite passed 323 of 328 tests. Its five unrelated failures are
existing CRLF-sensitive terrain, grass, audio and sheep shader source-string
checks in this Windows worktree; the candidate does not edit those surfaces.

## Risks

- Both candidates share one pack and visual vocabulary. The nine authored pack
  shapes offer efficient family expansion, but do not provide species-level
  botanical detail.
- Crown facets can pick up a yellow highlight from Herd's existing lighting.
  This is a palette issue, not an imported material.
- Spreading can still read as helmet-flat from high Classic angles. Round is
  less flat but less distinctive. Neither should be treated as final approval
  without owner comparison against the other candidate lanes.
