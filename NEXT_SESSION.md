# Next Session - Cycle 47

> **Updated:** 2026-05-29
> **For:** Cycle 47
> **Pickup priority:** Cycle 47 (`ui-foundation-overhaul`) is scaffolded but not authored. Fill in Goal + Phases in [`docs/cycle-47-plan.md`](docs/cycle-47-plan.md) from the entrance/UI spike, then run `/cycle-start`. First, verify the Cycle 46 entrance post-deploy (see "Cycle 46 post-deploy verification" below).

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-47-plan.md`](docs/cycle-47-plan.md). The research Cycle 47 is authored from is in [`cycle45-validation/entrance-ui-spike.md`](cycle45-validation/entrance-ui-spike.md). Closed-cycle context is in [`docs/archive/cycles/cycle-46-plan.md`](docs/archive/cycles/cycle-46-plan.md) and [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Current State

Cycle 46 (`entrance-zen-boids-and-cleanup`) closed 2026-05-29: shipped 4/5 phases. The app now paints a zen attract field (a cheap drifting-dart field over a gradient sky) as first paint instead of building Rolling Hills behind the menu, with the scene picker live on top. Picking a scene prefetches assets during the field idle, holds the last field frame while the real scene builds, then dissolves the darts out in-engine (no DOM flash, no View Transitions API). Phase 4 deleted 632 lines / ~58 KiB of dead CSS and fixed the stale "Step 1 scaffolding" swap comments. Phase 5 (polish) was deferred whole to Cycle 47. The four phase commits were unpushed at close, so the close commit deploys the whole cycle together. v2.1.10 still stands; no version bump.

Cycle 47 is the second half of the approved entrance + UI split: the UI foundation overhaul (TSX, design tokens, component library, Motion). It is scaffolded from the template but not yet authored. The full research is in the entrance/UI spike (see Reference Table). Fill in the plan's Goal + Phases before running `/cycle-start`.

## Cycle 46 post-deploy verification (Matt-pickup, blocked headless)

These could not be verified locally because headless WebGPU does not composite (the preview tab runs `visibilityState: hidden`, so screenshots time out). Verify on the live site after the close deploy:

- **Q1 zen-field aesthetic.** The drifting-dart field over the gradient sky is a paired taste call. Sign off on the look, or note what to change.
- **Crossfade feel + speed.** Confirm the pick-to-scene hand-off reads as a smooth in-engine dissolve (no black frame, no pop-in) and feels faster than the old Cycle 45 swap. The prefetch win in [`cycle46-validation/entrance-timing.md`](cycle46-validation/entrance-timing.md) is a derived figure (about 61% of swap cost pre-paid) pending a live measurement.
- **Deep-link + MP smoke.** `?scene=rolling-hills` should build directly with no field; an `#/r/` room invite should still hard-reload into its locked scene.

## Cycle 46 deviations (documented, for context)

Both deviations were forced by the same constraint: the production WebGPU renderer is vendored separately (injected as material-factory globals) and is not headless-testable, so the lowest-risk renderer-agnostic mechanism won.

- **CPU-drift darts, not TSL GPU-compute boids.** A `three/tsl` import in a main-bundle module would pull a second copy of three and break the renderer or blow the bundle ratchet. The darts drift on the CPU over a standard MeshBasicMaterial that runs on both renderers.
- **Dart-dissolve, not a two-layer `uAlpha` render-to-texture blend.** A true two-layer blend needs render-to-texture, high-risk on the untestable production renderer. The dissolve is a real in-engine alpha crossfade using only `material.opacity` + render order.

## Carryover into Cycle 47

- **Phase 5 polish (deferred whole from Cycle 46).** Scene preview affordance, load-overlay progress affordance, combined scene + mode gate. All picker-overlay UI work that the UI foundation overhaul should absorb rather than ship shallow first.
- **Grass body-deform visual taste check (from Cycle 45).** `js/world/konveyorGrassBladeNodeMaterial.js` shipped post-Cycle-45-close on Matt's authorization; structurally validated, visual eyeball still open (same headless-WebGPU block). Matt pre-accepted the look.
- **Cycle 44 paired buckets C/D/E** (WebGPU painterly parity, mobile/real-device proofs, multiplayer playtest) stay under "Deferred / not blocking" for a later paired cycle.

## Release reference (Cycle 42 / v2.1.10)

- Commit `fb78851`, tag `v2.1.10`, deploy run `26595530924` (success on `main`). Cycles 43, 44, 45, and 46 shipped no version bump, so v2.1.10 is still the current release. Do not bump the version unless Matt calls a release.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-47-plan.md`](docs/cycle-47-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-46-plan.md`](docs/archive/cycles/cycle-46-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Entrance/UI research spike | [`cycle45-validation/entrance-ui-spike.md`](cycle45-validation/entrance-ui-spike.md) |
| Cycle 46 entrance timing | [`cycle46-validation/entrance-timing.md`](cycle46-validation/entrance-timing.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
