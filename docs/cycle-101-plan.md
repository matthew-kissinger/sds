# Cycle 101 - impostor-bake-repass

> Drafted 2026-06-14 after Cycle 100 closed; Goal + Phases authored the same day at `/cycle-start` (Matt: "lets do an imposter bake repass ... look at latest pixel-forge ... peek at terror in the jungle ... think first principles and implement proper imposters"). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

The far-tree impostor players actually see is a flat, single-angle 3-quad cross-billboard. On the only default path that renders far-tree impostors (Newsheepdogland, the consolidated compute-cull path), far trees are `createColdImpostorGeometry(atlas.sidecar, 0)` - a static cross-billboard sampling **one** azimuth tile (column 0) with a plain `MeshBasicMaterial` (no view-dependent tile selection, no normal relighting, no depth). The sophisticated kiln material we already built (camera-driven 3-tile blend + per-fragment relighting, both a WebGL `js/kiln-impostor-material.js` and a TSL `js/webgpuKilnImpostorNodeMaterial.js`) ships on **no default path** - it is reachable only via the `?webgpuNativeTreeImpostors` debug route. This cycle implements proper impostors: a view-dependent, relit impostor on the production paths, re-baked with pixel-forge's latest Kiln pipeline, validated by a settled-signal SSIM A/B (not the stale golden harness). User-visible before/after: orbit a far tree and the impostor's silhouette follows the camera and shades to the sun and sky instead of reading as a flat fixed-angle card; and Rolling Hills and Open Country gain a far-impostor band where today they render LOD0-only with no impostor on the default path.

## How to read this plan

This doc fixes the shape (data contracts, where new code slots in, acceptance), not the implementation choices. The references below are starting points, not the final answer; the Phase 1 spike picks the representation with numbers.

- **Research current best practice per sub-problem before coding.** The references: pixel-forge v0.2.0 (`../pixel-forge`, the mature Kiln baker), the Fable5 demo runtime vendored in terror-in-the-jungle (`../terror-in-the-jungle/examples/fable5-world-demo`), and SDS's own kiln material (already ~80% of the pieces, unwired).
- **Measure on the actual targets** (RTX 3070 desktop, mid-tier mobile) before committing a technique. Use the jitter rails + a settled SSIM A/B.
- **Pick the simplest thing that meets the budget.** If a re-wire of the existing latlon-hemi atlas reads correctly, ship that; escalate to a full octahedral re-bake only on demonstrated need.

The load-bearing constraint that dissolved: the impostor atlas format, sidecar, and `assets/objects.manifest.json` are **not** fence-frozen, and `shared/` is untouched (no sim-baseline, refactor-baseline, or wire-protocol impact). A re-bake is a non-fence change.

## Open questions to resolve before writing code (the Phase 1 spike answers these)

1. **Q1: Octahedral re-bake vs keep latlon-hemi-y?** Author lean: spike both in the orbit lab, pick with numbers. Octahedral gives ~2x tile efficiency + even angular coverage (pixel-forge + Fable5 both favor it); latlon-hemi is already wired and the skinny-trunk double-image risk under azimuth blend is lower. The honest answer is whichever holds silhouette + relight at the orbit for the lower atlas weight.
2. **Q2: Do we ship the depth channel?** Author lean: probably drop it. Depth is parallax-polish-only per all three references; albedo (baseColor, unlit) + capture-view normal carry the relight win. Dropping depth saves a third of the atlas weight. Confirm no visible loss in the spike.
3. **Q3: Cheapest correct way to give Rolling Hills + Open Country a far-impostor band?** Author lean: spike decides - either extend the consolidated compute-cull gate (today `sceneDef.boundary.kind === 'coastline'` only) to those scenes, or add a far-impostor band to the per-chunk path. The consolidated path is the modern one (Cycle 90/91); extending it is likely cleaner than bolting impostors onto the older per-chunk fan-out. If it is an architectural forklift, that is a Hard stop (defer the per-chunk band, do not expand scope mid-cycle).
4. **Q4: Atlas resolution.** Author lean: 4x4 @ 512 (2048^2) is the current shape; the spike measures SSIM-vs-LOD0 against atlas weight and confirms or revises tile count / tile size.

## Architecture / shared changes

None in `shared/`. The cycle touches the client render path + the bake pipeline only: the impostor TSL material, the production wiring on both render paths, a re-baked atlas + sidecar (possibly octahedral, possibly a sidecar version bump), and the bake/encode tooling. The lighting must read the same atmosphere uniforms the terrain and foliage already use, so the impostor tracks time-of-day by construction.

## Phase shape rules

≤ 8 phases (this cycle has 7), each a single sharp goal of ≤ 4 hours, each fully autonomous or fully paired (no mixed mode).

## Phases

### Phase 1 - Spike: representation + relight proof (~4hr, autonomous, risky-primitive-first)

**Independently testable.** This is the risky primitive; pick it with numbers before the bake (per the spike-risky-primitives rule). Use `js/impostors/impostorOrbitLab.js` + the `?webgpuNativeTreeImpostors` debug route to prove a view-dependent relit impostor on a single tree, and answer Q1-Q4.

1. Stand up an orbit A/B in the lab: impostor vs the LOD0 mesh at matched camera across a yaw + elevation sweep.
2. Compare latlon-hemi vs octahedral, with and without depth, at the orbit; relight from the captured normal under a moving sun.
3. Decide projection, channels, resolution, and the per-chunk-extension approach (Q3). Save artifacts (orbit captures, SSIM-vs-LOD0 table, atlas-weight table) to `cycle101-validation/`.

**Acceptance (EARS):**

- When the spike completes, then `cycle101-validation/` shall contain an orbit A/B (impostor vs LOD0 mesh) and a recommendation for projection (latlon vs octahedral), channels (depth kept or dropped), and resolution, each backed by a measured number.
- When the spike completes, then this plan's Q1-Q4 shall be edited to RESOLVED with the chosen answer.
- If the spike shows the per-chunk extension (Q3) requires moving Rolling Hills / Open Country wholesale onto the consolidated cull path, then the migration cost shall be measured and surfaced to Matt before Phase 5 starts.

### Phase 2 - Bake repass (~3hr, autonomous, local-only bake)

**Depends on:** Phase 1's projection/channels/resolution decision.

Re-bake tree1 + tree2 with pixel-forge latest per the Phase 1 decision; port the BFS edge-bleed / dilation from `Impostors.ts` if the current 2px `edgeBleed` shows haloing; update `assets/objects.manifest.json` + the sidecars + KTX2 encode. The bake is local-only (CI cannot run Kiln), so commit the artifacts.

- Files: `tools/bake-tree-impostors.mjs`, `tools/encode-impostors-ktx2.mjs`, `assets/objects.manifest.json`, `assets/models/trees/*.imposter.*`.

**Acceptance (EARS):**

- When the re-bake runs, then each tree's atlas + sidecar shall reflect the Phase 1 projection / channels / resolution, and the sidecar shall self-validate (`atlasWidth === tilesX * tileSize`; the `directions` or `azimuths`/`elevations` length equals the tile count).
- When the atlas re-bakes, then a KTX2 sibling shall be re-encoded for each shipped layer and `tools/ktx2-impostor-probe.mjs` shall confirm KTX2 loads with no PNG fallthrough.
- If the depth channel is dropped (Q2), then no shipped sidecar shall reference a depth layer and no dist artifact shall include a `*.depth.*` file.

### Phase 3 - Production impostor material (~4hr, autonomous)

**Depends on:** Phase 2 (the material reads the new sidecar).

Extend `js/webgpuKilnImpostorNodeMaterial.js` into a real in-shader billboard + view-dependent tile-select + multi-tile blend + normal relight, porting the Fable5 runtime techniques: 4-tile bilinear blend (or azimuth crossfade per the spike) so the silhouette tracks the view with no single-tile pop; decode the capture-view normal, rotate by the instance yaw, feed `transformNormalToView` so the impostor gets real sun/sky response; `specularIntensity ~0.25` to tame the glancing-sun silver; night ambient multiplied inside the albedo, not added after.

- Files: `js/webgpuKilnImpostorNodeMaterial.js`, `js/webgpuImpostorNodeMaterialFactories.js`, `js/webgpuImpostorMaterialAdapter.js`, `js/impostors/impostorTileSelection.js` (if octahedral selection changes), tests.

**Acceptance (EARS):**

- When the camera orbits a far tree, then the impostor material shall select tiles by camera-to-instance direction and blend neighbors so the silhouette tracks the view with no single-tile pop.
- While the sun moves across the sky, the impostor shall relight from the captured normal so its shading tracks the atmosphere rather than a fixed baked shade.
- When `npm test` runs, then a spec shall cover the tile-selection + blend math (extend `impostorTileSelection` / orbit-lab specs).

### Phase 4 - Wire onto the consolidated compute-cull far path (Newsheepdogland) (~3hr, autonomous)

**Depends on:** Phase 3.

Replace the static `createColdImpostorGeometry(atlas.sidecar, 0)` cross-billboard on the far-impostor controller with the Phase 3 view-dependent relit impostor for coastline scenes (NSL). Keep cold-coverage coherent (cold scatter still byte-matches wave scatter; impostor-first loading unaffected).

- Files: `js/world/TreePlacement.js`, `js/world/treeComputeCull.js` (if per-instance attribute plumbing is needed), `js/world/foliageStreaming.js` (cold-coverage coherence).

**Acceptance (EARS):**

- When NSL renders far trees on the consolidated path, then the far band shall use the view-dependent relit impostor, not `MeshBasicMaterial` sampling column 0.
- While NSL streams foliage, then the cold impostor coverage shall stay byte-coherent with the wave scatter (the Cycle 88 coverage rule holds).
- If a far impostor would cast a shadow, then it shall not (the durable no-far-impostor-shadow rule holds).

### Phase 5 - Extend the far-impostor band to the per-chunk islands (~4hr, autonomous)

**Depends on:** Phase 3 + the Phase 1 Q3 decision.

Give Rolling Hills + Open Country a far-impostor band using the approach decided in Phase 1. Today these render LOD0-only on the default WebGPU path. Gate the new band on a `SceneDef` flag, not a hardcoded scene-id branch (per `scene-and-render.md`).

- Files: `js/world/TreePlacement.js` (the gate / per-chunk far band), `shared/scenes/types.js` + the affected scene defs **only if** a scene-def opt-in is the chosen mechanism (optional field with a default = the cheap fence case; migrate all consumers in the same PR).

**Acceptance (EARS):**

- When Rolling Hills or Open Country renders trees beyond the far switch, then a view-dependent relit impostor band shall render where today there is none.
- When a new scene needs the far band, then it shall opt in via a `SceneDef` flag, not a hardcoded scene-id branch in render code.
- If the per-chunk extension would regress the field or NSL jitter rails, then stop and surface before shipping.

### Phase 6 - Validation (~3hr, autonomous)

**Depends on:** Phases 4 + 5.

Settled-signal SSIM A/B (impostor vs LOD0 at matched poses across a yaw sweep) - **not** the stale golden harness. Perf on NSL + Rolling Hills + Open Country (jitter rails). Parity across the desktop-no-LOD1 and mobile-LOD1 ladders.

- Files: `tools/` (a settled-signal impostor A/B probe, reusing the `tools/ktx2-impostor-probe.mjs` settle pattern), `cycle101-validation/`.

**Acceptance (EARS):**

- When the A/B probe runs, then the impostor shall hold SSIM >= the Phase 1 threshold vs the LOD0 mesh at matched camera across a yaw sweep, and the result shall be saved to `cycle101-validation/`.
- When `npm run perf:jitter:nsl -- --check=1` runs (warm rerun), then NSL shall stay within the Cycle 96 budget (1%-low >= 100, worst-delta <= 45ms, hitch <= 30 per 30s).
- While on the mobile (low) tier, then the impostor path shall not regress the mobile LOD1 ladder (no desktop-only path leaks to low tier).

### Phase 7 - Paired review + close (paired)

**Depends on:** Phase 6.

Visual sign-off with Matt (orbit before/after on NSL + Rolling Hills + Open Country, sun-sweep relight, the LOD0-to-impostor transition seam), then `/validate` and `/cycle-close`.

**Acceptance (EARS):**

- When Matt signs off on the orbit + sun-sweep look, then the impostor change ships; otherwise the spike's alternate (latlon vs octahedral) is reconsidered.
- When the cycle closes, then `npm test` + `npm run build` shall pass and the deploy on `main` shall be green.

## Dependencies

```
Phase 1 (spike) → Phase 2 (bake) → Phase 3 (material) → Phase 4 (NSL wire) + Phase 5 (per-chunk band, parallel) → Phase 6 (validation) → Phase 7 (paired close)
```

Phase 1 gates everything (it picks the representation). Phases 4 and 5 can run in parallel once Phase 3 lands (both consume the same material; 4 touches the consolidated path, 5 the per-chunk path / scene-def gate).

## Frozen files (cycle-specific)

- `shared/**` - untouched this cycle (no sim-baseline, refactor-baseline, or wire impact). Listed so the fence is explicit.
- The impostor atlas, sidecar, and `assets/objects.manifest.json` are **not** frozen - the re-bake is the authorized change.
- `shared/scenes/types.js` (fence-frozen) - touched **only if** Phase 5 adds a far-band `SceneDef` flag, and only as the cheap case (an optional field with a default), with all consumers migrated in the same PR. If the per-chunk band needs anything more than an additive optional field, stop and surface.

## Hard stops

Durable stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific additions:

1. If the Phase 5 per-chunk extension turns out to need an architectural forklift (moving Rolling Hills / Open Country wholesale onto the consolidated cull path with unbounded risk), stop and surface - defer the per-chunk band to a follow-up cycle rather than expand scope mid-cycle.
2. If a re-bake moves a non-impostor baseline (`tests/sim-baseline/*`, `tests/refactor-baseline/*`), stop - the bake should only touch impostor atlases / sidecars.
3. If NSL or the field jitter rails regress past the Cycle 96 budgets on a warm rerun, stop.
4. Far impostors must never cast shadows (durable rule). If a path adds far-impostor shadow casting, stop.
5. The golden harness is NOT the impostor gate (it is stale and captures before textures resolve). Do not regenerate goldens to "prove" the impostor; use the settled SSIM A/B.

## What NOT to do during this cycle

- Don't reintroduce the deleted compensation patches (the `uMatchBoost` calibration LUT, atmospheric desat). The relight model + edge-bleed are the proper fix, not a per-scene color LUT (the polish-program thesis - see [`DECISIONS.md`](../DECISIONS.md)).
- Don't add Fable5's crown-proxy far-shadow band; it conflicts with the durable no-far-impostor-shadow rule unless Matt explicitly authorizes it.
- Don't collapse the desktop-no-LOD1 and mobile-LOD1 ladders for cleanliness ([`scene-and-render.md`](../.claude/rules/scene-and-render.md)).
- Don't bump the version. Player-visible releases are explicit.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks Matt to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass (including the new tile-selection / blend specs).
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the cycle closes, no `tests/sim-baseline/*` or `tests/refactor-baseline/*` fixture shall have moved (the re-bake touches only impostor atlases / sidecars).
- [ ] When the camera orbits a far tree on NSL and on Rolling Hills / Open Country, the impostor shall be view-dependent and relit (not a fixed-angle flat card), confirmed by the settled SSIM A/B + Matt's paired sign-off.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- pixel-forge v0.2.0 baker: `../pixel-forge` (Kiln CLI `kiln bake-imposter`; `packages/core/src/kiln/imposter/`, `examples/foliage-octahedral`). Full octahedral 8x8, baseColor-unlit + capture-view normal + depth, `bleedTransparentRgb` edge-bleed, ortho bounding-sphere capture with pole-flip. Runtime shader not included.
- Fable5 demo runtime (vendored in terror-in-the-jungle): `../terror-in-the-jungle/examples/fable5-world-demo/src/vegetation/Impostors.ts` (bake) + `src/render/ImpostorRuntime.ts` (4-tile blend + normal relight). The gold-standard "proper impostor" reference.
- terror-in-the-jungle shipped path: `../terror-in-the-jungle/src/systems/world/billboard/BillboardNodeMaterial.ts` (latlon atlas billboard, azimuth-only crossfade) - the simpler middle ground.
- [`docs/archive/research/webgpu-octahedral-impostor-spike-2026-05-16.md`](archive/research/webgpu-octahedral-impostor-spike-2026-05-16.md) - the prior SDS octahedral spike + the proper-port requirements.
- [`docs/archive/research/cycle-21-tree-impostor-research.md`](archive/research/cycle-21-tree-impostor-research.md), [`cycle-20-impostor-color-handoff.md`](archive/research/cycle-20-impostor-color-handoff.md) - the SDS color-handoff history (why the LUT was added then deleted).
- [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - foliage LOD strategy, far-tree impostors, the no-far-impostor-shadow rule, scene-def-flag-not-scene-id-branch rule.
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md), [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md), [`docs/BACKLOG.md`](BACKLOG.md).
