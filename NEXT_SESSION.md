# Next Session - Cycle 115, fence-and-homestead

> **Updated:** 2026-07-25
> **For:** Cycle 115
> **Pickup priority:** The Cycle 115 plan is authored against a reality check, not against the roadmap. Read "What the reality check changed" before touching anything, because most of the roadmap's asks already ship.

## Current State

Cycle 114 (`grounding-pass`) closed 2026-07-25. Seven phases green, one recorded as failed-honestly. Plan archived at [`docs/archive/cycles/cycle-114-plan.md`](docs/archive/cycles/cycle-114-plan.md); the close entry with full detail is at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md).

Grass now thins toward the pen and the farmhouse yard instead of stopping at a knife edge, and it reads the same low-frequency ground field the terrain has used since Cycle 91 rather than its own plaid. Fence posts lean and vary. The farmhouse has three materials instead of one. The dog darkens the ground under it, on grass and on bare earth alike. The WebGPU terrain stopped compositing a second fog over `scene.fog`.

**Nobody has looked at any of it.** Every visual acceptance line in 114 was verified by unit test, analytic bound, or reading the shader. See carryover 1.

## The most important thing to read first

[`docs/cycle-115-plan.md`](docs/cycle-115-plan.md)'s "What the reality check changed" table. A four-agent pass over the shipping build found that **three of the roadmap's five Cycle 115 bullets already ship**, and one of them (the farmhouse checkpoint) already fired and already resolved to external in Cycle 105. Building against the roadmap text would rebuild working assets and re-author a model Matt already approved.

What is actually missing is narrower: the fence kit has **no authoring source anywhere** (it exists only as an opaque binary GLB, so weathering, sag and chamfer cannot be touched without rebuilding it), Home Field's gate renders **frozen in its baked-open pose** because the leaf rig is trapped in a Newsheepdogland branch, and there is **no point or spot light anywhere in the repo**, so a dusk lamp cannot be a real light.

## Carryover from Cycle 114

1. **No browser probe was run, and it is the top of the list.** The grass falloff, the post lean, the three farmhouse materials and the dog's contact shadow are all unviewed. The golden re-baseline was deferred with it, since Phases 1, 2 and 5 all move ground colour. Run `npm run validation:screenshots -- --diff` and read the numbers before re-baselining, the way Cycle 112 did.
2. **Establishing the horizon-seam gate** needs a horizon-bearing before/after pair from a Follow or Free camera. `tools/validation/horizon-seam.mjs` is rewritten and good, but its own validation could not be established: three of the four Cycle 112 fixture pairs have no horizon in frame and do not encode a fog difference. That is a capture session, not a threshold.
3. **The per-material fog pattern is systemic.** Cycle 114 Phase 6 fixed one of seven. `js/atmosphere/skyFogSamplePacket.js` feeds a boot-frozen `fogColor` to grass blade, meadow quad, water, sheep wool, tree branch, tree leaf and kiln impostor, each compositing its own distance fog independently of `scene.fog`. Correct at boot, drifts only under a moving sun, so Newsheepdogland alone. Worth a cycle of its own. **Cycle 118 will fix the water one as part of the rewrite.**
4. **The bundle ratchet was bumped** (`mainKB` 644 to 654, `main` budget 645 to 655) under an authorization recorded in the Cycle 114 plan's Frozen files section. Main grew 10 KiB raw, 3.8 kB gzipped, from the generated GLSL that makes cross-path drift impossible. If that trade is wrong, revert the two numbers and the cycle fails its bundle gate honestly.
5. **`shared/TreePlacement.js` holds a sixth pen-rect variant** (`z > 100 && z < 135 && |x| < 35`), with a comment claiming it is "the exact rect of the single-player pasture", which it is not. Frozen, so Cycle 114 left it alone.
6. **The hero review is Matt's, and still open** (inherited from 112 and 113). Every measurable part of the D8 brief is met and gated by [`tools/validation/entrance-hero-clearance.mjs`](tools/validation/entrance-hero-clearance.mjs); the taste call has not been made.
7. **The name field has no new home.** D6 took it off the entrance and said it belongs at first score submission. That surface is unbuilt, so a player who never opens Settings submits as "Shepherd".
8. **Loading-to-live camera framing.** Needs a camera-pose handshake from the engine. A cycle of its own, not a phase.

## What is waiting after 115

- **Cycle 116 `gate-legibility`** is reconned and is **shared-free**: it can be built entirely as a client-side cue layer. It depends on Cycle 115 Phase 3 (the gate leaf controller). Note there is no `PointLight` or `SpotLight` in the repo and the node materials are self-lit from atmosphere uniforms, so the "lantern" and "warm rim light" must be shader or emissive effects, not lights. `FencePresets.addThresholdEffect` already exists and is dead code.
- **Cycle 117 `island-pasture`** is reconned and has **two hard stops**, both recorded in its task notes. D12's factual premise about the leaderboard looks contradicted by the repo's own record, and there is no sim mechanism that keeps sheep inside a free-standing pasture rect on an island. Read both before planning it.
- **Cycle 118 `water-rewrite`** is reconned and is independent of 113 to 117.

## Autonomy Rules

- Do not re-author the farmhouse. The D10 checkpoint already fired and resolved to external in Cycle 105.
- Do not change the fence silhouette. It would move every placement and invalidate the heroes.
- Do not add the repo's first real light without measuring it first.
- Do not reset any leaderboard. Cycle 117 owns it, and its premise needs re-verifying before anything is deleted.
- Keep `shared/`, sim-baseline goldens, and frozen process files untouched unless the plan explicitly authorizes it, with a migration story.
- Do not store API keys in repo files, docs, memory notes, screenshots, or launch packets.
- Do not publish paid, irreversible, or public marketplace submissions without explicit approval.
- Do not bump the version. D20 says roll continuously.

## Reference Table

| Topic | Source |
|---|---|
| Active cycle plan | [`docs/cycle-115-plan.md`](docs/cycle-115-plan.md) |
| Portable agent rules | [`AGENTS.md`](AGENTS.md) |
| The seven-cycle program | [`docs/front-door-roadmap.md`](docs/front-door-roadmap.md) |
| Locked decisions | [`DECISIONS.md`](DECISIONS.md) |
| UI pattern for new surfaces | [`css/entrance.css`](css/entrance.css) + [`tests/ui/entranceStylesheet.spec.ts`](tests/ui/entranceStylesheet.spec.ts) |
| Ground shading authority | [`js/world/groundShading.js`](js/world/groundShading.js) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Pickup contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
| Closed cycles + deferred | [`docs/BACKLOG.md`](docs/BACKLOG.md) |

## Stop Conditions

Stop and surface before continuing if the work would touch `shared/` or the wire protocol without an authorization and a migration story, if it would re-author the farmhouse or change the fence silhouette, if adding a real light regresses the mid tier, if a deploy target is red, or if any frozen-file edit is needed outside the active plan's authorization.
