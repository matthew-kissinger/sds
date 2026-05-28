# Next Session - Cycle 45 Scaffolding

> **Updated:** 2026-05-28
> **For:** Cycle 45
> **Pickup priority:** Fill in the [`docs/cycle-45-plan.md`](docs/cycle-45-plan.md) Goal paragraph and EARS phases for the paired-track work (C WebGPU painterly/taste parity, D mobile/real-device proofs, E multiplayer playtest), then run `/cycle-start`. This is a paired cycle: it needs Matt's eyes, a real device, or credentials, so phases scope as paired, not autonomous.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-45-plan.md`](docs/cycle-45-plan.md). Closed-cycle context is in [`docs/archive/cycles/cycle-44-plan.md`](docs/archive/cycles/cycle-44-plan.md), [`docs/archive/cycles/cycle-43-plan.md`](docs/archive/cycles/cycle-43-plan.md), and [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Current State

Cycle 44 closed: an autonomous hygiene + cleanup sweep shipped 4/4 phases with no user-visible change (commits `1128f19`, `65b50bb`, `3874dd5`, `e6b3685`; deploy run `26604025545` green on `main`). It resolved the `uuid` Dependabot advisory via an npm `overrides` pin, split a `vendor` chunk to pull `main` from 607 to 533 KiB (under the re-baselined 534 ratchet), deduped the polygon-spawn helpers onto `js/gamestate/polygonSpawn.js`, and documented the four Cycle 5 primitives (`Random`, `SceneObstacles`, `Boundary`, `AnimeWater`) in ARCHITECTURE.md. WebGPU remains the proven production default shipped as `v2.1.10` in Cycle 42.

Cycle 45 is scaffolded as the paired-track cycle, not a ready single cycle. It carries the paired buckets deferred from Cycle 44. It needs a Goal paragraph and EARS phases before `/cycle-start`.

## Cycle 45 candidate scope (paired-track; fill in at plan authoring)

Carried over from Cycle 44. All three buckets are paired: they need Matt's taste, a real device, or credentials.

- **C. WebGPU painterly parity (paired, taste).** The six low-sun actor / Open Country material-lock manual-review items from `npm run validation:cycle42-material-lock`; broader WebGPU/WebGL terrain-foliage parity (Cycle 41 carryover).
- **D. Mobile / real-device proofs (paired, blocked locally).** Android WebGPU water/device proof (needs an authorized ADB device or the Hub's ADB path); BrowserStack iOS Safari water canary (needs `BROWSERSTACK_*` / `BS_*` creds wired into the local env).
- **E. Multiplayer playtest (paired).** Open Country paired two-client playtest, deferred since Cycle 40 (needs two clients and Matt's eyes).

The standing long-tail of deferred items is in [`docs/BACKLOG.md`](docs/BACKLOG.md) under "Deferred / not blocking" - pull from there if a chosen theme has room.

## Release reference (Cycle 42 / v2.1.10)

- Commit `fb78851`, tag `v2.1.10`, deploy run `26595530924` (success on `main`). Cycles 43 and 44 shipped no version bump, so v2.1.10 is still the current release.
- Live HTML at sheepdogsim.com serves the current `assets/main-*.js`; the direct asset URL returns HTTP 200.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-45-plan.md`](docs/cycle-45-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-44-plan.md`](docs/archive/cycles/cycle-44-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
