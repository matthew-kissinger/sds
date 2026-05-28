# Next Session - Cycle 44 Scaffolding

> **Updated:** 2026-05-28
> **For:** Cycle 44
> **Pickup priority:** Triage the [`docs/cycle-44-plan.md`](docs/cycle-44-plan.md) candidate scope into one coherent goal and ≤ 8 phases (author lean: bundle the autonomous hygiene + cleanup buckets A/B/F as Cycle 44, split the paired C/D/E real-device and taste work into a separate paired-track cycle), then run `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-44-plan.md`](docs/cycle-44-plan.md). Closed-cycle context is in [`docs/archive/cycles/cycle-43-plan.md`](docs/archive/cycles/cycle-43-plan.md), [`docs/archive/cycles/cycle-42-plan.md`](docs/archive/cycles/cycle-42-plan.md), and [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Current State

Cycle 43 closed: the WebGPU boot-scout scaffolding is retired (commit `5e149ab`, deploy run `26597359915` green on `main`). No user-visible change. WebGPU remains the proven production default shipped as `v2.1.10` in Cycle 42.

Cycle 44 is scaffolded as a candidate-scope sweep, not a ready single cycle. The plan holds a triage list of loose ends carried across Cycles 40-43 plus found items. It needs a Goal paragraph and EARS phases before `/cycle-start`.

## Cycle 44 candidate scope (triage at /cycle-start)

Full detail with file links is in [`docs/cycle-44-plan.md`](docs/cycle-44-plan.md). Summary by theme and mode:

- **A. Dependency / security (autonomous).** Resolve the moderate Dependabot advisory `security/dependabot/25` (the `uuid` advisory, transitive through Google / BrowserStack tooling).
- **B. Build / bundle (autonomous).** Main bundle is creeping (~607 kB vs the 593 KiB ratchet accepted in Cycle 41); investigate code-splitting or re-baseline with a rationale.
- **C. WebGPU painterly parity (paired, taste).** The six low-sun actor / Open Country material-lock manual-review items; broader WebGPU/WebGL terrain-foliage parity.
- **D. Mobile / real-device proofs (paired, blocked locally).** Android WebGPU device proof (needs authorized ADB device); BrowserStack iOS water canary (needs `BROWSERSTACK_*` creds).
- **E. Multiplayer playtest (paired).** Open Country paired two-client playtest.
- **F. Code / doc cleanup (autonomous).** Cross-module polygon-spawn dedup (OptimizedSheep / SandboxConfig / StructureBuilder); add the four undocumented Cycle 5 primitives to ARCHITECTURE.md.

The standing long-tail of deferred items is in [`docs/BACKLOG.md`](docs/BACKLOG.md) under "Deferred / not blocking" - pull from there if a chosen theme has room.

## Release reference (Cycle 42 / v2.1.10)

- Commit `fb78851`, tag `v2.1.10`, deploy run `26595530924` (success on `main`).
- Live HTML at sheepdogsim.com serves `assets/main-CZelhZcJ.js`; the direct asset URL returns HTTP 200.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-44-plan.md`](docs/cycle-44-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-43-plan.md`](docs/archive/cycles/cycle-43-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
