# Cycle 82 — feel-and-media-live

> Drafted 2026-06-08 after Cycle 81 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> Cycle 81 lifted the flagship live on desktop WebGPU. Cycle 82 opens with a post-ship flagship-stability phase (Phase 1, shipped) and carries the standing player-visible `feel-and-media-live` thread as the follow-on work.

## Goal

Keep the freshly-lifted desktop WebGPU flagship correct and stable, then return to player-visible feel/media work. Phase 1 (shipped this cycle) fixes three live regressions Matt hit testing newsheepdogland: the farmhouse spawned in the sea instead of attached to the pen, grass came and went, and loads flip-flopped between WebGPU and WebGL. All three trace to two mechanisms (a field-bounds reset that clobbered the scene-pinned homestead, and a QualityGovernor that false-floored on transient spikes and wrote a 24h sticky WebGL fallback from a desktop step-down). Phase 2 (shipped) fixes a fourth newsheepdogland regression: grass was fully invisible on the desktop WebGPU path (a grass-blade distance-fade shader bug that keyed the fade off the world origin instead of the camera), corrected at the shader source. Later phases pick up the deferred `feel-and-media-live` thread (survival-feel retune, two-dog co-op playtest, entrance hero blessing) and the measure-first production steady-state profile.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), not the implementation choices. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

## Open questions to resolve before writing code

1. **Q1: Does the 3070 genuinely exceed the desktop frame budget on newsheepdogland, or was the floor purely a transient false-positive?** Author lean: false-positive. A live dev-mode read showed 7.3 ms (~137 fps) real frame cost; the floor came from cold-load and backgrounded-tab spikes, not steady state. Confirm with a production-build, foreground, >= 5-run steady-state profile (Phase 4).

## Phase 1 - Flagship stability fixes (SHIPPED 2026-06-08, ~3hr)

**Independently testable.** Three live regressions in the shipped Cycle 81 flagship, fixed and verified on the 3070 + WebGPU. No `shared/` sim change; sim-baselines untouched.

Root causes:

- **House in the sea.** The mode-start "reset to default bounds" (`setDynamicBounds`, [`js/world/sandbox.js`](../js/world/sandbox.js), the only caller) re-derived the farmhouse from the medium-field default `±100` bounds, landing it at `(180,160)` = sea. The genuine sandbox resize uses `rebuildEnvironment`, which is already skipped for island scenes.
- **The WebGPU/WebGL "split" + grass thinning + "WebGPU slower".** The `QualityGovernor` floored quality on transient spikes (cold-load compile, backgrounded-tab frames) and wrote the 24h sticky `sds-renderer-fallback` flag, which flips the next load to WebGL for 24h. That flag can only ever fire on desktop (mobile is WebGL-pinned on the flagship, so its rendererMode is `webgl` and the writer returns early).

Fixes:

- `setDynamicBounds` preserves a scene-pinned `farmHouse.position` + `exclusionArea`. Field's bounds-derived behavior is unchanged (its pin equals the default `(180,160)` derivation, so it is a no-op there).
- `QualityGovernor`: cold-load warmup grace, skip `document.hidden` frames, gap-reset on sample discontinuity, drop > 200 ms outliers, a desktop discrete-GPU budget (28 ms p95 / 44 ms p99) separate from the mobile-high bar, faster recovery (2 windows), and desktop never writes the sticky WebGL fallback.
- `GrassSystem` auto-LOD gets the same cold-load warmup grace (hold `_autoLodFactor` steady until the scene has run 6 s).

Files: [`js/world/sandbox.js`](../js/world/sandbox.js), [`js/perf/QualityGovernor.js`](../js/perf/QualityGovernor.js), [`js/perf/RenderCostReport.js`](../js/perf/RenderCostReport.js), [`js/GrassSystem.js`](../js/GrassSystem.js), [`tests/render-cost-report.spec.js`](../tests/render-cost-report.spec.js), [`tests/farmhouse-pin.spec.js`](../tests/farmhouse-pin.spec.js).

**Acceptance (EARS):**

- [x] When a solo run starts on a scene that pins `farmHouse.position`, then `setDynamicBounds` shall keep the house at the scene-def position (newsheepdogland stays `(640,-956)`, mesh Y `3.58`, on land by the pen, not the `(180,160)` sea tile). Verified live + [`tests/farmhouse-pin.spec.js`](../tests/farmhouse-pin.spec.js).
- [x] While the renderer is desktop WebGPU, if frame windows miss budget at the quality floor, then the QualityGovernor shall not write the `sds-renderer-fallback` sticky flag. Verified live (no flag after a 60,008 ms backgrounded frame) + [`tests/render-cost-report.spec.js`](../tests/render-cost-report.spec.js).
- [x] If the tab is hidden or a frame exceeds 200 ms, then the QualityGovernor shall not fold it into the budget window. Verified live + unit test.
- [x] While on desktop, the QualityGovernor shall judge frames at the 28 ms-p95 desktop budget, not the 18.5 ms mobile-high bar. Unit test.
- [x] When the grass auto-LOD ticks inside the first 6 s of a scene, then it shall hold `_autoLodFactor` steady.
- [x] When `npm test` runs, then the suite shall stay green with 7 new specs (1142 pass / 8 skip), and `npm run build` shall stay clean at the bundle baseline (mainKB 591).

## Phase 2 - Flagship grass visibility on WebGPU (SHIPPED 2026-06-08, ~4hr)

**Independently testable.** A live regression in the shipped Cycle 81 flagship: grass was completely invisible on newsheepdogland on the desktop WebGPU path (both the compute-cull path it ships and the per-chunk fallback), while it rendered correctly on WebGL and on every near-origin scene. Fixed at the shader source. No render-path or architecture change, no `shared/` sim change, sim-baselines untouched.

Root cause:

- The grass blade node material ([`js/world/konveyorGrassBladeNodeMaterial.js`](../js/world/konveyorGrassBladeNodeMaterial.js)) computed its distance-fade opacity from a hand-rolled `bladeWorld = instanceWorldOffset + positionLocal`. `bladeWorld` is built from a per-instance source (the `instanceWorldOffset` attribute, or the compute-cull storage read indexed by `instanceIndex`) that collapses to ~0 in the FRAGMENT stage, so `viewDistance = length(cameraPosition - bladeWorld)` became `|cameraPosition|` (the camera's distance from the world ORIGIN, not the blade). newsheepdogland's play area sits ~1.2km from origin, entirely past `grassFadeEnd` (260m), so `densityFade -> 0` and every blade went fully transparent. Near-origin scenes (Rolling Hills, Home Field, Open Country) survived by accident because their grass never exceeded the origin-keyed threshold, which also means the intended camera-distance LOD had been silently dead on every WebGPU scene.

Fix:

- Use the engine built-ins like every sibling konveyor material (terrain, tree branch, tree leaf, meadow): `viewDistance = length(positionView)` (the view-space fragment position, whose length is the true camera-to-fragment distance), plus `positionWorld` for the colour jitter and the `toCamera` view vector. Size-neutral (both nodes are already bundled by the sibling materials). The Cycle 81 compute-cull consolidation (8 InstancedMeshes, the cold-load freeze fix) is untouched.

Files: [`js/world/konveyorGrassBladeNodeMaterial.js`](../js/world/konveyorGrassBladeNodeMaterial.js). Regression probe: [`tools/grass-fix-validate-cycle82.mjs`](../tools/grass-fix-validate-cycle82.mjs).

**Acceptance (EARS):**

- [x] While on a far-from-origin scene (newsheepdogland, play area ~1.2km from origin) on desktop WebGPU, when grass is in view near the camera, then it shall render visible blades (was fully transparent). Verified live on the shipped compute-cull path (grass field around the dog; grass-only isolation shows the full field) - `cycle82-validation/fix-newsheepdogland-*.png`.
- [x] When the grass distance fade evaluates `viewDistance`, then it shall measure camera-to-fragment distance (via `positionView`), not distance from the world origin.
- [x] While on a near-origin scene (Rolling Hills), when the fix lands, then near grass shall stay solid and only far grass fades (no regression) - `cycle82-validation/fix-rollinghills-closeup.png`.
- [x] While on the newsheepdogland flagship, when the fix lands, then the compute-cull consolidation shall be unchanged (8 InstancedMeshes, `grassControllerPresent: true`, 0 console errors).
- [x] When `npm test` runs, then the suite shall stay green (1142 pass / 8 skip, exit 0), and `npm run build` shall stay clean within the bundle baseline (main 591 / three 604 KB).

## Phase 3+ - feel-and-media-live (TODO, the standing thread)

Pick up at `/cycle-start`. Candidates from carryover:

- Survival-feel retune (day length, flock growth, loss threshold; Matt's taste pass).
- Two-dog co-op playtest.
- Entrance hero blessing (player-visible, paired).
- **Phase 4 (measure-first):** production-build, foreground, >= 5-run cold-load + steady-state p95/p99 on the 3070 to confirm the flagship sustains `qualityIndex 0` (resolves Q1). Optional spawn/shore-fade polish if the dog start still reads grass-light (it sits inside the 28 m coastline shore-fade band).
- Mobile WebGPU validation once a WebGPU-capable mobile device is on hand.

## Dependencies

```
Phase 1 + Phase 2 (shipped) → Phase 4 measurement → optional grass/spawn polish
Phase 3 feel-and-media-live (independent)
```

## Frozen files (cycle-specific additions)

- None. Phase 1 touched no fenced files (the `shared/` sim core is untouched; the `SceneDef` schema is unchanged).

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. No `shared/` sim change without the four-piece migration story; sim-baselines stay byte-identical (Phase 1 held this).

## What NOT to do during this cycle

- Don't regress the Cycle 81 flagship WebGPU lift (mesh consolidation, pixel-identical grass, lod0 trees). The guard `tools/webgpu-flagship-lift-gate-cycle81.mjs` (`GUARD=1`) asserts the counts.
- Don't lift the mobile WebGL pin without a real WebGPU-capable mobile device + a within-budget flagship cold-load.
- Don't de-fang the QualityGovernor or grass auto-LOD past the transient-rejection fixes without the Phase 3 production measurement. A genuine sustained budget miss should still adapt.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-81-plan.md`](archive/cycles/cycle-81-plan.md) — the WebGPU flagship lift (latest close)
