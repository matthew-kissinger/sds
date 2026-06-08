# Cycle 74 - webgpu-compile-reduction

> Authored 2026-06-08 at `/cycle-start` (autonomous run: Matt: "complete autonomously and commit and deploy at end - i can review all changes by playtesting prod when you are done"). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Make newsheepdogland's heavy WebGPU cold pipeline compile non-catastrophic, and lift the Cycle 71 WebGL pin if (and only if) a within-budget cold load is verified on the RTX 3070. The Cycle 72 spike already root-caused the ~83-95s stall to intrinsic cold D3D12 WGSL-to-DXIL driver compilation of the scene's ~28 heavy pipelines (not material duplication; only 28 unique materials), proved that `renderer.compileAsync` moves that compile off the blocking first-render onto Dawn's async path and stops the TDR crash, and showed Dawn disk-caches the result so warm reloads are ~4s. This cycle builds that mechanism: a `compileAsync` prewarm under the loading bar, gated by a new opt-in `SceneDef.prewarmShaders` flag so the live WebGPU scenes are untouched, then a 3070 measurement spike for whether a menu-idle background prewarm warms the disk cache enough to bring the effective cold load within budget. The measured numbers decide the pin. User-visible before/after: if the pin lifts, newsheepdogland renders its real WebGPU Hosek sky + water (today, pinned to WebGL, the sky dome and sea render dark) and the flagship's hero + cinematic media unblocks; if the numbers do not support a within-budget load, the pin stays, the prewarm mechanism ships dormant behind it, and the residual gap is documented for a follow-up. No `shared/` sim change; sim-baselines stay byte-identical.

## Open questions to resolve before writing code

1. **Q1: Does a menu-idle background prewarm warm Dawn's disk cache enough that a later navigation to newsheepdogland loads within budget?** Author lean: unknown, this is the P2 spike. The proven floor is the `compileAsync` crash-fix (P1); the pin only comes off if P2 verifies a within-budget effective load.

## Phase shape rules

A cycle has <= 8 phases, each fully autonomous OR fully paired (no mixed mode within a phase). Single sharp goal, <= 4 hours each. This cycle is fully autonomous.

## Phase 1 - compileAsync prewarm mechanism (~3hr)

**Independently testable.** The proven crash-fix from the Cycle 72 spike, shipped as a gated, reversible mechanism. Comes first because P2 measures it and P3's pin decision depends on it.

Add an optional `SceneDef.prewarmShaders` boolean (additive, default absent). In the `rebuildScene` build tail (after `buildSceneBody` + `recordKonveyorProductionWebGpuBoot`, before the rAF loop resumes at `_sceneRebuilding = false`), when the active renderer exposes `compileAsync` AND the scene opts in, `await renderer.compileAsync(scene, camera)` under a `_reportLoadStep('Optimizing shaders')`, wrapped in try/catch so a rejection falls through to the status-quo lazy compile. Set `prewarmShaders: true` on newsheepdogland. The WebGL path and every non-opted scene stay byte-identical.

**Files touched:** `shared/scenes/types.js` (frozen - additive optional field, authorized below), `shared/scenes/newsheepdogland.js` (set the flag), `js/main.js` (build-tail prewarm step).

**Acceptance (EARS):**

- When `prewarmShaders` is added to `shared/scenes/types.js`, then the SceneDef typedef shall document it as an optional render-only flag (default absent => no prewarm).
- While a scene has no `prewarmShaders` flag, the load path shall make no `compileAsync` call (byte-identical to before on every live scene).
- When newsheepdogland loads on the WebGPU renderer (pin forced off via `?renderer=webgpu`), then the build tail shall `await renderer.compileAsync(scene, camera)` under an 'Optimizing shaders' load step before the first `renderAsync`.
- If `compileAsync` rejects, then the loader shall catch it and fall through to the existing render path (no unhandled rejection, no blocked load).
- When `npm test` runs, then all specs shall pass (render-only change; no sim-baseline drift).

## Phase 2 - 3070 measurement spike (~3hr)

**Independently testable.** Adapt the Cycle 72 probe into a headed-GPU measurement tool. The risky primitive (does a background prewarm warm the cache) is spiked here before P3 commits to the pin decision.

Measure on the RTX 3070, system Chrome, d3d11: (a) newsheepdogland forced-WebGPU cold load WITH P1's prewarm - does the tab survive (no TDR) and what is the compile wall-time under the loading bar; (b) warm reload time; (c) a live WebGPU scene (rolling-hills) still loads cleanly, no regression; (d) the Q1 spike: whether a menu-idle background prewarm warms Dawn's disk cache so a subsequent navigation to newsheepdogland loads within budget. Results + verdict to `cycle74-validation/`.

**Files touched:** `tools/webgpu-prewarm-probe-cycle74.mjs` (new), `cycle74-validation/*` (new, gitignored).

**Acceptance (EARS):**

- When the cold forced-WebGPU newsheepdogland load runs with P1's prewarm, then the probe shall record survived=true (no TDR) and a finite compileAsyncMs.
- When rolling-hills loads on WebGPU after P1, then the probe shall record it reaching a live async render loop with lastError=null (no regression on a live scene).
- When the background-prewarm spike runs, then `cycle74-validation/` shall record whether a post-prewarm navigation to newsheepdogland loads within budget (target: under ~10s effective) with the measured numbers.
- When the measurement completes, then `cycle74-validation/README.md` shall state the within-budget verdict (met / not met) with the evidence.

## Phase 3 - pin decision + conditional lift + capture (~2hr)

**Independently testable.** The measured numbers from P2 drive an objective decision against the hard-stop gate.

IF a within-budget cold load is verified on the 3070, remove `renderer: 'webgl'` from newsheepdogland, update the `swapScene` pin-handling + boot-gate comments to reflect the lift, and re-run the Cycle 73 capture tools to confirm the real Hosek sky + water now render (the marketing payoff). IF NOT verified, keep the pin, leave P1's mechanism dormant behind it, and document the residual gap + the recommended next step. Either way, record the decision + evidence in DECISIONS.md.

**Files touched:** `shared/scenes/newsheepdogland.js` (conditional pin removal), `js/main.js` (conditional comment/handler update), `DECISIONS.md`, `cycle74-validation/*`.

**Acceptance (EARS):**

- While the 3070 within-budget gate is unmet, the newsheepdogland `renderer: 'webgl'` pin shall remain in place (hard stop honored).
- When the within-budget gate is met and the pin is lifted, then `grep "renderer: 'webgl'" shared/scenes/newsheepdogland.js` shall return nothing AND a default load of newsheepdogland shall render the WebGPU sky, not the dark WebGL dome.
- When the pin decision is made, then `DECISIONS.md` + `cycle74-validation/` shall record the verdict and the measured basis.

## Phase 4 - validate + close (~1hr)

**Independently testable.** Standard close ritual.

**Acceptance (EARS):**

- When cycle close runs, then `npm test`, `npm run build`, and `npm run lint` shall all pass.
- When the bundle-size ratchet is checked, then `main-*.js` shall not exceed the recorded baseline, or the delta shall be surfaced.
- When the close commit lands on main, then the GH Actions deploy shall succeed.

## Dependencies

```
Phase 1 -> Phase 2 -> Phase 3 -> Phase 4
```

Strictly sequential. P2 measures P1; P3's pin decision is gated on P2's verdict.

## Frozen files (cycle-specific additions)

- **`shared/scenes/types.js`** (fence: schema/data contract). Authorized this cycle, P1 only. Change: add `@property {boolean} [prewarmShaders]` - an optional, render-only, default-absent field. This is the cheap additive case per [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) line 26. Migration story: no consumer reads it except the new build-tail step in `js/main.js`; absent => no prewarm (every existing scene byte-identical); the Worker sim never reads it. No rename/removal, no other consumer.

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. Do not remove the newsheepdogland WebGL pin unless a within-budget WebGPU cold compile is actually verified on the RTX 3070 (the Cycle 72/73 hard stop carries forward; removing it is the live-crash class again). The verification is P2; the lift is P3, gated on P2.
2. Do not touch `shared/` sim files. This is a render-path cycle; the sim-baselines stay byte-identical. Any sim-baseline drift is an emergency stop.
3. Do not let P1's prewarm change the load path for any scene without `prewarmShaders`. If a live WebGPU scene (rolling-hills, home-field, open-country) regresses in P2 measurement, revert and re-scope before continuing.

## What NOT to do during this cycle

- Don't apply a survival feel retune (taste; Matt's live wolf night - the other deferred thread).
- Don't simplify the grass/terrain/water/sky shaders to cut compile cost. That degrades the flagship's beauty (the whole marketing payoff) and is a separate, deliberate decision. This cycle is prewarm-first, not shader-reduction.
- Don't broaden `compileAsync` to all WebGPU scenes for cleanliness. Keep it opt-in behind the flag so live scenes stay byte-identical.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [x] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover. (P1 mechanism + P2 measurement + P3 decision + P4 close all shipped; the conditional pin-LIFT is deferred to the cycle-75 background-prewarm carryover.)
- [x] When `npm test` runs at cycle close, all vitest specs shall pass. (1135 pass, 8 skip.)
- [x] When `npm run build` runs at cycle close, the production build shall be clean. (clean; bundle 586/604 KiB == baseline, no regression.)
- [x] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions. (verified post-close; run recorded in BACKLOG.)
- [x] The pin decision (lift / stay) shall be recorded with its measured 3070 basis. (STAY: cold ~38s, disk cache no-help, in-session ~0.4s; DECISIONS.md + cycle74-validation/README.md.)

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files (types.js line 25)
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (Cycle 73 carryover)
- [`docs/archive/cycles/cycle-73-plan.md`](archive/cycles/cycle-73-plan.md) - the cycle just closed
- `cycle72-validation/webgpu-cold-compile/research.md` - the cold-compile root cause + option space (A/B/C/D)
- `cycle73-validation/README.md` - the media WebGPU-gating finding (the marketing payoff)
- `js/rendering/konveyorProductionWebGpuBoot.js` - the WebGPU boot path the prewarm slots into
- `js/main.js` swapScene (~913), rebuildScene (~1076), boot gate (~3340) - the seams
