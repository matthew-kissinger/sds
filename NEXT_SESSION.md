# Next Session - Post-Cycle 63 Prod Playtest

> **Updated:** 2026-06-06
> **For:** `v2.2.2` / Cycle 63 `collision-stutter-profile`. Plan archived at [`docs/archive/cycles/cycle-63-plan.md`](docs/archive/cycles/cycle-63-plan.md); closeout is in [`docs/BACKLOG.md`](docs/BACKLOG.md).
> **Pickup priority:** Prod-test the dense-grid collision optimization. If stutter remains at normal flock counts, capture exact scene, mode, device, renderer, and whether the symptom is frame-time loss or visual popping.

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/BACKLOG.md`](docs/BACKLOG.md) -> [`docs/archive/cycles/cycle-63-plan.md`](docs/archive/cycles/cycle-63-plan.md) -> the touched module source.

## Where It Stands

**Cycle 63 `collision-stutter-profile` is closed as `v2.2.2`.** Matt reported a prod playtest concern that colliding with a group of sheep may stutter on PC and likely mobile. The cycle shipped a profiling harness and a conservative deterministic collision broadphase optimization.

What shipped:

- **Research pass complete:** recommendation is to keep a uniform grid for active moving sheep disks. KDBush/Flatbush are static indexes and RBush is a general dynamic rectangle tree; none beat the grid as the first SDS move.
- **Browser probe added:** [`tools/collision-stutter-probe.mjs`](tools/collision-stutter-probe.mjs) plus `npm run perf:collision` profiles a deterministic dog-vs-flock storm in production preview and writes JSON under `cycle63-validation/collision-stutter/` (gitignored).
- **Client probe surface:** `?collisionProbe=1` extends `window.__perfHarness` with collision timing, sheep cluster placement, and CPU-throttle-compatible sampling.
- **Dense-grid resolver:** [`shared/EntityCollision.js`](shared/EntityCollision.js) now uses a typed-array cell-head grid when bounds are supplied, with sparse fallback. The Worker, client, and sim-baseline harness pass scene bounds into the same shared resolver.
- **No behavior drift:** dense and sparse outputs match in unit tests; sim-baseline parity and fixtures stayed clean.

## Current Evidence

Production-preview profile (`http://127.0.0.1:4173`, built bundle `assets/main-CCxUjbKL.js` during the spike; final validation build emitted `assets/main-dIepcf9u.js`):

- 200 classic dense storm: p99 frame stayed `16.8 ms`; sheep collision avg/p95 improved from `0.107/0.200 ms` to `0.069/0.200 ms`; total sheep update p95 improved from `1.9 ms` to `1.4 ms`.
- 1000 extreme dense storm: sheep collision avg/p95 improved from `0.428/0.700 ms` to `0.259/0.500 ms`; one 33 ms burst frame still appears.
- 5000 chaos dense storm: sheep collision avg/p95 improved from `2.603/4.200 ms` to `1.724/3.000 ms`; frame p95 improved from `50.0 ms` to `33.4 ms`, but p99 remains `50.0 ms`.
- CPU-throttled 200 classic control shows the broader loop dominates mobile-like pressure: dense collision frame p95 `66.6 ms`, wide control p95 `66.7 ms`, with collision under `1 ms` p95 in both.

Interpretation:

- The 200-sheep PC stutter did not reproduce as collision CPU cost in automation.
- The dense-grid optimization is still worth keeping because it reduces the shared resolver slice, especially at 1000/5000 sheep.
- If stutter persists at normal counts, next step is a specific scene/mode/device repro and a visual-popping check, not a broadphase rewrite.

## Validation

- `npm test -- tests/entity-collision.spec.js` passed.
- `npm test -- tests/sim-baseline/harness-parity.spec.ts` passed.
- `npm test -- tests/sim-baseline/baseline.spec.ts` passed.
- `npm run lint` passed.
- `npm test` passed.
- `npm run build` passed; final validation build emitted `assets/main-dIepcf9u.js`.
- `npx playwright test --project=chromium --grep-invert='@local-only'` passed.
- Bundle ratchet accepted at `566 KiB` (`561 KiB` -> `566 KiB`) for the bounded dense-grid resolver and gated collision probe.
- Browser probes wrote JSON under `cycle63-validation/collision-stutter/`.
- Release commit `360f054`, tag `v2.2.2`, and deploy run `27077642978` are live. sheepdogsim.com serves `assets/main-C0FgLyTC.js`, and the Worker health endpoint returns `{"ok":true,"worker":"sds-worker"}`.

## What To Pick Up Next

1. Prod-test `v2.2.2` collision feel on sheepdogsim.com.
2. If normal-count stutter remains, capture scene/mode/device/renderer and whether the issue is frame-time loss or visual popping.
3. If mobile still stutters, profile the full sheep update/render path on a real device. CPU-throttled automation suggests the broader loop dominates.
4. Once collision feel is settled, pick the next cycle: wolf predator mode, bark feel finalize, second mode edition, or tablet draw-call perf.

## Open Carryover

- **Wolf predator mode** - deferred from the original Cycle 63 scaffold until collision perf/feel is settled.
- **Bark feel finalize** (Matt's taste on the bark constants) + optional radial-startle.
- **The second mode edition** - still deferred.
- **Tablet draw-call perf** - the Tab S9 FE is draw-call-bound on Rolling Hills (~20k draws, 37 fps at 200 sheep).
- **Controller nav for deferred surfaces** (settings, leaderboard, editors, MP lobby/rooms) + a 2D row-aware entrance focus order - see [`docs/cycle-60-controller-parity.md`](docs/cycle-60-controller-parity.md).
- **Counting naming + curve-feel** (Cycle 59/60 strawman) - Matt's standing taste call.
- **Minor housekeeping:** `/api/rename` parses the JSON body before the auth check (no-body POST returns 500 not 400, cosmetic). CI `actions/upload-artifact@v5` runs on Node 20; GitHub forces Node 24 on 2026-06-16.

## Working Contract

- Deterministic-sim work must name shared files, update all consumers in the same commit, and regenerate sim-baselines only with recorded acceptance.
- Do not claim mobile acceptance from CPU throttle alone.
- Do not auto-bump the version outside an explicit player-visible release.
- Run `/validate` before any cycle close. Close via `/cycle-close`.

## Reference Table

| Area | Source of truth |
|---|---|
| Latest closed cycle | [`docs/archive/cycles/cycle-63-plan.md`](docs/archive/cycles/cycle-63-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Collision core | [`shared/EntityCollision.js`](shared/EntityCollision.js) |
| Worker authority | [`worker/src/GameSim.js`](worker/src/GameSim.js) |
| Client prediction/render sync | [`js/OptimizedSheep.js`](js/OptimizedSheep.js) |
| Collision browser probe | [`tools/collision-stutter-probe.mjs`](tools/collision-stutter-probe.mjs) |
| Wolf asset + predator design intent | [`docs/wolf-asset.md`](docs/wolf-asset.md) |
| Deterministic-sim rules | [`.claude/rules/shared-sim.md`](.claude/rules/shared-sim.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
