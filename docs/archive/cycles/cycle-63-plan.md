# Cycle 63 - collision-stutter-profile

> Drafted 2026-06-06 after Matt's prod playtest feedback on Cycle 62 sheep hard-body collision. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Status: CLOSED 2026-06-06.** This cycle shipped as `v2.2.2` after Matt's prod playtest feedback on Cycle 62 collision stutter. Wolf mode remains deferred until collision perf/feel is settled.

## Goal

Profile the suspected stutter when the dog collides with a dense group of sheep, decide from browser evidence whether the sheep-to-sheep broadphase is the root cause, and ship only the smallest deterministic optimization that improves the hot path without changing collision behavior.

Before: Cycle 62 used a deterministic sparse `Map` spatial hash for sheep-to-sheep hard bodies. The implementation was correct and bounded, but prod playtest raised a PC/mobile stutter concern under dog-vs-flock contact.

After: a reusable collision-storm browser probe can reproduce dense contact and report frame percentiles plus collision sub-timing. The shared resolver keeps the same uniform-grid broadphase, but uses a dense typed-array cell-head grid when scene bounds are available, with sparse fallback for out-of-range cells. Pair order and sim output stay identical.

## Research summary

The delegated research pass agreed with the local code shape:

- **Keep uniform grid/spatial hash for SDS.** Same-radius moving disks rebuilt every frame are the workload where a fixed grid is the normal solution.
- **Do not switch first to KDBush, Flatbush, or RBush.** KDBush and Flatbush are static indexes; RBush is dynamic/general rectangle indexing, but every-frame moving sheep would pay rebuild/update overhead without clear benefit over a grid.
- **Use typed arrays before new libraries.** SDS already has a local high-count pattern in [`js/ExtremeBoidSystem.js`](../js/ExtremeBoidSystem.js): preallocated typed arrays and fixed cell heads.
- **Longer-term frontier:** sorted-cell lists or GPU/WebGPU grids may be useful for visual-only huge flocks, but the Worker/client deterministic sim still favors CPU deterministic data structures.

## Phase 1 - Profile Surface

1. Add `?collisionProbe=1` gated timing to the client sheep update.
2. Add `tools/collision-stutter-probe.mjs` and `npm run perf:collision`.
3. Capture frame percentiles, sheep-collision time, dog-collision time, rewrite time, pair checks, pairs, moved sheep, and max cell occupancy.

**Acceptance (EARS):**

- When `npm run perf:collision` runs against a preview server, then it shall write a JSON artifact under `cycle63-validation/collision-stutter/`.
- When the probe flag is absent, then normal gameplay shall not call collision timing code.

## Phase 2 - Browser Evidence

Production-preview probe results:

| Scenario | Build | Frame p95 | Frame p99 | Sheep collision avg / p95 | Total sheep update avg / p95 | Notes |
|---|---:|---:|---:|---:|---:|---|
| 200 classic, radius 2.5 | sparse | 16.8 ms | 16.8 ms | 0.107 / 0.200 ms | 1.127 / 1.900 ms | No PC frame stutter reproduced |
| 1000 extreme, radius 12 | sparse | 16.8 ms | 16.8 ms | 0.428 / 0.700 ms | 3.373 / 5.200 ms | One 33 ms frame during burst |
| 5000 chaos, radius 35 | sparse | 50.0 ms | 50.0 ms | 2.603 / 4.200 ms | 19.949 / 27.900 ms | High-count storm repro |
| 200 classic, radius 2.5 | dense | 16.8 ms | 16.8 ms | 0.069 / 0.200 ms | 0.912 / 1.400 ms | PC classic stays stable |
| 1000 extreme, radius 12 | dense | 16.8 ms | 16.8 ms | 0.259 / 0.500 ms | 3.361 / 5.500 ms | Resolver slice improved |
| 5000 chaos, radius 35 | dense | 33.4 ms | 50.0 ms | 1.724 / 3.000 ms | 20.059 / 27.400 ms | Resolver improved; high-count update remains heavy |
| 200 classic, radius 2.5, CPU 4x | dense | 66.6 ms | 83.3 ms | 0.353 / 0.600 ms | 5.672 / 8.200 ms | Mobile proxy shows broad loop pressure |
| 200 classic, radius 80, CPU 4x | dense | 66.7 ms | 66.8 ms | 0.387 / 0.900 ms | 5.546 / 8.700 ms | Near-zero collisions still slow under throttle |

**Acceptance (EARS):**

- When a 200-sheep dense collision storm is profiled on local production preview, then the report shall show whether frame spikes correlate with collision sub-timing.
- When a 4x CPU-throttled control is profiled, then the report shall distinguish collision cost from general mobile-class main-thread pressure.

## Phase 3 - Deterministic Dense Grid

1. Extend [`shared/EntityCollision.js`](../shared/EntityCollision.js) with a dense typed-array cell-head path selected by scene bounds.
2. Preserve the sparse `Map` path for unbounded callers or oversized grids.
3. Pass bounds from [`worker/src/GameSim.js`](../worker/src/GameSim.js), [`js/OptimizedSheep.js`](../js/OptimizedSheep.js), and [`tests/sim-baseline/harness.js`](../tests/sim-baseline/harness.js).
4. Prove dense output matches sparse output in [`tests/entity-collision.spec.js`](../tests/entity-collision.spec.js).

**Acceptance (EARS):**

- When dense-grid bounds are supplied, then sheep pair order, position corrections, velocities, and pair counts shall match the sparse path.
- When sim-baseline parity and baseline fixtures run, then they shall stay byte-identical.
- When 1000/5000 sheep collision storms are profiled in production preview, then the sheep-collision timing slice shall improve versus the sparse build.

## Phase 4 - Next Decisions

Short term:

- Keep the dense-grid optimization.
- Treat 200-sheep PC stutter as not reproduced by the automated CPU profile; ask for a specific scene/mode/device repro if Matt still sees it.
- Run a real mobile device pass before claiming mobile acceptance.

Medium term:

- If mobile still stutters, profile the full sheep update, not just collision. The CPU-throttled control suggests flock update/render work dominates at mobile-class speed.
- Consider reducing sheep-sheep render snapping for non-dog corrections only if the reported stutter is visual popping rather than frame-time loss.
- If high-count chaos remains a target, move more of the classic per-sheep update into the existing typed-array high-count path.

Long term:

- Evaluate sorted-cell lists if dense-grid fill cost shows up on larger scenes.
- Reserve KDBush/Flatbush for static or mostly static queries; do not use them for active sheep collision unless a benchmark beats the grid.
- Keep GPU/WebGPU collision as a visual-only frontier unless SDS introduces a deterministic GPU/CPU reconciliation strategy.

## Frozen files

The durable fence is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). This cycle intentionally touches:

- [`shared/EntityCollision.js`](../shared/EntityCollision.js) - deterministic collision broadphase optimization and probe counters.
- [`shared/index.js`](../shared/index.js) - unchanged unless exports are needed.
- [`worker/src/GameSim.js`](../worker/src/GameSim.js) - pass authoritative scene bounds into the shared resolver.
- [`js/OptimizedSheep.js`](../js/OptimizedSheep.js) - client probe timing and bounds pass-through.
- [`tests/sim-baseline/harness.js`](../tests/sim-baseline/harness.js) - mirror Worker bounds pass-through.

No frozen shared core file is touched.

## Validation

Completed 2026-06-06:

- `npm test -- tests/entity-collision.spec.js` passed.
- `npm test -- tests/sim-baseline/harness-parity.spec.ts` passed.
- `npm test -- tests/sim-baseline/baseline.spec.ts` passed.
- `npm run lint` passed.
- `npm test` passed.
- `npm run build` passed; the final validation build emitted `assets/main-dIepcf9u.js` at `566 KiB`, and the main-bundle ratchet is intentionally accepted from `561 KiB` to `566 KiB` for the bounded dense-grid resolver and gated browser collision probe.
- `npx playwright test --project=chromium --grep-invert='@local-only'` passed.
- Production-preview probes wrote JSON under `cycle63-validation/collision-stutter/` (gitignored).
- `CHANGELOG.md`, `NEXT_SESSION.md`, and `docs/BACKLOG.md` were updated for the `v2.2.2` release.
- Deploy run `27077642978` passed Test, Deploy Worker, Deploy Pages, and Chromium E2E. Live HTML served `assets/main-C0FgLyTC.js`, and direct Worker health returned `{"ok":true,"worker":"sds-worker"}`.

## Hard stops

1. Do not replace the current collision model with a non-deterministic library.
2. Do not regenerate sim-baseline fixtures for this optimization unless behavior intentionally changes.
3. Do not claim mobile acceptance from CPU throttle alone.
4. Stop if dense-grid output diverges from sparse output.

## Success criteria (cycle close)

- [x] When the research pass completes, then the recommendation shall compare uniform grid, KDBush, Flatbush, RBush, and sweep-and-prune for SDS's workload.
- [x] When the browser probe runs, then it shall produce frame and collision sub-timing for dog-vs-flock contact.
- [x] When the shared resolver changes, then dense and sparse output shall be equivalent in unit tests.
- [x] When sim-baseline tests run, then parity and committed fixtures shall stay clean.
- [x] When `npm run build` grows `main-*.js`, then `tests/refactor-baseline/__fixtures__/bundle-sizes.json` shall be updated with the measured value and this plan shall record the rationale.
- [x] When release validation runs, then full `npm test`, `npm run lint`, `npm run build`, and release-safe Playwright shall pass.
- [x] When the cycle closes, then `NEXT_SESSION.md` and `BACKLOG.md` shall reflect the outcome.

## References

- [`docs/archive/cycles/cycle-62-plan.md`](archive/cycles/cycle-62-plan.md) - shipped sheep hard-body collision
- [`docs/archive/cycles/cycle-56-plan.md`](archive/cycles/cycle-56-plan.md) - shipped dog-to-sheep collision
- [`js/ExtremeBoidSystem.js`](../js/ExtremeBoidSystem.js) - local typed-array grid precedent
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) - deterministic-sim discipline
