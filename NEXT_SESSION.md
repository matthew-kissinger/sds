# Next Session - Cycle 41 (`webgpu-painterly-parity-and-polish`)

> **Updated:** 2026-05-27
> **For:** Cycle 41
> **Pickup priority:** Cycle 41 is locally implemented and validated. Review the final contact sheet, then either commit/tag/deploy `v2.1.9` or start the next cycle from the deferred carryovers.

## Cold-start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-41-plan.md`](docs/cycle-41-plan.md). Closed-cycle context for the prior sun/tree work is in [`docs/archive/cycles/cycle-40-plan.md`](docs/archive/cycles/cycle-40-plan.md) and [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Current State

Cycle 40 shipped as v2.1.8, but the 2026-05-27 visual review showed the WebGPU path still missed the intended WebGL art direction: the sun read too tiny/bland, the sky was too bright, the water lacked a strong reflected sun path, and the overall scene was not zen/painterly enough.

The working tree now contains a renderer-only Cycle 41 patch prepared as `v2.1.9` that:

- Enlarges the WebGPU sun disc/mass and whitens the core so it reads closer to the WebGL reference.
- Makes the WebGPU sun billboard untone-mapped.
- Feeds live Hosek-Wilkie sky colors into the WebGPU sky node material.
- Retunes the WebGPU sky and water response so the image is less pastel/washed out without returning to a dead-black dome.
- Adds a broad flat-normal water glint path plus ripple glint.
- Fixes `Atmosphere.setSun()` partial updates so callers can change elevation or azimuth independently.
- Adds `npm run validation:cycle41-art-lock`, which captures paired WebGL/WebGPU screenshots and a contact sheet.

No `shared/`, Worker, D1, migration, or sim-baseline files are touched.

## Validation State

Current local gates for the Cycle 41 patch:

- `npm run validation:cycle41-art-lock` passed and wrote:
  - `cycle41-validation/runtime/art-lock-matrix.json`
  - `cycle41-validation/screenshots/cycle41-webgl-webgpu-contact-sheet.png`
  - `cycle41-validation/screenshots/art-lock-matrix/`
- `npm test` passed: 54 files, 1 skipped; 498 specs passed, 7 skipped.
- `npm run lint` passed (`eslint shared/`).
- `npm run build` passed with the existing Vite chunk-size/dynamic-import warnings; main bundle ratchet accepted at `593 KiB`.
- `npx playwright test tests/e2e/smoke.spec.ts --project=chromium --reporter=line` passed: 2 tests.
- `npx playwright test --project=chromium --grep-invert @local-only --reporter=line` passed: 6 tests.
- Cleanup proof after browser probes: no listeners on ports `3000`, `4173`, or `8787`; no localhost Chrome tabs for ports `3000` or `4173`.

Full all-project `npm run test:e2e` is not the Cycle 41 release gate because it includes slow local-only suites; keep using the grep-inverted Chromium release lane above unless a later cycle reworks the e2e project split.

## Active Carryovers

- Commit, tag, push, and deploy `v2.1.9` if the final contact sheet is accepted for release.
- Keep octahedral tree impostors lab-only until device budget and visual quality are proven.
- Mobile/iOS water and WebGPU proof remains deferred until explicitly picked up.
- Open Country paired two-client playtest remains deferred.
- Broader WebGPU terrain/foliage parity with WebGL material contrast remains a separate future polish item.

## Hard Stops

- No `shared/` changes without explicit cycle-plan authorization and sim-baseline acceptance.
- No Worker, D1, migration, or production tree-default changes in this visual cycle.
- Do not claim `v2.1.9` is live until commit/tag/push/deploy/live verification is complete.
- Do not use full all-project `npm run test:e2e` timeout language as release failure without naming the specific slow/failing spec; the release-safe Chromium lane is documented in [`tests/e2e/README.md`](tests/e2e/README.md).

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-41-plan.md`](docs/cycle-41-plan.md) |
| Prior sun/tree closeout | [`docs/archive/cycles/cycle-40-plan.md`](docs/archive/cycles/cycle-40-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |

## Running Locally

```bash
npm run dev
npm test
npm run lint
npm run build
npm run validation:cycle41-art-lock
npx playwright test tests/e2e/smoke.spec.ts --project=chromium
npx playwright test --project=chromium --grep-invert @local-only --reporter=line
```

Useful visual-review params: `?scene=field|rolling-hills|open-country`, `?renderer=webgpu`, `?renderer=webgl`, `?autostart=1`, `?mode=classic`, `?sun=0.20|0.35|0.50|0.75`, `?ui=off`, `?tonemap=aces|neutral|linear|none`.
