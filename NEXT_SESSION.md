# Next Session - upkeep program shipped; Matt's two launch items remain

> **Updated:** 2026-06-09 (late)
> **For:** Cycle 86 (`docs/cycle-86-plan.md`; Cycle 85 still open on the
> real mobile proof, absorbed as Cycle 86 Phase 3). The post-launch
> upkeep program (`docs/upkeep/2026-06-post-launch-upkeep.md`) ran
> autonomously and is COMPLETE.
> **Pickup priority:** The two remaining Matt items, planned for
> 2026-06-10: (1) real-device mobile pass on his phone (Phase 3, closes
> Cycle 85), (2) post or defer the launch drafts in `docs/launch/`
> (Phase 6). Then `/cycle-close` for 85 + 86.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-86-plan.md`](docs/cycle-86-plan.md)
(dated status blocks per phase) ->
[`docs/upkeep/2026-06-post-launch-upkeep.md`](docs/upkeep/2026-06-post-launch-upkeep.md)
(per-phase status blocks + checked acceptance) ->
[`docs/cycle-85-plan.md`](docs/cycle-85-plan.md) (still open).

## Where It Stands

**v2.3.0 is LIVE** (2026-06-09, tag `v2.3.0`). Cycle 86 Phases 1, 2, 4,
5, 7 complete; Phase 3 hardware-blocked for Matt tomorrow; Phase 6 drafts
ready in `docs/launch/` for Matt to post.

**Upkeep program complete** (2026-06-09 late, commits `5258af4`..`e4430eb`):

- **A (review-debt tests):** delta-aware integration wsClient +
  broadcast-cadence coop-survival, new mixed-cohort spec (v3 vs v2
  streams + cross-cohort equality, 3/3 live), committed 600k-pair
  rectBoundarySteer fuzz, unicast-keyframe backpressure guard in RoomDO
  with 5 unit tests.
- **B (localization):** all four parity allowlists at zero (~118 keys
  translated incl. the pt sandbox.* gap); i18n ratchet 136 -> 140 KiB,
  recorded.
- **C (majors):** typescript 6.0.3, i18next 26.3.1 + react-i18next
  17.0.8, concurrently 10.0.3 (shell-quote override dropped) all
  shipped with per-upgrade validation. vite 8 NOT taken: Rolldown swap
  vs our object-form manualChunks + bundle-graph preload plugin +
  chunk-family ratchet is a deliberate migration cycle (recorded in the
  program doc Phase C table).
- **D (lint):** shared/ no-restricted-imports verified active, worker/
  pattern gap closed, proof run, shared-sim.md updated.
- **E (housekeeping):** 44 scratch PNGs gone, p2-backpressure husk
  removed (9 orphaned holder processes killed), all three cycle83
  worktrees + branches removed (fully merged, verdict table in the
  program doc), stale hardening line-refs annotated.
- **F (docs):** README/ARCHITECTURE/llms.txt truth-up to v2.3.0; site
  copy untouched (Phase 6, Matt's).
- **G (quality):** audit at
  [`docs/upkeep/code-quality-audit-2026-06.md`](docs/upkeep/code-quality-audit-2026-06.md)
  with prioritized proposals; 3 verified-dead files deleted (361 LOC).
  HeightFogPatch.js deliberately left (dormant Cycle 25-C foundation,
  proposal #2: activate or delete).

Validation at close: lint, both typechecks, build, 1456 passed / 11
skipped on fresh dist, sim-baselines byte-identical, deploys green
(wave 1 run 27249719972 success; wave 2 + final noted in the program
doc).

## Open Carryover

- Phase 3 hardware (planned 2026-06-10): Matt's phone on live, or hub
  power for tablet ADB, or BrowserStack creds for `tests/browserstack/`.
- Phase 6 posting (Matt), gated on Phase 3.
- Q4 staging provisioning (three operator steps; optional).
- Cycle 85 + 86 closure ritual (`/cycle-close`) once the above land.
- Paired-session candidates from the quality audit: main.js boot-seam
  extraction, HeightFogPatch activate-or-delete decision.
- vite 8 / Rolldown migration as its own future cycle phase.
- Post-launch: re-tail worker logs during live MP traffic for the loaded
  tick-health baseline; egress lever decision (plan Q2) only if CF costs
  surface.

## Working Contract

- No `shared/` edits; sim-baselines stay byte-identical.
- Matt publishes every player-facing artifact; drafts are ready.
- Don't close Cycle 85 without the real-device pass.
- Agent-launched Vite/Playwright sets `SDS_SUPPRESS_BROWSER_OPEN=1`;
  close every probe page/listener after use.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle plan (statuses inline) | [`docs/cycle-86-plan.md`](docs/cycle-86-plan.md) |
| Upkeep program (complete, statuses inline) | [`docs/upkeep/2026-06-post-launch-upkeep.md`](docs/upkeep/2026-06-post-launch-upkeep.md) |
| Quality audit + proposals | [`docs/upkeep/code-quality-audit-2026-06.md`](docs/upkeep/code-quality-audit-2026-06.md) |
| Open prior cycle (one item) | [`docs/cycle-85-plan.md`](docs/cycle-85-plan.md) |
| Launch drafts (Matt to post) | [`docs/launch/`](docs/launch/) |
| Fence-review dossiers | [`docs/hardening/review-dossiers-2026-06-09.md`](docs/hardening/review-dossiers-2026-06-09.md) |
| Release log | [`CHANGELOG.md`](CHANGELOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
