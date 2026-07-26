# Next Session - the front door program is complete

> **Updated:** 2026-07-26
> **For:** Cycle 123 close, then whatever comes next
> **Pickup priority:** Finish Cycle 123's close ritual. The code is shipped and pushed (`e4b832a0`); what is left is the ceremony - archive the plan, prepend BACKLOG, rewrite this file for whatever comes next. Confirm the `e4b832a0` deploy went green first.

## Current State

**Cycles 112 through 123 are all shipped.** Seven of them (117, 118, 119, 120, 121, 122, 123) landed in a single session on 2026-07-26. The front door program that came out of the 2026-07-24 alignment is done.

**121 and 122 are formally closed** - plans archived under [`docs/archive/cycles/`](docs/archive/cycles/), entries at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md).

**123 is committed, pushed and documented, but its close ritual has not run.** [`docs/cycle-123-plan.md`](docs/cycle-123-plan.md) is still in place with every phase record written and every acceptance line ticked bar one. To close it: archive the plan, prepend a BACKLOG entry, rewrite this file.

## What landed at the end

- **Cycle 122, N pastures.** Island competitive stopped borrowing Home Field's geometry. Two stacked hardcodes, not one: the layout tables, and a `bounds` default that made every island round happen inside a 200 m square (39% of Rolling Hills, 8.8% of Open Country). Home Field came back bit-identical and `competitive.json` never moved.
- **Cycle 123, grass reads the light.** Grass takes the scene's daylight, derived from a quantity the rig already computes so noon is an identity by construction. **D25 is closed**: Home Field has an hour-long day and Cycle 115's dusk lamp fires for the first time.

## The one acceptance line left open

**The per-blade frame cost of the grass lighting term is not measured.** It is one `vec3` multiply on a value the shader already computes, with no new fetch and no branch, so the analytic cost is trivial - but analytic is not measured, and this cycle was corrected twice by a probe that disagreed with the arithmetic. It went to carryover rather than being ticked on reasoning. `npm run validation:perf`; Solo Chaos on Home Field is the case that matters.

## Carryover, in rough priority order

- **The golden matrix has no Newsheepdogland cell and no close-range cell.** Cycle 121 changed three ground surfaces and Cycle 123 changed every grass field, and the standing gate covers six wide classic cells on three scenes. `tools/validation/worn-ground-probe.mjs` and `tools/validation/grass-light-ratio.mjs` are the framings that do cover them.
- **The baked entrance heroes are permanently noon.** The entrance renders a hero PNG, not the live scene, which is why Home Field's new evening does not touch it. An evening hero is now a legitimate thing to want and it is a paired capture session in Matt's voice, not an autonomous change.
- **Rolling Hills' pasture reads as a black hole** (Cycle 121's finding). The worn-ground zone is correct there; it is the island terrain albedo floor, which is its own entry. Worth re-looking now that grass lighting has landed.
- **`shared/SpawnLogic.js` hardcodes Home Field spawn-cluster coordinates on every scene** (`+-50` / `+-40` / `+-30`). Fairness is preserved by symmetry and timed mode does not use the path, so it is not urgent, but the layout is scene-aware now and the spawn is not.
- **The client's competitive `passageZone` is half the server's depth** and is not rotated for east/west gates. Pre-existing, self-corrects because the DO is authoritative, pinned by a spec **as it stands** so a future fix trips it and reads the migration story first.
- Home Field's farmhouse yard is an 80x80 m axis-aligned rect and wants a radial falloff. Rolling Hills still has no gate approach fan.

## Habits this program earned, worth keeping

- **Run a read-only de-risking pass over a plan before executing it.** Six for six, it changed the shape of the work - twice by refuting the plan's central mechanism outright.
- **A browser probe will refuse to agree with arithmetic that looks right.** Two complete grass-lighting formulations passed unit tests and died against the live build.
- **Headless Chromium has no `navigator.gpu`.** Any probe claiming to measure production must launch headed Chrome and assert WebGPU is engaged, or it is measuring the WebGL twin.
- **SSIM is corroboration, not proof, for a uniform brightness change.** Prove a multiplier with a measured multiplier; use goldens for the noon-versus-night split.
- **Decide what a baseline is evidence of before touching it.**

## Reference

| What | Where |
|---|---|
| Cycle 123 plan, awaiting archive | [`docs/cycle-123-plan.md`](docs/cycle-123-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Decisions D1-D36 | [`DECISIONS.md`](DECISIONS.md) |
| Program shape | [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) |
| Grass lighting authority | [`js/world/grassLighting.js`](js/world/grassLighting.js) |
| Scene lighting authority | [`js/world/sceneLightingRig.js`](js/world/sceneLightingRig.js) |
| Shared ground shape | [`js/world/groundShading.js`](js/world/groundShading.js) |
| Competitive layout | [`shared/CompetitiveLayout.js`](shared/CompetitiveLayout.js) |
| Golden harness | `npm run validation:screenshots -- --diff`, then `--baseline` (needs a dev server on :3000) |
| Grass light probe | `node tools/validation/grass-light-ratio.mjs --webgpu` |
| Home Field evening probe | `node tools/validation/home-field-evening.mjs` |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
