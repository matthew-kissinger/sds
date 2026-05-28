# Next Session - Cycle 42 Release Approval

> **Updated:** 2026-05-28
> **For:** Cycle 42 closeout / release approval
> **Pickup priority:** Review [`docs/cycle-42-plan.md`](docs/cycle-42-plan.md), the current material-lock contact sheet, and the blockers below. Cycle 42 is implemented locally for `v2.1.10`; commit, push, tag, deploy, and live proof are still pending approval.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-42-plan.md`](docs/cycle-42-plan.md). Closed-cycle context is in [`docs/archive/cycles/cycle-41-plan.md`](docs/archive/cycles/cycle-41-plan.md), [`docs/archive/cycles/cycle-40-plan.md`](docs/archive/cycles/cycle-40-plan.md), and [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Current State

Cycle 42 implements the approved visual-first WebGPU scene-material parity pass:

- WebGPU sun/sky now paints a warmer sun body with a hot core and separate corona instead of the prior faded moon-like disc.
- WebGPU grass is less brown, uses more green/yellow tip separation, and reads apart from terrain better in Rolling Hills and Open Country.
- WebGPU water is darker blue and uses a masked sun-glint path so low-sun water no longer becomes a whole-surface purple wash.
- WebGPU terrain, grass, sheep, impostor, sky, sun, and water material controls were tuned locally without touching `shared/`, Worker, D1, migrations, or sim-baseline goldens.
- `?renderer=webgpu&konveyorNativeTreeImpostors=1` now resolves to octahedral v2 after PC proof; rollback remains `?renderer=webgpu&konveyorNativeTreeImpostors=latlon`.

## Proof Artifacts

- Cycle 42 material lock:
  - `cycle42-validation/runtime/material-lock.json`
  - `cycle42-validation/screenshots/material-lock/`
  - `cycle42-validation/screenshots/cycle42-material-contact-sheet.png`
- Focused sun/water proof:
  - `cycle42-validation/runtime/material-lock-sun-water-focus.json`
  - `cycle42-validation/screenshots/cycle42-sun-water-focus-contact-sheet.png`
- Issue-focused grass/water proof:
  - `cycle42-validation/runtime/material-lock-issue-focus.json`
  - `cycle42-validation/screenshots/cycle42-issue-focus-contact-sheet.png`
- Octahedral proof:
  - `cycle42-validation/runtime/octahedral-proof.json`
  - `cycle42-validation/screenshots/cycle42-octahedral-contact-sheet.png`

These proof artifacts are local and gitignored. They are evidence, not release assets.

## Validation

- `npm test` - passed, 54 files passed and 1 skipped; 499 specs passed and 7 skipped.
- `npm run lint` - passed.
- `npm run build` - passed with existing Vite large-chunk/dynamic-import warnings.
- `npx playwright test tests/e2e/smoke.spec.ts --project=chromium --reporter=line` - passed, 2 tests.
- `npx playwright test --project=chromium --grep-invert @local-only --reporter=line` - passed, 6 tests. One earlier parallel run was invalid because another Playwright server had already taken port `3000`; the standalone rerun passed.
- `npm run validation:cycle42-material-lock` - passed. It still classifies six low-sun actor/Open Country comparisons as material-parity manual-review items.
- `npm run validation:cycle42-octahedral-proof` - passed.

## Blockers / Carryover

- Android WebGPU device proof is blocked locally: `adb devices` returned no authorized devices.
- BrowserStack iOS water proof is blocked locally: no `BROWSERSTACK_*` / `BS_*` env vars were present.
- Open Country paired two-client playtest remains carryover unless explicitly promoted.
- `uuid` advisory remains a dev-tooling transitive carryover through Google/BrowserStack packages; `tmp` and `qs` were resolved via low-risk hygiene.
- The material-lock classifier still lists six metric deltas in low-sun actor/Open Country views. Manual review is the authority; the contact sheet is recorded for approval.

## Release Steps Remaining

1. Rerun `npm test`, `npm run lint`, `npm run build`, smoke, and release-safe Chromium e2e after any doc-only edits if required by the releaser.
2. Commit as the Cycle 42 `v2.1.10` release.
3. Push, tag `v2.1.10`, and watch `deploy.yml`.
4. Verify live HTML and direct asset URL before claiming production release.
5. Update this file and [`docs/cycle-42-plan.md`](docs/cycle-42-plan.md) with commit, tag, deploy run, live HTML asset, and direct asset proof.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-42-plan.md`](docs/cycle-42-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-41-plan.md`](docs/archive/cycles/cycle-41-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
