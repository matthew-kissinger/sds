# Next Session - Cycle 86 v2.3.0 Launch (Cycle 85 open on one item)

> **Updated:** 2026-06-09
> **For:** Cycle 86 (`docs/cycle-86-plan.md`, scaffolded, not started).
> Cycle 85 stays open on exactly one acceptance item (real mobile proof),
> absorbed as Cycle 86 Phase 3.
> **Pickup priority:** Run Cycle 86 Phase 1 (paired): walk the hardening
> fence reviews with Matt. Phase 3 (real-device mobile pass) closes
> Cycle 85.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-86-plan.md`](docs/cycle-86-plan.md)
-> [`docs/cycle-85-plan.md`](docs/cycle-85-plan.md) (still open) ->
[`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) ->
[`docs/hardening/ORCHESTRATION.md`](docs/hardening/ORCHESTRATION.md).

## Where It Stands

**The hardening program (docs/hardening/, 42 tasks, 5 phases) is COMPLETE
and DEPLOYED LIVE** (2026-06-09, merge `ccc0d7b`, Deploy run 27242005458
all green; live bundle `main-SaSle6SI.js` carries the delta client,
`/api/rooms` answers 200, migration 0010 applied to remote D1). Highlights:
delta wire protocol v3 with per-client soft-degrade, first-run tutorial,
achievements, settings completion (key + gamepad rebinding, colorblind,
language), share surfaces, crash beacon, structured worker logging,
lint/typecheck/bundle CI gates, D1 migration-state tracking, entrance
preload wave (entrance-visible 8.8s to 0.9s at 20 Mbps), listener-leak
fixes + 50-cycle soak, 100-room load test (0 desyncs / 208k ticks), chaos
validation (30/30). Tests 1159 -> 1428 passed. Codex's BrowserStack iOS
first-session spec merged in the same push.

**Cycle 85 (`v2.2.12`, Newsheepdogland entrance readiness) shipped live and
is validated except one item: the real mobile proof.** Chromium mobile
emulation passed; no authorized ADB device or BrowserStack credentials were
available in that run. The v2.2.12 live proof record (stale-cache
overwrite, Play/pause/menu/Play loop, WebKit Play-path fix) lives in
[`docs/cycle-85-plan.md`](docs/cycle-85-plan.md) and CHANGELOG. Per Matt's
contract: do not close Cycle 85 without the real-device pass.

**Cycle 86 is scaffolded, not started.** Goal: turn the hardening program
into a player-visible v2.3.0 release and point traffic at it. Phases:
paired fence-review debt, worker fixes from chaos findings (full-room
rehydration 409 lockout, reclaimedByOriginal log bug, crash-stack
truncation), real-device mobile pass (paired, closes Cycle 85), tutorial
translations, the v2.3.0 cut, launch content (paired, Matt's voice),
telemetry confirmation.

## Open Carryover (tracked in the Cycle 86 plan)

- Fence reviews owed from the autonomous hardening run (Phase 1; sign-off
  boxes in `docs/hardening/` are honestly unchecked).
- Real mobile proof on Matt's actual phone covering the live default path:
  first Play, terrain-safe spawn, mobile controls/HUD, pause/Main Menu,
  second Play, no stale-cache behavior (Phase 3; also run Codex's
  `tests/browserstack/newsheepdogland-first-session.spec.ts`).
- Staging activation needs three operator steps (preview D1 +
  `CF_PREVIEW_D1_ID` + `JWT_SECRET --env preview`); workflow ships dormant
  (plan Q4).
- Round-start delta egress lever deliberately deferred (plan Q2; analysis
  in `docs/hardening/delta-protocol-design.md` Deviations).
- Housekeeping: one empty locked dir husk at `../sds-p2-backpressure/worker`
  (deletes after a stray process exits or reboot); ~44 untracked gitignored
  scratch PNGs at repo root, deletable at leisure.

## Working Contract

- No `shared/` edits in Cycle 86; sim-baselines stay byte-identical. Do not
  regenerate goldens.
- The Phase 2 RoomDO rejoin fix must not change the wire protocol or
  room-full semantics for genuinely new joiners.
- Version bump to 2.3.0 happens only in Phase 5 (the plan is the explicit
  authorization). No other player-visible version moves.
- Matt publishes every player-facing artifact; agents draft only.
- Agent-launched Vite/Playwright sets `SDS_SUPPRESS_BROWSER_OPEN=1`; close
  every probe page/listener after use.
- When release proof matters, verify Pages (`https://sheepdogsim.com/`) and
  the direct Worker health endpoint separately.

## Reference Table

| Area | Source of truth |
|---|---|
| Next cycle plan (scaffolded) | [`docs/cycle-86-plan.md`](docs/cycle-86-plan.md) |
| Open prior cycle (one item) | [`docs/cycle-85-plan.md`](docs/cycle-85-plan.md) |
| Completed hardening program | [`docs/hardening/ORCHESTRATION.md`](docs/hardening/ORCHESTRATION.md) |
| Delta protocol spec + deviations | [`docs/hardening/delta-protocol-design.md`](docs/hardening/delta-protocol-design.md) |
| Chaos findings (Phase 2 inputs) | [`docs/hardening/phase-4-polish-launch.md`](docs/hardening/phase-4-polish-launch.md), `tools/loadtest/chaos-results-2026-06-09.json` |
| Release log | [`CHANGELOG.md`](CHANGELOG.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
