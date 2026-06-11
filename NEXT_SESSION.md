# Next Session - Cycle 89 executed same-day; review and close

> **Updated:** 2026-06-10
> **For:** Cycle 89 (`docs/cycle-89-plan.md`, all phases shipped or data-skipped; awaiting Matt's review and `/cycle-close`).
> **Pickup priority:** (1) Matt plays Home Field and Rolling Hills on the PC to confirm the stutter is gone by feel, (2) `/cycle-close` Cycle 89, (3) scope Cycle 90 (NSL runtime perf, candidates below).

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-89-plan.md`](docs/cycle-89-plan.md) (the "Mid-cycle reshape" section is the story) -> `DECISIONS.md` (2026-06-10 Cycle 89 entry) -> [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Where It Stands

**Cycle 89 (frame stability) executed 2026-06-10, same day it was scoped.**
Matt reported unstable frames on Home Field with 3 sheep; mid-cycle he corrected the methodology (probes must DRIVE the dog - move, weave, sprint, zoom; idle capture misses it) and hypothesized trees. Both were right:

- **Driven attribution** (new `tools/cycle89-jitter-probe.mjs`, `npm run perf:jitter`): deep stalls of 69-160ms with zero JS longtasks, exclusive to the WebGPU path, carried by the tree chunks. All four originally planned suspects (alloc churn, grass readback, collision grid, atmosphere) measured NOT ARMED and were skipped.
- **Mechanism:** frustum-culled tree chunks re-entering the WebGPU render list re-trigger GPU-process pipeline/bind-group setup (three.js #33685). Cycle 87's webgpu-everywhere default exposed it.
- **Fix shipped:** `js/world/TreePlacement.js` pins desktop tree chunks in the render list (`frustumCulled = builder.isMobile`). Result: worst frame 159.6ms -> 20.9ms, 1%-low 20 -> 70+ FPS, zero visual change (proven by SSIM differential against main HEAD).
- **Durable rail:** `npm run perf:jitter -- --check` gates driven field/practice against `cycle89-validation/jitter-budgets.json` (local, machine-specific budgets).
- **R&D spike (Matt-directed):** ez-tree 1.1.0 current, asset exonerated; dgreenheck's webgpu skill already installed (`webgpu-threejs-tsl`); long-term impostor shape is TSL instancedArray + compute. Backlog: alpha-to-coverage A/B, tight-fit impostor outlines, ez-tree main-branch cherry-picks at next re-bake via Pixel Forge.
- **Pre-phase (also this cycle):** entrance default moved back to Rolling Hills; Newsheepdogland labeled Experimental (WIP).

**Known-stale rail surfaced:** `npm run validation:screenshots -- --diff` goldens date from 2026-05-16 and fail 12/12 on clean main (mean SSIM 0.33) after three visual cycles. Needs a deliberate re-capture from a verified-good build (Matt's eyes on the captures first).

## Carryover (recorded in BACKLOG)

- **S24+ device pass** - one phone session settles the Cycle 85/86/87 carryover and the Cycle 88 low-tier impostor island (checklist in BACKLOG). Cycle 89 adds: confirm mobile tree culling unchanged (the pin is desktop-only).
- **Screenshot golden re-capture** after Matt verifies current visuals.
- **Launch posting** from `docs/launch/` (drafts ready, Matt's voice).
- Q4 staging provisioning (optional).

## Cycle 90 candidates (Matt picks)

- **NSL runtime perf** (the original complaint that opened this cycle): rerun the driven jitter probe on Newsheepdogland; evaluate whether the consolidated compute-cull tree path has its own churn; consider the render-list pin question for rocks/structures.
- Storage-buffer impostor tile selection (TSL instancedArray + compute; kills the per-frame CPU rewrite).
- vite 8 / Rolldown migration (own cycle).
- main.js boot-seam extraction (paired).
- HeightFogPatch activate-or-delete.

## Working Contract

- No `shared/` deterministic-core edits; sim-baselines stay byte-identical.
- Matt publishes every player-facing artifact.
- Agent-launched Vite/Playwright sets `SDS_SUPPRESS_BROWSER_OPEN=1`; close every probe page/listener after use.
- Perf probes DRIVE the dog (the jitter probe does this by default now); idle-camera numbers understate stutter and must not gate.
- CI e2e runs with `--grep-invert='@local-only'`.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan | [`docs/cycle-89-plan.md`](docs/cycle-89-plan.md) |
| Jitter probe + rail | `tools/cycle89-jitter-probe.mjs`, `npm run perf:jitter [-- --check]` |
| Attribution evidence | `cycle89-validation/` (local, gitignored) |
| Decision record | `DECISIONS.md` 2026-06-10 Cycle 89 entry |
| Closed cycles | [`docs/BACKLOG.md`](docs/BACKLOG.md) + [`docs/archive/cycles/`](docs/archive/cycles/) |
| Launch drafts (Matt to post) | [`docs/launch/`](docs/launch/) |
| Release log | [`CHANGELOG.md`](CHANGELOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
