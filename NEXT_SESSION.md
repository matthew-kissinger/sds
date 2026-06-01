# Next Session - Cycle 51

> **Updated:** 2026-06-01
> **For:** Cycle 51
> **Pickup priority:** Cycle 51 (`frontend-loading-and-assets-redesign`) opens with an **alignment check-in and a first-principles brainstorm, before any code.** The plan ([`docs/cycle-51-plan.md`](docs/cycle-51-plan.md)) has the Goal and Open Questions seeded from Matt's brief; the Phases are intentionally unauthored. This is a "step back and rethink the whole frontend shell" cycle: the stack, the component structure and instantiation, the loading sequence, the entrance, the scene-switch backdrop, the style and icon system, and non-scene art. Do not start phases. Run the brainstorm (Q1-Q6), converge, author the plan, then `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-51-plan.md`](docs/cycle-51-plan.md). The brainstorm inputs are the Pastoral UI program docs ([`docs/ui-design-language.md`](docs/ui-design-language.md), [`docs/entrance-loading-spec.md`](docs/entrance-loading-spec.md), [`docs/ui-migration-map.md`](docs/ui-migration-map.md)) and the standalone `/gallery` headless review route.

## The redesign brief (Matt, 2026-06-01)

First-principles, not incremental. Specific pain points to resolve:

- **Vestigial skeleton loader** on Play (an artifact from an old sequence where skeleton loading made sense; it does not fit the current flow).
- **Degraded zen entrance** - we used to load the full selected scene at entrance; we stopped because scene + assets are heavier and slower now (larger files). Decide the entrance model given asset weight.
- **Void scene-switch backdrop** - scene switching works, but the backdrop is a basic void that serves no purpose.
- **Style drift and ugly icons** - establish a coherent style and icon system.
- **Frontend stack and structure** - open to reworking instantiation/implementation from first principles.
- **Non-scene art** - likely introduce new concepts and art.

The Pastoral UI/UX program (Cycle 49 vision/spec) already captured a lot of this; the brainstorm decides how much to adopt vs revisit from scratch.

## Cycle 50 carryover (closed 2026-06-01)

Cycle 50 (`object-impostor-plumbing`) shipped 4/4 phases (see [`docs/BACKLOG.md`](docs/BACKLOG.md)). Two items were deferred at close by explicit decision:

- The full Kiln re-bake byte-identity (hard-stop #1) is unverified-by-execution; the CI determinism golden is green. Run `npm run bake-tree-impostors` and confirm the latlon atlases re-bake byte-identical.
- The committed octahedral atlas was baked from the runtime `tree1.glb` (3783 tris), not the manifest `_originals` source (5880 tris), so an octahedral re-bake will not reproduce it. Reconcile the source or accept a new octahedral bake.

## Program threads in flight

- **Frontend redesign (active, Cycle 51).** The Pastoral UI/UX program (Cycle 49 vision/spec) feeds this; Cycle 51 may adopt or revisit it from first principles.
- **Object-driven impostor program.** Cycle 50 (Cycle A, plumbing) shipped. Cycle B (per-instance variation + rocks/structures) remains a candidate future cycle: [`docs/object-impostor-cycle-plan.md`](docs/object-impostor-cycle-plan.md).
- **Security / perf / coverage audit roadmap.** A 14-phase Cycles 51+ program in [`docs/audit-roadmap-2026-05.md`](docs/audit-roadmap-2026-05.md), not yet scheduled against a cycle.

## Release reference (Cycle 42 / v2.1.10)

- Commit `fb78851`, tag `v2.1.10`, deploy run `26595530924`. Cycles 43 through 50 shipped no version bump, so v2.1.10 is still the current release. Do not bump the version unless Matt calls a release.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-51-plan.md`](docs/cycle-51-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-50-plan.md`](docs/archive/cycles/cycle-50-plan.md) |
| Pastoral UI program | [`docs/ui-design-language.md`](docs/ui-design-language.md), [`docs/entrance-loading-spec.md`](docs/entrance-loading-spec.md), [`docs/ui-migration-map.md`](docs/ui-migration-map.md) |
| Impostor program (2-cycle) | [`docs/object-impostor-cycle-plan.md`](docs/object-impostor-cycle-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
