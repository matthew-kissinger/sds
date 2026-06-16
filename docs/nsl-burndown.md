# Newsheepdogland regression burn-down

> Cycle 104 Phase 4. **Diagnosis only - no NSL scene or survival code changes this
> cycle (Q3).** This doc enumerates NSL's render/sim path, the known regression
> classes, and the measurable bar NSL must clear before the entrance "Coming soon"
> comes off. Seeded by [`burndown-notes.md`](burndown-notes.md) finding 2.

## Why NSL is off

Switched off in the entrance on 2026-06-16 (entrance "Coming soon" + disabled Play,
[`js/components/entrance/worlds.ts`](../js/components/entrance/worlds.ts); dropped from
the multiplayer rotation, [`RoomCreation.js`](../js/components/Multiplayer/RoomCreation.js)).
The scene + survival code is INTACT and still reachable via `?scene=newsheepdogland`;
its player-flow E2E is skipped with re-enable comments. Matt's call: "it has caused
major regressions as we have tried to implement it... isolate and do a burn down, but
for now switch it off and focus around the first three scenes."

## NSL's path (what makes it the fragile one)

Read off the SceneDef ([`shared/scenes/newsheepdogland.js`](../shared/scenes/newsheepdogland.js))
and the render-path map ([`tools/validation/scene-render-path-map.mjs`](../tools/validation/scene-render-path-map.mjs)):

| Axis | NSL | The three live scenes |
|---|---|---|
| Boundary | `coastline` (SDF, cellSize 12) | rect / island |
| Loading | **streamed** (post-interactive foliage waves) | all-cold |
| Renderer | **WebGPU** (no `renderer` pin) | WebGPU |
| Foliage | consolidated cull + streamed far impostors | consolidated cull, all-cold |
| Extras | `prewarmShaders`, `dayNight` + `dayLoop`, `survival` (wolves, maxFlock 200) | none |

NSL is the only scene that combines the coastline SDF, streamed foliage, a day/night
cycle, and the survival run. Every one of those is a system the other scenes never
exercise, so NSL is where every render/perf regression lands first. The `types.js`
JSDoc still claims NSL pins `renderer: 'webgl'`; the live def does NOT - NSL runs the
WebGPU production path, which is where the cold-compile / jitter / TDR risk lives.

## Known regression classes (hypotheses to confirm on-device)

These are the recurring NSL failure modes from the cycle history. They are the
candidate root causes of the current "plain broken" state, NOT confirmed live
symptoms (confirming those needs an on-device NSL session + the concurrent perf
effort's data - see "Not yet confirmed").

1. **Cold WebGPU pipeline compile (boot).** NSL's cold pipeline compile historically
   blocked the main thread ~43s and TDR-crashed the tab (`cycle71-validation/webgpu-crash/`).
   Mitigated by `prewarmShaders` (build-tail `compileAsync`, Cycle 74) + the mesh
   consolidation collapse (Cycle 81). Hypothesis: a regression in the prewarm path or
   the consolidated-cull build re-opens the cold-compile stall on the WebGPU route.
2. **1%-low jitter floor (sustained play).** NSL mixed alphaTest 0 / 0.4 shadow casters
   churned the r184 shared shadow-override material (221 key recomputes/frame, GC
   hitches), fixed in Cycle 92 (`shadowOverrideMaterialFix.js`) and gated by a bracketed
   jitter rail (`npm run perf:jitter:nsl`). Hypothesis: a render-path change since has
   re-introduced shadow-override churn or a new per-frame allocation.
3. **Streamed-foliage stalls (re-entry / facing).** Cycle 95 fixed an impostor stall on
   scene re-entry (`QualityGovernor.resetWarmup`) and foliage blanking when facing one
   way (cold impostors `frustumCulled = false`). Hypothesis: the streamed wave / cold
   impostor coverage interacts badly with the Cycle 101-103 consolidated octahedral
   impostor path on the coastline route.
4. **Survival-loop coupling.** `GameState.survival` is a sticky singleton (set once,
   never cleared); the day-loop + wolf pack arm inside the build. Hypothesis: a
   scene-swap or re-entry leaves survival/day-loop state armed against the wrong scene.

## Not yet confirmed (needs on-device + the perf effort's data)

This box has one GPU (RTX 3070) and a separate concurrent effort owns it for perf
testing right now, so the SPECIFIC current regressions are NOT captured here. The
first on-device NSL step is to reproduce and label the live symptoms against the four
classes above, using:

- the render-path harness `--runtime` layer (boot-gate + impostor presence),
- `npm run perf:jitter:nsl -- --check=1` (the bracketed jitter rail),
- the perf effort's NSL findings once available.

This doc is the framework; the live-symptom capture is the first task of the NSL fix
cycle (105+), not this diagnosis.

## Re-enable bar (EARS)

NSL's entrance "Coming soon" comes off only when ALL of these hold on-device:

- When NSL is armed and Play is pressed, then the scene shall boot `webgpu-production`
  (no `production-webgpu-gates-failed`, no TDR) within the prewarm budget.
- When NSL runs the bracketed jitter rail, then `npm run perf:jitter:nsl -- --check=1`
  shall pass within the Cycle 96 budget (1%-low >= 100, worst delta <= 45ms, hitch
  rate <= 30 per 30s).
- When the player re-enters NSL after a menu return, then foliage shall stream to LOD0
  with no impostor stall and no blank-facing-one-way (Cycle 95 A/B hold).
- When a survival run ends and the player returns to menu, then the survival / day-loop
  / wolf-pack state shall fully reset (no stale arm against another scene).
- When the impostor-vs-LOD0 SSIM A/B runs on NSL across a yaw sweep, then it shall meet
  the agreed bar (the carried Cycle 101 paired validation).
- When NSL is re-enabled, then the entrance `comingSoon` flag, the multiplayer
  `SCENE_ORDER` entry, and the skipped player-flow E2E shall all be restored in the
  same change.

## References

- [`burndown-notes.md`](burndown-notes.md) - finding 2 (the takedown)
- [`cycle-104-plan.md`](cycle-104-plan.md) - Phase 4 (this diagnosis), Q3 (no fixes)
- [`archive/cycles/cycle-92-plan.md`](archive/cycles/cycle-92-plan.md) - shadow-churn jitter fix + bracketed gate
- [`archive/cycles/cycle-95-plan.md`](archive/cycles/cycle-95-plan.md) - the six NSL playtest fixes
- `cycle71-validation/webgpu-crash/` - the cold-compile TDR (local)
