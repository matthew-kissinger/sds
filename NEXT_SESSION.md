# Next Session - Cycles 85/86/87 closed; Cycle 88 drafted, awaiting review

> **Updated:** 2026-06-10
> **For:** Cycle 88 (`docs/cycle-88-plan.md`, DRAFT - needs Matt's review,
> then `/cycle-start`).
> **Pickup priority:** (1) S24+ device pass (the one carryover that closed
> three cycles open - checklist below), (2) Matt posts or defers
> `docs/launch/`, (3) review the Cycle 88 draft and `/cycle-start`.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-88-plan.md`](docs/cycle-88-plan.md)
(draft: impostor-first scene loading, spike numbers inline) ->
[`docs/BACKLOG.md`](docs/BACKLOG.md) (Cycles 85/86/87 close entries, all
2026-06-10).

## Where It Stands

**Cycles 85, 86, and 87 closed 2026-06-10** per Matt's "close all cycles"
(plans archived to `docs/archive/cycles/`; full entries in BACKLOG):

- **85** shipped v2.2.12 (entrance readiness); **86** shipped v2.3.0 LIVE
  (launch release, 5/7 phases); **87** shipped 7/7 same-day (renderer
  never-demote + Settings diagnostics row, NSL post-Play foliage streaming,
  overlay z-band/rail/toast-hub system, konveyor retirement).
- Last Deploy run `27276034272` green; 1496 vitest specs green; goldens and
  sim-baselines byte-identical throughout.

**Cycle 88 is drafted, not started:** impostor-first scene loading (first
frame complete at low fidelity; waves upgrade to LOD0 instead of
materializing; signal-based arming; per-scene loading-stage contract).
Spiked: island-wide scatter ~278ms reference desktop (hideable in the
scene-load transition); Phase 1 measures the production-path impostor
build cost (`tools/probe-foliage-streaming-diag.mjs` ready). Decision
recorded in DECISIONS.md.

## Carryover (closed-as-open, recorded in BACKLOG)

- **S24+ device pass** - one phone session settles the Cycle 85 blocker,
  Cycle 86 P3, and Cycle 87's last criterion:
  1. Load sheepdogsim.com, open Settings: renderer status row reads
     `webgpu-production`.
  2. Play Newsheepdogland 2-3 minutes: WebGPU holds, foliage streams past
     the homestead, no overlay overlaps the touch controls.
  3. Check D1 afterwards for `webgpu_frame_budget_floor` events (expected
     telemetry, not failure).
- **Launch posting** from `docs/launch/` (drafts ready, Matt's voice).
- Q4 staging provisioning (optional, three operator steps).
- Coastline-aware meadow quads (Cycle 87 P4 stretch, not taken).
- Earlier standing items: vite 8 / Rolldown migration cycle, main.js
  boot-seam extraction, HeightFogPatch activate-or-delete, worker log
  re-tail during live MP traffic.
- Note: Matt's `tools/trailer/` WIP exists in one pushed commit's history
  (`ac32488`); untracked on disk, output dir gitignored. History rewrite is
  Matt's call only.

## Working Contract

- No `shared/` deterministic-core edits; sim-baselines stay byte-identical.
- Matt publishes every player-facing artifact.
- Agent-launched Vite/Playwright sets `SDS_SUPPRESS_BROWSER_OPEN=1`;
  close every probe page/listener after use.
- CI e2e runs with `--grep-invert='@local-only'`; hardware-dependent
  assertions (real-GPU quality reads, full streaming completion) carry the
  `@local-only` tag.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (DRAFT) | [`docs/cycle-88-plan.md`](docs/cycle-88-plan.md) |
| Closed cycles | [`docs/BACKLOG.md`](docs/BACKLOG.md) + [`docs/archive/cycles/`](docs/archive/cycles/) |
| Launch drafts (Matt to post) | [`docs/launch/`](docs/launch/) |
| Loading-architecture decision | `DECISIONS.md` (2026-06-10 entries) |
| Streaming diag | `window.__sdsFoliageStreaming` (browser console) |
| Renderer diagnostics | Settings panel, under the WebGPU toggle |
| Release log | [`CHANGELOG.md`](CHANGELOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
