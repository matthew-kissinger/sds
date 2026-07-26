# Next Session - Cycle 124, coverage and albedo

> **Updated:** 2026-07-26
> **For:** Cycle 124
> **Pickup priority:** Author [`docs/cycle-124-plan.md`](docs/cycle-124-plan.md), which is a scaffolded stub. The two things that have earned it are the golden matrix's missing cells and the island terrain albedo floor, and the first would guard the second.

## Current state

**The front door program is complete and closed.** Cycles 112 through 123 all shipped; the last seven of them (117 through 123) landed on 2026-07-26. Every plan is archived under [`docs/archive/cycles/`](docs/archive/cycles/) with a close entry at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md). The binding decision record is [`DECISIONS.md`](DECISIONS.md), D1 through D36.

`main` is green and deployed. v2.6.2, no version bump this run.

## What Cycle 124 is for

The stub is named `coverage-and-albedo` because two items have now been deferred by three cycles each, and they are related:

1. **The golden matrix has no Newsheepdogland cell and no close-range cell.** The standing gate is six wide classic cells on three scenes. Cycle 121 changed three ground surfaces, Cycle 123 changed every grass field on every scene, and Cycle 120 changed the sun - none of that is guarded at close range or on the one scene with a live day loop. `tools/validation/worn-ground-probe.mjs` and `tools/validation/grass-light-ratio.mjs` are the framings that do cover them. Note the Cycle 103 constraint: the follow-camera cells were dropped because the sim settles by wall-clock, so a close-range cell needs a deterministic fixed-dt sim-step affordance first.
2. **Rolling Hills' pasture reads as a black hole, and it is albedo, not lighting.** Cycle 120 measured a 4.2x spread in the terrain floor across four biomes **under an identical sun and ambient** (Home Field 60.08 against Rolling Hills 14.30). Cycle 121 confirmed the worn-ground zone is correct there and that time of day is not the cause. Cycle 123 left it explicitly out of scope. Now that grass lighting has landed it is worth re-looking, because the grass above it moved.

Do the coverage first if both land in one cycle. A gate that cannot see the surface you are about to change is the thing that made all three deferrals cheap to keep making.

## Other carryover, in rough priority order

- **The baked entrance heroes are permanently noon.** The entrance renders a hero PNG, not the live scene, which is why Home Field's new evening does not touch it. An evening hero is now a legitimate thing to want and it is a **paired capture session in Matt's voice**, not an autonomous change.
- **Cycle 122's Phase 4 is partial.** The competitive layout change was validated against 600 frames of the real authoritative sim on three island rooms plus the deployed client transform run verbatim against the new payload, but **never against a real Durable Object over a real socket with real browsers**. Worth doing before anyone plays island competitive in anger.
- **`shared/SpawnLogic.js` hardcodes Home Field spawn-cluster coordinates on every scene** (`+-50` / `+-40` / `+-30`). Fairness holds by symmetry and timed mode does not use the path, so it is not urgent - but the competitive layout is scene-aware now and the spawn is not.
- **The client's competitive `passageZone` is half the server's depth** and is not rotated for east/west gates. Pre-existing, self-correcting because the DO is authoritative, and pinned by a spec **as it stands** so a future fix trips it and reads the migration story first.
- **Grass no longer takes the sun's warmth at golden hour.** A deliberate trade: warmth was a nice-to-have, an exactly-unchanged noon was a hard stop. Reopening it means finding a formulation that keeps the noon identity.
- Home Field's farmhouse yard is an 80x80 m axis-aligned rect and wants a radial falloff. Rolling Hills still has no gate approach fan.
- **Newsheepdogland is still entrance-gated** (D19) pending its regression burn-down, `docs/nsl-burndown.md`. The public SEO surface still sells it and Survival as live.

## Habits this program earned, worth keeping

- **Run a read-only de-risking pass over a plan before executing it.** Seven for seven. It refuted a central mechanism outright twice, and in Cycle 122 it corrected the plan's stated symptom into a different and worse defect.
- **A browser probe will refuse to agree with arithmetic that looks right.** Two complete grass-lighting formulations passed unit tests and died against the live build.
- **Prefer deriving from something the code already computes over normalising against a constant you chose.** That is what finally made noon an identity rather than an approximation.
- **Headless Chromium has no `navigator.gpu`.** Any probe claiming to measure production must launch headed Chrome and assert WebGPU engaged. This bit twice more in Cycle 123, once in a probe and once in the perf harness, which had been measuring the WebGL twin all along.
- **Check what a measurement is capable of resolving before trusting a null result.** A frame time of exactly 1000/refresh in both arms is a vsync reading, not a finding.
- **SSIM is corroboration, not proof, for a uniform brightness change.**

## Reference

| What | Where |
|---|---|
| Cycle 124 stub, needs authoring | [`docs/cycle-124-plan.md`](docs/cycle-124-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Decisions D1-D36 | [`DECISIONS.md`](DECISIONS.md) |
| Program shape, now complete | [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) |
| Grass lighting authority | [`js/world/grassLighting.js`](js/world/grassLighting.js) |
| Scene lighting authority | [`js/world/sceneLightingRig.js`](js/world/sceneLightingRig.js) |
| Shared ground shape | [`js/world/groundShading.js`](js/world/groundShading.js) |
| Competitive layout | [`shared/CompetitiveLayout.js`](shared/CompetitiveLayout.js) |
| Golden harness | `npm run validation:screenshots -- --diff`, then `--baseline` (needs a dev server on :3000) |
| Frame time, genuine WebGPU | `node tools/validation/frame-time-histogram.mjs --webgpu --novsync --scene=field --sheepCount=5000` |
| Grass light probe | `node tools/validation/grass-light-ratio.mjs --webgpu` |
| Home Field evening probe | `node tools/validation/home-field-evening.mjs` |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
