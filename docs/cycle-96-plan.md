# Cycle 96 — visual-queue-and-polish

> Adopted 2026-06-14 from the authored `cycle-93` draft after Cycle 95 closed. The "93" number was authored ahead and skipped (94 and 95 ran first), so this content lands at the live number, 96. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top to bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Two cycles of heavy render work (91: tree remake, canopy shadows, ground noise; 92: frame floor fix, pill removal, trunk-split fix) shipped faster than Matt could review them, and a queue of approval-gated polish piled up behind that review: the golden visual baselines are stale since 2026-05-16, KTX2 and the rock re-bake are parked "pending visual approval", and the NSL perf win has no regression rail guarding it. This cycle drains that queue: one paired review session makes the gating decisions, then the autonomous phases land everything those decisions unlock - golden re-capture, three r185, an NSL jitter rail at the new floor, rock re-bake behind a collider-parity harness, KTX2, and repo housekeeping. Before: shipped-but-unreviewed visuals, stale baselines, unguarded perf floor. After: Matt has signed off on the current look, every baseline matches it, the floor cannot silently regress, and the deferred asset polish is in or explicitly out.

## Execution mode this cycle (the re-scope)

Matt opened this cycle with "complete autonomously". The cycle is paired-gated by design: Phase 1 is a paired decision gate that everything downstream depends on ("nothing autonomous starts until those decisions are recorded"), and Phase 8 is paired launch (Matt's voice and hands). So the autonomous run lands the slice that needs no gate, and the rest waits for one paired session - which also absorbs Matt's still-open Cycle 95 prod validation (the NSL look he is verifying on the live build feeds the Phase 1 look-approval call).

| Phase | Mode this cycle | Status at the autonomous handoff |
|---|---|---|
| 1 Paired visual review + decision gate | PAIRED | Awaits Matt. Prep pack assembled in `cycle96-validation/`. |
| 2 Golden re-capture | Gated on Phase 1 approval (Hard stop 1) | Held. |
| 3 three r185 | Upstream-blocked + gated on Phase 2 | Held. r185 is not on npm (latest `0.184.0` as of 2026-06-14). |
| 4 NSL jitter rail | AUTONOMOUS (budgeted against shipped r184) | Ran this cycle. |
| 5 Rock re-bake | Harness AUTONOMOUS; re-bake gated on Phase 1 direction | Harness ran. Re-bake held. |
| 6 KTX2 | Gated on Phase 1 go + Phase 2 | Held. |
| 7 Housekeeping | Doc-freshness AUTONOMOUS; trailer disposition gated on Phase 1 | Doc sweep ran. Trailer held. |
| 8 Launch + device pass | PAIRED (Matt's voice + hands) | Held. No version bump, no posting. |

## How to read this plan

This doc fixes the *shape* of the changes (decision gates, where new code slots in, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code (r185 release notes when it ships, KTX2/basisu encoder state, meshopt recipes).
- **Measure on the actual hardware target** (RTX 3070 desktop). The jitter probe is the instrument of record; idle-camera numbers never gate. Perf gates use the bracketed control/gate/control protocol from Cycle 92 (`cycle92-validation/bracketed-gate.mjs` is the reference runner).
- **Pick the simplest thing that meets the budget** rather than the most impressive.

## Open questions to resolve before writing code

1. **Q1: Does Newsheepdogland become the default entrance world now that the pill is off?** Author lean: not yet - Rolling Hills loads in ~2.3s and reads instantly; NSL is a 14s cold load at 20Mbps and a survival-mode pitch. Promote it after the look is approved and the load story improves, not as a side effect of the pill. Matt decides in Phase 1; either way the decision lands in `DECISIONS.md`.
2. **Q2: Does three r185 fix the shadow override `alphaTest` version churn upstream?** Moot for now: r185 is **not published** (npm latest is `0.184.0` as of 2026-06-14), so Phase 3 cannot start. Our instance-level fix (`js/rendering/shadowOverrideMaterialFix.js`) stays regardless. Re-open Q2 against the r185 changelog when it ships.
3. **Q3: Take the vite 8 / @vitejs/plugin-react 6 majors this cycle?** Author lean: no - and measured (2026-06-11 dep-drift pass): vite 8 (rolldown) needs function-form `manualChunks` and re-chunks the bundle with ~160 KiB more raw JS (three 604 -> 697, ui 127 -> 176, other 551 -> 652 KiB; main 538), failing the ratchet on three budgets; `vite-plugin-static-copy` 4 changes copy semantics and needs a 12-target migration. Both majors are deliberately held at `^7.3.5` / `^5.2.0` / `^3.4.0`; a future migration cycle owns the re-chunk decision. Minors + sharp 0.35 were taken (commit `3d07f621`).

## Architecture / shared changes

None. No `shared/` edits this cycle (no phase carries the sim-change ritual). The r185 bump (Phase 3, when it ships) touches the render dependency only; sim-baselines must stay byte-identical through it.

## Phase shape rules

A cycle has **≤ 8 phases**. Each phase is either **fully autonomous** or **fully paired** - no mixed mode. Phase 1 and Phase 8 are paired; Phases 2-7 are fully autonomous once Phase 1's decisions are recorded. The autonomous-now subset (Phase 4, the Phase 5 harness, the Phase 7 doc sweep) needs no Phase 1 decision and ran ahead of the paired session.

## Acceptance criteria — EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/): `When [trigger], the [system] shall [response].` / `While [precondition]...` / `If [unwanted], then...`. Each line is grep-testable.

## Phase 1 — Paired visual review + decision gate (~1hr, PAIRED)

**Independently testable.** Everything downstream is gated on these decisions; nothing autonomous starts until they're recorded. The autonomous run has assembled the prep pack (`cycle96-validation/phase1-prep.md`) per the media-prep pattern so this session is short.

Agenda:

1. **Review the shipped look**: Cycle 91 surveys (`cycle91-validation/asset-survey/`, `lighting-survey/`), Cycle 92 trunk-split A/B (`cycle92-validation/impostor-ab.png`), and the live pill-less NSL on sheepdogsim.com (now carrying the Cycle 95 fixes - this review folds in Matt's open Cycle 95 prod validation of A/B/C/E/D/F).
2. **Decisions to record** (each one line in `DECISIONS.md`): (a) current look approved as the golden baseline, or itemized rejections; (b) Q1 NSL-as-default verdict (if yes, flip `DEFAULT_WORLD_INDEX`/`DEFAULT_SCENE_ID` + specs live in the session, paired); (c) rock re-bake direction and KTX2 go/no-go; (d) `tools/trailer/` disposition - finish it, commit it as-is, or drop it; (e) appetite for the P8 lighting items (if wanted, they become a future survey-gated cycle, not phases here).

**Acceptance (EARS):**

- [ ] When Phase 1 completes, `DECISIONS.md` shall record the look-approval verdict, the default-world verdict, the rock/KTX2 verdicts, and the trailer-toolkit disposition, each dated 2026-06-14 or later.
- [ ] If Matt rejects any visual element, then the rejection shall be itemized in this plan's Phase 2 scope before any golden re-capture runs.

## Phase 2 — Golden visual baseline re-capture (~3hr)

**Depends on:** Phase 1 look approval. The golden suite is stale since 2026-05-16; every scene's trees changed intentionally in Cycle 91 and the impostor trunks in Cycle 92.

1. **Re-capture** the golden suite for all four scenes at the pinned camera/ToD configurations; re-pin perceptual-diff baselines.
2. **Verify** the suite passes green twice consecutively on the new baselines (flake check).
3. **Record** the re-pin in the goldens' manifest with the approving decision's date.

**Acceptance (EARS):**

- [ ] When Phase 2 ships, the golden suite shall pass on freshly captured baselines dated this cycle.
- [ ] When Phase 2 ships, two consecutive golden runs shall both pass (no flake).
- [ ] If any golden diff exposes an unapproved visual change, then the capture shall halt and the diff shall surface to Matt before re-pinning.

## Phase 3 — three r185 adoption (~3hr)

**BLOCKED UPSTREAM as of 2026-06-14:** three r185 is not yet on npm (latest is `0.184.0`). This phase cannot start until r185 publishes. **Also depends on** Phase 2 (goldens must be fresh so the bump's visual diff is attributable). Carryover from Cycle 91 (#33730 fix). The checklist below is what to run when r185 lands.

1. **Read the r185 changelog** for the #33730 fix, the shadow override material behavior (Q2), and any WebGPU/TSL breaking changes touching our node materials, compute-cull, or terrain shader.
2. **Bump and battery**: `npm i three@0.185`, full vitest, field rail, a 5-run driven NSL battery vs a same-window control on r184 (bracketed protocol), golden suite, and the NSL rail from Phase 4.
3. **Re-evaluate the churn fix**: instrument one run with `--heapProfile=1`; record whether `getMaterialCacheKey` churn returns with the fix disabled (i.e. whether r185 fixed it upstream). The fix stays shipped either way.

**Acceptance (EARS):**

- [ ] When Phase 3 ships, `npm test` shall pass on three r185 with sim-baseline fixtures byte-identical.
- [ ] When Phase 3 ships, the field rail, the NSL rail, and the golden suite shall pass on r185.
- [ ] When Phase 3 ships, a same-window NSL battery on r185 shall show mean 1%-low within 10% of the r184 control, with the heap-profile verdict on the upstream churn recorded here.
- [ ] If r185 regresses any gate, then the bump shall be reverted and the blocker recorded as carryover.

## Phase 4 — NSL jitter rail (~2hr, AUTONOMOUS, budgeted against r184)

**Independent of Phase 1.** Cycle 92 carryover: with the floor at 120-140, a regression to 70 would still pass the old 55-FPS field gate and ship silently. The rail budgets against the shipped r184 build; when r185 lands (Phase 3), re-derive the budgets in the same battery.

1. **Probe support**: add a `--budgets=<path>` override to `tools/cycle89-jitter-probe.mjs` `runCheck` (default = the existing field path), so the same probe can gate a second scene.
2. **Budget file**: `cycle89-validation/jitter-budgets-nsl.json` with driven NSL survival budgets derived from a fresh battery on the shipping build, sharp against the 70/54 pre-fix world (targets near min 1%-low >= 100, worst delta <= 45ms, hitch rate <= 30/30s; generous against the Cycle 92 post-fix 133-140 / 21ms / 2 measured).
3. **Wire** `npm run perf:jitter:nsl -- --check=1` (same probe, NSL scene + `--waitFoliage=1` + NSL budgets) and document it next to the field rail in `AGENTS.md`'s validation list.
4. **Prove it**: rail passes on the shipped build; rail fails when run against a deliberately re-churned build (temporarily disable the shadow fix locally - do not commit that state).

**Acceptance (EARS):**

- [x] When Phase 4 ships, `npm run perf:jitter:nsl -- --check=1` shall pass on the shipping build. (Warm control 2026-06-14: 1%-low 135 / worst 27.9ms / hitch 1.3, within 100/45/30.)
- [x] When the shadow churn fix is locally disabled, the NSL rail shall fail (verified once, not committed). (Fail-proof: 1%-low 10.9 / worst 257ms / hitch 547.5, 84% GC-correlated.)
- [x] When Phase 4 ships, the rail and its budgets shall be documented alongside the field rail. (AGENTS.md + the budget file note; budget values + provenance in this plan.)

## Phase 5 — Rock re-bake behind a collider-parity harness (~4hr)

**Harness is AUTONOMOUS and ran this cycle; the re-bake depends on Phase 1 direction.** Carryover since Cycle 91; the standing hard stop: visual-only changes must not move collision footprints.

1. **Harness first**: a spec that snapshots every rock collider footprint (position, radius/extent per scene) from the current bake and asserts byte-stable parity; this is the gate the re-bake must pass, written before the re-bake.
2. **Re-bake** rocks per Phase 1's direction (extend `bake-rocks.mjs` icosa+noise; in-repo pipeline, no external 3D AI services). *Held: needs Phase 1 direction.*
3. **Survey shots** per scene into `cycle96-validation/` for Matt's async review. *Held with the re-bake.*

**Acceptance (EARS):**

- [x] When Phase 5's harness ships, the collider-parity spec shall pass against the current bake (footprints snapshotted as the parity baseline). (`tests/rock-collider-parity.spec.js`, 6 tests green; baseline `tests/refactor-baseline/__fixtures__/rock-collider-footprints.json`: field 334/277, rolling-hills 9/8, NSL 24/21, open-country 0.)
- [ ] When the re-bake ships, the collider-parity spec shall pass with the new bake (footprints byte-identical to the snapshot).
- [ ] When the re-bake ships, before/after survey shots per scene shall exist in `cycle96-validation/`.
- [ ] If any collider footprint moves, then the re-bake shall not ship and the diff shall be recorded here.

## Phase 6 — KTX2 texture pipeline (~3hr)

**Depends on:** Phase 1 go, Phase 2 (goldens catch visual drift). Carryover since Cycle 91.

1. **Scope**: the large WebP/PNG textures in `dist` (tree bark/leaf atlases, terrain, dog/wolf textures) encoded to KTX2/basisu at build time; loader support via three's KTX2Loader with the existing basis transcoder.
2. **Measure**: dist size delta, decode-time delta on the 20Mbps cold-load probe, golden suite for visual parity.
3. **Tier check**: verify transcode targets on the low tier (mobile ETC/ASTC) don't regress the S24-class path - record, don't device-test (that's Phase 8).

**Acceptance (EARS):**

- [ ] When Phase 6 ships, the golden suite shall pass with KTX2 textures live.
- [ ] When Phase 6 ships, dist size and cold-load deltas shall be recorded here (ship only if dist shrinks and cold load does not regress).
- [ ] If visual parity fails on any golden, then KTX2 stays out and the failing surface is recorded.

## Phase 7 — Housekeeping (~2hr)

**Doc-freshness is AUTONOMOUS and ran this cycle; the trailer disposition depends on Phase 1.** Low-risk repo hygiene, batched.

1. **Doc freshness**: `ARCHITECTURE.md` and `AGENTS.md` sweep for Cycle 91-95 drift (LOD chain, shadow fix, pill state, NSL streamed loading, Cycle 95 fixes, new rails); `docs/INTERFACE_FENCE.md` sanity pass. *Ran this cycle.*
2. **Trailer toolkit**: execute Phase 1's disposition for `tools/trailer/` (commit with `output/` gitignored, finish, or delete). *Held: needs Phase 1 decision.*
3. **Dep minors**: `@types/node`, `browserstack-node-sdk`, others if their majors are trivial-changelog; explicitly NOT vite 8 / plugin-react 6 (Q3). Minors already taken in `3d07f621`.

**Acceptance (EARS):**

- [x] When Phase 7's doc sweep ships, `AGENTS.md` shall document the NSL rail next to the field rail and `ARCHITECTURE.md` shall reflect the Cycle 91-95 render reality. (AGENTS: both jitter rails + spec count; ARCHITECTURE: far-tree LOD compute-cull + 200m, shadow-churn fix, 3->4 biomes + NSL streamed.)
- [ ] When Phase 7 completes, `git status` shall show no untracked `tools/trailer/` (committed or removed per the Phase 1 decision).
- [ ] When Phase 7 completes, `npm test` + `npm run build` shall pass.

## Phase 8 — Launch + device pass (~2hr, PAIRED)

**Depends on:** Phases 1-7 (post in the approved state). Matt's voice and Matt's hands.

1. **Launch posting** from `docs/launch/` drafts (description refresh, devlog, social copy) - Matt reviews, edits, posts. Decide the version bump explicitly here (player-visible: pill removal, frame floor, visuals, Cycle 95 NSL fixes).
2. **S24+ device pass**: NSL on the real device - load, tier selection, LOD1 placement, survival round.

**Acceptance (EARS):**

- [ ] When Phase 8 completes, the posting checklist (itch + devlog + social) shall be marked done or explicitly skipped per surface, in Matt's words.
- [ ] When Phase 8 completes, S24+ findings shall be recorded here (or the pass explicitly rescheduled).

## Dependencies

```
Phase 1 (paired gate) → Phase 2 → Phase 3 (also upstream-blocked) → Phase 3 NSL battery
                      → Phase 5 re-bake (parallel with 2-4 after Phase 1)
                      → Phase 6 (after 2)
                      → Phase 7 trailer (after 1)
Phase 8 (paired) last.

Autonomous-now (no Phase 1 needed, ran this cycle):
  Phase 4 NSL jitter rail, Phase 5 harness, Phase 7 doc sweep, Phase 1 prep pack.
```

Phase 5's re-bake only needs Phase 1's direction; it can run while 2-4 proceed. Phase 6 wants fresh goldens (2). Everything funnels into Phase 8.

## Frozen files (cycle-specific additions)

The durable fence ([`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)) is enough. Standing rule restated: **no `shared/` edits this cycle** - no phase carries the sim-change ritual. The r185 bump, when it lands, must leave sim-baselines byte-identical.

## Hard stops

Durable hard stops apply - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific:

1. **No golden re-capture before Phase 1's approval is in `DECISIONS.md`.** Re-pinning baselines to an unapproved look defeats the suite's purpose.
2. **r185: any sim-baseline diff or field-rail failure = revert the bump immediately.** Record and retry next release; don't patch around an engine regression mid-cycle.
3. **Rock re-bake: any collider footprint drift = the bake does not ship.** No tolerance threshold; parity is byte-identical.
4. **KTX2: any golden failure = KTX2 stays out.** No "close enough" on texture transcodes.
5. **Don't post any launch surface without Matt in the loop** (Phase 8 is paired; nothing earlier posts anything).

## What NOT to do during this cycle

- No P8 lighting items (keyframed hemisphere ambient, sky-dome A/B) unless Phase 1 explicitly promotes them - and then as a future cycle, not appended phases.
- No vite 8 / @vitejs/plugin-react 6 majors (Q3). No three r186+ leapfrogging; r185 only, and only once it publishes.
- No `main.js` boot extraction or other structural refactors - nothing this cycle demonstrates the need.
- No new gameplay, scene, or mode scope. This is a drain-the-queue cycle.
- No NSL-as-default flip outside Phase 1's paired decision.
- No version bump and no launch posting outside paired Phase 8.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When Cycle 96 closes, the golden suite shall be green on baselines approved this cycle, and `npm run perf:jitter:nsl -- --check=1` shall pass.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`docs/BACKLOG.md`](BACKLOG.md) — Cycle 91/92/95 entries carry the queue this plan drains
- `cycle91-validation/REPORT.md`, `cycle92-validation/REPORT.md` + `ATTRIBUTION.md` (local) — evidence base
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
