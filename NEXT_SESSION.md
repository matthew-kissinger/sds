# Next Session - Cycle 43 Scaffolding

> **Updated:** 2026-05-28
> **For:** Cycle 43
> **Pickup priority:** Fill in the [`docs/cycle-43-plan.md`](docs/cycle-43-plan.md) Goal + Phases for the WebGPU boot-scout scaffolding retirement (scope below), then run `/cycle-start`.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-43-plan.md`](docs/cycle-43-plan.md). Closed-cycle context is in [`docs/archive/cycles/cycle-42-plan.md`](docs/archive/cycles/cycle-42-plan.md), [`docs/archive/cycles/cycle-41-plan.md`](docs/archive/cycles/cycle-41-plan.md), and [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Current State

Cycle 42 shipped as `v2.1.10` and is closed. WebGPU is the proven production default; the migration scaffolding that was only ever a stepping-stone is now dead weight. Cycle 43 retires the WebGPU boot-scout scaffolding while preserving all load-bearing production WebGPU code.

The Cycle 43 plan is scaffolded as a stub. It needs a Goal paragraph and EARS phases before `/cycle-start`.

## Proposed Cycle 43 scope (confirm in /cycle-start)

Retire the obsolete WebGPU boot-scout recorder and dead `konveyor*` proof routes/flags. Keep the production WebGPU path intact. Disjoint from the v2.1.10 release file set, so no conflation risk.

**Remove (scout-only):**

- [`index.html`](index.html) bootstrap (lines ~405-466): drop the `productionBootScout` request parse, the `effective: 'webgpu-production-boot-scout'` branch, and `__sdsG.productionBootScout`. Keep `productionWebGpu` and the `webgpu-production` effective mode.
- [`js/main.js`](js/main.js) DOMContentLoaded dispatch (~2549-2601): drop the `if (window.__sdsG?.productionBootScout)` branch and the `recordProductionBootScoutSequence` var + call. Keep the `else if (window.__sdsG?.productionWebGpu)` production path verbatim.
- [`js/diagnostics/konveyorProductionBootScoutRecorder.js`](js/diagnostics/konveyorProductionBootScoutRecorder.js): delete the whole file (557 lines, diagnostic-only).
- [`js/rendering/konveyorRuntimeMode.js`](js/rendering/konveyorRuntimeMode.js): drop only the `explicitScoutRoute` clause from `shouldUseKonveyorProductionNativeInstancing()`. Keep `explicitTreeImpostorRoute` (`konveyorNativeTreeImpostors`) and the `isKonveyorProductionWebGpuActive()` gate.
- [`js/rendering/konveyorProductionWebGpuBoot.js`](js/rendering/konveyorProductionWebGpuBoot.js): remove `dataset.konveyorProductionBootScout = '1'` (line ~139). Keep `dataset.konveyorProductionWebGpu = '1'` (line ~138) and every exported function.
- [`tools/konveyor-production-boot-scout.mjs`](tools/konveyor-production-boot-scout.mjs) and [`tools/konveyor-production-gameplay-parity-proof.mjs`](tools/konveyor-production-gameplay-parity-proof.mjs): delete. One-time proof runners; no `package.json` script references.

**Tests (careful, do not just delete):**

- [`tests/konveyor-instancing-adapter.spec.js`](tests/konveyor-instancing-adapter.spec.js): `NATIVE_INSTANCING_SEARCH` (line ~19) uses the scout query as the activation fixture for three production native-instancing tests (placeTrees, placeEnvironmentDetails x2). Repoint these to a surviving production route (likely `?renderer=webgpu&konveyorNativeTreeImpostors=octahedral`) after verifying `TreePlacement`/`RockPlacement` gating. Do not delete the coverage.
- [`tests/konveyor-runtime-mode.spec.js`](tests/konveyor-runtime-mode.spec.js): remove the "keeps the guarded scout native-instancing route intact" test (lines ~37-41).

**Docs:**

- [`ARCHITECTURE.md`](ARCHITECTURE.md) (~144-164): remove the boot-scout paragraph.
- [`DECISIONS.md`](DECISIONS.md): add a NEW dated entry recording the retirement. Do not rewrite the existing boot-scout entry (history is append-only).
- [`tools/validation/README.md`](tools/validation/README.md): drop the scout-runner references.

**Why this is safe:** production native instancing rides `isKonveyorProductionWebGpuActive()` + `konveyorNativeTreeImpostors`, not the scout route. The scout pieces are a stepping-stone from the migration and have no production consumer.

## Release reference (Cycle 42 / v2.1.10)

- Commit `fb78851`, tag `v2.1.10`, deploy run `26595530924` (success on `main`).
- Live HTML at sheepdogsim.com serves `assets/main-CZelhZcJ.js`; the direct asset URL returns HTTP 200.

## Blockers / Carryover (from Cycle 42)

- Android WebGPU device proof is blocked locally: `adb devices` returned no authorized devices.
- BrowserStack iOS water proof is blocked locally: no `BROWSERSTACK_*` / `BS_*` env vars were present.
- Open Country paired two-client playtest remains carryover unless explicitly promoted.
- `uuid` advisory remains a dev-tooling transitive carryover through Google/BrowserStack packages.
- Six low-sun actor/Open Country material-lock manual-review classifications stay visible for Matt approval and future painterly parity work.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-43-plan.md`](docs/cycle-43-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-42-plan.md`](docs/archive/cycles/cycle-42-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
