# Phase D — impostor parity — PARKED

**Trigger:** depends on Phase C aerial-LUT (parked); Pixel Forge re-bake
on Windows is multi-hour + visually-reviewed work.

## Why parked

Phase D's deliverables:

1. **Re-bake atlases at 8×4 lat-lon × 256px tiles** via Pixel Forge —
   needs a full asset pipeline run (~30+ min per tree, ×2 trees).
   Pixel Forge CLI on Windows has a known install workaround (per
   NEXT_SESSION.md standing risks: bun-run hangs on CDP-pipe, use
   node tsx); even so the bake step is multi-hour and produces
   binary atlas files that need visual review.
2. **Padded-atlas mipmaps** — couples to the bake (16px tile padding
   in the same Pixel Forge invocation).
3. **Hybrid trunk-mesh + impostor canopy** — Cycle 21 Phase 4
   deferred work; new LOD chain shape (LOD0 0-180m, then trunk-mesh +
   impostor-canopy 180m+).
4. **Sky-LUT-coupled relighting** — depends on Phase C (parked).
5. **Delete `tools/generate-impostor-lut.mjs` + `uMatchBoost`
   plumbing (~190 LOC)** — independent of the bake; could ship
   standalone once the new atlas is in.
6. **Update kiln shader vertex constants** for 8×4 cell math.

Items 1-3 + 6 are inseparable from a fresh Pixel Forge bake.
Item 5 is an LOC reduction that depends on items 1+6 landing first
(the new shader path replaces the matchBoost compensation).

## What's reverted

Nothing landed. The current 4×4 atlas + uMatchBoost plumbing stays.

## Recommended morning actions

1. Schedule Phase D as a Cycle 26 candidate alongside Phase C.
2. Run `npm run bake-tree-impostors` against an updated
   `tools/bake-tree-impostors.mjs --azimuths=8 --elevations=4
   --tileSize=256` once Phase C lands.
3. Visually review new atlases via the existing inspector HTML before
   committing.

## Budget delta

Plan: 4hr autonomous. Realistic: 8-16hr (bake time + visual review +
shader rework + matchBoost LOC removal). Parked rather than ship a
half-rebaked atlas that wouldn't load cleanly.
