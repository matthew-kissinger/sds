# Post-launch upkeep program - 2026-06 (orchestrator-ready)

> **Created:** 2026-06-09, Matt-directed ("scaffold the rest of the goals
> ... polish, rearc, refactor, code gold, housekeeping").
> **Status:** PENDING. Sits alongside the numbered cycle plans (the
> docs/hardening/ precedent), because Cycle 86 stays open on Matt's two
> paired items and this program must not touch them.
> **Authorization scope:** everything in this doc is pre-authorized for
> autonomous execution EXCEPT where a phase says report-only. Update each
> phase's Status line and check acceptance boxes as verified.

## Ground rules (binding for every phase)

- Do NOT touch Cycle 86 Phase 3 (real-device mobile) or Phase 6 (launch
  posting) surfaces or their gating. Those are Matt's, planned 2026-06-10.
- No `shared/` behavior changes anywhere in this program. Sim-baseline
  fixtures stay byte-identical; a diff aborts the phase.
- No version bump. v2.3.0 is the live release; this program ships under it.
- Every push must end with a green Deploy run (gh run watch). A red
  deploy preempts everything until fixed.
- Fence rules apply in full (docs/INTERFACE_FENCE.md, .claude/rules/).
  Nothing here needs a fence exception; if a task turns out to need one,
  mark it blocked and move on.
- Prose rules for any doc/string output: no em-dashes, no exclamation
  marks, one pasture and three islands / four biomes.
- EOL discipline: preserve each file's existing line-ending style.
- Browser/probe hygiene: SDS_SUPPRESS_BROWSER_OPEN=1, close everything,
  kill any wrangler dev you start.
- Commit per task or coherent task group with the program tag, e.g.
  `test(mp): delta-aware coop-survival integration client [upkeep A1]`.

## Phase A - Review-debt tests (from the 2026-06-09 fence dossiers)

> **Status: DONE 2026-06-09.** A1: `wsClient.ts` is delta-aware (mirrors
> NetworkManager reconstruction exactly: wholesale keyframe replace,
> baseTick-guarded delta apply, conditional blocks, cooldown-limited
> requestKeyframe), coop-survival observes the reconstructed snapshot
> stream and asserts broadcast-cadence observation (delta count > 0,
> snapshots > raw keyframes); handshake helpers extracted to
> `helpers/liveWorker.ts`. A2: new `tests/integration/mixed-cohort.spec.ts`
> (3 tests: v3 keyframe/delta cadence, v2 full-frames-only with zero
> deltas, cross-cohort sheep/sheepdogs/scalars equality at ~150 shared
> ticks); live run 43 passed across the integration suite. Note: it
> follows the suite's existing convention of env-gating
> (`MIXED_COHORT_LIVE=1` + a live wrangler dev), so in CI's plain
> `npm test` it skips like coop-survival does; live-protocol CI coverage
> is unchanged in kind, now broader in depth. A3:
> `tests/rect-boundary-steer-fuzz.spec.js`, 200k pairs per call-site
> config (600k total, 344ms), pre-DRY math copied from `2d34a2b^`,
> `Object.is` per component, gate carve-out coverage counters. A4:
> `unicastSendAllowed()` guard on both unicast keyframe sites in
> RoomDO.ts (same constant and comparison as the broadcast skip), 5 unit
> tests in `tests/worker/unicast-backpressure.spec.ts`; worker suite 277
> passed.

Items flagged accept-with-flags in
[`../hardening/review-dossiers-2026-06-09.md`](../hardening/review-dossiers-2026-06-09.md).

1. **A1 (F5):** `tests/integration/coop-survival.spec.ts` +
   `tests/integration/helpers/wsClient.ts` joined as v3 and now sample
   ~1Hz keyframes. Teach wsClient to reconstruct `gameStateDelta` frames
   (mirror `js/NetworkManager.js` semantics: keyframe replaces wholesale,
   delta applies on `baseTick === lastAppliedTick`) so the spec regains
   ~60Hz observation. Alternative if simpler and equally honest: have the
   harness join with `protocolVersion: 2` EXPLICITLY with a comment, and
   add a separate minimal v3 observation test.
2. **A2 (coverage gap 2):** a mixed-cohort integration test in CI: one v3
   + one v2 client in a live local room, assert the v3 stream is
   keyframe/delta cadence, the v2 stream is full frames every interval,
   and both reconstruct identical sheep state at shared ticks. Reuse the
   `tools/loadtest/` client patterns against an INTEGRATION_TEST wrangler
   dev (see `tests/integration/` harness).
3. **A3:** commit a re-runnable `rectBoundarySteer` bit-exactness fuzz
   (the dossier Item B low flag: the 600k-pair claim is throwaway prose).
   A vitest spec under `tests/` seeded-PRNG-driving the three call-site
   configs through the shared helper vs an inline reimplementation of the
   pre-DRY math, `Object.is` on outputs. Keep runtime under ~2s.
4. **A4 (F6):** the unicast keyframe paths (`RoomDO.ts` bind +
   requestKeyframe) bypass the backpressure skip. Add the same
   `bufferedAmount <= BACKPRESSURE_MAX_BUFFERED_BYTES` guard before the
   unicast send (skipping is correct: a saturated socket re-requests or
   gets the cadence keyframe), plus a unit test.

Acceptance:

- [x] When the integration suite runs, then the coop-survival client
      shall observe game frames at the broadcast cadence (not 1Hz), or
      carry an explicit v2-cohort comment plus a v3 companion test.
      (Delta-aware path taken; cadence asserted in the spec itself.)
- [x] When `npm test` runs, then a mixed-cohort spec shall assert both
      cohort streams and cross-cohort state equality. (Live-gated per the
      suite's existing convention; executed 3/3 against wrangler dev.)
- [x] When `npm test` runs, then a committed fuzz spec shall pin
      `rectBoundarySteer` bit-exactness across all three call-site
      configs. (600k pairs, runs in CI unconditionally.)
- [x] When a unicast keyframe targets a saturated socket, then the DO
      shall skip the send, asserted by a unit test. (Both sites; 5 tests.)
- [x] When `npm test` runs at phase end, all suites green; sim-baselines
      byte-identical. (1456 passed / 11 skipped on fresh dist;
      `git status shared/ tests/sim-baseline/` clean.)

## Phase B - Localization completion

> **Status: DONE 2026-06-09.** Every allowlisted key translated in all
> four locales (es/ja/zh-CN 25 each, pt 43 including the 18-key
> `sandbox.*` gap); all four allowlists now empty with a dated comment.
> Parity spec 17/17 green. i18n chunk family measured 140 KiB on the
> fresh build; budget bumped 136 -> 140 in the ratchet fixture, recorded
> here and in the commit (the ~118 newly translated values across four
> locale files are the growth).

The parity allowlists still carry pre-hardening entries
(`tests/ui/locale.parity.spec.ts`): es/ja/zh-CN 25 each, pt 43 (including
an 18-key pt-only `sandbox.*` gap). Translate them all following the
Phase 4 conventions (terminology from each locale's existing keys,
placeholders byte-identical, key names untranslated). Shrink the
allowlists to zero if achievable; document any irreducible entry with a
reason line in the spec.

Acceptance:

- [x] When `npx vitest run tests/ui/locale.parity.spec.ts` runs, then the
      allowlists shall be empty or each remaining entry shall carry a
      written reason. (All four empty.)
- [x] If the i18n chunk family exceeds its 136 KiB budget, then the bump
      shall be recorded in the ratchet commit per convention. (140 KiB
      measured; bump recorded.)

## Phase C - Major dependency upgrades (one at a time, full validation each)

Deferred majors from 2026-06-09 (`docs/cycle-86-plan.md` Post-release
upkeep). Order matters; validate (lint + typecheck client/worker + full
test + build + a Chromium smoke e2e) after EACH, commit each separately,
and push+watch deploy after each lands (or batch pushes of proven
upgrades, but never stack unproven ones):

1. **C1:** vite 8 + @vitejs/plugin-react 6 + vite-plugin-static-copy 4
   (one coherent build-tool move; read each migration guide first).
2. **C2:** typescript 6 (root + worker).
3. **C3:** i18next 26 + react-i18next 17 (paired ecosystem move).
4. **C4:** concurrently 10 (dev scripts only); drop the shell-quote
   override if its tree no longer pins 1.8.3.

If an upgrade breaks something non-trivially, REVERT it, record the
blocker + the failing surface in this doc, and continue to the next.
Record bundle-ratchet deltas per convention. Do not chase three.js or
renderer-adjacent majors in this program.

Acceptance:

- [ ] When each upgrade commit lands, then lint, both typechecks,
      `npm test`, and `npm run build` shall pass on it in isolation.
- [ ] When the phase ends, then this doc shall list per-major: shipped
      (version) or reverted (reason).
- [ ] When the final push lands, then the Deploy run shall be green.

## Phase D - Import-discipline lint for shared/

> **Status: DONE 2026-06-09.** Stream B5 had already landed the rule
> (eslint.config.js scopes no-restricted-imports to shared/**/*.js for
> three.js + sub-paths and js/, plus no-undef with a DOM-free globals
> map). Gap found and closed: worker/ imports were not restricted; added
> the `../worker/**` pattern group. Proof: a temporary edit adding
> `import "three"`, `import ... from "../js/main.js"`, and
> `import ... from "../worker/src/GameSim.js"` to shared/Vector2D.js
> produced 3 lint errors, then the file was restored byte-identical to
> HEAD (git checkout; verified clean). shared-sim.md sentence updated to
> active voice. No real violations surfaced.

`.claude/rules/shared-sim.md` says ESLint will enforce the shared/
boundary "once Stream B5 lands the no-restricted-imports rule scoped to
shared/**". Verify whether it landed (`grep no-restricted-imports
eslint.config*`); if absent, add it: `shared/**` may not import from
`js/`, `worker/`, three.js, or any browser global module. Fix any
violations the rule surfaces (expected: none; if a real one exists and
is behavioral, STOP that fix and record it instead, since shared/ is
fenced). Update the rule-file sentence to past tense.

Acceptance:

- [x] When `npm run lint` runs, then an import from `js/` or `worker/`
      added to a `shared/` file shall fail lint (prove with a temporary
      local edit, not committed). (Proven 2026-06-09: 3 errors on the temp
      edit, file restored byte-identical, full lint clean after.)
- [x] When the phase ends, shared-sim.md shall state the rule is active.

## Phase E - Housekeeping

> **Status: DONE 2026-06-09.** E1: 44 gitignored scratch PNGs deleted from
> the repo root (verified untracked and ignored first). E2: the
> `../sds-p2-backpressure` husk was held by 9 orphaned processes from the
> hardening session (2 wrangler dev on :8799, 2 bash wrappers, 4 tail -f
> log followers); all killed, directory removed, worktrees pruned. E3:
> verdict table below; all three cycle83 worktrees and branches removed
> under the doc's own merged-and-clean criteria. E4: both stale references
> annotated in place (original text preserved). E5: `.playwright-cli/`
> (empty generated dir) deleted; remaining ignored dirs (`cycleN-validation/`,
> `.codex/`, `browserstack-artifacts/` etc.) are deliberate evidence stores,
> left alone.

E3 worktree verdict table:

| Branch | `git log main..branch` | Worktree | Verdict |
|---|---|---|---|
| codex/cycle83-main-merge | 0 commits | clean | removed (worktree + branch) |
| codex/cycle83-night-arc | 0 commits | clean | removed (worktree + branch) |
| codex/cycle83-wolf-bark-feel | 0 commits | clean | removed (worktree + branch) |
| codex/mobile-webgpu-primary | 0 commits | none | report-only: fully merged, branch left (not in E3 scope); safe to delete |
| codex/newsheepdogland-mobile-proof | 0 commits | none | report-only: fully merged, branch left (not in E3 scope); safe to delete |

1. **E1:** delete the gitignored scratch PNGs at the repo root (verify
   gitignored first; anything tracked is out of scope).
2. **E2:** remove the `../sds-p2-backpressure` worktree husk
   (`git worktree prune` + directory delete; the holding process was
   killed 2026-06-09, a reboot may have cleared the lock).
3. **E3:** audit the `../sds-cycle83-*` worktrees (codex/cycle83-* 
   branches). REPORT-ONLY unless fully merged into main: for each, state
   merged/unmerged (`git log main..<branch>`) and recommend; remove only
   if `git log main..branch` is empty AND the working tree is clean.
4. **E4:** fix the stale line-number references the dossiers flagged in
   `docs/hardening/phase-0-foundation.md` (post-split locations:
   `shared/CompetitiveMode.js:104/118`, GameSim call `:1374`). Cosmetic,
   keep the original text struck or annotated rather than rewritten.
5. **E5:** `.playwright-cli/` and any other untracked scratch dirs at the
   root: delete if generated artifacts, gitignore if recurring.

Acceptance:

- [x] When the phase ends, then `git status` at the repo root shall show
      no untracked scratch artifacts, and this doc shall carry the E3
      worktree verdict table. (Verified 2026-06-09: the only untracked
      paths are this program's own new test files, staged for commit.)

## Phase F - Docs truth-up (repo-facing only)

> **Status: DONE 2026-06-09.** README: v2.3.0 entry added to Current
> state; tutorial/achievements/rebinding bullets in the i18n section;
> wire protocol v3 + P-SEC-1 bullets in the multiplayer section; biome,
> mode, and dog framing verified accurate. ARCHITECTURE: P2-DELTA-DOC
> edits verified present and extended (5,000-sheep count, WebGPU note in
> the stack table, GSV-split module list with the shim annotated,
> protocol.js in the shared/ diagram, requestKeyframe/gameStateDelta in
> the message tables, broadcast-cohort and backpressure paragraphs).
> llms.txt: tutorial/achievements/rebinding/languages sentence added.
> Site copy untouched (Cycle 86 Phase 6, Matt's). Prose greps clean on
> all added lines (no em-dash, no exclamation, no four-islands or
> three-biomes). EOL note: the truth-up agent flipped two files' line
> endings; both restored (README rebuilt from HEAD bytes so the diff is
> content-only, ARCHITECTURE converted back to LF).

v2.3.0 changed what the game IS; repo docs may lag. Truth-up pass over
`README.md` (feature list: tutorial, achievements, rebinding, languages,
delta protocol), `ARCHITECTURE.md` (verify the P2-DELTA-DOC protocol
edits landed at ~lines 10/199/339 and nothing else drifted), and
`public/llms.txt` (feature currency). Player-facing site copy
(index.html seo-content, scene pages, about) stays OUT: that is Cycle 86
Phase 6, Matt's. Prose rules apply; do not re-edit Matt's own pre-2.3
prose beyond factual corrections.

Acceptance:

- [x] When the phase ends, then README shall mention the v2.3.0 player
      features accurately, and a grep for "three biomes|four islands"
      across edited files shall return nothing. (Verified 2026-06-09.)

## Phase G - Code-quality audit + proposals (execute only zero-risk)

Multi-agent read-only audit producing `docs/upkeep/code-quality-audit-2026-06.md`:

1. Dead-code sweep (unused exports/files; verify candidates against
   dynamic imports and the worker/Electron/tools entry points before
   claiming dead).
2. Complexity hotspots outside the do-not-refactor list (the list in
   `.claude/rules/scene-and-render.md` is binding: OptimizedSheep,
   GrassSystem, main.js loop, ?cinematic=1 stay untouched).
3. Duplication candidates with measured line counts and a
   cohesion-vs-size argument each way.
4. A prioritized proposal table (effort, risk, payoff) for the next
   paired planning session; main.js seam candidates included as
   PROPOSALS only.

Execute in this program only what is mechanically zero-risk AND proven
by existing tests: deleting verified-dead files/exports, removing
commented-out code blocks older than two cycles, normalizing obvious
lint-suppression leftovers. Everything else is proposal-only.

Acceptance:

- [ ] When the phase ends, then the audit doc shall exist with the
      proposal table, and every executed cleanup shall name the proof
      (test/build/grep) that it was dead.
- [ ] When `npm test && npm run build` run at program end, both green,
      bundle ratchet respected (deletions may SHRINK budgets: record
      tightened numbers if a family drops more than 5 KiB).

## Sequencing

```
A, B, E, F run in parallel (disjoint files).
C runs alone after A/B/E/F land (build-tool churn last, one major at a time).
D anytime; G's audit anytime, G's executions after C.
Final: full validation, deploy green, NEXT_SESSION + memory refresh.
```

## Hard stops

1. Any sim-baseline or refactor-baseline golden diff: abort the task,
   revert, record.
2. Deploy red: fix before anything else.
3. A Phase C major that needs source changes beyond mechanical API
   renames: revert and record rather than absorb risk.
4. Anything touching Cycle 86 Phase 3/6 surfaces: stop, leave for Matt.
