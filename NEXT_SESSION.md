# Next Session - Cycle 86 nearly done; Matt-only items remain

> **Updated:** 2026-06-09
> **For:** Cycle 86 (`docs/cycle-86-plan.md`, executed autonomously
> through Phases 1, 2, 4, 5, 7; Cycle 85 still open on the real mobile
> proof, absorbed as Cycle 86 Phase 3).
> **Pickup priority:** The two remaining Matt items, planned for
> 2026-06-10: (1) real-device mobile pass on his phone (Phase 3, closes
> Cycle 85), (2) post or defer the launch drafts in `docs/launch/`
> (Phase 6). The fence sign-offs landed 2026-06-09 (Matt signed off
> in-session on the delta design + egress deviation); review debt is
> fully cleared.

## Cold-Start Orientation

Read in order: this file -> [`docs/cycle-86-plan.md`](docs/cycle-86-plan.md)
(every phase carries a dated status block) ->
[`docs/cycle-85-plan.md`](docs/cycle-85-plan.md) (still open) ->
[`docs/hardening/review-dossiers-2026-06-09.md`](docs/hardening/review-dossiers-2026-06-09.md).

## Where It Stands

**v2.3.0 is LIVE** (2026-06-09, release `2b5b2ed` + ratchet fix
`ceb45b7`, tag `v2.3.0`, Deploy run 27244953409 all green). Live proof:
`main-Dh4UGGjR.js` served, worker healthz ok, fresh-profile probe shows
the tutorial offer and the achievements panel (0 of 9), zero console
errors. The CHANGELOG 2.3.0 entry tells the hardening-program story.

Cycle 86 phase state:

- **Phase 1 (fence reviews): done by adversarial-review proxy.** Four
  independent dossiers, all accept / accept-with-flags. One real defect
  found (F1 unicast-keyframe basis race) and fixed; fence-list gap
  closed. Only the two literal "Matt has signed off" boxes remain his.
- **Phase 2 (worker fixes): shipped** (`83571f6`). Full-room rehydration
  rejoin (persisted identity reclaims its slot, new joiners still 409),
  reclaimedByOriginal log fix, /api/event raw-string caps (stack 4096,
  propsJson 8192, always-valid JSON), basis-aligned unicast keyframes.
  Chaos harness rerun: 32/32 PASS
  (`tools/loadtest/chaos-results-rejoinfix-2026-06-09.json`).
- **Phase 3 (real-device mobile): BLOCKED on hardware, not failed.** Hub
  down, phone/tablet unreachable, no BrowserStack creds. Checklist is
  written in the plan, ready to run the moment Matt has the phone or the
  hub is up. Cycle 85 archives only after this passes.
- **Phase 4 (tutorial translations): shipped** (`bebce1e`). es/ja/pt/zh-CN,
  parity allowlist shrunk, i18n ratchet bumped 130 to 136 KiB (recorded).
- **Phase 5 (v2.3.0 cut): shipped and live** (see above).
- **Phase 6 (launch content): drafts done** in `docs/launch/` (devlog,
  description refresh, social copy; prose-checklist clean). Posting is
  Matt's, and waits on Phase 3 per the plan dependency.
- **Phase 7 (telemetry): baseline recorded** in the plan. client_error
  baseline ZERO; renderer_fallback flowing with correct shape; idle tail
  quiet. Hard stop 3 clear.

Also done: Dependabot 28 (shell-quote, critical, dev-scope) closed via
npm override to 1.8.4; stray wrangler processes killed (the
`../sds-p2-backpressure` worktree husk may now delete cleanly; one
`worker/` subdir was still busy at last attempt).

## Open Carryover

- Phase 3 hardware (planned 2026-06-10): Matt's phone on live, or hub
  power for tablet ADB, or BrowserStack creds for Codex's
  `tests/browserstack/` iOS spec.
- Phase 6 posting (Matt), gated on Phase 3.
- Q4 staging provisioning (three operator steps; workflow ships dormant,
  optional).
- Cycle 85 + 86 closure ritual (`/cycle-close`) once the above land.
- Post-launch: re-tail worker logs during live MP traffic for the loaded
  tick-health baseline; egress lever decision (plan Q2) only if CF costs
  surface; pre-hardening locale allowlist entries (pt sandbox.* etc.).
- Wrangler-action Node 20 deprecation warning in deploy workflow (forced
  Node 24 on 2026-06-16; check for a wrangler-action update before then).

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
| Open prior cycle (one item) | [`docs/cycle-85-plan.md`](docs/cycle-85-plan.md) |
| Fence-review dossiers | [`docs/hardening/review-dossiers-2026-06-09.md`](docs/hardening/review-dossiers-2026-06-09.md) |
| Launch drafts (Matt to post) | [`docs/launch/`](docs/launch/) |
| Release log | [`CHANGELOG.md`](CHANGELOG.md) |
| Chaos rejoin proof | `tools/loadtest/chaos-results-rejoinfix-2026-06-09.json` |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
