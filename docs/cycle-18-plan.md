# Cycle 18 — scene-stability-and-octahedral-impostors

> Drafted 2026-05-04 from Matt's gallery review of the Cycle 17 deploy. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Cycle 17 plan + research at [`archive/cycles/cycle-17-plan.md`](archive/cycles/cycle-17-plan.md) (after `/cycle-close` runs) and [`cycle-17-research.md`](cycle-17-research.md).

> **AUTONOMOUS EXECUTION MANDATE — overnight run on 2026-05-04.** Matt is asleep. Ship Phases 1, 2, 3 end-to-end without check-ins. **Do NOT wait for user responses.** All 6 open questions below already have RESOLVED author leans — treat them as the final decision and proceed. If a phase blocks on a hard stop (sim-baseline failure, perf regression > 5%, visible regression on a previously-passing scene), park that phase, document why in the cycle-close notes, and move to the next phase. Absorb any mid-cycle directives Matt sends asynchronously without pausing to re-confirm scope. Push to `main` after each phase passes vitest + e2e + perf-check; let CI run autonomously.

## Goal

Close the visible gaps the Cycle 17 deploy left open. Three independent threads:

1. **Rolling Hills full-island grass coverage** — the original `worldSize × densityRange` formula tops out at ~252m generation radius and only covers the lower-elevation interior (~half the island). Player sees grass-bare hills on the slopes and outer ring.
2. **Scene-switch + mode-switch state hygiene** — switching scenes mid-session leaves rocks / mushrooms placed against the previous scene's heightfield Y; starting a new mode from a prior session leaves sheep outside the new mode's play area. Both are state-hygiene bugs in the scene-swap path.
3. **Octahedral impostors (real ones)** — Cycle 17 deferred octahedral and shipped only the existing 3-quad cross-billboard. Matt observed both the cross-billboard limitation (silhouette obvious from edge-on angles) and noted impostors look noticeably darker than live trees in some lighting. Land a real octahedral atlas pipeline + fragment-shader sampler.

User-visible difference between "before" and "after":

- Rolling Hills grass extends to the perimeter of the island, climbing the hills, reading like a coherent meadow.
- Scene swap (e.g. Field → Rolling Hills) leaves no floating / sunken rocks or mushrooms.
- Mode swap (e.g. exit Classic, start Extreme) spawns sheep at the new mode's spawn pattern, never the prior mode's leftover positions.
- Tree impostors at distance: 8-16 angle octahedral atlas with sun-direction-aware sampling, brightness parity with live trees. The cross-billboard remains as a fallback for the bake-failure case but is no longer the primary far-LOD tier.

## How to read this plan

This doc fixes the *shape* of each fix (where it slots into the existing module map, acceptance criteria, fallback paths), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Reproduce the bug first** before writing fix code. The Phase 2 state-hygiene bugs in particular need a clean repro to know which slot in the swap path to patch.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile, iOS Safari).
- **Pick the simplest thing that meets the budget.** Phase 3 octahedral is the only phase here that justifies an architectural lift; Phase 1 + 2 should both land as small, surgical changes.

## Open questions — RESOLVED (autonomous mandate; do not wait for confirmation)

All 6 questions below are pre-resolved per the author lean. Treat them as final decisions and proceed.

1. **Q1 — RH grass coverage strategy.** **RESOLVED: (b) per-scene `grassRadius` field on `SceneDef.grass`.** Explicit per-scene control, no implicit area math, Field/RH/OC each declare what they want. Falls back to `worldSize * densityRange` when absent (byte-identical for opt-out scenes). The Cycle 17 Phase 3 bug came from doing implicit area math; (b) is harder to mis-apply.

2. **Q2 — Scene-swap prop terrain-sync root cause.** **RESOLVED: profile-driven first.** Build the swap-probe (Phase 2 step 1) BEFORE guessing root cause. Suspects in order of probability: (a) stale heightfield ref on a sub-system after swap, (b) rocks/flora instance Y values baked from prior heightfield. The probe data dictates the fix.

3. **Q3 — Mode-switch sheep-out-of-bounds root cause.** **RESOLVED: (b) flock recreation isn't gated correctly.** The current `previousSheepCount !== this.totalSheep` guard is wrong — it lets a Classic→Extreme→Classic restart skip recreation. Fix: always recreate flock on `startGame`. See also Q6.

4. **Q4 — Octahedral impostor pipeline.** **RESOLVED: (b) self-contained Three.js render-to-texture baker in `tools/bake-octahedral.mjs`.** Pixel Forge's `kiln.bakeImposter` is a big sibling-repo dep with its own realm; rolling our own bake is ~200 LoC of Three.js render code we already understand. Pixel Forge stays the path for animated imposters in a future cycle.

5. **Q5 — Octahedral runtime sampler.** **RESOLVED: (b) single-tile-per-instance picker.** Start with the cheap path; escalate to 3-tile blend in Phase 4 if oblique-camera step is visible. With 16 angles the step is ~22° — likely fine. Cross-billboard remains as the bake-failure fallback.

6. **Q6 — Mode-restart sheep recreation policy.** **RESOLVED: (a) always re-spawn on `startGame`.** Cost is one `OptimizedSheepSystem.recreate()` per mode-start (a few hundred ms at worst); benefit is bulletproof spawn correctness across mode-cycle paths.

## Architecture / shared changes

One contract change in this cycle (Phase 1):

- `SceneDef.grass.grassRadius: number` (optional) — inner generation extent for the grass chunk grid. When absent, falls back to `worldSize * densityRange` (current behavior, byte-identical for scenes that don't opt in). Field/RH/OC each declare appropriate values:
  - Field: omit (rect scene, falls back to default).
  - RH: `boundary.radius - 8` = 172m.
  - OC: `boundary.radius - 8` = 372m, with a per-area density rescale so total clumps don't blow the perf budget.

No deterministic-sim contract changes this cycle. No `INTERFACE_FENCE.md` updates required.

## Phase 1 — Rolling Hills full-island grass (~3-4hr)

**Independently testable.**

1. **Schema add.** [`shared/scenes/types.js`](../shared/scenes/types.js) — add `GrassDef.grassRadius: number` (optional). Document semantics: "inner generation extent in meters; grass density falloff goes to zero at this distance from origin. When absent, falls back to `worldSize * densityRange`."
2. **Scene migration.** [`shared/scenes/rolling-hills.js`](../shared/scenes/rolling-hills.js) sets `grassRadius: 172` (= `boundary.radius - 8`). [`shared/scenes/open-country.js`](../shared/scenes/open-country.js) sets `grassRadius: 372`. Field omits the field — keeps existing density behavior.
3. **GrassSystem consumption.** [`js/GrassSystem.js`](../js/GrassSystem.js) — replace the hardcoded `this.config.worldSize * this.config.densityRange` density-formula denominator with `this.config.grassRadius ?? (this.config.worldSize * this.config.densityRange)`. **Don't** change the chunk grid extent — keep that at `worldSize`. The chunk grid's circular `halfWorld * 1.2` cull naturally bounds chunks to the relevant zone; the density falloff is what controls per-area distribution.
4. **For OC specifically: per-area density preservation.** OC's `grassRadius: 372` is wider than the default ~252m falloff zone. To avoid the per-m² density drop, multiply the per-chunk acceptance threshold so the user-tuned `clumpsPerChunk: 2400` lands roughly the same density across the wider zone. Concretely: in `createChunk`, multiply `clumpCount` by `min(1, (worldSize * densityRange) / grassRadius)` for the acceptance probe — chunks farther from center accept more candidates per attempt. **Verify perf-check stays green** — extra clumps on OC will move the needle on the OC-extreme baseline.
5. **Visual verify.** Desktop probe screenshot of RH at zoom-max — grass extends from center to within ~10m of island edge, climbing the hills. OC verify: grass extends past the woodszone clusters to the outer ring (the "next to no grass" complaint resolved).

**Acceptance:** RH grass covers the whole island visually. OC grass extends to within 10m of safe radius. Field grass byte-identical to pre-cycle. perf-check green vs Linux baseline.

## Phase 2 — Scene-swap + mode-switch state hygiene (~4-6hr)

**Depends on:** none.

1. **Reproduce the prop terrain-sync bug first.** Extend [`tools/mobile-probe.mjs`](../tools/mobile-probe.mjs) into a `tools/swap-probe.mjs` that drives `Field → RH → OC → Field → RH` mode swaps via `window.__sdsStressTestSwaps`, capturing per-rock + per-mushroom Y vs `heightfield.meshSampleY(x, z)` after each swap. Output: per-swap CSV of `|propY - terrainY|`. Spike values pinpoint which swap step left the prop misaligned.
2. **Audit the scene-swap path.** [`js/main.js`](../js/main.js) `disposeScene` + `swapToScene` — confirm `heightfield` is reassigned before `terrainBuilder.createTrees` / `addEnvironmentDetails` / `scatterSystem.populate` run. Suspect: a stale `this.heightfield` ref on a sub-system.
3. **Reproduce the sheep-out-of-bounds bug first.** Same swap-probe extends to drive `Classic → Extreme` mode swaps via `gameState.startGame`, capturing sheep positions + `playArea` bounds after each restart.
4. **Audit `startGame` flock recreation.** [`js/GameState.js`](../js/GameState.js) `startGame` — currently sets `needsFlockRecreation = true` only when `previousSheepCount !== this.totalSheep`. Per Q6, change to **always recreate** on `startGame` (idempotent in fresh-mode case; correct in mode-swap case).
5. **Add a swap-stability spec.** New `tests/e2e/scene-swap-stability.spec.ts` that does the swap matrix + asserts post-swap prop Y deltas + sheep in-bounds. Locks the regression.

**Acceptance:** Both bugs reproduce in the swap-probe pre-fix and disappear post-fix. New e2e spec gates both regressions in CI.

## Phase 3 — Octahedral impostors (~6-9hr)

**Depends on:** none (Phase 1 + 2 are independent).

1. **Build `tools/bake-octahedral.mjs`** — Playwright-driven Three.js render-to-texture baker. For each tree LOD0 GLB: render N=16 views with octahedral camera distribution (Brucks UE technique), compose to a 4×4 atlas at 512px per tile = 2048×2048 PNG. Write atlas + sidecar JSON (`{ angles: 16, atlasW, atlasH, tileSize, axis: 'hemi-y' }`) to `assets/models/trees-impostor/<species>.{png,json}`. Reuse the existing `tools/bake-trees.mjs` static-server + Playwright pattern.
2. **Bake all 3 species** (tree1, tree2, pine) — checked-in atlases. Compress via Pillow / sharp lossless to keep PNG size under 200KB per species (~600KB total committed).
3. **Runtime sampler.** New `js/octahedral-impostor-material.js` — `ShaderMaterial` with custom fragment that:
   - Reads camera direction in object space.
   - Maps to octahedral UV space (Brucks formula).
   - Picks single closest tile (per Q5 lean: skip 3-tile blend until perf shows it's needed).
   - Samples the atlas, applies `alphaTest: 0.4`, multiplies by sun-tint uniform.
4. **Wire into `createTrees`.** Replace `_createCrossBillboardGeometry` + `MeshBasicMaterial` with the octahedral material when the atlas loaded successfully. Cross-billboard stays as the explicit fallback when the atlas wasn't loaded (network race) or per-species bake failed. Same `addLOD(billboardGeo, billboardMat, 100)` distance.
5. **Sun-tint integration.** `setImpostorTint(color)` continues to work — it now updates a uniform on the octahedral material instead of the basic material's `.color`. Same sunrise/sunset behavior.
6. **Visual gate.** Desktop probe at zoom-max + 4 sun positions (`?sun=0.0` → `?sun=1.0` in 0.25 increments). Octahedral impostors should look indistinguishable in silhouette from live trees at all 4 sun positions, no longer noticeably darker (the cross-billboard's flat-baked-from-one-angle limitation is what drove the brightness mismatch).

**Acceptance:** Octahedral impostors render at 100m+ on all 3 species. Brightness matches live trees within a ~10% perceptual delta across all 4 sun positions. Cross-billboard remains as the failure-fallback. Atlas bake reproducible via `npm run bake-impostors`.

## Phase 4 — Polish (optional, ~2-3hr)

Nice-to-haves once Phases 1-3 land. Skip any that don't move the needle in playtest.

- 3-tile octahedral blend (Q5(a)) if Phase 3's single-tile picker shows visible step at oblique camera moves.
- Auxiliary normal map atlas (from `kiln.bakeImposter`'s `auxLayers: ['normal']`) for per-pixel runtime lighting on octahedral material — better parity with live MeshStandardMaterial trees, especially at oblique sun angles.
- 32-angle bake variant for a quality preset; 16-angle as the default.

## Dependencies

```
Phase 1 (RH grass) — independent; small, surgical
Phase 2 (swap hygiene) — independent; needs swap-probe build
Phase 3 (octahedral) — independent; biggest lift, can run parallel to 1+2
Phase 4 (polish) — depends on Phase 3 landing; skip if not needed
```

Phases 1, 2, 3 can ship in any order. Phase 4 is gated on Phase 3.

## Frozen files (cycle-specific additions)

Phase 1 modifies:
- [`shared/scenes/types.js`](../shared/scenes/types.js) — schema add for `GrassDef.grassRadius`. Backwards-compat: optional field, falls back to existing formula. Migration is additive — every existing scene continues working.

No `shared/MovementPhysics.js` / `shared/BoundaryCollision.js` / `shared/FlockingAlgorithms.js` / `shared/GameStateValidation.js` / `shared/Vector2D.js` changes this cycle.

## Hard stops

Surface to the user, do not proceed:

1. Frozen-file change without scope authorization — see [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md).
2. Sim-baseline test failure that you don't understand — don't regenerate fixtures, escalate.
3. Visual regression on a previously-passing scene — fix or revert before adding new scope.
4. Frametime regression > 5% on `perf-check` — diagnose before adding new scope.
5. Phase 3 octahedral impostor doesn't reach brightness parity with live trees → keep cross-billboard as the active impostor tier, document why octahedral didn't fit, defer to a future cycle.

## What NOT to do during this cycle

- **Don't try to "fix" Cycle 17's grass extent goal by re-introducing chunk-grid expansion.** The Phase 1 approach is per-scene `grassRadius` — explicit, no implicit area math.
- **Don't blindly bump OC's `clumpsPerChunk` to compensate for the wider grassRadius.** Total clump budget is finite; verify perf-check stays green.
- **Don't replace the cross-billboard before octahedral demonstrably ships.** Cross-billboard stays as fallback. Cycle 17's lessons: fallback paths matter.
- **Don't introduce a new bake tool when `tools/bake-trees.mjs` already has the Playwright + static-server scaffolding.** Reuse the pattern.
- **Don't migrate to TSL/WebGPU.** Still its own cycle.
- **Don't replace EZ-Tree with Procedural Instanced Forest.** Same NOT-DO as Cycle 16 / 17.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] Phase 1 — Rolling Hills grass covers the whole island. OC grass extends to within ~10m of island edge.
- [ ] Phase 2 — Scene swap leaves no floating / sunken rocks or mushrooms. Mode swap spawns sheep at the new mode's spawn pattern, not the prior mode's leftover positions. Both gated by new e2e spec.
- [ ] Phase 3 — Octahedral impostors shipped. Brightness parity with live trees within 10% perceptual delta across 4 sun positions. Cross-billboard remains as the documented fallback path.
- [ ] All vitest specs pass.
- [ ] Production build clean.
- [ ] `perf-check` CI job green vs the committed Linux baseline.
- [ ] Live on sheepdogsim.com via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — cycle template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/cycle-17-research.md`](cycle-17-research.md) — Cycle 17 open-question resolutions (Q1 octahedral defer is the genesis of this cycle's Phase 3)
- [Pixel Forge `kiln.bakeImposter` API](file:///C:/Users/Mattm/X/games-3d/pixel-forge/packages/core/src/kiln/imposter/bake.ts) — Q4 candidate; deferred per Q4 lean
- [Octahedral impostors — Brucks / shaderbits.com](https://shaderbits.com/blog/octahedral-impostors) — reference for the Phase 3 bake math
- [Octahedral impostor (agargaro)](https://github.com/agargaro/octahedral-impostor) — Three.js implementation reference
