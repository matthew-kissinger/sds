# Next Session - Cycle 49

> **Updated:** 2026-05-29
> **For:** Cycle 49
> **Pickup priority:** Cycle 49 (`pastoral-vision`) is authored ([`docs/cycle-49-plan.md`](docs/cycle-49-plan.md)): the first cycle of the Matt-approved Pastoral UI/UX rework program (Cycles 49-52). It is a vision/spec cycle with zero behavior change to the running game. Six phases: design-language doc (P1), v2 pastoral token palette additive in `@theme` + `tokens.ts` (P2), a standalone `/gallery` route that renders the UI without booting the WebGPU game (P3, the headless-validation keystone), a pastoral preview of the six primitives in the gallery (P4), the entrance + loading concept spec with static mockups (P5), and a container migration map sequencing the 13 stateful containers for Cycles 51-52 (P6). Run `/cycle-start` to begin. Several phases are taste-paired and ship a draft for review on the deployed `/gallery`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-49-plan.md`](docs/cycle-49-plan.md). The program this cycle opens reworks the front end from first principles: an instant lightweight menu (no heavy 3D at entry), the 3D world built only when a scene is chosen, a calm-pastoral / painterly visual language, and a cohesive design system replacing the two stacked styling eras. The entrance + UI history it builds on is Cycles 46-48 ([`docs/archive/cycles/`](docs/archive/cycles/)); the research the program draws from is the entrance/UI spike at [`cycle45-validation/entrance-ui-spike.md`](cycle45-validation/entrance-ui-spike.md). Closed-cycle context is in [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Current State

Cycle 48 (`ui-conversion-sweep`) closed 2026-05-29: shipped 5/6 phases. It swept the Cycle 47 leaf-first TSX conversion across the leaf-tier createElement components (HUD readouts, StartScreen menu screens, Multiplayer screens, `ui` leftovers), retired the named inline hex (App.js's 7 literals and `MenuOption`'s `DEFAULT_ACCENT`), and moved the ScenePicker scene-card slide onto Motion. P6 (picker affordances) was optional/paired and deferred whole. The big stateful containers (App.js body, PauseMenu, CompletionScreen, SettingsPanel, SandboxSetup, the editors, MobileHUD, MobileControls, ExtremeTuningPanel, Lobby, RoomCreation) stay on the createElement path; they are the restyle-and-convert target for Cycles 51-52. No version bump; v2.1.10 stands. Validation at close: `npm test` 594 passed / 7 skipped, `npm run build` clean, last `main` deploy green.

Cycle 49 (`pastoral-vision`) opens the new program and is authored. It is render/UI/doc-only: no `shared/` edits, no sim-baseline regeneration, no `SceneDef` change, no Worker change, no version bump. Run `/cycle-start` to begin Phase 1.

## The program arc (Cycles 49-52)

- **Cycle 49 (this one) - pastoral-vision.** Define the design language and ship reviewable artifacts (design-language doc, v2 palette, `/gallery`, entrance/loading spec, migration map). No in-game change.
- **Cycle 50 - entrance + loading.** Flip the boot gate so a plain open mounts the instant pastoral menu (not `buildSceneBody`, not `ZenAttract`). Build the level only on scene commit; idle-prefetch the likely scene; rework `SceneSwapOverlay` into the pastoral loading experience (in-engine crossfade preserved; deep-link + MP fallback preserved).
- **Cycle 51 - containers batch 1.** Restyle-and-convert the StartScreen/setup containers (SettingsPanel, SandboxSetup, LocalModeSetup, FenceEditor, ShapeEditor) plus Lobby + RoomCreation to pastoral TSX.
- **Cycle 52 - containers batch 2 + polish.** Restyle-and-convert the in-game HUD/overlay containers (MobileHUD, MobileControls, PauseMenu, CompletionScreen, ExtremeTuningPanel), then program-wide polish + dead-CSS / drift cleanup.

## Carryover into the program

- **Cycle 48 P6 picker affordances** (scene-preview, load-overlay stream-progress, combined scene-plus-mode gate) fold into the program; entrance and loading land in Cycle 50.
- **Cycle 46 post-deploy visual checks** (zen-field aesthetic, crossfade feel, deep-link + MP smoke) are superseded by the program's entrance rework; the instant-menu entrance replaces the zen field as default in Cycle 50.
- **Grass body-deform visual taste check (from Cycle 45)** still open (same headless-WebGPU block); Matt pre-accepted the look.

## Release reference (Cycle 42 / v2.1.10)

- Commit `fb78851`, tag `v2.1.10`, deploy run `26595530924` (success on `main`). Cycles 43 through 48 shipped no version bump, so v2.1.10 is still the current release. Do not bump the version unless Matt calls a release.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-49-plan.md`](docs/cycle-49-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-48-plan.md`](docs/archive/cycles/cycle-48-plan.md) |
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
