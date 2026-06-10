# Next Session - Cycle 87 shipped; device validation day

> **Updated:** 2026-06-10
> **For:** Cycle 87 (`docs/cycle-87-plan.md`, all 7 phases shipped 2026-06-10;
> Cycles 85 and 86 remain open on Matt's two items).
> **Pickup priority:** Real-device pass on the connected S24+ (validates
> Cycle 87 Phase 1 renderer policy AND closes Cycle 85 Phase 3), then
> Matt posts or defers `docs/launch/`, then `/cycle-close` for 85 + 86 + 87.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-87-plan.md`](docs/cycle-87-plan.md)
(per-phase status blocks, all shipped) ->
[`docs/cycle-86-plan.md`](docs/cycle-86-plan.md) and
[`docs/cycle-85-plan.md`](docs/cycle-85-plan.md) (both open on Matt items only).

## Where It Stands

**Cycle 87 shipped end-to-end on 2026-06-10** (commits `7df916a`, `7ed8be0`,
`06ae9ac`, `c983761`, `26224e7`, `82615a8`, `ac32488`, fixes `1a8b1d5` +
`d9d785c`):

- **Renderer trust (P1):** frame-budget renderer demotion deleted; the
  sticky `sds-renderer-fallback` record is removed on boot and on the
  settings toggle; `webgpu_frame_budget_floor` telemetry replaces it;
  read-only renderer diagnostics row in Settings under the WebGPU toggle.
- **NSL foliage streaming (P2-P4):** post-Play idle-scheduled waves restore
  the pre-trim island (live probe: +1,728 trees, +138,575 grass clumps,
  qualityIndex 0); cold-path bounds unchanged; tier-gated (low: 1 wave, no
  grass); diag on `window.__sdsFoliageStreaming`.
- **Overlay system (P5-P6):** z-band registry (`js/ui/zIndex.js`), shared
  top rail + toast hub with gameplay suppression, HUD CSS-var reserves,
  safe-area sweep, 44px touch targets; `overlay-collision.spec.ts` proves
  no intersections at 390x844.
- **Konveyor retired (P7):** zero `konveyor` matches in live code/tests;
  goldens and sim-baselines pass without regeneration; naming rule codified
  (files name WHAT, not WHEN) in `.claude/rules/scene-and-render.md` +
  `AGENTS.md`; DECISIONS.md entry.

Known wart: commit `ac32488` accidentally swept in Matt's untracked
`tools/trailer/` WIP; `1a8b1d5` untracked it again (files live on in that
one commit's history). `tools/trailer/output/` is now gitignored.

## Tomorrow's Device Run (the pickup)

On the S24+ (USB debugging enabled, ADB via hub if needed):

1. Load sheepdogsim.com, open Settings: the "Renderer status" row should
   read `webgpu-production` (WebGL only if `navigator.gpu` is absent).
2. Play Newsheepdogland 2-3 minutes: renderer stays WebGPU, foliage
   streams in past the homestead, overlays do not overlap the touch
   controls or tutorial.
3. Check D1 for `webgpu_frame_budget_floor` events afterwards (expected
   telemetry, not a failure signal).

This run is the Cycle 85 Phase 3 evidence and the Cycle 87 P1 acceptance.

## Open Carryover

- Matt: post or defer the launch drafts in `docs/launch/` (Cycle 86 P6).
- `/cycle-close` ritual for 85, 86, and 87 once the device pass lands.
- **Scene-loading sequencing review (Matt's 2026-06-10 ask):** evaluate
  impostor-first cold path (first frame complete at low fidelity, waves
  upgrade instead of materialize), arming the streamer at scene-body
  completion instead of the fixed 6.5s delay, and a per-scene loading
  contract on SceneDef. Recommendation delivered in-session; spike the
  impostor cold-bake cost in `tools/` before any plan (per the
  spike-risky-primitives preference). Candidate Cycle 88.
- BACKLOG candidates from 87: coastline-aware meadow quads (P4 stretch,
  not taken); `?konveyorNativeTreeImpostors` read alias removal after one
  release.
- Earlier carryover unchanged: vite 8 / Rolldown migration cycle, main.js
  boot-seam extraction, HeightFogPatch activate-or-delete, Q4 staging
  provisioning, worker log re-tail during live MP traffic.

## Working Contract

- No `shared/` deterministic-core edits; sim-baselines stay byte-identical.
- Matt publishes every player-facing artifact.
- Don't close Cycle 85 without the real-device pass.
- Agent-launched Vite/Playwright sets `SDS_SUPPRESS_BROWSER_OPEN=1`;
  close every probe page/listener after use.
- CI e2e runs with `--grep-invert='@local-only'`; hardware-dependent
  assertions (real-GPU quality reads) carry the `@local-only` tag.

## Reference Table

| Area | Source of truth |
|---|---|
| Just-shipped cycle (statuses inline) | [`docs/cycle-87-plan.md`](docs/cycle-87-plan.md) |
| Open prior cycles (Matt items) | [`docs/cycle-85-plan.md`](docs/cycle-85-plan.md), [`docs/cycle-86-plan.md`](docs/cycle-86-plan.md) |
| Launch drafts (Matt to post) | [`docs/launch/`](docs/launch/) |
| Streaming diag | `window.__sdsFoliageStreaming` (browser console) |
| Renderer diagnostics | Settings panel, under the WebGPU toggle |
| Release log | [`CHANGELOG.md`](CHANGELOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
