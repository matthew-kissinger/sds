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

## Open questions to resolve before writing code

1. **Q1 — Octahedral impostor pipeline.** Three options: (a) reuse local Pixel Forge Kiln (`pixelforge kiln bake-imposter ./tree.glb --out ./tree.png --angles 16` per the Kiln vision doc at [`pixel-forge/docs/kiln-vision.md`](file:///C:/Users/Mattm/X/games-3d/pixel-forge/docs/kiln-vision.md)), (b) port Brucks' UE octahedral impostor technique into a new `tools/bake-impostors.mjs` (Three.js render-to-texture, 8 or 16 angles, octahedral atlas + vertex-shader sampling), (c) stay with the existing 3-quad cross-billboard as the only impostor tier. Author lean: **(a) try Kiln first** — it's a tool we already understand and built; if its bake-imposter output doesn't fit the GLB → atlas → shader-sample pipeline cleanly, fall back to (b). (c) is a non-answer; the user explicitly asked for more LOD tiers.

2. **Q2 — Mobile asset invisibility root cause.** Three suspects: (a) the cross-billboard impostor texture fails to bake silently because `getSceneManager().getRenderer()` returns null at the moment `createTrees()` runs on mobile (timing race), (b) `InstancedMesh2.perObjectFrustumCulled` over-culls at LOD2 distance because the cross-billboard's bounding sphere is computed from the unrotated 3-quad geometry and doesn't match per-instance rotated bounds, (c) the trunk's degenerate empty geometry (which I share across all tree types) ends up with a zero bounding sphere that pulls the InstancedMesh2's overall bounds toward origin, breaking parent-frustum-cull. Author lean: **profile-driven** — add a `?probeRender=1` URL param that logs LOD-active per tree per frame, then look at the data. Don't guess.

3. **Q3 — White-bark tree origin.** Two possibilities: (a) one of the LOD0 or LOD1 GLBs ships with `bark.tint` not applied (recipe bug — maybe `tweaks.bark` got overwritten somewhere), (b) the cross-billboard impostor `_bakeTreeImpostor` lights the tree with white ambient 0.55 + white dirLight 0.85 (combined 1.4× white) — the resulting impostor texture reads as washed-out cream/white at distance even though the live mesh's bark is brown. Author lean: **(b) impostor lighting** is the more likely culprit since (a) would have shown up in Matt's gallery review, and the "tall and skinny" silhouette description matches a single tree species' impostor seen edge-on. Drop ambient to 0.20 + dirLight to 0.50 + use `THREE.Color(0x6e4f30).convertSRGBToLinear()` for the bake background to better match in-scene lighting.

4. **Q4 — OC portal scaling formula.** Currently [`shared/scenes/open-country.js:107`](../shared/scenes/open-country.js) has `requiredSheep: 40` hardcoded. Three formulas: (a) `Math.max(10, Math.floor(totalSheep * 0.40))` — 200→80, 1000→400, 3000→1200, 5000→2000. (b) Step function per mode (Classic=80, Extreme=400, Insane=1200, Chaos=2000). (c) Logarithmic — `Math.floor(40 * Math.log2(totalSheep / 200) + 80)` — gentler scaling at high counts. Author lean: **(a) flat 40% with min-clamp** matches user's stated preference ("if 200 then lets go 80 and scale for all the other amounts") and is the simplest to reason about. The required field on `CorralDef` becomes `requiredSheepFraction: 0.40` + a per-scene `requiredSheepMin: 10`, computed at game-start from the mode's total.

5. **Q5 — Grass-stretch root cause.** Cycle 15 added a defensive `Number.isFinite(baseY) || baseY > 50 || baseY < -10 → 0` clamp on the placement Y in [`js/GrassSystem.js:916`](../js/GrassSystem.js). That fixed the NaN-Y "blade-to-the-sky" path. The recurrence is therefore most likely a different mechanism: the leaf-wind shader patch on TREES uses `position.y += offset` in vertex space; if anything causes the GRASS material's `onBeforeCompile` to inherit the tree-wind patch (shared-material trap?), grass blades near trees would pick up the offset and stretch. Author lean: **shader patch leakage** via shared material reference. Audit `_patchTreeWindMaterial` in [`js/TerrainBuilder.js`](../js/TerrainBuilder.js) — does it WeakSet-tag the patched material so re-apply is a no-op? Does grass material end up sharing with a tree material accidentally?

6. **Q6 — Bundle slim strategy.** Three approaches: (a) manual chunks via `build.rollupOptions.output.manualChunks` to split three.js + react + game code into named bundles, (b) dynamic-import the deferred React panels (Multiplayer, Leaderboard, Settings) so they load on first menu interaction not first paint, (c) precache shell + lazy-load assets via `vite-plugin-pwa` with a workbox config. Author lean: **(b) dynamic imports** for the deferred panels — simplest win, no Vite-config gymnastics, drops first-paint by exactly the size of the panel bundle. (a) is the next-best escalation if (b) doesn't move the needle enough.

These don't all block Phase 1. Q1 + Q2 should be resolved before Phase 5. Q3 should be resolved before re-baking trees in Phase 2. Q4 should be settled before touching the sim contract in Phase 6.

## Architecture / shared changes

One contract change in this cycle: `CorralDef.requiredSheep: number` → `CorralDef.requiredSheepFraction: number` + `CorralDef.requiredSheepMin: number`. Shared schema in [`shared/scenes/types.js`](../shared/scenes/types.js); migration in Phase 6.

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

## Phase 4 — Portrait-mobile HUD layout (~2-3hr)

**Depends on:** none.

1. **CameraModeIndicator overlap fix.** The component is in [`js/components/GameHUD/CameraModeIndicator.js`](../js/components/GameHUD/CameraModeIndicator.js); placement is in [`js/components/App.js`](../js/components/App.js) (lines 1021 + 1047). Read the current absolute-positioning, identify what the time/score HUD's positioning is, find the overlap region. Fix with safe-area-inset + a portrait media query that stacks them or moves the camera indicator below the score on portrait < 500px width.
2. **General portrait UX pass.** Audit all HUD elements (score, timer, sheep counter, joystick, mobile button row, settings overlay, completion screen) at the common portrait viewports — iPhone SE 375×667, iPhone 14 390×844, Android 360×780, iPad 768×1024. Use Playwright `--viewport` flag. Catalog any overlap or off-screen issue.
3. **Fix any other overlap surfaced by the audit.** Apply the same safe-area-inset + portrait media query pattern as in Phase 1's mobile bottom-bar fix.

**Acceptance:** No HUD elements overlap on portrait at the common mobile viewports. Camera-mode indicator visible without obscuring time/score. New playwright visual-regression spec for each (scene × viewport) pair.

## Phase 5 — LOD chain extensions + culling sync (~5-7hr)

**Depends on:** Phase 1 (need to know cull behavior baseline before extending), Phase 2 (no white-bark outliers in the impostor input).

1. **Per-instance frustum-cull sync investigation.** InstancedMesh2's `perObjectFrustumCulled = true` is the default; if Matt sees out-of-frustum trees rendering OR in-frustum trees disappearing mid-pan, the per-instance BVH is stale. Profile via Chrome DevTools performance tab. If the BVH is the issue, manually call `instancedMesh.computeBVH({ margin: 0 })` after `addInstances` finishes (currently we don't, since the LOD chain handles distance — but addLOD changes the bounding sphere and might invalidate).
2. **Add a LOD2-reduced tier.** Currently the chain is LOD0 (full) → LOD1 (reduced) at 80m → cross-billboard at 150m. Insert a LOD2-reduced tier at ~110m: same trunk geometry as LOD1 but `leaves.count` halved again (12 → 6 leaves per branch endpoint). This bridges the visual gap between LOD1 and the impostor swap.
3. **Octahedral impostor evaluation via Pixel Forge Kiln.** Per Q1: Pixel Forge ships a Kiln subcommand `pixelforge kiln bake-imposter ./tree.glb --out ./tree.png --angles 16`. Run on tree1/tree2/pine, get a 16-angle atlas + UV layout. Evaluate visual quality at 250m+ vs current 3-quad cross. If demonstrably better, add as a new LOD3 entry at ~250m. Keep cross as LOD2 for the 150-250m band. If Kiln output doesn't fit (wrong UV layout, missing depth/normal channels, etc.), fall back to (b) building a `tools/bake-impostors.mjs` Three.js port of the same technique.
4. **Wire vertex-shader sampling for octahedral.** New material with custom fragment that picks the 3 closest sprites to camera direction and blends. Reference: agargaro/octahedral-impostor + shaderbits.com/blog/octahedral-impostors.

**Acceptance:** Trees render correctly at all distances on both desktop and mobile. Either: (a) octahedral impostor demonstrably better than 3-quad cross at 250m+ → ships as LOD3; or (b) cross-billboard remains the only impostor tier and we document why octahedral didn't fit in the cycle close notes.

## Phase 6 — OC portal scales to total sheep (~1-2hr)

**Depends on:** none.

1. **Schema change in [`shared/scenes/types.js`](../shared/scenes/types.js).** Add `CorralDef.requiredSheepFraction: number` (default 0.40) + `CorralDef.requiredSheepMin: number` (default 10). Keep `requiredSheep: number` as a fallback for scenes that want to opt out (zap effect on RH).
2. **Compute-at-game-start helper.** New `shared/CorralLogic.js` (or add to existing) — `getRequiredSheep(corral, totalSheep)` returns `corral.requiredSheep ?? Math.max(corral.requiredSheepMin, Math.floor(totalSheep * corral.requiredSheepFraction))`.
3. **Update consumers.** Every site that reads `corral.requiredSheep` directly — sim (`worker/src/GameSim.js` + `shared/GameStateValidation.js`) and UI (HUD progress indicator) — routes through the helper.
4. **Update [`shared/scenes/open-country.js`](../shared/scenes/open-country.js)** to drop the hardcoded 40 in favor of fraction 0.40. Field / RH retain their `requiredSheep` (or migrate at the same time if appropriate).
5. **Sim-baseline check.** Re-run the baseline traces. Since the formula isn't part of per-tick state, traces should be byte-identical. If not, the corral logic touched the sim path — back out and re-think.

**Acceptance:** Portal unlock count scales with total sheep mode (Classic 200→80, Extreme 1000→400, Insane 3000→1200, Chaos 5000→2000). Sim-baseline byte-identical. UI HUD shows correct count.

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
- [`shared/scenes/types.js`](../shared/scenes/types.js) — schema add for `requiredSheepFraction` + `requiredSheepMin`. Backwards-compat: keep `requiredSheep` as opt-out. Migration is additive — every existing scene continues working.
- [`shared/GameStateValidation.js`](../shared/GameStateValidation.js) — sim-core file, fence-authorized for Phase 6 only.

Both must be authorized in the Phase 6 task brief per [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). Sim-baseline regenerate NOT required (formula doesn't change per-tick state); if baseline diverges, back out the change.

## Hard stops

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure — escalate, don't regenerate fixtures.
3. Visual regression on a previously-passing scene — fix or revert before adding new scope.
4. Frametime regression > 5% on `perf-check` (now push-gating per Cycle 16) — diagnose before adding new scope.
5. Phase 5 octahedral impostor doesn't reach quality parity with current cross-billboard — keep cross, document why, move on. Don't ship a worse impostor.

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
