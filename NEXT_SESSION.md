# Next Session - Cycle 50

> **Updated:** 2026-06-01
> **For:** Cycle 50
> **Pickup priority:** Cycle 50 (`object-impostor-plumbing`) Phases 1-2 shipped on `main` (P1 `374c7a4` + `26e214f`, P2 `911e329`): the manifest drives the bake, each sidecar carries `objectId/category/variant/layoutId`, the baker has an `--augment-only` mode (re-stamp sidecars without a Kiln render), and a CI-portable determinism golden (`tests/objects-impostor-parity.spec.js` + `.hashes.json`) guards atlas drift plus sidecar re-stamp idempotency. tree1/tree2 atlases stay byte-identical (PNGs never touched). Pickup is **Phase 3** (runtime route: add `js/world/objectImpostorManifest.js` and make `js/world/TreePlacement.js` resolve the impostor base via `impostorAssetBase()` from the manifest instead of `tree1/tree2` string templates, degrade-not-crash on fetch failure) and **Phase 4** (octahedral made reproducible through the baker), which run in parallel since both depend only on Phase 2. The full Kiln re-bake byte-identity stays a cycle-close manual gate (hard-stop #1). The Pixel Forge Kiln bake tool is present at `../pixel-forge`. Run `/cycle-start` to re-orient, or pick up Phase 3 directly.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-50-plan.md`](docs/cycle-50-plan.md). The full 2-cycle impostor design (Cycle A here, Cycle B is the variation + new-object-types capability cycle) is in [`docs/object-impostor-cycle-plan.md`](docs/object-impostor-cycle-plan.md). The impostor architecture map and constraints live in [`.claude/rules/scene-and-render.md`](.claude/rules/scene-and-render.md) and [`DECISIONS.md`](DECISIONS.md) (far-tree impostors, octahedral lab-only, the polish-program offline-bake decision). Closed-cycle context is in [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Current State

Cycle 49 (`pastoral-vision`) closed 2026-05-29: shipped 6/6 phases. It opened the Pastoral UI/UX rework program with a vision/spec cycle (zero in-game change): the design-language doc, the v2 pastoral token palette, the standalone `/gallery` route (the headless review surface, live at sheepdogsim.com/gallery), the pastoral primitive preview, the entrance/loading spec + mockups, and the container migration map. The pastoral look is Matt's post-deploy visual call on `/gallery`. No version bump; v2.1.10 stands.

Cycle 50 (`object-impostor-plumbing`) is the active cycle, a render refactor inserted ahead of the UI program's remaining work (Matt's reprioritization). It makes the tree impostor pipeline object-driven (manifest-driven offline bake, generalized sidecar + runtime route, octahedral reproducible) while holding tree1/tree2 byte-identical. It is render/asset-only: no `shared/` edits, no sim-baseline regeneration, no SceneDef change, no Worker change, no version bump. Phases 1-2 shipped on `main`; pickup is Phase 3 (runtime route) and Phase 4 (octahedral), which run in parallel.

## Program threads in flight

- **Object-driven impostor program (active).** Cycle 50 = Cycle A (plumbing + parity, this cycle). Cycle B (per-instance variation + rocks/structures + polish) follows as a later cycle. Full design: [`docs/object-impostor-cycle-plan.md`](docs/object-impostor-cycle-plan.md).
- **Pastoral UI/UX program (paused, resumes after the impostor work).** Cycle 49 shipped the vision/spec. The remaining implementation cycles shift to Cycles 51+: the entrance/loading rework ([`docs/entrance-loading-spec.md`](docs/entrance-loading-spec.md)) and the container restyle batches ([`docs/ui-migration-map.md`](docs/ui-migration-map.md), the 13 stateful containers). The `/gallery` route is the durable headless review surface for that work.

## Release reference (Cycle 42 / v2.1.10)

- Commit `fb78851`, tag `v2.1.10`, deploy run `26595530924` (success on `main`). Cycles 43 through 49 shipped no version bump, so v2.1.10 is still the current release. Do not bump the version unless Matt calls a release.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-50-plan.md`](docs/cycle-50-plan.md) |
| Impostor program (2-cycle) | [`docs/object-impostor-cycle-plan.md`](docs/object-impostor-cycle-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-49-plan.md`](docs/archive/cycles/cycle-49-plan.md) |
| Paused UI program | [`docs/ui-migration-map.md`](docs/ui-migration-map.md), [`docs/entrance-loading-spec.md`](docs/entrance-loading-spec.md), [`docs/ui-design-language.md`](docs/ui-design-language.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
