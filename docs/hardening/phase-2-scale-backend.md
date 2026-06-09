# Phase 2 - Scale, Cost & Backend Robustness

> **Rationale:** Do this before any marketing spike. The wire-protocol change
> is the long pole and is fence-frozen, so it gates the broadcast-side work
> that depends on the new frame shape.

## DAG

```
P2-DELTA-DESIGN ─→ P2-DELTA-IMPL ─→ P2-DELTA-CLIENT ─→ P2-DELTA-DOC
                                  └─→ P2-BACKPRESSURE
P2-DOSPILL ──────────────── (independent)
P2-MIGRATE-STATE ────────── (independent)
P2-ALLOC ───────────────── (independent, client-side)
P2-STAGING ──────────────── (independent, infra)
```

---

## [P2-DELTA-DESIGN] Design delta wire format + version migration [FENCE: wire protocol]

- **Owner hint:** backend architect
- **Status:** done (design doc: [`delta-protocol-design.md`](delta-protocol-design.md))
- **Deps:** none
- **Files:** design doc (place in this directory as `delta-protocol-design.md`), `shared/protocol.js`, `.claude/rules/multiplayer.md` (the doc currently claims delta encoding that does not exist)
- **Risk:** high. Fence violation if shipped without the migration story. Human sign-off required before P2-DELTA-IMPL starts.
- **Fence:** wire protocol is fence-frozen. The four-point rule from `.claude/rules/multiplayer.md` applies in full.

Acceptance:

- [x] When the design lands, then it shall specify changed-sheep-only frames + periodic keyframes, a PROTOCOL_VERSION bump, and the in-flight-session migration story (old client + new DO behavior).
- [x] Per multiplayer.md's four-point rule, all four pieces shall be present: named change, in-flight migration story, full consumer list (client NetworkManager, Worker DO message handler, payload-shape tests), version-tag acceptance line.
- [ ] Matt has signed off on the design before implementation begins.
  - 2026-06-09 orchestrator note: implementation proceeded under the
    session's standing autonomous directive (/goal: complete all phases).
    The orchestrator reviewed the doc as acting reviewer and accepted all
    four section-12 recommendations (per-client soft-degrade, N=60,
    full-record deltas with field masks as fallback, 85% degenerate
    threshold). Matt's post-hoc review of `delta-protocol-design.md`
    remains owed before this box is checked; the per-client soft-degrade
    design means the change is safe to roll back by simply not bumping
    the client PROTOCOL_VERSION.

---

## [P2-DELTA-IMPL] Implement delta snapshots in the DO [FENCE]

- **Owner hint:** backend agent
- **Status:** done with one measured caveat (2026-06-09, uncommitted working tree). Server side shipped exactly per the design doc; the egress gate holds for mid-round+ flocks but NOT for a fully active flock, because the design's stationary-grazing assumption is factually wrong for the MP sim (see the design doc's Deviations section and the caveat below). Safe either way: the degenerate rule bounds the delta path at exactly today's cost, and v<3 clients are byte-compatible.
- **Deps:** P2-DELTA-DESIGN
- **Files:** `worker/src/GameSim.js` (tick counter, snapshot `tick` stamp, `getDeltaPathFrame()` delta builder + `_wireBasis` lastWire cache, 85% degenerate rule, index-stability comment), `worker/src/RoomDO.ts` (per-session `protocolVersion` storage on create/join + rehydration-as-legacy, broadcast cohort split with lazy per-cohort encode, keyframe-on-bind, `requestKeyframe` handler with 2/s per-client cap + `keyframe_request_capped` log event), `worker/src/index.ts` (create + quick-match forward `protocolVersion`; join already did), `shared/protocol.js` (PROTOCOL_VERSION 3, DELTA_MIN_PROTOCOL_VERSION 3, KEYFRAME_INTERVAL_TICKS 60; SURVIVAL_MIN stays 2). Tests: new `tests/worker/delta-protocol.spec.ts`, `tests/worker/delta-broadcast.spec.ts`, `tests/worker/delta-egress.spec.ts`; extended `snapshot-shape.spec.ts`, `dos-caps.spec.ts`, `survival-room.spec.ts`.

Acceptance:

- [x] When the sim broadcasts, then unchanged sheep shall be omitted and a keyframe sent every N ticks. (Delta frames carry exactly the changed quantized records keyed by array index; keyframes at tick%60==0, game start, socket bind, requestKeyframe; >85% changed flips to a keyframe; v<3 / no-version sessions get full frames every interval, byte-compatible plus the additive `tick`.)
- [ ] When measured at 200 sheep / 4 players, then per-room egress shall drop >= 50% vs the full-snapshot baseline. **Holds from ~65% round progress onward; does NOT hold at round start.** See evidence.

Evidence (2026-06-09, `tests/worker/delta-egress.spec.ts`, seeded 200 sheep / 4 players / 60 sim-seconds / scripted gate-herding, production msgpack encoder on both paths):

- Round start, fully active flock: delta path 75,594,056 B == full path 75,594,056 B (ratio 100.0%, all 3,600 frames degenerate keyframes). Root cause measured, not assumed: the MP server has no grazing state; 199-200 of 200 active sheep cross the 0.01 wire quantum EVERY tick even with zero dog input, so the design doc section 2's "~50 of 200 changed" projection is wrong for this sim. The degenerate rule held the never-worse bound exactly.
- 120/200 retired: ratio 53.7%.
- 140/200 retired (asserted gate scenario): delta 25,762,858 B vs full 59,296,181 B, ratio **43.4%** (429,381 B/s vs 988,270 B/s per client; 61 keyframes + 3,539 deltas; mean changed per delta 59.5 of 200). Gate crossover sits near 65% retired; survival rooms (10-50 active of a 200 pool) are deep in the winning regime from tick 1.
- Options if the round-start regime must also win (for Matt's decision, not pulled unilaterally): fixed-point int encoding of quantized floats, server-side calm/settle sim behavior (fence-gated sim change), or accept progress-scaled savings. The design doc Deviations section has the analysis.
- Validation: `npm run lint` clean, `npm test` 1278 passed / 8 skipped (zero sim-baseline or refactor-baseline fixture modifications, `git status` clean on `tests/sim-baseline/`), `npx tsc --noEmit -p worker` clean, `npm run typecheck` clean, `npm run build` green. A v3 client joins survival (SURVIVAL_MIN stays 2, locked by test). LF line endings preserved.

---

## [P2-DELTA-CLIENT] Client delta reconstruction [FENCE]

- **Owner hint:** frontend/net agent
- **Status:** pending
- **Deps:** P2-DELTA-IMPL
- **Files:** client NetworkManager, `js/main.js` reconciliation path

Acceptance:

- [ ] When the client receives a delta frame, then it shall reconstruct full sheep state identically to the pre-delta path.
- [ ] When a keyframe arrives, then drift shall reset to zero.

---

## [P2-DELTA-DOC] Reconcile multiplayer.md with shipped reality

- **Owner hint:** docs agent
- **Status:** pending
- **Deps:** P2-DELTA-CLIENT
- **Files:** `.claude/rules/multiplayer.md`, `DECISIONS.md`

Acceptance:

- [ ] After delta encoding ships, then the rule file shall describe the actual implemented protocol.

---

## [P2-BACKPRESSURE] DO backpressure + tick-health

- **Owner hint:** backend agent
- **Status:** pending
- **Deps:** P2-DELTA-IMPL (shares the broadcast loop it modifies)
- **Files:** `worker/src/RoomDO.ts:1077-1092`

Acceptance:

- [ ] When a client fails N consecutive broadcasts or its bufferedAmount exceeds a threshold, then it shall be evicted.
- [ ] When tick duration variance exceeds a bound, then a metric shall fire.

---

## [P2-DOSPILL] Per-tick allocation cleanup in the sim hot path [FENCE: shared/ adjacent]

- **Owner hint:** sim agent
- **Status:** done (2026-06-09, uncommitted working tree). Single file: `worker/src/GameSim.js`. No shared/ edits, no fixture regeneration.
- **Deps:** none
- **Files:** `worker/src/GameSim.js:936, 668` (velocity.clone().multiply per sheep per tick)
- **Risk:** medium. Must not change numeric results; sim-baseline is the guard. No regeneration authorized.

Acceptance:

- [x] When the sim ticks, then no per-sheep Vector2D allocation shall occur in the position-update loop (use in-place scratch math).
- [x] When the sim-baseline runs, then traces shall be byte-identical (pure perf change).

Evidence (2026-06-09):

- Allocation sites removed, all in `worker/src/GameSim.js`, all rewritten as in-place scalar math with the same float operations in the same order:
  - `updateSheepMovementClientStyle`: 3 Vector2D allocations per sheep per tick (previousVelocity clone, smoothing clone, position-step clone). The spec's primary site.
  - `updateSheepdogMovementTimeStyle`: the same 3 allocations per dog per tick (the spec's second site).
  - `shouldSeekGate` (competitive and cooperative branches): 2 `clone().subtract()` temporaries per check, inlined as a scalar dot product. Runs per active sheep per tick.
  - `calculateGateAttraction`: `clone().subtract()` plus the `new Vector2D(0, 0)` no-gate return, replaced with a module-level `GATE_STEER_SCRATCH` (DO is single-threaded; the caller only `acceleration.add()`s the result before the next call).
  - `applySheepBoundaryConstraint`: the `extendedBounds` object literal per retiring sheep per tick, inlined (matches the form the sim-baseline harness already uses).
- Audited and deliberately left alone: constructor-time spawns (init only), `applyPlayerInput` targetVelocity (max 1 per dog per tick, passed into shared `applyAcceleration`), `clientStopTarget` and `retirementTarget` (retained state, must be fresh objects), `applyPastureContainment` and `updateGrazingSheep` (dead code, never called), the per-tick `activeSheep` filter array (1 per tick, not per sheep), Map-values iterators passed to `resolveDogSheepCollisions` (iterator shape, not a Vector2D allocation; marginal gain vs churn), and everything in `shared/` (out of scope per the determinism contract).
- Fixture byte-identity: `npm test` green (1248 passed, 8 skipped); `git status` shows zero modified files under `tests/` (sim-baseline including competitive.json, refactor-baseline, all fixtures). `harness-parity.spec.ts` additionally drove a real GameSimulation against the harness tick-by-tick and matched bit-identically.
- Micro-benchmark (1000 ticks, 200 sheep, field coop, node 24, separate process per variant, median of 7): old 456-512 ms vs new 447-506 ms per 1000 ticks; within run-to-run noise. The full tick is dominated by the O(N^2) neighbor pass and shared/ allocations, so the ~600 removed allocations per tick do not move wall-clock at this scale; the win is allocation discipline in the DO hot path. Benchmark script was temporary and deleted.
- Validation: `npm run lint` clean, `npm test` green, `npx tsc --noEmit -p worker` clean. LF line endings preserved.

---

## [P2-MIGRATE-STATE] Self-managed D1 migration state

- **Owner hint:** backend agent
- **Status:** done (2026-06-09, uncommitted working tree; remote D1 untouched, the state table ships with the next deploy)
- **Deps:** none
- **Files:** `.github/workflows/deploy.yml` (migrate job now calls the script), new `worker/migrations/0010_migration_state.sql`, new `scripts/d1-migrate-remote.mjs`. `scripts/d1-local-setup.mjs` unchanged (picks 0010 up automatically; the migration is idempotent via IF NOT EXISTS + INSERT OR IGNORE).
- **Risk:** medium. Append-only migration discipline; do not edit applied migrations. Note the existing `d1_migrations` tracking table is out of sync from earlier manual applies (see `.claude/rules/multiplayer.md`); the new state table must account for that history.

Design shipped: `sds_migration_state(id TEXT PK, applied_at TEXT, status TEXT CHECK applied|failed)`, seeded with all 11 existing migration files as 'applied' (0001-0009 including both 0002 files, plus 0010 itself; all are live in prod, covering the manual 0007-0009 history). The deploy's migrate job runs `scripts/d1-migrate-remote.mjs`: it reads applied ids from the state table, computes pending files in sequence order, and for each one INSERTs the id with status='failed' BEFORE applying, applies the file, then UPDATEs to 'applied'. A crash mid-apply leaves a 'failed' row; the next run detects it and fails with operator guidance (finish or roll back the partial change, then flip or delete the row) instead of skipping. Bootstrap case (state table absent, i.e. the deploy that ships 0010 itself): the script falls back to the legacy `git diff --diff-filter=A` behavior for exactly that run, then records whatever it applied once the table exists.

Acceptance:

- [x] When a migration is applied, then its id shall be recorded in a state table the deploy controls.
- [x] When a migration half-fails, then the next deploy shall detect the incomplete state rather than skipping it.

Evidence (all against LOCAL D1; remote untouched):

- 0010 applied to local D1 twice; second run a no-op (idempotent seeds), table holds all 11 ids as 'applied'.
- `D1_LOCAL=1 node scripts/d1-migrate-remote.mjs` with the table fully seeded: "All 11 migration(s) already applied", exit 0.
- Injected a synthetic `status='failed'` row: the script refused with the resolve-manually message, exit 1.
- Deleted the 0010 row to simulate a pending file: the script ran the mark-failed -> apply -> mark-applied sequence and re-recorded it, exit 0.
- Dropped the state table to simulate bootstrap: the script fell back to diff mode, found no newly-added files in HEAD~1..HEAD, exit 0; table restored after.
- `node --check` clean; deploy.yml parses with js-yaml.

---

## [P2-ALLOC] Client-side per-frame allocation audit

- **Owner hint:** frontend agent. The spec notes this folds into P2-DOSPILL if it turns out to be the same loop; the named site below is client-side, so treat it as independent unless investigation shows otherwise.
- **Status:** done (2026-06-09, uncommitted working tree). Independent of P2-DOSPILL (this loop is the client render-loop perf path, not the DO).
- **Deps:** none
- **Files:** `js/main.js:1617-1676` (per-frame `.filter()` for visible counts)

Acceptance:

- [x] When `updatePerformanceVisibleCounts` runs, then it shall read a cached/dirty-tracked count, not filter the full tree/rock arrays each frame.

Result:

- Consumers traced: the three `.filter()` results fed only display diagnostics. `treeGroups`/`rockGroups` feed `PerformanceMonitor.setEstimatedDrawCalls` (read only for the WebGPU draw-call HUD metric, displayed every 10 frames); `counts.Mountains` feeds `setVisibleCountsBySystem` (read only by on-demand `getCostReport` probes; `tb.mountains` is always `[]` since Cycle 28 removed the procedural ring). QualityGovernor samples frame time only; nothing gameplay-affecting reads these counts.
- Invalidation design: tree mesh visibility legitimately flips per frame on the WebGL native-impostor path (camera-distance hybrid switching in `js/world/TreeImpostorRuntime.js`), and instrumenting those flip sites is outside this task's single-file ownership. So: cached counts in `this._perfGroupCountCache`, recomputed with an allocation-free counting loop when (a) the trees/rocks/mountains array reference or length changes (scene swap, streaming chunk builds), (b) the perf-probe `_perfSystemIsolation` mode changes (cost-report isolation runs stay exact), (c) 1000ms elapsed (camera-driven LOD flips converge within a second), or (d) the one-shot `registerSystemTriangleCounts` (init / post-rebuild) calls with `forceRefresh = true`. Counts are at most 1s stale for the HUD; exact at every consumer decision point.
- No vitest spec added: the method lives on the unexported `SheepDogSimulation` class inside `js/main.js` (module-level DOM + 33 static imports), so it is not cheaply importable. Validated via the existing suite plus a manual trace of the four invalidation paths; behavior is observationally equivalent (same counts, bounded staleness on a display-only metric). CRLF preserved (3524 CRLF, 0 bare LF).
- Validation: lint, typecheck, test (1248 passed, 8 skipped), build all green.

---

## [P2-STAGING] Preview/staging deploys per PR

- **Owner hint:** infra agent
- **Status:** done pending operator provisioning (2026-06-09, uncommitted working tree). The Pages-preview path works as soon as the workflow lands; the preview Worker path activates once the operator TODO below is completed.
- **Deps:** none
- **Files:** new `.github/workflows/preview.yml`, `worker/wrangler.toml` (`[env.preview]`), `scripts/d1-migrate-remote.mjs` (shared with P2-MIGRATE-STATE; `D1_TARGET=preview`).
- **Risk:** medium. Ensure preview never touches production D1/leaderboard.

Architecture shipped: `preview.yml` runs on `pull_request` against main. Job `test` (lint + typecheck + npm test), then two deploy jobs gated to same-repo PRs. `preview-worker` runs only when the repo Actions variable `CF_PREVIEW_D1_ID` is set: it substitutes the placeholder `database_id` under `[env.preview]` in `worker/wrangler.toml`, applies the FULL migration set to the PREVIEW D1 (`scripts/d1-migrate-remote.mjs` with `D1_TARGET=preview`, full bootstrap on a fresh DB, state-tracked thereafter), then deploys `sds-worker-preview` via `wrangler deploy --env preview`. `pages-preview` builds with `SDS_WORKER_BASE` pointed at the preview worker URL (or at `https://sds-preview-mp-disabled.invalid` when no preview worker exists; the sentinel never resolves, so multiplayer/leaderboard calls fail fast and cannot reach production) and deploys with `wrangler pages deploy --branch=<head ref>`, which Cloudflare Pages treats as a native preview deployment. When `CF_PREVIEW_D1_ID` is unset, a notice job explains the skip.

Guard rails: the preview workflow never references the production database id and never runs `d1 execute` against it; `d1-migrate-remote.mjs` with `D1_TARGET=preview` hard-refuses if the `[env.preview]` `database_id` equals the production id or is still the placeholder, and refuses the production database name outright. The build-time API base is never empty (an empty `SDS_WORKER_BASE` would fall back to the production worker URL in `js/runtimeConfig.js`).

Acceptance:

- [x] When a PR opens, then a preview Pages deployment + preview Worker shall be created against a non-production D1. (Workflow + env shipped; the Worker leg requires the operator TODO below, and is skipped with a notice until then.)

Evidence:

- Both workflows parse with js-yaml (`deploy.yml`: 7 jobs, `preview.yml`: 4 jobs). `action-validator` is not installed in this repo; not run.
- `npx wrangler deploy --dry-run` (default env): config valid, binds `sds-db`. Wrangler now prints an advisory "multiple environments defined, no target specified" warning on env-less deploys; the top-level env is still used, production deploy behavior unchanged.
- `npx wrangler deploy --dry-run --env preview`: config valid, binds `sds-db-preview`. Note: dry-run does not contact the API, so the placeholder id passes structurally; a real `deploy --env preview` with the placeholder would fail at the API, and the migrate script refuses before that point anyway.
- Guard-rail proofs: `D1_TARGET=preview` with the placeholder id refused (exit 1, "still the placeholder"); with the production id sed-substituted in, refused (exit 1, "equals the PRODUCTION database id"); wrangler.toml restored to placeholder after the test.

Operator TODO (one time, before the preview Worker leg activates):

1. `npx wrangler d1 create sds-db-preview` (from `worker/`).
2. Set the repo Actions **variable** `CF_PREVIEW_D1_ID` to the new database id.
3. `npx wrangler secret put JWT_SECRET --env preview` (the preview worker mints its own sessions; do not reuse anything that grants production access).
4. Confirm the existing `CF_API_TOKEN` secret has D1 edit scope for the new database (it already migrates production D1, so it should).

---

## Gate

- [ ] `npm test` green
- [ ] `npm run build` green
- [ ] Bandwidth/cost is bounded and measured (egress drop verified at 200 sheep / 4 players)
- [ ] The DO survives slow clients (backpressure eviction verified)
- [ ] Migrations cannot silently drift
- [ ] A safe staging surface exists for testing

Gate result: (record date, commit, and evidence here)
