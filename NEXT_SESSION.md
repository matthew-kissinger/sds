# Next Session - Cycle 42 Draft (`webgpu-scene-material-parity-and-device-proof`)

> **Updated:** 2026-05-27
> **For:** Cycle 42 planning
> **Pickup priority:** Cycle 42 is drafted but not approved. Review [`docs/cycle-42-plan.md`](docs/cycle-42-plan.md), answer the approval questions, then start implementation only after Matt approves or edits the plan.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-42-plan.md`](docs/cycle-42-plan.md). Closed-cycle context is in [`docs/archive/cycles/cycle-41-plan.md`](docs/archive/cycles/cycle-41-plan.md), [`docs/archive/cycles/cycle-40-plan.md`](docs/archive/cycles/cycle-40-plan.md), and [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Current State

Cycle 41 is closed and shipped:

- Commit: `c1fd5c0` (`feat(cycle-41): ship webgpu painterly parity`).
- Tag: `v2.1.9`.
- Deploy run: `26541935987` passed.
- Live HTML: `https://sheepdogsim.com/` returned HTTP 200 and referenced `assets/main-Cm7rDWr0.js`.
- Live asset: `https://sheepdogsim.com/assets/main-Cm7rDWr0.js` returned HTTP 200.

Cycle 41 fixed the immediate WebGPU sun/sky/water art complaint. The accepted local proof remains:

- `cycle41-validation/runtime/art-lock-matrix.json`
- `cycle41-validation/screenshots/cycle41-webgl-webgpu-contact-sheet.png`
- `cycle41-validation/screenshots/art-lock-matrix/`

Those proof artifacts are local and gitignored. They are evidence, not release assets.

## Cycle 42 Draft

The proposed Cycle 42 scope is WebGPU scene material parity and device proof. It should not start until approved.

The draft promotes these carryovers:

- Broader WebGPU terrain, grass, foliage, sheep, and dog material parity against the WebGL style reference.
- Mobile/BrowserStack/iOS water proof as available.
- Octahedral tree lab route decision, without production promotion unless proof supports it.
- Open Country paired two-client playtest as a focused gameplay regression surface.
- Dependabot moderate advisory triage as release hygiene, not as a visual-scope blocker.

## Last Known Validation

Local Cycle 41 validation before release:

- `npm test` - 54 files passed, 1 skipped; 498 specs passed, 7 skipped.
- `npm run lint` - clean.
- `npm run build` - passed with existing Vite large-chunk/dynamic-import warnings; main bundle ratchet accepted at `593 KiB`.
- `npx playwright test tests/e2e/smoke.spec.ts --project=chromium --reporter=line` - 2 passed.
- `npx playwright test --project=chromium --grep-invert @local-only --reporter=line` - 6 passed.
- `npm run validation:cycle41-art-lock` - passed.
- Cleanup proof after browser probes: no listeners on ports `3000`, `4173`, or `8787`; no localhost Chrome/Edge tabs for ports `3000` or `4173`.

Push-triggered CI/deploy after commit `c1fd5c0`:

- `deploy.yml` run `26541935987` - success.
- Jobs passed: Test, E2E (Chromium), Deploy Pages, Deploy Worker.

## Hard Stops

- Do not implement Cycle 42 until Matt approves or edits [`docs/cycle-42-plan.md`](docs/cycle-42-plan.md).
- No `shared/` changes without explicit cycle-plan authorization and sim-baseline acceptance.
- No Worker, D1, or migration changes for visual material parity.
- Do not promote octahedral tree impostors to production defaults without device-budget and visual-quality proof.
- Do not claim mobile/iOS proof from desktop-only captures.

## Reference Table

| Area | Source of truth |
|---|---|
| Draft cycle | [`docs/cycle-42-plan.md`](docs/cycle-42-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-41-plan.md`](docs/archive/cycles/cycle-41-plan.md) |
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

## Useful Commands

```bash
npm run dev
npm test
npm run lint
npm run build
npx playwright test tests/e2e/smoke.spec.ts --project=chromium
npx playwright test --project=chromium --grep-invert @local-only --reporter=line
npm run validation:cycle41-art-lock
```

Useful visual-review params: `?scene=field|rolling-hills|open-country`, `?renderer=webgpu`, `?renderer=webgl`, `?autostart=1`, `?mode=classic`, `?sun=0.20|0.35|0.50|0.75`, `?ui=off`, `?tonemap=aces|neutral|linear|none`.
