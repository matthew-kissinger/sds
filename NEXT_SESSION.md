# Next Session - Cycle 91 in flight (lighting-perf-optimization)

> **Updated:** 2026-06-11
> **For:** Cycle 91 (`docs/cycle-91-plan.md`, active - P1 + most of Phase 2.5 shipped)
> **Pickup priority:** Phase 2.5 item 4 - wire the NSL consolidated cull pass for the full LOD chain (LOD0 / LOD1 / kiln impostor by camera distance). It is the structural fix for Matt's open observation: small trees at distance render full LOD0 and their alphaHash leaf cards dissolve to near-invisible at sub-pixel coverage.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-91-plan.md`](docs/cycle-91-plan.md) (Goal, Evidence base, Phase 2.5 Status block) -> `git log --oneline -8`.

## Where It Stands

**Cycle 91 is mid-flight.** Shipped so far (commits on main):

1. **P1 shadow caster scope** (`eaa4e3c`): alpha-material leaf cards out of the shadow depth pass, opaque trunks keep casting. NSL driven probe 71.9 -> 142.9 median, 44.6 -> 65.7 mean 1%-low (gates 130/55 pass); field rail unchanged. Plus texel-proportional shadow bias, last-texel guard on the day-loop shadow follow.
2. **Phase 2.5 tree pipeline remake** (Matt's directive, pre-empts other phases): trees re-baked from ez-tree GitHub main (sibling clone `../ez-tree` @48dc193 - stratified sampling, rounded leaf normals, externalized textures), preset-pure structure, real PBR bark (Bark014/Bark015 after the preset defaults washed white in-game), green ash-leaf swap on the tree1 aspen (kills the garish yellow island). LOD1s meshopt-baked at ratio 0.25; kiln impostor atlases re-baked via the compiled pixelforge CLI; tree GLB textures WebP-converted (8.3 -> 1.9 MB). White-trunk root cause fixed properly: transform-free GLBs (V-repeat baked into UVs) + `webgpuTreeBranchNodeMaterial` now samples source map/normal/AO instead of a flat tint.
3. **Minimap/timer overlap fixed** (`--sds-topright-reserve` CSS variable; layout assert now includes the timer).

**Open items, in order:**

1. **Phase 2.5 item 4 (the pickup):** cull-pass LOD selection on NSL - per-type impostor controllers sharing the source offset buffers, LOD0 near / impostor far (LOD1 mid-band tier-tunable). Design notes in the plan's Phase 3 item 4 (absorbed) + Phase 2.5. Probe gates: median/1%-low no worse than 142.9/65.7. Survey shots before/after.
2. After item 4: re-check Matt's distant-leaf complaint; if a mid-band still reads thin, bump tree1 leaf size/count (new bake has ~900 leaf quads vs the old 2,310).
3. Verify the WebGPU leaf node material handles the new rounded leaf normals (WebGL backface-flip skip shipped in `shaderPatches.js`; WebGPU equivalent unverified).
4. Then the remaining plan phases: P2 canopy shadows (impostor casters + cadence), P3 controller consolidation, P4 per-frame waste, P5 load/boot (+ tier-gated LOD1 fetch), P6 asset slimming, P7 remaining assets (wolf, rocks, farm house), P8 lighting uplift + pill decision.

**Matt review queue:** tree survey shots in `cycle91-validation/asset-survey/` (staging candidates + `nsl-noon-new-trees.png`); swap any pick via `tools/asset-gallery/picks.json` + `node tools/asset-gen/integrate.mjs --compress`.

## Carryover (recorded in BACKLOG)

- Matt feel-check of the new NSL look + new trees on the live site.
- S24+ device pass (mobile shadows off, mobile tree-cull path, now also new tree assets on low tier).
- Screenshot golden re-capture (stale since 2026-05-16; NSL + trees intentionally changed - re-capture after Matt approves).
- Launch posting from `docs/launch/` (drafts ready, Matt's voice).
- three.js r185 adoption when it publishes (issue #33730 fix unblocks shadow-camera-layer caster patterns).

## Working Contract

- No `shared/` deterministic-core edits; sim-baselines stay byte-identical.
- Matt publishes every player-facing artifact.
- Agent-launched Vite/Playwright sets `SDS_SUPPRESS_BROWSER_OPEN=1`; close every probe page/listener after use.
- Perf probes drive input; idle-camera numbers must not gate.
- `renderer.compute()` is a `queue.submit()` - batch compute passes into one call per frame.
- Tree bakes need the sibling clones: `../ez-tree` (pinned 48dc193, `npm run build:lib`) and `../pixel-forge` (compiled CLI at `packages/cli/dist/index.js`).
- CI e2e runs with `--grep-invert='@local-only'`. NSL e2e specs arm the world via the carousel before every Play.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-91-plan.md`](docs/cycle-91-plan.md) |
| Jitter probe + rail | `tools/cycle89-jitter-probe.mjs`, `npm run perf:jitter [-- --check]` |
| Tree bake pipeline | `tools/bake-trees.mjs` (+ `bake-trees/bake.html`), `tools/bake-tree-lod1.mjs`, `tools/bake-tree-impostors.mjs`, `tools/capture-tree-candidates.mjs` |
| Cycle 91 evidence | `cycle91-validation/` (local, gitignored) |
| Closed cycles | [`docs/BACKLOG.md`](docs/BACKLOG.md) + [`docs/archive/cycles/`](docs/archive/cycles/) |
| Launch drafts (Matt to post) | [`docs/launch/`](docs/launch/) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
