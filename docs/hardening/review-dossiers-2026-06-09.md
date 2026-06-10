# Fence review dossiers - 2026-06-09 (Cycle 86 Phase 1)

> Post-hoc adversarial reviews of the four fence items executed under the
> hardening program's autonomous directive. Each review was performed by an
> independent read-only agent against the deployed code on main, under
> Matt's "complete the next cycle" directive. Matt's own flag/accept pass
> remains available on top of these; the sign-off boxes in the phase docs
> point here.

## Verdict table

| Item | Verdict | Actioned in Cycle 86 |
|---|---|---|
| Delta protocol design doc | accept-with-flags | F1 fix (Phase 2), F4 wording fix |
| Delta server impl (d20d775) | accept-with-flags | F10 log fix (Phase 2) |
| Delta client impl (0e992f9) | accept | none needed |
| Backpressure eviction (3f4f385) | accept | none needed |
| P0-DETBUG tie-break (e420ee6) | accept-with-flags | flags hygiene-only, no action |
| GSV split + BoundaryCollision DRY (2d34a2b) | accept-with-flags | fence-list gap closed (INTERFACE_FENCE.md + shared-sim.md) |
| multiplayer.md rewrite (b638e72) | accept | none needed |

## Delta wire protocol v3 (design + d20d775 + 0e992f9 + 3f4f385)

Four-point wire-protocol fence rule satisfied and verified in code, not
just in the doc: per-client soft-degrade works (stored, coerced, persisted,
rehydrate-as-legacy; SURVIVAL_MIN stays 2 with a v3-joins test), the
determinism boundary is clean (only `shared/protocol.js` constants changed,
sim-baselines untouched), client reconstruction is exact (fresh-array,
`Object.is`-faithful, gap-detected with cooldown), and backpressure
eviction (256KB / ~4s) routes through the normal grace/host-migration path
with correct skip-and-recover semantics.

Findings:

- **F1 (medium, FIXED in Cycle 86 Phase 2):** unicast keyframes (bind and
  requestKeyframe) were built from `lastGameState`, which the 60Hz sim
  advances independently of the broadcast-loop diff basis, so the design
  doc section 4 consistency note ("a client that keyframes at tick T can
  apply the broadcast delta for T+1 directly") was false roughly half the
  time. A recovering client could enter a discard-deltas loop freezing its
  MP state ingestion for up to ~1s per recovery, occasionally repeated.
  Bounded by the 60-tick cadence keyframe; never an undetected desync (the
  exact baseTick equality guard always catches the mismatch). Fix:
  basis-aligned unicast keyframes + regression test.
- **F4 (low):** legacy-cohort frames carry `v: 3`, so "byte-compatible
  with v2 except the additive tick field" was imprecise. No client reads
  frame-level `v`. Rule-file wording corrected.
- **F5 (low, recorded):** `tests/integration/coop-survival.spec.ts` and
  `tests/integration/helpers/wsClient.ts` were starred as consumers in the
  design's section 10 but never edited. coop-survival joins as v3 and now
  samples ~1Hz keyframes instead of 60Hz full frames; still passes, but
  its predicate windows sample 60x less often. Live-protocol coverage
  exists outside CI via the delta-aware loadtest/chaos clients.
- **F6 (low, recorded):** unicast keyframe replies bypass the
  backpressure skip; bounded by the 2/s cap and the eviction horizon.
- **F7 (recorded):** round-start egress gate failure honestly recorded in
  the design doc Deviations section; >= 50% savings hold from ~65% round
  progress (43.4% at the asserted 140/200-retired scenario), never worse
  than baseline by construction. Levers deferred per cycle-86 plan Q2.
- **F10 (cosmetic, FIXED in Cycle 86 Phase 2):** `ws_broadcast_failed`
  log hardcoded `msgType: 'gameStateUpdate'` for delta frames.

Coverage gaps recorded: no test for the unicast-keyframe-then-delta
sequence (closed by the F1 regression test); mixed-cohort room covered by
socket-stub unit tests + non-CI loadtest/chaos only; backpressure CI
coverage uses stub sockets (chaos run covers real sockets live).

## P0-DETBUG tie-break (e420ee6)

Genuine determinism bugfix confined to the competitive winner tie-break:
two `Object.keys().find()` call sites gain `.sort()`, making tied max
scores resolve to the lexicographically lowest playerId on both the Worker
DO and the client predictor. Default string sort is spec-pinned across
engines; no trig, no Math.random, no for...in. No pre-existing sim-baseline
fixture regenerated; companion de3ff20 added a net-additive competitive
fixture + 13 unit tests pinning the fix (14/14 pass, re-run at review).
Migration story correctly characterizes in-flight MP exposure as transient
cosmetic misprediction reconciled by the authoritative broadcast. Flags:
transient CRLF flip on the file header (normalized by 2d34a2b), and
pre-merge sign-off deferred to this review per the autonomous directive.

## GSV split + BoundaryCollision DRY (2d34a2b)

Independent mechanical verification (normalized line-multiset diff of the
old 1,009-line file vs the five new modules) confirms the split is a pure
move: only import/re-export lines differ. The DRY'd `rectBoundarySteer`
preserves the float sequence position-for-position; all three sites'
historical differences (config defaults, the hardcoded 1.5 multiplier,
gate carve-outs) are parameterized at call sites with comparison-only
suppress predicates at their original branch positions. No sim-baseline
fixture touched; import discipline clean (no js/ or worker/ imports).
Flags: the four new modules were absent from `docs/INTERFACE_FENCE.md`
and `.claude/rules/shared-sim.md` (**closed 2026-06-09**, same-day edit
adding SpawnLogic/GameProgress/CompetitiveLayout/CompetitiveMode to both);
the 600k-pair fuzz harness was throwaway (claim not re-runnable, mitigated
by the mechanical verification above); sign-off deferred to this review.

## multiplayer.md rewrite (b638e72)

Factually accurate against deployed code; every checkable claim verified
at source (PROTOCOL_VERSION 3, SURVIVAL_MIN 2, KEYFRAME_INTERVAL_TICKS 60,
0.85 degenerate fraction, delta frame shape, 256KB/~4s/close-1013
backpressure, 2/s requestKeyframe cap, named function/file locations, ship
commits, measured numbers). Only nit: the conventional "60Hz" label for
the 16ms broadcast interval, which predates the rewrite. Accept without
conditions.
