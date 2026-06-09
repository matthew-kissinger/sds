# Cycle 82 — feel-and-media-live

> Drafted 2026-06-08 after Cycle 81 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> Closed 2026-06-09. Cycle 81 lifted the flagship live on desktop WebGPU. Cycle 82 opened with a post-ship flagship-stability phase, then shipped the standing player-visible `feel-and-media-live` thread as `v2.2.3`.
>
> Release proof: tag `v2.2.3` at `dc1855e`; CI follow-up `8b0936e`; Deploy run `27180799572` green; live Pages root 200 with `/assets/main-CLV5WhDs.js`; live Newsheepdogland hero asset 254,128 bytes, sha256 `2b80c17e0ac95b20554944eb6a9c85c0eb220cd0a7d8a428215fbed857dab5f3`; direct Worker `/healthz` 200 with `{"ok":true,"worker":"sds-worker"}`.

## Goal

Keep the freshly-lifted desktop WebGPU flagship correct and stable, then return to player-visible feel/media work. Phase 1 fixed three live regressions Matt hit testing newsheepdogland: the farmhouse spawned in the sea instead of attached to the pen, grass came and went, and loads flip-flopped between WebGPU and WebGL. All three trace to two mechanisms (a field-bounds reset that clobbered the scene-pinned homestead, and a QualityGovernor that false-floored on transient spikes and wrote a 24h sticky WebGL fallback from a desktop step-down). Phase 2 fixed a fourth newsheepdogland regression: grass was fully invisible on the desktop WebGPU path (a grass-blade distance-fade shader bug that keyed the fade off the world origin instead of the camera), corrected at the shader source. Phases 3 and 4 completed the deferred `feel-and-media-live` thread: survival pacing is sharper, two-dog co-op survives the shorter day/night cycle, the entrance now leads with Newsheepdogland, and the 3070 production-build steady-state profile holds full quality.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), not the implementation choices. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

## Open questions resolved during this cycle

1. **Q1: Does the 3070 genuinely exceed the desktop frame budget on newsheepdogland, or was the floor purely a transient false-positive?** Resolved by Phase 4: a local production preview on the 3070 passed 5/5 foreground steady-state runs at `qualityIndex 0` with worst p95 7.0 ms and worst p99 7.1 ms, no WebGL fallback, no console/page errors, and the WebGPU grass compute-cull path active. The budget miss was not a steady-state production problem.

## Phase 1 - Flagship stability fixes (SHIPPED LIVE 2026-06-09, ~3hr)

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
- [x] When `npm test` runs, then the suite shall stay green with 7 new specs (1142 pass / 8 skip), and `npm run build` shall stay clean at the Phase 1 checkpoint bundle baseline (mainKB 591).

## Phase 2 - Flagship grass visibility on WebGPU (SHIPPED LIVE 2026-06-09, ~4hr)

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
- [x] When `npm test` runs, then the suite shall stay green (1142 pass / 8 skip, exit 0), and `npm run build` shall stay clean at the Phase 2 checkpoint bundle baseline (main 591 / three 604 KB).

## Phase 3 - feel-and-media-live (SHIPPED LIVE 2026-06-09 as v2.2.3)

**Independently testable.** Turns Newsheepdogland from a correct-but-secondary option into the lead survival island. This phase touches shared scene/survival tuning; the active-cycle acceptance is recorded here, `npm test` including sim-baseline passed, and no sim-baseline golden was regenerated.

Fixes:

- Survival pacing is shorter and more legible: the Newsheepdogland day length is 360 s, so the initial `t=0.28` morning reaches night at about 187 s instead of about 312 s.
- Survival recovery is slightly more generous but losses matter earlier: flock growth is +6 per day, run loss triggers below 45% of the starting flock, and wolf kill cooldown is 1.6 s.
- The live two-client co-op survival test derives its night advance from the scene day length instead of hard-coding the old 600 s day.
- The entrance defaults to Newsheepdogland, uses a fresh WebGPU homestead/pen/grass capture, preloads that image first, and carries Newsheepdogland copy through baseline SEO/OG/Twitter metadata.
- Mobile entrance polish: the fullscreen banner sits below the top title/actions, and the Newsheepdogland tagline wraps instead of clipping.

Files: [`shared/scenes/newsheepdogland.js`](../shared/scenes/newsheepdogland.js), [`shared/survival/tuning.js`](../shared/survival/tuning.js), [`shared/survival/run.js`](../shared/survival/run.js), [`tests/survival-tuning.spec.js`](../tests/survival-tuning.spec.js), [`tests/survival-run.spec.js`](../tests/survival-run.spec.js), [`tests/worker/survival-tick.spec.ts`](../tests/worker/survival-tick.spec.ts), [`tests/worker/survival-persistence.spec.ts`](../tests/worker/survival-persistence.spec.ts), [`tests/integration/coop-survival.spec.ts`](../tests/integration/coop-survival.spec.ts), [`js/components/entrance/worlds.ts`](../js/components/entrance/worlds.ts), [`js/components/entrance/Entrance.tsx`](../js/components/entrance/Entrance.tsx), [`js/MobileControls.js`](../js/MobileControls.js), [`index.html`](../index.html), [`js/main.js`](../js/main.js), [`js/utils/seo.js`](../js/utils/seo.js), [`assets/scenes/entrance/newsheepdogland.webp`](../assets/scenes/entrance/newsheepdogland.webp), [`tools/cycle82-entrance-hero-capture.mjs`](../tools/cycle82-entrance-hero-capture.mjs).

**Acceptance (EARS):**

- [x] When a Newsheepdogland survival run starts at `dayNight.initialT = 0.28`, then night shall arrive in about 187 s on the 360 s day. Verified by survival unit coverage and the live co-op integration test.
- [x] When a survival day rolls forward, then the flock shall grow by 6, a run shall fail below 45% of the starting flock, and wolves shall not kill faster than the 1.6 s cooldown. Verified by focused survival tests and the full suite.
- [x] When the two-dog survival integration test advances to night, then it shall compute the advance from `newsheepdogland.dayNight.secondsPerDay` and observe both clients in the same survival snapshot with 2 wolves. Verified live against local Wrangler: `COOP_SURVIVAL_LIVE=1 INTEGRATION_WORKER_URL=http://127.0.0.1:8787 npx vitest run tests\integration\coop-survival.spec.ts`; proof artifact `cycle68-validation/coop/two-client-proof.json`.
- [x] When the root entrance opens on desktop or mobile, then the selected world shall be Newsheepdogland with survival copy, loaded Newsheepdogland image, Newsheepdogland preload, Newsheepdogland OG image, and no console/page errors. Verified by `cycle82-validation/entrance-proof/proof.json`.
- [x] When the mobile entrance renders, then the fullscreen prompt shall not overlap the title and the full survival tagline shall be visible without ellipsis. Verified by `cycle82-validation/entrance-proof/mobile.png`.
- [x] When `npm test` runs after the shared survival tuning change, then sim-baselines shall still pass without regenerating any golden.

## Phase 4 - production steady-state profile on the 3070 (SHIPPED LIVE 2026-06-09 as v2.2.3)

**Independently testable.** A measure-first production-build profile against a local `vite preview` confirmed that Newsheepdogland sustains the desktop WebGPU flagship at full quality on the 3070. The same release bundle is now live on Pages; the live main bundle contains the Newsheepdogland scene data plus the `lossThreshold:.45`, `killCooldown:1.6`, and `secondsPerDay:360` release markers.

Probe: [`tools/cycle82-steady-state-profile.mjs`](../tools/cycle82-steady-state-profile.mjs). Artifacts: `cycle82-validation/steady-state-profile-3070.json`, `cycle82-validation/steady-state-profile-screens/run-1.png`.

**Acceptance (EARS):**

- [x] When the production build runs Newsheepdogland on the 3070 with `renderer=webgpu`, `probeRender=1`, `perfMode=1`, and `autostart=1`, then the renderer shall stay `webgpu-production` with no WebGL fallback. Verified 5/5 runs.
- [x] When the steady-state foreground window is measured after 12 s warmup for 15 s per run, then p95 shall stay under 28 ms and p99 under 44 ms. Verified worst p95 7.0 ms, worst p99 7.1 ms, mean average frame time 6.943 ms.
- [x] When the flagship profile runs, then quality shall remain at `qualityIndex 0`, the WebGPU grass compute-cull path shall be active, instanced mesh count shall stay within the Cycle 81 consolidation envelope, and there shall be no console/page errors. Verified by `cycle82-validation/steady-state-profile-3070.json`.
- [x] When `npm run build` runs at this checkpoint, then the production bundle shall build cleanly. Current bundle reality after the entrance work is main 605.49 KB and three 618.78 KB; the earlier 591/604 KB notes were Phase 1/2 checkpoint values, not the current end-of-cycle bundle size.

## Dependencies

```
Phase 1 + Phase 2 (shipped live) -> Phase 4 measurement (validated locally, release shipped live)
Phase 3 feel-and-media-live (shipped live)
Mobile WebGPU validation remains blocked on a WebGPU-capable mobile device
```

## Frozen files (cycle-specific additions)

- None of the durable frozen files listed in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) were touched. Phase 3 deliberately touched shared scene/survival tuning (`shared/scenes/newsheepdogland.js`, `shared/survival/*.js`); this plan records the acceptance for that shared change, and sim-baselines passed without regeneration.

## Hard stops

Durable hard stops apply on every cycle — see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. No `shared/` sim change outside the Phase 3 survival tuning accepted above; sim-baselines stay byte-identical unless a future cycle explicitly accepts a golden change.

## What NOT to do during this cycle

- Don't regress the Cycle 81 flagship WebGPU lift (mesh consolidation, pixel-identical grass, lod0 trees). The guard `tools/webgpu-flagship-lift-gate-cycle81.mjs` (`GUARD=1`) asserts the counts.
- Don't lift the mobile WebGL pin without a real WebGPU-capable mobile device + a within-budget flagship cold-load.
- Don't further de-fang the QualityGovernor or grass auto-LOD past the transient-rejection fixes. Phase 4 confirmed the 3070 steady state is healthy; a genuine sustained budget miss should still adapt.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [x] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover. Cycle 82 shipped live; mobile WebGPU validation remains carryover.
- [x] When `npm test` runs at cycle close, all vitest specs shall pass. Passed before release commit; GH Actions `Test` passed in deploy run `27180799572`.
- [x] When `npm run build` runs at cycle close, production build shall be clean. Passed locally before release; GH Actions `Deploy Pages` built and deployed successfully in run `27180799572`.
- [x] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions. Run `27180799572` green; live Pages and direct Worker proof recorded above.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`docs/archive/cycles/cycle-81-plan.md`](archive/cycles/cycle-81-plan.md) — the WebGPU flagship lift (latest close)
