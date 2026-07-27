# Next Session - Cycle 125 candidate (`procedural-farmhouse`)

> **Updated:** 2026-07-26
> **For:** Cycle 125 candidate
> **Pickup priority:** Align a dedicated procedural-house plan with Matt before editing runtime assets; do not treat the current Kiln farmhouse as accepted final art.

## Current state

Cycle 124 is closed and `v2.6.3` is the Play-start performance release line. Its archived plan is [`docs/archive/cycles/cycle-124-plan.md`](docs/archive/cycles/cycle-124-plan.md); the durable delivery record is at the top of [`docs/BACKLOG.md`](docs/BACKLOG.md).

Public production uses stable WebGL across Home Field, Rolling Hills, and Open Country. WebGPU is an explicit diagnostic only. Newsheepdogland remains a dev-gated lab rather than a public scene. CPU boids remain preferred at ordinary counts; 5,000 is a supported CPU stress tier, while the separate `sds-gpu-boids` repository owns future 5K/25K/100K single-player research outside deterministic Worker multiplayer.

## Candidate next cycle

The live `assets/models/Farm house.glb` was replaced in Cycle 105, but Matt's current visual verdict supersedes its old approval: it is too small, poorly built, and visibly holed. The intended result is an SDS-owned procedural house kit with a repeatable deterministic baker, analogous to the fence pipeline rather than another opaque generated GLB.

Before implementation, write a bounded Cycle 125 plan that measures the current model and defines:

- correct playable scale and scene placement for Home Field and the gated Newsheepdogland lab;
- watertight roof, wall, trim, door, window, porch, chimney, and lantern geometry;
- coherent authored proportions and a deliberate SDS pastoral design language;
- stable pivots, named parts, explicit collision and shadow proxies, and terrain grounding;
- deterministic byte-stable bake output plus triangle, material, texture, bundle, and load budgets;
- close and gameplay-distance visual acceptance, hole/backface inspection, browser proof, and rollback to the current asset.

Do not fold the deferred Rolling Hills pasture albedo, close-range golden coverage, or future GPGPU work into the house cycle without explicit alignment. Read [`AGENTS.md`](AGENTS.md), [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md), and [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) before editing.
