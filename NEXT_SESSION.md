# Next Session - Cycle 119, bundle

> **Updated:** 2026-07-26
> **For:** Cycle 119
> **Pickup priority:** Phase 3, the GLSL comment strip. It is the only remaining item with a real measured saving, because measurement disqualified Phase 2 entirely and cut Phase 4 from 17,644 B to 4,314 B. Read "Measurement disqualified two of its four remaining phases" at the top of the plan first.

## Current State

Cycle 118 (`water-rewrite`) closed 2026-07-26. Plan archived in [`docs/archive/cycles/`](docs/archive/cycles/); the close entry with full detail sits at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md).

The water stopped being cel-shaded anime cobalt. Measured over the water band across all 24 capture poses, cobalt-wedge pixels went **61.5% to 2.4%**. One shared surface model both render paths are authored against, one palette in one stated colour space, a normal with enough amplitude to actually shade, fog that tracks the sky, and a clock you can pin so a capture is repeatable.

Cycle 117 (`island-pasture`) closed the same day. Sheep Dog Island has a fenced pasture with one gate that you drive sheep into, and the leaderboard reset landed with it: rows 16 and 21 archived then deleted, `id=23` untouched, verified against the live boards after deploy.

## The active cycle

[`docs/cycle-119-plan.md`](docs/cycle-119-plan.md). Five phases, of which Phase 1 is already shipped and Phase 2 is dropped.

**This cycle exists to protect one rule: do not raise the ratchets.** They have caught real design errors three times now, most recently a two-budget `main` trip in Cycle 118 that got restructured rather than bumped. A cycle whose stated goal is "make the bundle smaller" is the most dangerous place to bump a budget, because the bump would look like bookkeeping.

**Measurement has already disqualified half the remaining work, and both findings are worth knowing before you start:**

- **Phase 2 is dropped.** The 38,900-byte ZSTD decoder is not dead payload. All ten shipped `.ktx2` files carry `supercompressionScheme = 2` with `vkFormat = 0`, so they need the basis transcoder and the ZSTD layer on top. Deleting it would blank every far-tree impostor on every scene. Lazy-loading buys nothing either, since impostors are part of first-interactive coverage.
- **Phase 4 is worth 4,314 B, not 17,644.** The premise was wrong in a way that matters beyond this phase: `tests/refactor-baseline/baseline.spec.ts:129-146` sums **every** `dist/assets/*.js` file into a family by filename prefix, with no notion of whether a chunk is ever fetched. Gating an import does not remove bytes from the measurement, it moves them out of `main` into the `other` catchall. And four of the five items are already dynamically imported. Only `ExtremeTuningPanel` is a real saving, because it is genuinely dead: imported, destructured, never rendered.

**So Phase 3 is the cycle's main event.** GLSL comments and indentation inside `js/**` template literals, measured at 15,907 B, and esbuild never touches them. That saving is real precisely because shader text lives inside chunks that are counted.

## What binds this cycle

- **No ratchet bump, in any phase, for any reason.** If a phase cannot fit, the phase is wrong. `tests/refactor-baseline/__fixtures__/bundle-sizes.json` is fence-frozen and is NOT authorised.
- **Strip GLSL at build time, keep it in source.** The shaders are heavily commented and those comments are load-bearing for the next person. A Vite transform leaves every comment where it is in the repo. Do not hand-strip source files.
- **No decomposition of `GrassSystem.js` or `OptimizedSheep.js`.** They are the biggest shader carriers and are protected by [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md). Phase 3 changes what the build emits from them, not their structure.
- **A saving that changes rendered output is not a saving.** Phase 3 must prove byte-identical renders through the golden harness.
- **One build at a time.** Concurrent builds sharing one tree double-compress `dist/terrain/*.bin` and the numbers become fiction.

## Headroom, as of the Cycle 118 close

| family | headroom |
|---|---:|
| main | 1,516 B |
| ui | 120 B |
| client | 442 B |
| webgpuDiagnostic | 848 B |
| App | 953 B |
| i18n | 1,517 B |
| other | 52,030 B |

**Five families are under 1 KiB.** `main` is the one to watch: Cycle 118 tripped it and had to restructure. Three cycles still have to land after this one.

## Two open questions for Matt, neither an agent's call

1. **`__sdsCinema.freeFly()` and its OrbitControls chunk, 20,875 B.** Retiring `freeFly` would drop its sole consumer. [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md) says removing the `?cinematic=1` harness is a separate decision, and `tools/validation/*.mjs` depend on it, including the harnesses this program has used to look at the build in five consecutive cycles.
2. **Whether the three live dev surfaces should exist on the deployed site at all.** Excluding PlaytestNote, the wolf harness and grassInteractionProof at build time would genuinely remove roughly 11.8 KB, but it takes playtest affordances off production. Gating them further does nothing, for the reason above.

## Carryover worth knowing before you start

- **The golden harness's flock is not attributable.** It replaces `Math.random` globally with one seeded stream and `js/OptimizedSheep.js` draws from it 32 times for the flock's layout, on a later frame than the re-seed. **Attribute golden deltas by block, not by score.** Cycle 118 did this properly: mean absolute luma over sea pixels versus everything else, with the two water-free Home Field cells setting the noise floor.
- From Cycle 118: foam is keyed on metres of seabed rather than horizontal distance to the interface; vertical streaking in mid-water at grazing angles, unchanged from the before-set; the WebGL twin's raw-output tone mismatch, deliberately left; and `js/water/AnimeWater.js` is now a misnomer.
- From Cycle 117: a cue dead zone on Rolling Hills' northern approach, the gate assembly's 0.4 m cross-slope, the near-black island terrain (routed to Cycle 120), and the `competitive.json` fence-glob gap (reconciled in Cycle 122 Phase 1).

## What comes after

- **Cycle 120, lighting** ([plan](docs/cycle-120-plan.md)). The roadmap's guess is refuted: both lights are added to the scene, with a proof object asserting it. `Atmosphere` binds different objects entirely, and `1.1 * Math.PI` is 3.45575, which is D25's measured 3.456 to three decimals. Direction is frozen too, not just intensity.
- **Cycle 121, worn ground** ([plan](docs/cycle-121-plan.md)). Smaller than the roadmap implies, because Cycle 115 already built the shared mechanism. It found a live gap: the grass exclusion keys on `sceneDef.pasture`, so Rolling Hills' new pasture and Newsheepdogland's homestead both have grass growing inside them.
- **Cycle 122, N pastures** ([plan](docs/cycle-122-plan.md)). The riskiest, deliberately last, and the only cycle in the program that can desync a live room.

## Reference

| What | Where |
|---|---|
| Active cycle plan | [`docs/cycle-119-plan.md`](docs/cycle-119-plan.md) |
| Remaining plans | [120](docs/cycle-120-plan.md), [121](docs/cycle-121-plan.md), [122](docs/cycle-122-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Bundle ratchet | [`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](tests/refactor-baseline/__fixtures__/bundle-sizes.json), counted by `tests/refactor-baseline/baseline.spec.ts:129-146` |
| Golden harness | `npm run validation:screenshots -- --diff`, then `--baseline` |
| Water captures | `npm run validation:water`, `cycle118-validation/water-before/` and `water-after/` |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Program shape | [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) |
