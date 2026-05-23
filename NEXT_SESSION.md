# Next Session - Cycle 40 closeout

> **Updated:** 2026-05-22
> **For:** Cycle 40 closeout / Cycle 41 pickup
> **Pickup priority:** If the commit containing Cycle 40 is already deployed to `sheepdogsim.com`, draft the next cycle from the carryovers below. If it is not deployed yet, push that commit, run the deploy workflow, and verify the live HTML points at the new production chunk before starting new feature work.

## Cold-start orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-40-plan.md`](docs/cycle-40-plan.md). Closed-cycle plans live under [`docs/archive/cycles/`](docs/archive/cycles/).

## Current state

Cycle 39 Phase E is closed. The final gameplay baseline was captured locally at `cycle39-validation/screenshots/phase5-painterly-final/` with 12 PNGs across `{field, rolling-hills, open-country} x {sun=0.20, 0.35, 0.50, 0.75}`. The `cycle*-validation/` folders are intentionally gitignored; treat those paths as local proof artifacts, not committed source.

Cycle 40 is locally complete. Water, clouds, the visible sun disc, and the WebGPU octahedral tree-impostor lab route landed together:

- Water update shape is now `update(timeSec, sunDirection, sunColor)`.
- WebGL water uses `uSunColor`; WebGPU water uses a live `sunColor` node uniform.
- Water probe metadata reports `konveyorWaterSunColorSource = 'skyFog.sunColor'`.
- Clouds keep the existing sun-color plumbing but no longer carry independent amber rim/highlight literals.
- The sun disc is tuned to read as an actual small sun disc instead of only a brighter patch of sky.
- Pixel Forge v2 octahedral sidecars live beside existing tree assets under `assets/models/trees/octahedral/`.
- `?renderer=webgpu&konveyorNativeTreeImpostors=octahedral` is the lab-only v2 route.
- `?konveyorNativeTreeImpostors=1` remains the current production v1 `latlon` / `hemi-y` route.

## Validation state

Local validation passed before close:

- Pixel Forge CLI build for the imposter baker.
- Pixel Forge `kiln validate-imposter` for both staged octahedral SDS tree sidecars.
- Focused specs for water/cloud/material adapters, runtime mode, impostor selection, v1 sidecars, and v2 sidecars.
- `npm run build` - clean. The bundle ratchet stayed at `mainKB=592` after trimming shipped GLSL comments; no fixture bump was needed.
- `npm test` - 54 passed files, 1 skipped; 498 passed specs, 7 skipped.
- `npm run lint` - clean (`eslint shared/`).

Local visual proof artifacts:

- Cycle 39 baseline runtime JSONs: `cycle39-validation/runtime/phase5-painterly-final-sun-*.json`.
- Cycle 39 baseline screenshots: `cycle39-validation/screenshots/phase5-painterly-final/`.
- Cycle 40 sun/water/cloud matrix JSONs: `cycle40-validation/runtime/sun-water-cloud-matrix-sun-*.json`.
- Cycle 40 sun/water/cloud screenshots: `cycle40-validation/screenshots/sun-water-cloud-matrix/`.
- Octahedral lab proof JSON: `cycle40-validation/runtime/octahedral-tree-lab-proof.json`.
- Octahedral lab screenshots: `cycle40-validation/screenshots/octahedral-tree-lab/`.

The octahedral proof confirmed WebGPU production renderer, nonblank screenshots, zero fatal page errors, active v2 sidecars (`layout: "octahedral"`, `version: 2`), tile variation across camera poses, and no production default switch.

## Carryovers

- Android/iOS proof remains deferred by Cycle 40 instruction.
- Octahedral tree impostors are lab-only. Do not call them production-ready until a later cycle proves device budget and visual quality.
- Existing v1 `latlon` / `hemi-y` tree sidecars remain the production contract.
- Broader tree art variety remains a later art/content cycle.
- Open Country paired two-client playtest remains outside Cycle 40.

## Hard stops

- No `shared/` changes without explicit cycle-plan authorization and sim-baseline acceptance.
- No Worker, D1, migration, or production tree-default changes from Cycle 40.
- If the build-size ratchet fails, stop and surface; do not silently bump fixtures.
- Do not treat local ignored validation artifacts as committed evidence unless a future cycle explicitly changes that repo policy.

## Reference table

| Area | Source of truth |
|---|---|
| Current cycle closeout | [`docs/cycle-40-plan.md`](docs/cycle-40-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |

## Running locally

```bash
npm run dev
npm test
npm run lint
npm run build
npm run test:e2e -- --project=chromium --grep-invert @local-only
npm run test:ios-water
npm run test:integration
```

Useful URL params: `?scene=field|rolling-hills|open-country`, `?renderer=webgpu`, `?konveyorNativeTreeImpostors=1`, `?konveyorNativeTreeImpostors=octahedral`, `?debug=gl`, `?cinematic=1`, `?ui=off`, `?sun=0.5`, `?perfMode=1`, `?tier=low|med|high`, `?tonemap=aces|neutral|linear|none`.
