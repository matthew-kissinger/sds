# Hardening & Ship Program - Orchestrator Runbook

> **Created:** 2026-06-09
> **Source:** External consultation spec, scaffolded for autonomous orchestration.
> **Status:** COMPLETE 2026-06-09. All five phase gates PASSED (42 tasks;
> two recorded acceptance caveats). Executed autonomously under /goal; see
> "Post-run review items" below for what Matt still owes a look.

## Post-run review items (Matt)

1. ~~FENCE post-hoc reviews owed~~ RESOLVED 2026-06-09 (Cycle 86 Phase 1):
   adversarial dossiers at
   [`review-dossiers-2026-06-09.md`](review-dossiers-2026-06-09.md), the
   F1 finding fixed in Cycle 86 Phase 2, and **Matt signed off in-session**
   on the delta design and the egress deviation.
2. ~~Egress caveat~~ SIGNED OFF by Matt 2026-06-09: progress-scaled
   savings accepted (>=50% holds from ~65% round progress; never worse
   than baseline by construction). Levers stay deferred per Cycle 86 plan
   Q2: fixed-point encoding or a calm/settle sim change, only if
   Cloudflare egress costs surface post-launch.
3. ~~Operator TODOs for staging: create the preview D1, set repo var
   CF_PREVIEW_D1_ID, wrangler secret put JWT_SECRET --env preview
   ([phase-2 P2-STAGING](phase-2-scale-backend.md)).~~ Resolved 2026-06-26:
   preview D1 `sds-db-preview` (`6d5b0fce-952f-4d94-8936-b51fc559496c`)
   exists, `CF_PREVIEW_D1_ID` is set, preview `JWT_SECRET` exists, all
   migrations are applied, and `sds-worker-preview` is live.
4. Worker findings from chaos validation (diagnosed, not fixed):
   full-room rehydration 409 lockout until the 60s idle alarm;
   host_migration.reclaimedByOriginal always logs true
   ([phase-4 P4-CHAOS](phase-4-polish-launch.md)).
5. ~~Nothing was pushed to origin.~~ Resolved 2026-06-09: Matt authorized
   the ship ("did you commit push and deploy"); merge `ccc0d7b` pushed,
   Deploy run 27242005458 all green (Test, E2E, Migrate 0010, Worker,
   Pages), live bundle verified carrying the delta client.

This directory is the single source of truth for the hardening program. It is a
multi-cycle body of work and sits alongside (not inside) the numbered cycle
plans. The orchestrator works through phases strictly in order; within a phase
it dispatches any task whose deps are satisfied, in parallel.

## Phase index

| Phase | File | Theme | Task count |
|---|---|---|---|
| 0 | [phase-0-foundation.md](phase-0-foundation.md) | Foundation & safety net | 7 |
| 1 | [phase-1-ship-blockers.md](phase-1-ship-blockers.md) | Player-facing ship blockers | 9 |
| 2 | [phase-2-scale-backend.md](phase-2-scale-backend.md) | Scale, cost & backend robustness | 9 |
| 3 | [phase-3-retention-maintainability.md](phase-3-retention-maintainability.md) | Retention & maintainability | 9 |
| 4 | [phase-4-polish-launch.md](phase-4-polish-launch.md) | Final polish & pre-launch validation | 8 |

## Dispatch rules

1. **Cross-phase ordering is strictly sequential.** Do not start a phase until
   the previous phase's gate is green.
2. **Within a phase, a task is ready when all its `Deps` are `done`.** Dispatch
   all ready tasks concurrently. Each task is sized at <= ~4h of focused work;
   if one grows past that, split it and record the split in the task block.
3. **Update the task block as you go.** Each task has a `Status:` line
   (`pending | in-progress | blocked | done`) and a checkbox per acceptance
   line. Check acceptance lines only when verified, not when code lands.
4. **Phase gate:** every phase ends with `npm test && npm run build` green plus
   that phase's named acceptance lines verified. Record the gate result in the
   phase file's Gate section before moving on.
5. **Staff long poles first.** Critical path: P0-DETBUG, then P1-TUTORIAL, then
   P2-DELTA-DESIGN -> P2-DELTA-IMPL -> P2-DELTA-CLIENT, then the Phase 3
   refactors, then P4-LOADTEST -> P4-CHAOS.

## Fence protocol ([FENCE] tasks)

Tasks marked `[FENCE]` touch a frozen file per
[docs/INTERFACE_FENCE.md](../INTERFACE_FENCE.md) or the wire protocol. They are
**never auto-merged**:

- The task's migration story must be written in the task block before
  implementation starts (file, why, alternative considered, consumer updates).
- Wire-protocol changes additionally satisfy the four-point rule in
  [.claude/rules/multiplayer.md](../../.claude/rules/multiplayer.md): named
  change, in-flight-session migration story, full consumer list, explicit
  version-tag acceptance line.
- The orchestrator stops, surfaces the prepared change to Matt, and waits for
  explicit sign-off before merging. Mark the task `blocked` while waiting.

Fence tasks in this program: P0-DETBUG, P2-DELTA-DESIGN, P2-DELTA-IMPL,
P2-DELTA-CLIENT, P2-DOSPILL, P3-GSV-SPLIT, P3-BOUNDARY-DRY.

## Sim-baseline discipline

Per [.claude/rules/shared-sim.md](../../.claude/rules/shared-sim.md):
`tests/sim-baseline/` traces stay byte-identical unless the task explicitly
authorizes regeneration with the decision recorded in the task block and the
fixture regenerated in the same PR. In this program only P0-DETBUG authorizes a
regeneration; P2-DOSPILL, P3-GSV-SPLIT, and P3-BOUNDARY-DRY explicitly require
byte-identical traces (they are pure perf/structure changes).

## Other standing constraints

- File and line references in task blocks were captured at spec time
  (2026-06-09). Verify each against the current tree before editing; line
  numbers drift.
- Player-facing or doc prose follows
  [.claude/rules/prose-and-voice.md](../../.claude/rules/prose-and-voice.md):
  no em-dashes, no exclamation marks, no emoji, accurate one-pasture
  three-islands framing.
- Browser probes follow the hygiene rules in
  [.claude/rules/scene-and-render.md](../../.claude/rules/scene-and-render.md):
  `SDS_SUPPRESS_BROWSER_OPEN=1`, close every page/listener after the probe.
- Do not bump the player-visible version or post marketing content. Releases
  are Matt's call.
- Cycle 85 (`docs/cycle-85-plan.md`, Newsheepdogland entrance readiness) may
  have uncommitted work in the tree. Check `git status` before starting; do
  not revert or absorb its changes. If the working tree is dirty with
  cycle-85 work, surface to Matt before Phase 0 begins.

## Status legend

Each task block:

```
Status: pending | in-progress | blocked | done
```

`blocked` always carries a one-line reason (usually a fence sign-off wait or a
failed dep). The orchestrator's progress report is the set of phase files
themselves; keep them current rather than maintaining a separate tracker.
