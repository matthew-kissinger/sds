# Next Session - Cycle 46

> **Updated:** 2026-05-29
> **For:** Cycle 46
> **Pickup priority:** Cycle 46 (`entrance-zen-boids-and-cleanup`) is pre-authored and approved. Start with Phase 1 (zen attract scene as first paint) after resolving Q1 (zen aesthetic) with Matt's eye; Phase 4 (dead-CSS and stale-comment cleanup) is parallel-safe and can run alongside. Run `/cycle-start` to orient before writing code.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-46-plan.md`](docs/cycle-46-plan.md). The research the plan is authored from is in [`cycle45-validation/entrance-ui-spike.md`](cycle45-validation/entrance-ui-spike.md). Closed-cycle context is in [`docs/archive/cycles/cycle-45-plan.md`](docs/archive/cycles/cycle-45-plan.md) and [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Current State

Cycle 45 (`entry-load-and-grass-feel`) closed 2026-05-29: shipped 2/5 phases. Phase 1 instrumented per-stage scene-load timing and found the load hog was synchronous main-thread tree placement, not WebGPU init. Phase 3 baked that placement to a build-time manifest, dropping warm Field swap from 1904 ms to 430 ms (placement is render-only, so the sim stayed untouched). Phase 2 (scene-select gate) was superseded by Cycle 46's richer zen-boids entrance; Phase 4 (grass body-deform) and Phase 5 (polish) carried forward (see below). The Cycle 45 implementation and its close bookkeeping landed together on `main` at close. v2.1.10 still stands; no version bump.

Cycle 46 is **pre-authored** from the entrance/UI spike and approved as the first half of an entrance + UI split: Cycle 46 = entrance + cleanup, Cycle 47 = UI foundation overhaul (TSX, design tokens, component library, Motion). Cycle 47 is intentionally not scaffolded yet. The full Cycle 46 plan with EARS acceptance is in [`docs/cycle-46-plan.md`](docs/cycle-46-plan.md).

## Cycle 46 phases

- **Phase 1 - Zen attract scene as first paint (autonomous build, paired taste).** Add a TSL WebGPU compute-boids field over a gradient sky as first paint; rewire boot so the default scene's `buildSceneBody` does not run at startup. Resolve Q1 (zen aesthetic) with Matt before locking the look. Capture first-paint timing in `cycle46-validation/entrance-timing.md`.
- **Phase 2 - Pick-then-stream + in-engine crossfade (autonomous).** Build the picked scene into a detached graph while the zen field keeps rendering; prefetch likely-next assets during the zen idle; crossfade in-engine with a fullscreen `uAlpha` blend. No View Transitions API (it freezes the live canvas).
- **Phase 3 - Deep-link + multiplayer fallback (autonomous).** `?scene=` streams directly and skips the zen field; preserve the MP hard-reload fallback; add a guard spec.
- **Phase 4 - Dead-code and drift cleanup (autonomous, parallel-safe).** Verify-then-delete three dead CSS files (`css/production.css`, `css/multiplayer-react.css`, `css/components/index-styles.css`; 632 lines / ~58 KiB, only `css/main.css` is live). Fix the stale "Step 1 scaffolding" swap comments in `js/main.js` and `js/App.js`.
- **Phase 5 - Polish (optional).** Absorbs Cycle 45's deferred polish: scene preview affordance, load-overlay progress affordance, combined scene + mode gate.

Dependency: Phase 1 -> Phase 2 -> Phase 3 -> Phase 5 (optional). Phase 4 runs parallel to 1-3.

## Open questions to resolve before P1 locks

Five are listed in the plan. The one that gates Phase 1 is **Q1 (zen-field aesthetic)** - boids over a neutral gradient sky and light fog with gentle open drift is the author lean, but the look is a paired taste call. Q2-Q5 (picker placement, deep-link behavior, boid budget, whether any `SceneDef` metadata is needed) have author leans in the plan and can be confirmed inline.

## Carryover owed from Cycle 45

- **Grass body-deform (Cycle 45 Phase 4, paired).** Not part of Cycle 46. Carry the bend down the full blade and push along the body-oval normal in `js/world/konveyorGrassBladeNodeMaterial.js`; validate via `window.__sdsGrassProof`. Needs Matt's taste check and a headed browser (the preview tab runs hidden, so WebGPU does not composite and screenshots time out).
- **Phase 3 treeline taste review.** Matt can load `/?scene=field` to eyeball the baked treeline (429.949 m) against the old procedural look.

## Release reference (Cycle 42 / v2.1.10)

- Commit `fb78851`, tag `v2.1.10`, deploy run `26595530924` (success on `main`). Cycles 43, 44, and 45 shipped no version bump, so v2.1.10 is still the current release. Do not bump the version this cycle unless Matt calls a release.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-46-plan.md`](docs/cycle-46-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-45-plan.md`](docs/archive/cycles/cycle-45-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Entrance/UI research spike | [`cycle45-validation/entrance-ui-spike.md`](cycle45-validation/entrance-ui-spike.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
