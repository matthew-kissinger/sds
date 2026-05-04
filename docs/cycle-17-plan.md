# Cycle 17 — mobile-hardening-lod-and-bundle-slim

> Drafted 2026-05-04 after Cycle 16 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Fold all post-Cycle-16-deploy regressions Matt reported during the gallery review pass into a structured hardening cycle, then land the bundle-slim work that was originally the cycle's headline. The hardening is the gate — `v1.1.0` shouldn't tag on a build with mobile asset invisibility, HUD overlap, grass anomalies, or under-sized scatter.

User-visible difference between "before" and "after":
- Trees, rocks, and flora visible at all classic-camera zoom levels on mobile (currently regressed: trees disappear at distance, rocks/flora often invisible or too small).
- No white-bark / EZ-Tree-default outliers in any scene at any LOD (currently one stray "white bark, tall and skinny, few branches" tree visible).
- No skyward grass blades near trees (regressed despite Cycle 15's defensive `Number.isFinite` clamp on placement Y).
- Open Country grass extends to the island edge (currently culled too aggressively — only middle of island has grass).
- Camera-mode toggle button on portrait mobile no longer overlaps the time/score HUD; broader portrait-mobile UX pass while we're there.
- Portal unlock count on Open Country scales with total sheep count (currently hardcoded `requiredSheep: 40`; should be ~40% of total mode count: 200→80, 1000→400, 5000→2000).
- Optional: more LOD tiers via octahedral impostor at far horizon (Pixel Forge's local Kiln tool ships a `bake-imposter` CLI worth evaluating).
- Cold-start TTI on mobile materially faster via `main.js` split (the Vite chunk-size warning that motivated this cycle's original framing).

## How to read this plan

This doc fixes the *shape* of each fix (where it slots into the existing module map, acceptance criteria, fallback paths), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Reproduce on the actual mobile device first** (Matt's iPhone or similar) before guessing root cause. Several of these regressions only manifest at specific viewport sizes or zoom levels.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile, iOS Safari). Use `__sdsRenderer.info` per-frame snapshots and the `tools/probe.mjs` canvas dump to triage without a live human eye.
- **Pick the simplest thing that meets the budget.** If a one-line change fixes the symptom, ship it. Escalate to architectural rework only when the symptom recurs.

## Open questions

> Resolved 2026-05-04 in [`cycle-17-research.md`](cycle-17-research.md). Summaries below for cold-start context; the research doc has the evidence trail.

1. **Q1 — Octahedral impostor pipeline.** **Resolved: defer.** Pixel Forge's `kiln bake-imposter` CLI doesn't exist (the kiln-vision doc never specs it). Real surface is the programmatic `kiln.bakeImposter()` API at `pixel-forge/packages/core/src/kiln/imposter/bake.ts` — TypeScript, sibling repo, integration friction. Cross-billboard stays primary. Phase 5 narrows to cull-sync investigation + LOD2.5 mid-tier. Octahedral integration is its own future cycle.

2. **Q2 — Mobile asset invisibility root cause.** **Resolved: profile-driven, no pre-commit.** All three plan suspects survive code inspection but a fourth dominates: mobile classic-camera at wide zoom positions the camera 60-80m from action, and `addLOD(..., 80)` + `addLOD(..., 150)` are CAMERA-distance thresholds. Trees swap aggressively. If the cross-billboard bake had any failure mode on mobile (e.g. silent renderer-null path), the LOD2 tier becomes invisible. Phase 1 builds the mobile-probe harness with `?probeRender=1` URL param to capture renderer truthy at createTrees time, per-type bake success, per-frame LOD distribution.

3. **Q3 — White-bark tree origin.** **Resolved: visual reproduction first.** Lighting math (1.4× white) doesn't fully account for "white" — brown `0x6e4f30` lit at 1.4× is tan, not white. Likely needs visual triage to identify the offender. Phase 2 builds `tools/probe-glbs.mjs` to render all 6 committed tree GLBs side-by-side, isolate the bad one, then pick the fix (drop bake lighting + neutral bake background OR re-bake the recipe).

4. **Q4 — OC objective scaling formula.** **Resolved: 40% flat with min-clamp on `ObjectiveDef`, NOT `CorralDef`.** [`shared/scenes/open-country.js:107`](../shared/scenes/open-country.js) — `requiredSheep: 40` is on the `objective` block. Add `ObjectiveDef.requiredSheepFraction: number` (default 0.40) + `ObjectiveDef.requiredSheepMin: number` (default 10). Helper: `getRequiredSheep(objective, totalSheep)`. Consumers: `js/GameState.js:409,693`, `js/components/GameHUD/ObjectiveBanner.js:36`. **`shared/GameStateValidation.js` is NOT a consumer** (verified via grep) — fence change there is unneeded.

5. **Q5 — Grass-stretch root cause.** **Resolved: shader-leak hypothesis dis-proven by inspection.** `_patchTreeWindMaterial` is only called from `_setupTreeWind()` (iterates `this.models.trees`) and `patchFloraWind` (ScatterSystem flora callback). Grass material in GrassSystem never enters either path. New leading hypothesis: **vertex-shader NaN propagation in the grass blade shader near tree placements** (heightfield discontinuity → bad sample → NaN through wind/interaction displacement → vertex spikes to clip-space Infinity). Phase 3 step 1 pivots to add `?probeGrass=1` to capture per-blade post-shader Y values + log first 100 anomalies.

6. **Q6 — Bundle slim strategy.** **Resolved: (b) dynamic-import deferred panels first, escalate to (a) manual chunks if needed.** Phase 7 starts with (b); rollup-plugin-visualizer pass tells whether (a) is also needed.

## Architecture / shared changes

One contract change in this cycle: `ObjectiveDef.requiredSheep: number` → adds `ObjectiveDef.requiredSheepFraction: number` (default `0.40`) + `ObjectiveDef.requiredSheepMin: number` (default `10`). The original `requiredSheep` is preserved as opt-out for legacy / non-scaling scenes (the helper uses `?? Math.max(min, floor(total*frac))`). Shared schema in [`shared/scenes/types.js`](../shared/scenes/types.js); migration in Phase 6.

## Phase 1 — Mobile asset visibility audit (~3-4hr) [foundation]

**Independently testable.** This phase is the gate — without understanding why trees / rocks / flora are invisible at distance on mobile, every other LOD tweak in Phase 5 risks chasing the wrong bug.

1. **Build a mobile-probe harness.** Extend [`tools/probe.mjs`](../tools/probe.mjs) to set viewport `375×667` (iPhone SE) + `390×844` (iPhone 14) + a wide-zoom-out classic-camera URL param (e.g. `&cameraZoom=max`). Capture canvas + `__sdsRenderer.info` snapshot per scene. Output to `tools/playtest/probe-mobile/<scene>-<viewport>.png` + `.json`.
2. **Diagnose tree-invisibility-at-distance.** Walk through Q2 suspects in order. Likely culprits in order of probability: cross-billboard texture transparent (alphaTest 0.4 cutting all pixels because the impostor bake ran before GLB textures uploaded) → InstancedMesh2 BVH stale post-LOD-add → degenerate trunk geom pulling parent bounds.
3. **Diagnose rock + flora invisibility.** Mobile cap = 800 vs desktop 2200, minDist = 6m vs 4m — sparse but should still be visible at the camera distances we care about. Check whether `ROCK_NATIVE_HEIGHT = 0.2m` normalization combined with `scaleRange: 4-50` produces visible rocks at sheep-cam distance on mobile (math: 0.2m × 4 = 0.8m smallest rock, ×50 = 10m largest — those should read).
4. **Fix root cause + add e2e smoke spec.** New spec asserts `__sdsRenderer.info.render.triangles > 100_000` after a 5s warmup at zoom-max for each scene. Current behavior would silently fail this — locks in the fix.

**Acceptance:** All three asset classes (trees, rocks, flora) visible at every classic-camera zoom level on both desktop and mobile. New e2e smoke spec gates this in CI.

## Phase 2 — White-bark tree + bark coherence (~2hr)

**Depends on:** none (independent of Phase 1).

1. **Build a per-GLB screenshot grid.** Drive `tools/probe.mjs` (or a new `tools/probe-glbs.mjs`) against a tiny static page that loads each of the 6 committed tree GLBs (LOD0 + LOD1 for tree1/tree2/pine), renders side-by-side at uniform lighting. Identify the white-bark offender visually.
2. **Trace back to the recipe + impostor bake.** Two probable causes per Q3: recipe-level `bark.tint` not applied OR `_bakeTreeImpostor` lighting too bright. Apply both fixes if both suspect:
   - Re-confirm `BARK_TINTS` in [`tools/bake-trees.mjs`](../tools/bake-trees.mjs) propagates through `applyTweaks` in [`tools/bake-trees/bake.html`](../tools/bake-trees/bake.html).
   - Drop impostor lighting in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) `_bakeTreeImpostor`: ambient `0xffffff, 0.55` → `0xffffff, 0.20`; dirLight `0xffffff, 0.85` → `0xffffff, 0.50`. Verify the impostor texture reads brown not cream.
3. **Re-bake + integrate if any recipe was wrong; re-deploy.**

**Acceptance:** All trees read as brown bark family across all LOD tiers including the cross-billboard impostor at 150m+. No white outliers in any scene.

## Phase 3 — Grass anomalies (~3-4hr)

**Depends on:** none.

1. **Grass-stretch-near-trees.** Per Q5: audit `_patchTreeWindMaterial` in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) — confirm the WeakSet guard `_patchedTreeMaterials.has(material)` blocks re-apply. Then check whether GrassSystem's material EVER ends up in `_patchedTreeMaterials`. If so, the shared-material trap is the root cause — fix by tagging grass material to opt-out OR by checking material's userData before patch. Add a defensive `userData.isGrass = true` flag on the grass material and skip in `_patchTreeWindMaterial` if set.
2. **OC grass extent.** [`js/GrassSystem.js`](../js/GrassSystem.js) generates clumps to a fixed inner radius (~250m per Cycle 8 comment at line 967), but OC's island radius is ~380m. Add a `grassRadius` field to `SceneDef` (default 250) so each scene can specify; OC sets to `boundary.radius - 8` (just inside the falloff). Existing boundary cull at `boundary.radius + boundary.falloff - 3` becomes the outer clip; the new `grassRadius` is the inner generation extent.
3. **Verify visually via probe on each scene.** OC should show grass to within ~10m of island edge. Field/RH unaffected.

**Acceptance:** No skyward grass blades visible near trees on any scene at any camera angle. OC grass extends to within ~10m of island edge. Field + RH grass extent unchanged.

> Per [`cycle-17-research.md`](cycle-17-research.md) Q5: shader-leak hypothesis dis-proven. Step 1 pivots to **vertex-shader NaN-spike instrumentation** via `?probeGrass=1` URL param. Step 2 OC extent root cause is the density-falloff formula at [`GrassSystem.js:889`](../js/GrassSystem.js) (already extends to ~387m geometrically but density factor drops to ~0.016 at 380m on `densityRange: 0.92`); fix is to switch the falloff radius to `boundary.radius - 8` for island scenes.

## Phase 4 — Portrait-mobile HUD layout (~2-3hr)

**Depends on:** none.

1. **CameraModeIndicator overlap fix.** The component is in [`js/components/GameHUD/CameraModeIndicator.js`](../js/components/GameHUD/CameraModeIndicator.js); placement is in [`js/components/App.js`](../js/components/App.js) (lines 1021 + 1047). Read the current absolute-positioning, identify what the time/score HUD's positioning is, find the overlap region. Fix with safe-area-inset + a portrait media query that stacks them or moves the camera indicator below the score on portrait < 500px width.
2. **General portrait UX pass.** Audit all HUD elements (score, timer, sheep counter, joystick, mobile button row, settings overlay, completion screen) at the common portrait viewports — iPhone SE 375×667, iPhone 14 390×844, Android 360×780, iPad 768×1024. Use Playwright `--viewport` flag. Catalog any overlap or off-screen issue.
3. **Fix any other overlap surfaced by the audit.** Apply the same safe-area-inset + portrait media query pattern as in Phase 1's mobile bottom-bar fix.

**Acceptance:** No HUD elements overlap on portrait at the common mobile viewports. Camera-mode indicator visible without obscuring time/score. New playwright visual-regression spec for each (scene × viewport) pair.

## Phase 5 — LOD chain extensions + culling sync (~3-5hr, narrowed)

**Depends on:** Phase 1 (need cull-behavior baseline before extending), Phase 2 (no white-bark outliers in the impostor input).

> Per [`cycle-17-research.md`](cycle-17-research.md) Q1: octahedral evaluation deferred to a future cycle. Phase 5 narrows to cull-sync investigation + a LOD2.5 mid-tier. Acceptance updated below.

1. **Per-instance frustum-cull sync investigation.** InstancedMesh2's `perObjectFrustumCulled = true` is the default; if Matt sees out-of-frustum trees rendering OR in-frustum trees disappearing mid-pan, the per-instance BVH is stale. Profile via Chrome DevTools performance tab. If the BVH is the issue, manually call `instancedMesh.computeBVH({ margin: 0 })` after `addInstances` finishes — addLOD changes the bounding sphere and may invalidate the BVH.
2. **Mobile LOD-distance retune.** Per Q2: mobile classic-camera at wide zoom positions camera 60-80m from action, so default `addLOD(..., 80)` for LOD1 + `addLOD(..., 150)` for impostor swap aggressively. On mobile, push to `100m` + `180m` to give wide-zoom headroom. Verify against the perf budget on Linux baseline.
3. **(Optional) Add a LOD2.5-reduced tier.** Currently chain is LOD0 (full) → LOD1 (reduced) at 80m → cross-billboard at 150m. Insert a LOD2.5 at ~115m: same trunk geom as LOD1 but `leaves.count` halved again (12 → 6 per branch endpoint). Re-bake via [`tools/bake-trees.mjs`](../tools/bake-trees.mjs) with a new `--set=lod2half` matrix. Skip if Phase 1's mobile cull-sync fix alone meets the visibility acceptance.

**Acceptance:** Trees render correctly at all distances on desktop and mobile. Per-instance cull is stable (no in-frustum trees disappearing). Either LOD2.5 ships OR cycle-close notes document why it wasn't needed.

## Phase 6 — OC objective scales to total sheep (~1-2hr)

**Depends on:** none.

1. **Schema change in [`shared/scenes/types.js`](../shared/scenes/types.js).** Add `ObjectiveDef.requiredSheepFraction: number` (default 0.40) + `ObjectiveDef.requiredSheepMin: number` (default 10). Keep `requiredSheep: number` as opt-out for legacy / non-scaling scenes.
2. **Compute-at-game-start helper.** New `shared/ObjectiveLogic.js` — `getRequiredSheep(objective, totalSheep)` returns `objective.requiredSheep ?? Math.max(objective.requiredSheepMin ?? 10, Math.floor(totalSheep * (objective.requiredSheepFraction ?? 0.40)))`.
3. **Update consumers.** Every site that reads `objective.requiredSheep` directly — `js/GameState.js:409,693` + `js/components/GameHUD/ObjectiveBanner.js:36` — routes through the helper. (`shared/GameStateValidation.js` is NOT a consumer; verified via grep.)
4. **Update [`shared/scenes/open-country.js`](../shared/scenes/open-country.js)** to drop the hardcoded 40 in favor of the 0.40 default. Update the explanatory comment ("20% of 200" → "40% of total mode sheep").
5. **Sim-baseline check.** Re-run baseline traces. Since the formula isn't part of per-tick state, traces should be byte-identical. If not, back out — the change should not enter the deterministic core.

**Acceptance:** Objective hold-count scales with total sheep mode (Classic 200→80, Extreme 1000→400, Insane 3000→1200, Chaos 5000→2000). Sim-baseline byte-identical. ObjectiveBanner shows correct count.

## Phase 7 — Bundle slim (deferred from cycle's original framing) (~4-6hr)

**Depends on:** Phases 1 + 4 land cleanly (don't ship a perf optimization on top of broken visuals / UX).

1. **Profile main.js with `vite build --mode production` + the rollup-plugin-visualizer.** Identify top contributors. Suspects from Cycle 15 close notes: deferred React panels (Multiplayer + Leaderboard + Settings + Sandbox), `js/main.js` size, the leaderboard global panel.
2. **Dynamic-import deferred React panels.** Each becomes a separate chunk loaded on first menu interaction. Per Q6 lean: this is the smallest-risk change with the biggest first-paint win.
3. **Verify perf-check still green.** The new chunks shift load timing; perf-baseline numbers should hold but verify on CI Linux runner before merging.
4. **Update docs.** Note the dynamic-import pattern in `ARCHITECTURE.md` so future React panels follow the same convention.

**Acceptance:** main.js < 500 KB raw / < 150 KB gzip. Vite build chunk-size warning gone. perf-check green. CI E2E timeout can revert from 30s back to 15s (Cycle 15 Phase 6 bumped it for the 800 KB main bundle).

## Dependencies

```
Phase 1 (mobile visibility audit) — foundation; gates 5
Phase 2 (white-bark + bark coherence) — independent; pairs with Phase 1 for verification
Phase 3 (grass anomalies) — independent
Phase 4 (portrait HUD) — independent; can run parallel to 1, 2, 3
Phase 5 (LOD extensions + cull sync) — depends on 1 + 2
Phase 6 (OC portal scaling) — independent; small phase, can land any time
Phase 7 (bundle slim) — depends on 1 + 4 (don't slim on top of broken visuals/UX)
```

Phases 1, 2, 3, 4, 6 can ship in any order. Phase 5 needs the visibility baseline from Phase 1. Phase 7 should be last so the perf numbers reflect the polished world.

## Frozen files (cycle-specific additions)

Phase 6 modifies:
- [`shared/scenes/types.js`](../shared/scenes/types.js) — schema add for `ObjectiveDef.requiredSheepFraction` + `ObjectiveDef.requiredSheepMin`. Backwards-compat: keep `requiredSheep` as opt-out. Migration is additive — every existing scene continues working.

`shared/GameStateValidation.js` was originally listed as fence-authorized but is NOT a `requiredSheep` consumer (verified via grep on 2026-05-04 in [`cycle-17-research.md`](cycle-17-research.md)). Phase 6 does not need to touch it.

The schema change must be authorized in the Phase 6 task brief per [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). Sim-baseline regenerate NOT required (formula doesn't change per-tick state); if baseline diverges, back out the change.

## Hard stops

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure — escalate, don't regenerate fixtures.
3. Visual regression on a previously-passing scene — fix or revert before adding new scope.
4. Frametime regression > 5% on `perf-check` (now push-gating per Cycle 16) — diagnose before adding new scope.
5. Phase 5 LOD2.5 mid-tier visibly worse than current LOD1 → 150m impostor — keep current chain, document why, move on. Don't ship a worse intermediate.

## What NOT to do during this cycle

- **Don't try to fix mobile visibility by raising the ScatterSystem cap.** Figure out the root cause first. A higher cap on top of a broken cull is just more invisible instances.
- **Don't replace the 3-quad cross-billboard until Phase 5 measurement justifies octahedral.** The cross is shipping today; replacing it without measured win is regression risk.
- **Don't rebuild flora from scratch in this cycle.** Mushroom + clover + flower picks are stable; just verify they render.
- **Don't tag `v1.1.0` until both Cycle 16 Phase 6 (hero cards keyboard session) lands AND Cycle 17 Phases 1-4 hardening lands.** The marketing surface goes on top of a polished world, not a regressed one.
- **Don't blow up `main.js` in one PR (Phase 7).** Shrink one responsibility at a time per the long-standing repo convention.
- **Don't migrate to TSL/WebGPU.** Still its own cycle.
- **Don't replace EZ-Tree with Procedural Instanced Forest.** Same NOT-DO as Cycle 16.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] Phase 1 — Trees + rocks + flora visible at all classic-camera zoom levels on mobile + desktop. Smoke spec locks the tris floor.
- [ ] Phase 2 — All trees read brown bark family across all LOD tiers. No white outliers.
- [ ] Phase 3 — No skyward grass near trees. OC grass extends to ~10m of island edge.
- [ ] Phase 4 — No HUD overlap on portrait at common mobile viewports. Camera-mode indicator placement clean.
- [ ] Phase 5 — Trees render correctly at all distances. Either octahedral impostor shipped as LOD3 OR documented why the cross-billboard remains the only impostor tier.
- [ ] Phase 6 — Portal unlock count scales with total sheep mode. Sim-baseline byte-identical.
- [ ] Phase 7 — main.js < 500 KB raw / < 150 KB gzip. Chunk-size warning gone. perf-check green.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] `perf-check` CI job green vs the committed Linux baseline.
- [ ] Live on sheepdogsim.com via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items (incl. Cycle 16 carryover entry: Phase 6 hero cards + v1.1.0)
- [`docs/archive/cycles/cycle-16-plan.md`](archive/cycles/cycle-16-plan.md) — prior cycle plan (tree foliage LOD chain + perf harness)
- [`docs/cycle-16-tree-research.md`](cycle-16-tree-research.md) — Cycle 16 LOD decision brief
- [`docs/cycle-16-tree-gallery-review.md`](cycle-16-tree-gallery-review.md) — gallery picks + how-to-swap
- [`docs/cycle-16-phase-6-prep.md`](cycle-16-phase-6-prep.md) — Phase 6 keyboard workflow (carryover)
- [Pixel Forge Kiln vision doc](file:///C:/Users/Mattm/X/games-3d/pixel-forge/docs/kiln-vision.md) — local LLM-authored procedural geometry tool with `bake-imposter` CLI; Q1 candidate for octahedral impostor pipeline
- [Octahedral impostors — Brucks / shaderbits](https://shaderbits.com/blog/octahedral-impostors) — original UE technique writeup
- [Octahedral impostor (agargaro)](https://github.com/agargaro/octahedral-impostor) — Three.js implementation reference
- [InstancedMesh2 LOD demo](https://discourse.threejs.org/t/instancedmesh-lod-1-million-instances/70748) — `addLOD` reference
