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
- **Status:** pending
- **Deps:** none
- **Files:** design doc (place in this directory as `delta-protocol-design.md`), `shared/protocol.js`, `.claude/rules/multiplayer.md` (the doc currently claims delta encoding that does not exist)
- **Risk:** high. Fence violation if shipped without the migration story. Human sign-off required before P2-DELTA-IMPL starts.
- **Fence:** wire protocol is fence-frozen. The four-point rule from `.claude/rules/multiplayer.md` applies in full.

Acceptance:

- [ ] When the design lands, then it shall specify changed-sheep-only frames + periodic keyframes, a PROTOCOL_VERSION bump, and the in-flight-session migration story (old client + new DO behavior).
- [ ] Per multiplayer.md's four-point rule, all four pieces shall be present: named change, in-flight migration story, full consumer list (client NetworkManager, Worker DO message handler, payload-shape tests), version-tag acceptance line.
- [ ] Matt has signed off on the design before implementation begins.

---

## [P2-DELTA-IMPL] Implement delta snapshots in the DO [FENCE]

- **Owner hint:** backend agent
- **Status:** pending
- **Deps:** P2-DELTA-DESIGN
- **Files:** `worker/src/GameSim.js:1288-1360` (createGameStateSnapshot), `worker/src/RoomDO.ts:934-945`

Acceptance:

- [ ] When the sim broadcasts, then unchanged sheep shall be omitted and a keyframe sent every N ticks.
- [ ] When measured at 200 sheep / 4 players, then per-room egress shall drop >= 50% vs the full-snapshot baseline.

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
- **Status:** pending
- **Deps:** none
- **Files:** `worker/src/GameSim.js:936, 668` (velocity.clone().multiply per sheep per tick)
- **Risk:** medium. Must not change numeric results; sim-baseline is the guard. No regeneration authorized.

Acceptance:

- [ ] When the sim ticks, then no per-sheep Vector2D allocation shall occur in the position-update loop (use in-place scratch math).
- [ ] When the sim-baseline runs, then traces shall be byte-identical (pure perf change).

---

## [P2-MIGRATE-STATE] Self-managed D1 migration state

- **Owner hint:** backend agent
- **Status:** pending
- **Deps:** none
- **Files:** `.github/workflows/deploy.yml:75-117`, new migration-state table + `worker/migrations/`
- **Risk:** medium. Append-only migration discipline; do not edit applied migrations. Note the existing `d1_migrations` tracking table is out of sync from earlier manual applies (see `.claude/rules/multiplayer.md`); the new state table must account for that history.

Acceptance:

- [ ] When a migration is applied, then its id shall be recorded in a state table the deploy controls.
- [ ] When a migration half-fails, then the next deploy shall detect the incomplete state rather than skipping it.

---

## [P2-ALLOC] Client-side per-frame allocation audit

- **Owner hint:** frontend agent. The spec notes this folds into P2-DOSPILL if it turns out to be the same loop; the named site below is client-side, so treat it as independent unless investigation shows otherwise.
- **Status:** pending
- **Deps:** none
- **Files:** `js/main.js:1617-1676` (per-frame `.filter()` for visible counts)

Acceptance:

- [ ] When `updatePerformanceVisibleCounts` runs, then it shall read a cached/dirty-tracked count, not filter the full tree/rock arrays each frame.

---

## [P2-STAGING] Preview/staging deploys per PR

- **Owner hint:** infra agent
- **Status:** pending
- **Deps:** none
- **Files:** `.github/workflows/`, `wrangler.toml`
- **Risk:** medium. Ensure preview never touches production D1/leaderboard.

Acceptance:

- [ ] When a PR opens, then a preview Pages deployment + preview Worker shall be created against a non-production D1.

---

## Gate

- [ ] `npm test` green
- [ ] `npm run build` green
- [ ] Bandwidth/cost is bounded and measured (egress drop verified at 200 sheep / 4 players)
- [ ] The DO survives slow clients (backpressure eviction verified)
- [ ] Migrations cannot silently drift
- [ ] A safe staging surface exists for testing

Gate result: (record date, commit, and evidence here)
