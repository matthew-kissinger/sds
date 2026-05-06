# Phase G — tree art direction — PARKED

**Trigger:** depends on Phase D 8×4 impostor pipeline (parked); 6
fresh tree variants require recipe authoring + bake passes.

## Why parked

Phase G calls for:

1. **Bake 6 tree variants** — `tools/bake-trees.mjs` extends with new
   recipes:
   - `tree-deciduous-small` (sapling)
   - `tree-deciduous-medium` (existing tree1 baseline)
   - `tree-deciduous-large` (ancient)
   - `tree-birch` (white-bark, slim)
   - `tree-conifer-reintro` (Cycle 22 pine removal reverses)
   - `tree-fall-color` (warm tint variant)
2. **Re-bake impostors for all 6** via the new 8×4 pipeline (Phase D —
   parked).
3. **Per-scene tree distribution profiles** — `shared/TreePlacement.js`
   reads `sceneDef.treeProfile`. Field=English pasture, RH=Mediterranean,
   OC=Pacific Northwest distributions.
4. **Authored landmark trees per scene** — 4-6 per scene, marked
   `sceneDef.landmarks`.
5. **Embedded wind in impostor bake** — Pixel Forge `--frames=4
   --windPhase=0..360` 4-frame impostor sequence.

Item 5 requires a Pixel Forge feature path that may not be available
out-of-the-box. Items 1+2 alone are ~6-8 hours of recipe iteration +
visual review.

## What's reverted

Nothing landed. Current tree1 / tree2 + 4×4 impostors stay.

## Recommended morning actions

1. Schedule as a Cycle 30 candidate (after Phase D lands the new
   atlas pipeline).
2. Author the 6 tree recipes one at a time in the asset gallery
   tooling.
3. Validate per-scene distribution profiles via a dedicated visual
   regression run.

## Budget delta

Plan: 4hr autonomous. Realistic: 16-24hr (recipe iteration + 6 bakes
+ 6 impostor re-bakes + per-scene profile authoring + landmark
positioning + wind animation in atlas). Parked rather than ship a
mismatched mix of tree sizes that wouldn't read as "English pasture"
or "Pacific Northwest" without all 6 variants.
