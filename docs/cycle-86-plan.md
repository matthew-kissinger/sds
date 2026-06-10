# Cycle 86 - v2.3.0 Launch

> Drafted 2026-06-09 after the hardening program (docs/hardening/, 42 tasks,
> all five gates PASSED, deployed live in run 27242005458). Cycle 85
> (v2.2.12, shipped live) remains OPEN with one acceptance item: the real
> mobile proof. This cycle absorbs that item as Phase 3; Cycle 85 closes
> when Phase 3 passes (see Phase 1 step 3). Cold-start agents: read
> [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc
> top-to-bottom.

## Goal

Turn the hardening program into a player-visible release and point traffic at
it. Before: the game gained a tutorial, achievements, gamepad support, share
surfaces, faster loads, and a load-tested multiplayer backend, all silently,
under patch number 2.2.12. After: the review debt from the autonomous run is
cleared, the two known worker bugs are fixed, a real phone has played the
first session cleanly, v2.3.0 is tagged and live with a CHANGELOG that tells
the story, and launch content in Matt's voice is posted (itch devlog, store
description refresh). The cycle ends when traffic has a reason to arrive and
the telemetry to learn from it is confirmed flowing.

## How to read this plan

This doc fixes the shape of the changes, not the implementation choices.
Each agent picking up a phase should research the specific sub-problem
before writing code, measure on the actual targets (RTX 3070 desktop,
Matt's phone, BrowserStack iOS), and pick the simplest thing that meets the
budget.

## Open questions to resolve before writing code

1. **Q1: Tag v2.3.0 before or after the launch content is ready?** Author
   lean: tag and deploy first (Phase 5), post within a day (Phase 6). The
   release is real either way; the devlog links a live version.
2. **Q2: Pull the round-start egress lever (fixed-point encoding) this
   cycle?** Author lean: no. The delta path is never worse than baseline by
   construction; savings already land where rounds spend most of their time.
   Revisit only if Cloudflare egress costs surface post-launch. Recorded in
   `docs/hardening/delta-protocol-design.md` Deviations.
3. **Q3: Steam readiness checklist this cycle?** Author lean: out of scope.
   Launch on the web first, learn from traffic, then scope Steam as its own
   cycle using `docs/native-store-steam-readiness-checklist.md`.
4. **Q4: Activate per-PR staging this cycle?** Author lean: only if Matt
   provisions the preview D1 during Phase 1 (three operator steps, recorded
   in `docs/hardening/phase-2-scale-backend.md` [P2-STAGING]). Otherwise the
   workflow stays dormant and harmless.

## Phase 1 - Review debt + cycle hygiene (PAIRED, ~2hr)

**Independently testable.** Matt's eyes are the deliverable; nothing else in
the cycle should ship ahead of this.

1. **Walk the fence reviews** listed in
   [`hardening/ORCHESTRATION.md`](hardening/ORCHESTRATION.md) Post-run review
   items: the delta protocol design + impl
   ([`hardening/delta-protocol-design.md`](hardening/delta-protocol-design.md)),
   the P0-DETBUG tie-break sim change (commit `e420ee6`), the
   GameStateValidation split + BoundaryCollision DRY (commits `2d34a2b`),
   and the `.claude/rules/multiplayer.md` rewrite. Claude summarizes each
   diff; Matt accepts or flags.
2. **Check the sign-off boxes** in the hardening phase docs as each review
   passes (the boxes were left honestly unchecked by the autonomous run).
3. **Cycle 85 closure is deferred to Phase 3.** Per Matt's handoff
   contract, Cycle 85 does not close without the real mobile proof; that
   proof IS Phase 3 of this cycle. When Phase 3 passes, archive
   `docs/cycle-85-plan.md` to `docs/archive/cycles/` and append its
   [`BACKLOG.md`](BACKLOG.md) entry (shipped v2.2.12: entrance Play
   hardening, parallel day-loop boot wiring, SW cache ownership, mobile
   coastline terrain).
4. **Optional (Q4)**: Matt provisions the preview D1 (`wrangler d1 create
   sds-db-preview`, set repo var `CF_PREVIEW_D1_ID`, `wrangler secret put
   JWT_SECRET --env preview`).

**Acceptance (EARS):**

- When Phase 1 ships, then every fence-review checkbox in
  `docs/hardening/` shall be checked or carry a written flag from Matt.
- When Phase 3 passes its real-device checklist, then
  `docs/cycle-85-plan.md` shall exist only under `docs/archive/cycles/`
  and `docs/BACKLOG.md` shall contain a Cycle 85 entry.

## Phase 2 - Worker fixes from chaos findings (autonomous, ~3hr)

**Depends on:** Phase 1 (the delta/backpressure review may adjust scope).

1. **Full-room rehydration lockout.** After a DO eviction, a room that
   rehydrates full refuses ALL rejoins with 409 until the 60s idle alarm
   fires, locking out the very players whose identities are in the persisted
   players map. Fix: a rejoin that re-proves a persisted identity
   (persistent_id + auth_secret already in the players map) is a
   reconnection, not a new join; it must not count against the room-full
   check. Evidence + repro shape in
   [`hardening/phase-4-polish-launch.md`](hardening/phase-4-polish-launch.md)
   [P4-CHAOS] and `tools/loadtest/chaos-results-2026-06-09.json`.
2. **`host_migration.reclaimedByOriginal` always logs true** (cosmetic log
   bug, same file region).
3. **Crash-beacon stack cap.** `/api/event` truncates every string prop to
   256 chars, so the 4 KB crash stacks from P0-CRASH persist truncated.
   Raise the cap for the `stack` key (~4096) and the propsJson cap (~8192),
   and fix the truncate-mid-string invalid-JSON edge noted in
   [`hardening/phase-0-foundation.md`](hardening/phase-0-foundation.md)
   [P0-CRASH]. Worker-side only; the client already sends correctly.
4. Extend `tests/worker/backpressure.spec.ts` patterns + the chaos harness
   checks for the rejoin fix; rerun `tools/loadtest/chaos.mjs` to prove C3
   rooms accept persisted-identity rejoins when full.

**Acceptance (EARS):**

- When a persisted-identity client rejoins a full rehydrated room, then the
  DO shall accept the reconnection (no 409), proven by a chaos-harness
  check.
- When host migration logs, then `reclaimedByOriginal` shall reflect the
  actual reclaim state, asserted by a unit test.
- When a `client_error` event with a 4,096-char stack posts to
  `/api/event`, then the stored D1 row shall retain at least 4,000 stack
  chars and remain valid JSON.
- When `npm test` runs, then all suites shall pass with sim-baselines
  byte-identical.

**Shipped 2026-06-09.** All three fixes plus a fourth from the Phase 1
review: (1) full-room rehydration rejoin - a join re-proving a persisted
identity (the router passes the JWT-verified `persistent_id`, never a
client claim) reclaims its stale slot, exempt from room-full; new joiners
still 409 (`worker/src/RoomDO.ts` join path). (2) `reclaimedByOriginal`
computed before the host re-pin. (3) `/api/event` caps moved to raw-string
truncation in `worker/src/eventProps.ts` (stack 4096, others 256,
propsJson 8192, surrogate-safe, always-valid JSON). (4) Review F1: unicast
keyframes (bind + requestKeyframe) now send the retained basis snapshot
(`getBasisKeyframeState`), so a recovering client's next broadcast delta
chains directly; plus F10 log msgType. Proof: 279/279 worker+delta specs
(new `rejoin-rehydration.spec.ts` 8, `event-props-cap.spec.ts` 9, three F1
regression tests in `delta-broadcast.spec.ts`), `npx tsc -p worker` clean,
chaos harness extended and rerun quiet: **32/32 PASS**
(`tools/loadtest/chaos-results-rejoinfix-2026-06-09.json` - C4 full
rehydrated room accepts all 4 persisted-identity rejoins, capacity held,
stranger still 409s, no phantoms, 0 desyncs, 0 decode errors).

## Phase 3 - Real-device mobile pass (PAIRED, ~2hr)

**Depends on:** nothing (can run parallel to Phase 2).

The standing Cycle 84/85 carryover: the live mobile WebGPU proof has only
run emulated. Matt drives his actual phone; Claude preps the checklist.

1. On Matt's phone (Chrome, live sheepdogsim.com): first Play lands on
   Newsheepdogland WebGPU (no `renderer=webgl`, no `fallbackReason`), the
   tutorial offer shows on a fresh profile, dog spawns on land, pause and
   return to menu works, second Play works.
2. Run Codex's BrowserStack iOS first-session spec
   (`tests/browserstack/newsheepdogland-first-session.spec.ts`) against
   live; record pass or the precise blocker.
3. Record results in this plan and NEXT_SESSION. If the phone pass fails,
   the failure becomes a Phase 2-style fix item and Phase 6 (launch post)
   blocks on it (see Hard stops).

**Acceptance (EARS):**

- When Phase 3 ships, then this plan shall contain a dated real-device
  result block naming the phone model, the effective renderer, and
  pass/fail per checklist item.
- If the real-device pass fails on a first-session blocker, then Phase 6
  shall not start until the blocker is fixed and re-proven.

**Status 2026-06-09: BLOCKED on hardware access (not failed).** Probed
during the autonomous cycle run: hub (192.168.1.218) unreachable, phone
(192.168.1.133) and tablet (192.168.1.230) refuse SSH on 8022 and ADB on
5555, no BrowserStack credentials in `~/.config/mk-agent/env` (Browserbase
is cloud Chromium, not real devices). Every route to real hardware needs
Matt: phone in hand on live sheepdogsim.com, or power the hub for tablet
ADB, or provision BrowserStack creds for Codex's iOS spec. Cycle 85 stays
open per the handoff contract. Checklist for the phone session, ready to
run: (1) fresh profile or cleared site data; (2) first Play lands on
Newsheepdogland WebGPU (`?debug=1` overlay or remote devtools confirms no
`renderer=webgl`, no `fallbackReason`); (3) tutorial offer shows; (4) dog
spawns on land; (5) pause, Main Menu, second Play works; (6) no
stale-cache behavior after the v2.3.0 deploy (SW update toast or fresh
bundle hash).

## Phase 4 - Tutorial translations (autonomous, ~2hr)

**Depends on:** nothing (parallel-safe).

The `tutorial.*` keys ship en-only behind the parity allowlist (deferred
from the hardening program's P1-TUTORIAL).

1. Translate `tutorial.*` into es/ja/pt/zh-CN following the locale file
   conventions; shrink the allowlist in `tests/ui/locale.parity.spec.ts`
   accordingly.
2. Sweep for any other allowlisted keys added during the hardening program
   and translate those too if small.

**Acceptance (EARS):**

- When `npm test` runs, then the locale parity spec shall pass with zero
  `tutorial.*` entries in its allowlist.

## Phase 5 - Cut v2.3.0 (autonomous, ~2hr)

**Depends on:** Phases 1-4 (release includes their fixes).

Version bumps are explicit per project rules; this phase IS the explicit
authorization.

1. Bump `package.json` to 2.3.0; write the CHANGELOG entry telling the
   release story (first-run tutorial, achievements, key + gamepad
   rebinding, colorblind mode, share and invite links, faster first load,
   multiplayer bandwidth and resilience work, crash reporting). Prose rule
   applies: no em-dashes, no exclamation marks, concrete numbers.
2. Tag `v2.3.0`, push, watch the deploy green (Test, E2E, migrate, Worker,
   Pages).
3. Live proof: new bundle hash served, worker healthy, tutorial offer on a
   fresh profile, achievements panel reachable, version surfaced wherever
   the app shows it.

**Acceptance (EARS):**

- When the release commit lands on `main`, then the GitHub Deploy run shall
  pass all jobs and `sheepdogsim.com` shall serve the v2.3.0 bundle.
- When `CHANGELOG.md` gains the 2.3.0 entry, then `grep -c` for em-dashes
  in the new entry shall return 0.

## Phase 6 - Launch content (PAIRED, ~3hr)

**Depends on:** Phase 5 (links a live release), Phase 3 (mobile pass green).

Matt's voice; Claude drafts, Matt edits and posts. Nothing auto-publishes.

1. **Itch devlog draft**: the v2.3.0 story per
   [`.claude/rules/prose-and-voice.md`](../.claude/rules/prose-and-voice.md)
   (ALL-CAPS headers, concrete numbers, one pasture and three islands, four
   biomes).
2. **Store description refresh** (itch + sheepdogsim.com seo-content) where
   the new features earn a mention: tutorial, achievements, gamepad.
3. **Share/social copy** for wherever Matt posts (his call where).
4. Pre-ship checklist from the prose rule runs on every artifact.

**Acceptance (EARS):**

- When Phase 6 ships, then drafts shall exist for the devlog and
  description refresh, each passing the prose-rule grep checklist, and
  Matt shall have posted or explicitly deferred each one.

## Phase 7 - Telemetry confirmation (autonomous, ~1hr, optional)

**Depends on:** Phase 5 live.

1. Query D1 (read-only) for the new event families arriving from production:
   `client_error`, `renderer_fallback`, `context_lost`,
   `konveyor_material_degraded`. Confirm rows flow and shapes match.
2. Spot-check Worker structured logs (wrangler tail, a few minutes) for
   `tick_overrun` / `tick_health_degraded` noise levels at real traffic.
3. Record a baseline snapshot in this plan so the post-launch cycle can
   compare.

**Acceptance (EARS):**

- When Phase 7 ships, then this plan shall contain a dated table of event
  counts by family from production D1.

## Dependencies

```
Phase 1 (paired) -> Phase 2
Phase 3 (paired) + Phase 4 run parallel to Phase 2
Phases 1-4 -> Phase 5 -> Phase 6 (paired, also gated by Phase 3)
Phase 5 -> Phase 7 (optional)
```

## Frozen files (cycle-specific additions)

- `worker/src/RoomDO.ts` join/rejoin path: Phase 2 item 1 is the explicit
  authorization; the fix must not change the wire protocol or the
  room-full semantics for genuinely new joiners.
- No `shared/` edits are authorized this cycle. Sim-baselines stay
  byte-identical.

## Hard stops

1. If the Phase 3 real-device pass fails on a first-session blocker, then
   Phase 6 does not start until it is fixed and re-proven on device.
2. If the v2.3.0 deploy goes red, fixing it preempts all other phases.
3. If post-release telemetry (Phase 7) shows a crash spike
   (`client_error` materially above zero baseline), pause launch posting
   and triage first.

## What NOT to do during this cycle

- No fixed-point wire encoding or calm/settle sim change (Q2: deferred).
- No Steam packaging work (Q3: next cycle, informed by traffic).
- No new gameplay/content scope; this cycle ships what exists.
- No auto-posting anywhere; Matt publishes every player-facing artifact.
- Do not regenerate sim-baseline fixtures for any reason.

## Success criteria (cycle close)

- [ ] When the cycle closes, all phases shall be shipped or explicitly
      deferred to `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be
      clean.
- [ ] When the close commit lands on `main`, the sheepdogsim.com deploy
      shall succeed via GH Actions.
- [ ] When the cycle closes, every hardening fence-review box shall be
      checked or flagged, and `docs/cycle-85-plan.md` shall be archived.
- [ ] When the cycle closes, v2.3.0 shall be live with its CHANGELOG entry
      and the devlog posted or explicitly deferred by Matt.
- [ ] When the cycle closes, the full-room rehydration rejoin fix shall be
      proven by a rerun chaos check.

## References

- [`docs/hardening/ORCHESTRATION.md`](hardening/ORCHESTRATION.md) - the
  completed program + post-run review items this cycle clears
- [`docs/hardening/delta-protocol-design.md`](hardening/delta-protocol-design.md)
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md), [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md),
  [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md), [`docs/BACKLOG.md`](BACKLOG.md)
