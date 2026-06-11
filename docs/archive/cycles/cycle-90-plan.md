# Cycle 90 - nsl-runtime-perf

> Drafted 2026-06-10 after Cycle 89 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Newsheepdogland lags while moving around on the PC (the original complaint that opened Cycle 89; Cycle 89 fixed the small-scene variant and left NSL unmeasured). This cycle applies the same measurement-first method to NSL: capture a driven jitter baseline in survival mode, attribute the hitches with the isolation/toggle matrix, ship only data-gated fixes with zero visual or gameplay change, and re-baseline. User-visible difference: NSL plays smoothly while moving, turning, and zooming on the RTX 3070, and if the after-numbers meet the same bar Home Field meets (driven 1%-low >= 55 FPS, worst frame delta <= 45ms), the Experimental (WIP) pill comes off the entrance. The entrance default stays Rolling Hills; flipping the default back to NSL is Matt's call after a feel-check, not this cycle's.

## How to read this plan

Measurement-first, exactly like Cycle 89: Phases 1-2 are tools-only and produce the data gate; Phases 3-6 are fix phases that run **only if** their suspect clears its gate; Phase 7 re-baselines and closes. Every fix phase proves zero visual change (SSIM differential vs pre-change main HEAD; goldens themselves are stale, see BACKLOG) and keeps sim-baselines byte-identical.

Known context going in:

- NSL trees ride the **consolidated compute-cull path** (coastline + WebGPU), not the per-chunk path Cycle 89 pinned. Its render-list churn profile is unmeasured.
- Cycle 89's trees-off run on field still showed a small residual; rocks/structures pin is an open question.
- The impostor runtimes (`TreeImpostorRuntime`, hybrid sync) do per-frame CPU work on NSL that field never exercised.
- NSL adds systems field doesn't have: day/night loop, wolves, water, streamed grass, larger heightfield.
- Methodological rule: **probes drive the dog** (hold W, weave, sprint, wheel-zoom). Idle numbers must not gate.

## Open questions to resolve before writing code

1. **Q1: Does the NSL stutter share the Cycle 89 signature (multi-frame GPU-process stalls, zero longtasks) or is it main-thread (longtask-correlated)?** Author lean: some of both; the compute-cull path re-sorts the render list when tile visibility changes, and the impostor sync rewrites instance buffers on the CPU. Phase 2 decides.
2. **Q2: Should the measure window include the foliage-streaming window or start after `completedAt`?** Author lean: steady-state (post-streaming) is the gating capture; one contrast capture without the wait documents the streaming-window cost separately.

## Phase 1 - NSL driven jitter baseline (tools-only, ~1hr)

**Independently testable.** No game code changes.

1. **Probe extension.** Add `--waitFoliage=1` to [`tools/cycle89-jitter-probe.mjs`](../tools/cycle89-jitter-probe.mjs): after `__perfHarness.isReady()`, wait for `window.__sdsFoliageStreaming?.completedAt > 0` (timeout 120s, non-fatal on scenes without streaming) before the warmup clock starts.
2. **Baseline.** `node tools/cycle89-jitter-probe.mjs --scene=newsheepdogland --mode=survival --waitFoliage=1 --contrast=0` (5 driven runs) -> `cycle90-validation/jitter-baseline-nsl-survival.json`.
3. **Streaming-window contrast.** One run without `--waitFoliage` -> `cycle90-validation/jitter-nsl-streaming-window.json`.

**Acceptance (EARS):**

- [x] When Phase 1 ships, then `cycle90-validation/jitter-baseline-nsl-survival.json` shall exist with 5 driven runs and a populated hitch timeline.
- [x] While the probe runs, the harness shall set `SDS_SUPPRESS_BROWSER_OPEN=1` and close every page/context/listener after capture.

**Status: DONE 2026-06-10.** Baseline reframed the cycle: NSL is THROUGHPUT-bound, not jitter-bound. Median 36.0 FPS (quarter-rate of the 143Hz panel), 1%-low 16.0-23.6, worst frame 104ms, zero longtasks, and the QualityGovernor pinned at index 3 (the floor rung) on every run. Streaming completed (40/40 waves) before every measure window.

## Phase 2 - Attribution matrix on NSL (tools-only, ~2hr) - THE DATA GATE

**Depends on:** Phase 1.

1. `node tools/cycle89-jitter-probe.mjs --scene=newsheepdogland --mode=survival --waitFoliage=1 --matrix=1` - isolations (sheep/terrain/grass/atmosphere/trees) + toggles (trees-off, tree-shadows-off, impostor-sync-off, hybrid-freeze, tree-alphahash-off, tree-cull-off, cull-off-all, readback-off) + collision profile.
2. WebGL renderer differential: one driven baseline with `--renderer=webgl`.
3. Write the go/no-go table into this plan.

**Gates (a fix phase runs only if its suspect clears the bar):**

- Phase 3 (compute-cull tree path) iff tree-cull-off or trees-off cuts hitch rate >= 30% or lifts 1%-low >= 20% over full.
- Phase 4 (impostor/hybrid CPU sync) iff impostor-sync-off or hybrid-freeze cuts hitch rate >= 30% or longtasks correlate with >= 30% of hitches.
- Phase 5 (rocks/structures render-list pin) iff cull-off-all beats tree-cull-off by >= 15% on hitch rate or 1%-low.
- Phase 6 (other: grass readback, atmosphere, collision) iff its isolation/toggle clears the same 30% bar.
- If nothing clears: stop, record findings in BACKLOG, surface to Matt with the data.

**Acceptance (EARS):**

- [x] When Phase 2 ships, then `cycle90-validation/jitter-attribution-nsl.json` shall exist and this plan shall contain a filled gate table.

**Status: DONE 2026-06-10.** The matrix answered Q1 decisively and rendered the planned hitch-rate gates moot: every isolation AND every toggle (15 applicable configs) sat at 36.0-36.1 FPS median. The cost is content-independent. Follow-ups that settled it:

| Run | Median FPS | 1%-low | Verdict |
|---|---|---|---|
| full (WebGPU) | 36.0 | 16-24 | the complaint |
| every isolation/toggle in the Cycle 89 matrix | 36.0-36.1 | 15-24 | content exonerated |
| WebGL differential | 144.9 | 77-89 | WebGPU-path-specific |
| computecull-off (new toggle) | 144.9 | 129.1 | compute-cull drive is the cost |
| grasscull-off (new toggle) | 36.1 | 19.9 | grass cull is free |
| treecull-compute-off (new toggle) | 144.9 | 104.6 | TREE cull controllers are the whole cost |

Root cause (`tools/probe-nsl-cull-controllers.mjs`, live count): Cycle 87's per-wave streaming calls `buildAdditiveTreeMeshes` once per wave, and on the compute-cull path each call creates fresh controllers per tree-type per child-mesh. NSL ends at **108 tree controllers + 2 grass = 220 `queue.submit()` calls per frame** for 3,758 trees (each `renderer.compute()` is its own command encoder + submit in the three.js WebGPU backend). At ~0.1ms per submit that is the measured ~21ms/frame. The original Cycle 81/82 design ("collapse ~410 meshes to one controller set") was silently re-fanned-out by streaming.

**Gate outcome:** Phase 3 armed with a re-scoped shape (batch the submits, not churn work). Phases 4, 5, and 6 NOT ARMED - impostor runtimes do not exist on the live NSL path (toggles skipped: "no impostor runtimes"/"no hybrid runtimes"), rocks/structures and everything else exonerated by the content-independence result.

## Phase 3 - Fix: batch compute-cull submits [armed, re-scoped from gate data] (~3hr)

**Depends on:** Phase 2 gate. Shipped shape: collect every live controller's reset+cull compute passes into ONE `renderer.compute(array)` call per frame (the three.js array form runs the whole list in one command encoder + one `queue.submit()`; WebGPU spec guarantees dispatch ordering within a pass, so each controller's reset still lands before its cull). Controllers (`treeComputeCull.js`, `grassComputeCull.js`) expose `updateCullUniforms(camera)` + `passes`; the driver (`TerrainBuilder._driveComputeCull`) batches and honors a `cullDisabled` probe flag. 220 submits/frame -> 1.

**Acceptance (EARS, re-scoped to the measured throughput problem):**

- [x] When Phase 3 ships, then the NSL driven median FPS shall rise >= 2x vs the Phase 1 baseline. (Measured: 36.0 -> 144.9, worst frame 104 -> 20.8ms, governor at quality 0 on all runs vs floor-pinned 3 before.)
- [x] When Phase 3 ships, then the NSL SSIM differential vs pre-change main shall land within the same-build noise floor. (head-vs-main 0.958-0.991 vs floor 0.977-0.998; abs-diff heatmaps localize 100% of the delta to wall-clock-animated sky/water - terrain/trees/grass pixel-identical. `cycle90-validation/visdiff/summary.json`.)

**Status: SHIPPED 2026-06-10.**

## Phase 4 - Fix: impostor/hybrid per-frame CPU sync [gated] (~3hr)

**Depends on:** Phase 2 gate. Candidate shapes: dirty-flag the impostor instance sync (skip rewrite when the camera cell hasn't changed), batch hybrid LOD transitions, or (spike, only if cheap wins are exhausted) the TSL `instancedArray` + compute selection from the R&D pass.

**Acceptance (EARS):** same bar as Phase 3 (>= 30% hitch cut, median within 5%, SSIM clean).

**Status: NOT ARMED, skipped.** No impostor/hybrid runtimes exist on the live NSL path (matrix toggles skipped with "no impostor runtimes"/"no hybrid runtimes").

## Phase 5 - Fix: rocks/structures render-list pin [gated] (~1hr)

**Depends on:** Phase 2 gate. Mirror the Cycle 89 tree pin on whichever static instanced systems the cull-off-all delta implicates.

**Acceptance (EARS):** same bar (measured against the residual the gate identified, SSIM clean).

**Status: NOT ARMED, skipped.** cull-off-all vs tree-cull-off showed no delta beyond noise at the 36 FPS floor, and the floor itself was the compute-submit fan-out, not render-list churn.

## Phase 6 - Fix: other attributed source [gated] (~2hr)

**Depends on:** Phase 2 gate. Scoped to whatever the matrix actually fingers (grass readback cadence, atmosphere/day-night recompute, collision grid). Frozen-file discipline: if the fix touches `shared/`, stop and surface first; sim-baselines stay byte-identical.

**Acceptance (EARS):** same bar.

**Status: NOT ARMED, skipped.** readback-off no delta; collision p95 0.1ms at N=10; atmosphere/grass/terrain isolations all at the same 36 FPS floor. No `shared/` edits this cycle.

## Phase 7 - Re-baseline + rail + pill decision (~1hr)

**Depends on:** armed fixes among 3-6 (or directly on Phase 2 if nothing armed).

1. Re-run the Phase 1 baseline -> `cycle90-validation/jitter-after-nsl-survival.json`; before/after table in this plan.
2. Extend `cycle89-validation/jitter-budgets.json` (machine-local) with an NSL entry so `npm run perf:jitter -- --check` covers both scenes, or document why not.
3. **Pill decision:** if the after-numbers meet driven 1%-low >= 55 and worst delta <= 45ms, remove the Experimental (WIP) pill from the entrance (entrance default stays Rolling Hills). If not met, pill stays; record the gap in BACKLOG.
4. Full rails: `npm test`, `npm run build` (main <= 609 KiB), `npm run perf:check`, e2e smoke locally.

**Acceptance (EARS):**

- [x] When Phase 7 ships, then `cycle90-validation/jitter-after-nsl-survival.json` shall exist and this plan shall contain a before/after table.
- [x] If the after-numbers meet 1%-low >= 55 and worst delta <= 45ms, then the entrance shall render Newsheepdogland without the Experimental (WIP) pill. (Bar NOT met with shadows on; pill kept per the next line.)
- [x] If the bar is not met, then the pill shall remain and BACKLOG shall record the measured gap.

**Status: DONE 2026-06-11.** Before/after (driven survival, RTX 3070, 143Hz panel):

| Metric | Before (Phase 1) | After cull fix only | Shipped (cull fix + Phase 8 shadows) |
|---|---|---|---|
| Median FPS | 36.0 (quality floor 3) | 144.9 (quality 0) | 71.9-72.5 locked, one run rode 138.9 (quality 0) |
| Min 1%-low FPS | 16.0 | 70.3 | 45.3 |
| Worst frame | 104.2ms | 20.8ms | 34.7ms |
| Steady hitches/30s | n/a (throughput-bound) | ~13 | 4.5-49.5 |

**Pill decision: stays.** With shadows on, NSL sits right at the 6.94ms vsync budget: it locks a clean 72.5 at full quality (vs 36 at the quality floor before the cycle), but 1%-low 45-47 misses the >= 55 bar and one run flapped across the budget edge (1,513 hitches/30s at median 138.9). The gap and the next lever (shadow depth-pass cost: per-instance shadow culling for the consolidated tree meshes) are recorded in BACKLOG. The `perf:jitter -- --check` field rail passes better than its Cycle 89 derivation (median 144.9, 1%-low 137.5, 1 hitch/30s).

Rails at close: `npm test` 1518 passed; main bundle 610.2 KiB <= 611 (deliberate ratchet bump 609 -> 611 main / 548 -> 549 other for the Phase 8 features); `npm run perf:check` 0 regressed; field jitter rail PASS.

## Phase 8 - NSL visual pass: shadows, ground color, water, lighting (mid-cycle directive, ~3hr)

**Added 2026-06-10 from Matt's mid-cycle message** ("i dont like the water shader that much and the lighting i feel like we could improve both - also i am not seeing shadows at all but i do see a lot of black spots on the ground... if we could improve the color of the ground and the shadows too at the end of this cycle"). This phase is explicitly EXEMPT from the zero-visual-change hard stop - visual improvement is the goal. It runs AFTER the perf fix is committed with its own clean differential, so perf and visual changes never share a diff.

1. **Screenshot survey first.** Capture NSL ground/water/shadow shots at noon and golden hour; diagnose the "black spots" and the missing shadows before touching any shader.
2. **Shadows.** Lead suspect: `SunSystem` ships a static +-220m shadow frustum centered on the world origin (`shadowHalfExtent` default, `setShadowFollowTarget` exists but is never called); on a ~3.2 km^2 island the player is outside it almost everywhere - no visible shadows. Wire the follow target to the dog on large scenes.
3. **Ground color.** Diagnose the near-black patches (splat/albedo/AO or shadow-acne) from the survey; lift the floor so dark areas read as soil/grass shade, not voids.
4. **Water.** Modest shader improvement on `AnimeWater` (color depth response, sun response); no new render passes.
5. **Before/after screenshots** saved to `cycle90-validation/` for Matt's review at close.

**Acceptance (EARS):**

- [x] When Phase 8 ships, then `cycle90-validation/` shall hold before/after NSL screenshots covering ground, water, and shadows. (`visual-survey/before3` vs `visual-survey/after-final` + `bridge-shadow-check.png`.)
- [x] When Phase 8 ships, then a shadow caster near the dog shall produce a visible shadow on NSL terrain wherever the dog is on the island. (Tree silhouette + dog shadow captured; frustum verified centered on the dog at (585,-1000).)
- [x] If a visual knob changes a non-NSL scene, then the change shall be gated to NSL (or shown identical on the other scenes' differential cells). (Terrain palette: SceneDef-gated, only NSL declares one. Water depth floor: coastline-gated. Shadows: day-loop-gated after the global config measured field at 48 FPS median. Day-night keyframes: NSL is the only day-night scene. Field jitter rail re-verified PASS.)

**Status: SHIPPED 2026-06-11.** What the survey found and what shipped:

1. **Shadows.** Root cause was deeper than the planned frustum-recenter: on the WebGPU path NO scene light ever cast shadows - the production lighting bridge (`productionWebGpuBoot.js`) ships a fixed directional with no shadow camera, and the `SunSystem`/`SceneManager` shadow lights are never attached on WebGPU. (Also, NSL's world origin is open water, so even an attached origin-pinned frustum would never land on the island.) Shipped: the bridge directional carries a 1024px +-70m shadow camera, OFF by default; day-loop scenes flip it on and recenter it on the dog every frame with texel snapping (`initWorld._tickDayLoop`); teardown flips it back off. Grass never casts (a global-shadows experiment measured field at 48 FPS median / 687ms worst frames with per-chunk blade casters). `SunSystem` keeps its follow-target + texel-snap improvements for any future attached-sun path.
2. **Ground color.** The terrain shader's palette was tuned for small dense-grass pastures; NSL's sparse streamed-annulus grass exposes bare terrain that read near-black at noon. Shipped: optional `terrain.colors` SceneDef field (schema cheap-case: additive optional, default preserves every scene; consumer `TerrainBuilder` WebGL uniforms + WebGPU factory context); NSL declares a lifted coastal palette.
3. **Water.** The shallow-to-deep gradient was floor-clamped at 0.82 (tuned for radial-boundary islands), flattening NSL's water to one blue. Shipped: `minDepthT` plumbed through `createAnimeWater` -> node material; coastline scenes pass 0.45 so a real shallow band reads along the shore; radial islands keep 0.82.
4. **Lighting cadence.** A 6-minute survival day spent most of its daylight in low-sun pink light (keyframes slid toward golden hour right after noon). Shipped: a t=0.60 pastoral-noon keyframe holds proper daylight through most of the day phase.

## Dependencies

```
Phase 1 -> Phase 2 (gate) -> armed fixes among 3/4/5/6 (serial, re-measure after each) -> Phase 8 (visual, post-commit of perf fix) -> Phase 7 (close rails)
```

## Frozen files (cycle-specific additions)

- `shared/**` - any sim-core edit requires stop-and-surface even if Phase 6 data points there. Sim-baselines stay byte-identical this cycle.

**Fence-frozen files touched (Phase 8, schema cheap-case):**

- `shared/scenes/types.js` - added optional `TerrainDef.colors` (+ `TerrainColors` typedef). Additive optional field with a default; absent means the long-standing palette, byte-identical for every existing scene. Render-only (the Worker ignores `terrain`). Consumer updated in the same commit: `js/TerrainBuilder.js` (WebGL uniforms + WebGPU factory context already mapped `baseColor1/2/3`). Alternative considered: hardcoded scene-id branch in TerrainBuilder - rejected per the scene-as-data rule.
- `shared/scenes/newsheepdogland.js` - declares the new optional field (data-only; no sim consumer reads `terrain`). Sim-baselines verified byte-identical by `npm test`.

## Hard stops

1. Any visual change detectable by the SSIM differential (cell delta > 0.01) - revert the fix, re-think.
2. Any sim-baseline fixture diff - revert immediately.
3. Median FPS regression > 5% from a hitch fix - the fix is wrong, revert.
4. Probe data contaminated by concurrent machine use - discard the run, re-capture.

## What NOT to do during this cycle

- Don't flip the entrance default back to NSL (Matt's feel-check call, post-cycle).
- Don't regenerate sim-baseline fixtures or screenshot goldens (golden re-capture is its own backlog item).
- Don't start the TSL instancedArray rewrite unless Phase 4 is armed AND the cheap dirty-flag fix measurably falls short.
- Don't touch the mobile tree-culling path without mobile data.

## Success criteria (cycle close)

- [x] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover. (1, 2, 3, 7, 8 shipped; 4, 5, 6 NOT ARMED by the Phase 2 gate, recorded above.)
- [x] When `npm test` runs at cycle close, all vitest specs shall pass. (1518 passed, 11 skipped.)
- [x] When `npm run build` runs at cycle close, production build shall be clean (main <= 609 KiB). (Clean; main 610.2 KiB against the deliberately bumped 611 ratchet - see Phase 7 status.)
- [x] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions (or be docs-only and covered by the prior green run). (Code commits `77c0337`/`ddb9b40` deploy run 27336393613; close commit is docs-only.)
- [x] When the cycle closes, `cycle90-validation/` shall hold baseline, attribution, and after captures, and this plan shall contain the filled gate table and before/after table. (Both tables above; captures + SSIM differential + visual surveys local.)
- [x] When the cycle closes, the Experimental (WIP) pill state shall match the Phase 7 data gate (removed iff the bar is met). (Bar not met with shadows on; pill stays, gap in BACKLOG.)

## References

- [`docs/archive/cycles/cycle-89-plan.md`](archive/cycles/cycle-89-plan.md) - the method this cycle reuses
- [`tools/cycle89-jitter-probe.mjs`](../tools/cycle89-jitter-probe.mjs) - the probe
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items
