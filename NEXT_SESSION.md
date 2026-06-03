# Next Session - Cycle 51

> **Updated:** 2026-06-02
> **For:** Cycle 51 (`frontend-loading-and-assets-redesign`)
> **Pickup priority:** **P6 + P7 SHIPPED and verified; P8 PAUSED by Matt to settle scope.** The world-first Golden Pasture entrance + the real per-stage loading bar are wired into the live boot (`0d401f2`), and the old shell is removed (`b4bb362`, net -7700 lines). Resume by **getting Matt's scope call** on the open concerns he raised mid-P8 (old HUD/icons, the `nipplejs` joystick, unused Pixel Forge, loading optimization, the misplaced in-game `#site-footer`) - all documented in [`docs/cycle-51-plan.md`](docs/cycle-51-plan.md) under "Open concerns" with a close-now-vs-extend-P8 question. Then either close Cycle 51 or continue P8.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-51-plan.md`](docs/cycle-51-plan.md) (authored, with the converged decisions, the Progress section, and the P1-P8 phases). The work is on branch **`cycle-51-mockups`** (unpushed; the live game on `main` is untouched).

## Where it stands

P5 resolved; **P6 and P7 are shipped and verified; P8 is investigated but not started in code** (working tree clean after the P7 commit). The hero of the cycle - a coherent, intentional entrance + loading + scene-switch - is delivered. Full detail in [`docs/cycle-51-plan.md`](docs/cycle-51-plan.md) Progress + Open-concerns sections.

- **P6 shipped (`0d401f2`).** World-first Golden Pasture entrance in the real boot: instant entrance over the armed world's fresh `close-eye` backdrop (`assets/scenes/entrance/*.webp`), a **real per-stage loading bar** (the boot emits `scene-load-step` marks; `js/components/entrance/loadStages.ts` maps them to pastoral captions + a calibrated fraction - no fixed timer), scene-build-on-commit, a CSS crossfade reveal, deferred identity (no first-run name gate), and the destinations (settings/leaderboard/sandbox/2-player/multiplayer) reachable. Verified desktop + mobile (390x844), no console errors, 903 tests pass.
- **P7 shipped (`b4bb362`, net -7700 lines).** The bake-off `/mockups` route, ZenAttract, the 9 retired entrance leaves, both dead skeletons, the dead `assets/icons/*`, and 4 obsolete specs are all gone. main chunk 544 -> 541 KB. Boot re-verified working. 866 tests pass.
- **P8 not started (investigated only).** In-game HUD + icon restyle to the pastoral language, plus the `createElement` -> `.tsx` container migration. **Paused by Matt - see the Open concerns + scope question in the plan.** (The `/mockups` route was removed in P7, so the old "open `localhost:3000/mockups.html`" instruction no longer applies; run `npm run dev:client` and open `http://localhost:3000/` to see the live entrance.)

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
