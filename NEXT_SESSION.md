# Next Session - Cycle 116, gate-legibility

> **Updated:** 2026-07-25
> **For:** Cycle 116
> **Pickup priority:** Look at the game before writing more of it. Two cycles of visual work have shipped unviewed and the goldens have not been re-baselined for either.

## Current State

Cycles 114 (`grounding-pass`) and 115 (`fence-and-homestead`) both closed 2026-07-25. Plans archived in [`docs/archive/cycles/`](docs/archive/cycles/); close entries with full detail sit at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md).

Grass thins toward the pen and the farmhouse yard instead of stopping at a knife edge, and reads the same low-frequency ground field the terrain has used since Cycle 91. Fence posts lean and vary. The fence has an authoring source for the first time and weathers toward the ground with sag on long runs. The farmhouse has three materials. The dog darkens the ground under it. Every gate can open. The pen gate has a worn approach. The homestead lantern lights at dusk.

## Read this first

**Nobody has looked at any of it.** Every visual acceptance line across both cycles was verified by unit test, analytic bound, or reading the shader. That is carryover item 1 on both close entries and it is now the pickup priority. Cycle 115's Phase 6 was the phase that would have done it and it did not run.

Concretely, before new work: boot Home Field, look at the pen, the fence, the farmhouse and the dog's shadow; then run `npm run validation:screenshots -- --diff`, read the numbers, and re-baseline only once the delta is confined to what actually changed. Per [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md), close every Playwright page, context and browser afterwards, stop any dev listener, and set `SDS_SUPPRESS_BROWSER_OPEN=1`.

## Cycle 116 shape

[`docs/cycle-116-plan.md`](docs/cycle-116-plan.md) is authored and reconned. It is **shared-free**: the cue reads gate position and sheep positions, both already client-side.

The finding that shapes the whole cycle: **nothing in it can be a light.** There is no `PointLight`, `SpotLight`, `RectAreaLight` or `LightProbe` anywhere in the repo, and the reason not to add one is sharper than it first appeared. On WebGL the node materials are self-lit and would ignore it; on WebGPU, terrain and meadow quads are `MeshLambertNodeMaterial` and sheep and tree leaves are `MeshStandardNodeMaterial`, all genuinely lit. So a new light would be visible on one render path and not the other. Cycle 115's [`js/atmosphere/duskLamp.js`](js/atmosphere/duskLamp.js) is the worked example to follow.

Two more that save a day each: `CorralCompass` already is the off-screen half of state 1, mounted unconditionally with a four-way target chain covering all four scenes. And `FencePresets.addThresholdEffect` already builds the ground threshold D13 describes, but is dead code because `createGateStructure` returns early with the authored GLB before reaching it. State 2 is a resurrection, not a build.

## Carryover, in priority order

1. **The browser probe, for both cycles.** See above.
2. **Goldens un-rebaselined across two cycles.** Home Field's cells moved twice.
3. **The live seam gate is red on Open Country** (0.1766 against a 0.0529 budget) and has not been re-run on a committed tree. Cycle 114 Phase 6 has a plausible mechanism: deleting the terrain's own fog blend means the far band shows more of its own colour. The phase bounded that at `k/4`, far too small to explain the number, so either the bound is wrong or something else is.
4. **The bundle is +19.7 kB (+3.0%) across two cycles**, with the ratchet bumped twice (`mainKB` 644 to 664). Both bumps are authorized and measured in their plans' Frozen files sections, and both were written after the change rather than before, which a reviewer rightly called out twice. **A third bump is a bundle cycle, not a bump.**
5. **The gate approach reaches only the terrain shaders**, so grass over the worn strip stays green. Same class of disagreement Cycle 114 Phase 2 fixed for the ground field.
6. **Competitive layouts get one approach for up to four gates.**
7. **The WebGPU clump hue varies per fragment**, not per clump, unlike both WebGL paths.
8. **Two lighting-rig bugs, both real and both out of scope:** the production WebGPU `AmbientLight` is constructed and never added to the scene, and the production `DirectionalLight` never tracks time of day.
9. **The hero review is still Matt's**, inherited from 112.
10. **The name field has no new home** since D6 took it off the entrance.

## What is waiting after 116

- **Cycle 117 `island-pasture`** is reconned and drafted, with **two hard stops** recorded in full. D12's premise about the Rolling Hills leaderboard is contradicted by the repo's own record, and there is no sim mechanism that keeps sheep inside a free-standing pasture rect on an island. Read both before planning it. **Delete nothing from any leaderboard.**
- **Cycle 118 `water-rewrite`** is reconned and drafted, independent of 113 to 117.

## Autonomy Rules

- Do not add the repo's first real light without measuring it, and know it will land on one render path only.
- Do not re-author the farmhouse. Its checkpoint fired in Cycle 105 and resolved to external.
- Do not reset any leaderboard. Cycle 117 owns it and its premise needs re-verifying first.
- Keep `shared/`, sim-baseline goldens and frozen process files untouched unless the active plan authorizes it **before** the change, with a migration story.
- Do not store API keys in repo files, docs, memory notes, screenshots or launch packets.
- Do not publish paid, irreversible or public marketplace submissions without explicit approval.
- Do not bump the version. D20 says roll continuously.

## Reference Table

| Topic | Source |
|---|---|
| Active cycle plan | [`docs/cycle-116-plan.md`](docs/cycle-116-plan.md) |
| Portable agent rules | [`AGENTS.md`](AGENTS.md) |
| The seven-cycle program | [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) |
| Locked decisions | [`DECISIONS.md`](DECISIONS.md) |
| Ground shading authority | [`js/world/groundShading.js`](js/world/groundShading.js) |
| Fence wear authority | [`js/world/fenceWear.js`](js/world/fenceWear.js) |
| Gate leaf controller | [`js/world/gateLeafController.js`](js/world/gateLeafController.js) |
| Emissive-at-dusk example | [`js/atmosphere/duskLamp.js`](js/atmosphere/duskLamp.js) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Closed cycles + deferred | [`docs/BACKLOG.md`](docs/BACKLOG.md) |

## Stop Conditions

Stop and surface before continuing if the cue needs a `shared/` change (the plan says it does not, so needing one means the design went wrong), if a state needs sim data the client does not hold, if `main-*.js` grows again, if a deploy target is red, or if any frozen-file edit is needed without authorization already written into the active plan.
