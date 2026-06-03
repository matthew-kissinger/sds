# Next Session - Cycle 51

> **Updated:** 2026-06-03
> **For:** Cycle 51 (`frontend-loading-and-assets-redesign`)
> **Pickup priority:** Review the ten frontend mockups at `/mockups` and the scene-angle shots, pick a winning direction plus the matched-shot angle and dog treatment (P5), then wire the winner, swap in the new captured backdrops (no old images), and remove the old shell (P6-P8).

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-51-plan.md`](docs/cycle-51-plan.md) (authored, with the converged decisions, the Progress section, and the P1-P8 phases). The work is on branch **`cycle-51-mockups`** (unpushed; the live game on `main` is untouched).

## Where it stands

The brainstorm converged and the plan is authored. P1-P4 shipped; P5 (Matt's pick) is the gate.

- **Ten mockups live on `/mockups`** (commit `301a03e`). Each is an interactive entrance-and-flow prototype over a shared headless shell: world-first IA (arm a world, set difficulty, swap the persistent dog, Play, real-stage loading bar, in-game HUD), responsive PC and mobile. The ten: Golden Pasture, Storybook, Living Diorama, Wide-Open, Launcher, Biome Cards, Zen Type, Warm Cinematic, Mode-First, One-Tap Hero. 903 tests pass, build clean, main-bundle ratchet holds (separate chunk). Run `npm run dev:client`, open `http://localhost:3000/mockups.html`.
- **Scene-art harness built** (local, gitignored under `cycle51-validation/`). `frame.mjs` poses the dog upright and sweeps camera techniques per world in real WebGPU; `assemble.mjs` builds per-technique matched series across the three worlds; `angles.html` slow-crossfades a scene's angles in the browser (the fast-loading animated-backdrop technique: crossfading pre-rendered WebPs, no GIF, no video). These produce the new world backdrops.
- **Render fix shipped (commit `98be647`).** The Cycle 23 meadow-quad far-grass LOD was disabled by tier config; it only fired on Open Country, where its flat carpets sat inside the playable island and read as a checkerboard at the shore. The whole field now uses instanced grass. Render-only, 903 tests pass. (Earlier conform attempt: `e9b5f6e`.)

## Decisions to honor (Matt, 2026-06-03)

- **New captures only, no old images.** The new frontend's world backdrops are fresh WebGPU scene renders (the matched-series shots). The old OG cards (`assets/marketing/og/og-*.webp`) and any other legacy imagery are NOT reused; every backdrop is a new capture.
- **Pixel Forge is greenlit** for generating any game assets we want (icons, sprites, textures). It is a full repo at `C:\Users\Mattm\X\games-3d\pixel-forge` (`../pixel-forge`). External-AI image generation is in-bounds this cycle.
- **The bake-off enforces a rewrite.** Picking a winner promotes new code; the old shell (the 13-screen `App.js` flow, `ZenAttract`, both skeleton loaders, dead `assets/icons/*`) gets deleted in P7. Net-negative diff.

## Cycle 50 carryover (closed 2026-06-01)

Cycle 50 (`object-impostor-plumbing`) shipped 4/4 phases (see [`docs/BACKLOG.md`](docs/BACKLOG.md)). Two items deferred at close:

- The full Kiln re-bake byte-identity is unverified-by-execution; the CI determinism golden is green. Run `npm run bake-tree-impostors` and confirm the latlon atlases re-bake byte-identical.
- The committed octahedral atlas was baked from the runtime `tree1.glb` (3783 tris), not the manifest `_originals` source (5880 tris), so an octahedral re-bake will not reproduce it. Reconcile the source or accept a new octahedral bake.

## Program threads in flight

- **Frontend redesign (active, Cycle 51).** The Pastoral UI/UX program (Cycle 49 vision/spec) feeds this; the bake-off evolved the entrance direction toward new WebGPU scene-render backdrops (static or the animated WebP cycle).
- **Object-driven impostor program.** Cycle 50 (plumbing) shipped. Cycle B (per-instance variation + rocks/structures) remains a candidate future cycle: [`docs/object-impostor-cycle-plan.md`](docs/object-impostor-cycle-plan.md).
- **Security / perf / coverage audit roadmap.** A 14-phase Cycles 51+ program in [`docs/audit-roadmap-2026-05.md`](docs/audit-roadmap-2026-05.md), not yet scheduled.

## Release reference (Cycle 42 / v2.1.10)

Commit `fb78851`, tag `v2.1.10`, deploy run `26595530924`. Cycles 43 through 50 shipped no version bump, so v2.1.10 is still the current release. Do not bump the version unless Matt calls a release.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-51-plan.md`](docs/cycle-51-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-50-plan.md`](docs/archive/cycles/cycle-50-plan.md) |
| Pastoral UI program | [`docs/ui-design-language.md`](docs/ui-design-language.md), [`docs/entrance-loading-spec.md`](docs/entrance-loading-spec.md), [`docs/ui-migration-map.md`](docs/ui-migration-map.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
