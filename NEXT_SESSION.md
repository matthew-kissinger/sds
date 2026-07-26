# Next Session - Cycle 120, lighting

> **Updated:** 2026-07-26
> **For:** Cycle 120
> **Pickup priority:** Phase 1, the identity fix, and ship it on its own with no render change. The roadmap's guess about this cycle is refuted and the real defect is simpler and larger than it describes. Read "What the trace found" at the top of the plan first.

## Current State

Cycle 119 (`bundle`) closed 2026-07-26, and with it Cycles 117 and 118 the same day. Plans archived in [`docs/archive/cycles/`](docs/archive/cycles/); close entries with full detail sit at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md).

**The payload cycle did its job.** 45,053 bytes, of which the number that matters is `main`'s: **1,516 bytes of headroom to 23,752**. That is the budget Cycle 118 tripped and had to restructure around, and the one this cycle and the next two would otherwise have been fighting for every import.

Before that, Cycle 118 took the water from cel-shaded anime cobalt to a surface that belongs to the world: measured over the water band across 24 capture poses, cobalt-wedge pixels went **61.5% to 2.4%**. And Cycle 117 gave Sheep Dog Island a fenced pasture you drive sheep into, with the leaderboard reset landing on production D1 and verified against the live boards.

## The active cycle

[`docs/cycle-120-plan.md`](docs/cycle-120-plan.md). Four phases.

**The roadmap's unverified claim is refuted, so do not spend a phase on it.** It records that "on the production WebGPU path the `AmbientLight` may be constructed and never added to the scene". It is added: [`js/rendering/productionWebGpuBoot.js`](js/rendering/productionWebGpuBoot.js):298 adds ambient, `:300` the directional, `:301` `directional.target`, and `:307-313` builds a `proof` object that asserts `scene.children.includes()` for both.

**The defect is not a missing `add`. It is a missing bind.** `Atmosphere` drives different objects entirely: [`js/main.js`](js/main.js):222 and `:1192` both bind `sceneManager.ambientLight`, which is the **WebGL** `SceneManager` ambient, a different instance from the one in the production scene. `1.1 * Math.PI` is **3.45575**, which is D25's measured "3.456 white at every time of day including full night" to three decimals. It was never a light that failed to update. It is a light nothing was ever wired to update.

**And all three of intensity, colour and direction are frozen, not just intensity.** `sceneManager.webgpuSunLight` has exactly three consumers and every one of them touches only the shadow frustum. Direction is pinned at `normalize(1.5, 2.2, 3.0) * 260`, one fixed mid-afternoon angle for every scene at every hour.

## What binds this cycle

- **Phase 1 ships with no render change.** If the goldens move on the identity fix alone, something other than the bind changed and the cycle stops until it is understood.
- **The impostor calibration is a real consumer and the roadmap does not mention it.** [`js/webgpuKilnImpostorNodeMaterial.js`](js/webgpuKilnImpostorNodeMaterial.js):239-248 calibrates the far-tree relight against `new DirectionalLight(0xffffff, 1.1 * Math.PI)` **by name and by value**, and Cycle 104 P3 deliberately retired a magic `brightness = 6` in favour of that derivation. If the production directional stops being a constant, that calibration is downstream of a value that now moves. Decide it in Phase 1, do not discover it in Phase 2.
- **The shadow frustum recentering must survive.** Two call sites write `sunLight.position` to move the shadow box, and the sun direction is `position - target.position`. Those two meanings are now in conflict on one vector. Separate them explicitly rather than letting the last writer win.
- **No ratchet bump.** Cycle 119 freed the headroom for this cycle and the two after it, not for this cycle to spend. `ui` at 120 B, `client` at 442 B and `vendor` at 606 B are still under 1 KiB.
- **Every capture proves genuine WebGPU.** `assertWebGpuEngaged` is not optional; headless Chrome has no `navigator.gpu`.

## Carryover worth knowing before you start

- **The golden harness's flock is not attributable.** It replaces `Math.random` globally with one seeded stream and `js/OptimizedSheep.js` draws from it 32 times for the flock layout, on a later frame than the re-seed. **Attribute golden deltas by block, not by score.** Cycle 118's method is the reference: mean absolute luma over the region of interest versus everything else, with an unaffected cell setting the noise floor.
- **Decide what a baseline is evidence of before touching it.** Cycle 118 re-baselined because the look was the deliverable. Cycle 119 deliberately did NOT, because its claim was that the pixels had not moved and standing baselines were the proof. This cycle changes every scene at every hour, so it is a re-baseline cycle, and the delta still has to be read first.
- **The near-black island terrain** is recorded as pre-existing and identical in a pre-116 golden. A frozen light direction is a plausible cause and this is the first cycle able to test it. Measure before folding it in; if Phase 2 does not fix it, it is an albedo problem with its own entry.
- From Cycle 118: foam is keyed on metres of seabed rather than horizontal distance to the interface; vertical streaking in mid-water at grazing angles; the WebGL twin's raw-output tone mismatch, deliberately left; `js/water/AnimeWater.js` is now a misnomer.
- From Cycle 117: a cue dead zone on Rolling Hills' northern approach, the gate assembly's 0.4 m cross-slope, and the `competitive.json` fence-glob gap (reconciled in Cycle 122 Phase 1).

## Two open questions for Matt, neither an agent's call

Both carried from Cycle 119, both still open:

1. **`__sdsCinema.freeFly()` and its OrbitControls chunk, 20,875 B.** `.claude/rules/scene-and-render.md` says removing the `?cinematic=1` harness is a separate decision, and `tools/validation/*.mjs` depend on it, including the harnesses this program has used to look at the build in six consecutive cycles.
2. **Whether the three live dev surfaces should exist on the deployed site.** Excluding PlaytestNote, the wolf harness and grassInteractionProof at build time would remove roughly 11.8 KB and take playtest affordances off production. Gating them further does nothing: the ratchet counts every emitted chunk regardless of whether it is fetched.

## What comes after

- **Cycle 121, worn ground** ([plan](docs/cycle-121-plan.md)). Smaller than the roadmap implies, because Cycle 115 already built the shared mechanism. It found a live gap: the grass exclusion keys on `sceneDef.pasture`, so Rolling Hills' new pasture and Newsheepdogland's homestead both have grass growing inside them.
- **Cycle 122, N pastures** ([plan](docs/cycle-122-plan.md)). The riskiest, deliberately last, and the only cycle in the program that can desync a live room. Its Phase 1 writes the migration story before any code.

## Reference

| What | Where |
|---|---|
| Active cycle plan | [`docs/cycle-120-plan.md`](docs/cycle-120-plan.md) |
| Remaining plans | [121](docs/cycle-121-plan.md), [122](docs/cycle-122-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Golden harness | `npm run validation:screenshots -- --diff`, then `--baseline` |
| Bundle ratchet | [`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](tests/refactor-baseline/__fixtures__/bundle-sizes.json), counted by `tests/refactor-baseline/baseline.spec.ts:129-146` |
| GLSL strip | [`scripts/glsl-template-minify.mjs`](scripts/glsl-template-minify.mjs), wired in [`vite.config.js`](vite.config.js) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Program shape | [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) |
