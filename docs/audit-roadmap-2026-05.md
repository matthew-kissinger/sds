# Security / Perf / Coverage / Determinism Audit + Execution Roadmap

> Drafted 2026-05-31. Source: four multi-agent audit workflows (determinism sweep, worker security, per-frame perf, test-coverage gaps) run against `main` at v2.1.10. This is the durable record of the findings and the proposed execution sequencing for Cycles 51+. It does NOT change the active Cycle 50 (`object-impostor-plumbing`) scope. Acting on any `shared/` item still requires a cycle phase with explicit acceptance per [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md).

## TL;DR

- **Worker security: 1 critical, ~11 high, ~6 medium, 2 low.** The critical is a live remote-unauthenticated identity takeover on a deployed backend. Highest priority.
- **Determinism: 0 live MP-desyncs.** The scoping lead (unseeded retirement RNG) was refuted as a desync (server-authoritative + broadcast, client copies it verbatim), but is a real reproducibility wart in the fence-frozen core.
- **Per-frame perf: a handful of genuinely high-leverage allocations** (Worker O(N^2) loop-invariant filter, per-frame `Object3D`, a 5000-wide grass gather). Most of the larger "critical" list is the `shared/` boid path, which only runs on the Worker DO + offline harness (Solo Chaos uses the pooled client `ExtremeBoidSystem`).
- **Coverage: 41 gaps, keystone first.** The sim-baseline harness hand-mirrors `GameSim` with no drift check, so today every fixture asserts the harness matches itself, not the authoritative Worker.

## Audit results at a glance

| Audit | Confirmed | Cleared | Run |
|---|---|---|---|
| Determinism / MP-desync | 0 live (1 reproducibility wart) | 33 | `wf_a3c044bf-1c7` |
| Worker security | 19 (1 crit / 11 high / 6 med / 2 low; a few fold) | 4 | `wf_32c9bf74-abb` |
| Per-frame perf | 31 (top ~4 actionable) | 4 | `wf_32c9bf74-abb` |
| Test coverage | 41 gaps | 0 | `wf_32c9bf74-abb` |

Provenance: ~221 agents, ~9.7M output tokens across the scoping run + two audit runs.

## Act-now: the one live exploit

[`worker/src/index.ts:127`](../worker/src/index.ts) - `/api/register` reads a client-supplied `persistent_id`, validates only that it is a non-empty string, and mints a valid 24h HS256 JWT for it. `persistent_id` is disclosed verbatim by the unauthenticated `GET /api/leaderboard`. So any attacker harvests a victim id from the public board, POSTs `/api/register`, and receives a cryptographically valid token authenticating as that victim: overwrite their bests, inflate `competitive_wins`, forge daily times, impersonate them in rooms. The JWT crypto itself is sound (HS256-only, constant-time compare, exp enforced); the defect is that the principal it signs is attacker-chosen. This is the root that makes the score-forgery and impersonation findings reachable. Fix = `P-SEC-1` (drafted in [`proposed-cycle-identity-authn.md`](proposed-cycle-identity-authn.md)).

## Confirmed worker-security findings

All are `touchesFrozen: false` (worker code is outside the deterministic fence; no fix changes the MessagePack message shape).

| Sev | Finding | Site |
|---|---|---|
| critical | Self-asserted `persistent_id` mints a JWT for any identity | `index.ts:127` |
| high | WS upgrade authorizes on an unauthenticated `?playerId=`, no JWT binding (session hijack) | `RoomDO.ts:313` |
| high | Host-only actions gated on a spoofable session id | `RoomDO.ts:431` |
| high | `playerInput` with missing/non-object `direction` throws in the un-try-caught 60Hz tick (freezes the room) | `GameSim.js:326` |
| high | Unbounded `pendingInputs` queue, O(n^2) drain | `GameSim.js:992` |
| high | WS frames MessagePack-decoded with no size/depth cap | `RoomDO.ts:382` |
| high | One JWT can create unlimited Durable Objects, no idle cleanup | `index.ts:151` |
| high | 5000-sheep solo room pins a DO at O(n^2) (no min-player gate) | `GameSim.js:485` |
| high | LobbyDO public-room map grows unbounded (prune only on read) | `LobbyDO.ts:80` |
| high | Solo/daily scores fully client-supplied; anomaly tag never filters on read | `index.ts:377` |
| high | `competitive_wins` inflated via repeated `/api/score` (MP path bypassed) | `d1.ts:506` |
| high | Daily-challenge accepts forged times with an attacker-chosen date partition | `d1.ts:57` |
| medium | `/api/event` reads `claims.sub` so attribution is always null | `index.ts:472` (quick win, applied) |
| medium | Unauthenticated `/api/register` no rate limit (row flood + discriminator squat) | `index.ts:118` |
| medium | No rate limiting on any endpoint (root enabler) | `index.ts:93` |
| medium | Unauthenticated `/api/event` one D1 row/request, no retention | `index.ts:450` |
| medium | Unauthenticated `/api/leaderboards` fans out to 7 D1 aggregate queries | `index.ts:415` |
| medium | Host migration promotes insertion-order[0], reconnecting host cannot reclaim | `RoomDO.ts:621` |
| medium | Client-asserted dog position enables a stamina-free glide | `GameSim.js:334` |
| medium | NaN `clientPosition` bypasses the 5m clamp, latches interpolation | `GameSim.js:337` (quick win, applied) |
| low | NaN/Infinity `direction` flows into velocity (defense-in-depth) | `GameSim.js:326` |
| low | Non-numeric `sequence` locks out a session's own inputs | `GameSim.js:318` |

Cleared (refuted, not cherry-picked): the JWT `alg`-header check is a real hardening footgun but not a present bypass (no `none` short-circuit, no asymmetric verify branch, secret is private); all SQL is parameterized via `.bind` (no SQLi); three findings folded as duplicates.

## Top perf findings (honest ranking)

The genuinely high-leverage wins, in order:

1. **`GameSim.js:485`** - loop-invariant `this.gameState.sheep.filter(s => s.state === 0)` recomputed per sheep inside `updateSheep()` (O(N^2) time + garbage). Worker, non-fence. Heaviest single allocator.
2. **`OptimizedSheep.js:555`** - `new THREE.Object3D()` per frame (~8 nested allocs). Client, non-fence. Quick win, applied.
3. **`main.js:2177`** - grass-interaction gather `.filter().filter().sort().slice()` over up to 5000 sheep every frame. Client, non-fence. HIGH.
4. **`GameSim.js:1040/1059`** - per-tick snapshot object map. Worker; serialized shape is wire-frozen so a pooling fix must preserve byte-identical output.

The `shared/FlockingAlgorithms.js` boid clones (separation/seek/flee/accumulators, lines 26/39/57/65/93/118/137/160/170/181) and `MovementPhysics.js:78` are real but: (a) only run on the Worker DO (2-4p MP) + offline harness, not the 5000-sheep client path, and (b) are fence-frozen, byte-identical fixes that must batch into one verify-unchanged pass. See `P-PERF-1`.

## Coverage: keystone + buckets

**Keystone (`P-DET-2`):** [`tests/sim-baseline/harness.js`](../tests/sim-baseline/harness.js) hand-mirrors `GameSim` and its own README admits there is no automated drift check. `GameSim.js` is imported by exactly one spec (objective-only). So every sim-baseline fixture asserts the harness matches itself, not the authoritative Worker. A `harness-parity.spec.ts` that drives a real `GameSimulation` and asserts bit-identical per-tick positions vs the harness makes all other traces meaningful and is the prerequisite for trusting everything below.

Other high-value buckets: `jwt.ts`, `LobbyDO.ts`, and `RoomDO` message/host-authority/migration paths have zero unit coverage (e2e is excluded from vitest); the desync-critical `shared/` sim-core functions are exercised only transitively via the harness; `CameraController.js` and `StructureBuilder.js` (743 + 881 LOC) have zero specs; locale key parity across 5 locales is unchecked.

## Determinism: clean, with one reproducibility wart

0 confirmed live MP-desyncs across 19 swept sim files / 33 verified sites. `for...in` ordering: fully clean. Transcendentals: all one-time setup or render-leaf (yaw/facing, wire-quantized + re-derived per tick). The unseeded RNG in `shared/GameStateValidation.js` (corral retirement lines 37/87/794, spawn lines 310/381) is reached per-tick from the Worker tick loop but is server-authoritative and broadcast (the client copies it verbatim, never re-runs it), so it is not a desync. It is a determinism-contract / replay-reproducibility wart: the sim-baseline harness already has to wrap it in `withSeededRandom` to get a stable trace, and any future client-side retirement prediction would desync by construction. Fix = `P-DET-1` (seed it through the existing `mulberry32`).

Caveat: at high fan-out many verifier subagents failed to emit structured output, so "0 confirmed" rests on the 33 completed verdicts plus the structural argument (server-authoritative + broadcast + single-source), not an individual verdict on every candidate.

## Execution roadmap (Cycles 51+)

14 phases across 4 lanes, sequenced around one fence pin. None touch the Cycle 50 impostor pipeline, so all are post-Cycle-50 (or parallel via separate worktrees if concurrent cycles are run).

### Lane A - Security (worker-only, zero fence, highest severity)

- **P-SEC-1 - Identity authn rebuild** (paired). Server-mint `persistent_id`, bind the JWT to a server-chosen opaque subject, require proof-of-possession before re-issuing for an existing id. Pair in the `jwt.ts` unit spec. The critical linchpin; must land first.
- **P-SEC-2 - WebSocket identity binding + host authority** (paired). Bind the WS upgrade to the verified JWT; re-derive host actions and host migration from the authenticated identity. The host-action and migration fixes depend on the upgrade binding (one phase). Pair in RoomDO host-authority / handlePlayerLeave / hostChanged / handleWebSocket specs.
- **P-SEC-3 - Input trust boundary + tick try/catch** (autonomous). One shared `validateInput` helper for direction/clientPosition/sequence finiteness; wrap `GameSim.tick()` in try/catch so one bad input can't freeze the room. (The two one-line halves are applied as quick wins already; this phase is the cohesive version.)
- **P-SEC-4 - DoS guardrails** (paired). Pre-decode byte cap + decoder limits; cap `pendingInputs`; per-connection message-rate limit; min-player gate on high sheep counts; idle-cleanup alarm + per-pid room cap; LobbyDO map cap + prune alarm; front-door rate limiter. Split into 4a (per-connection caps) / 4b (lifecycle + HTTP rate limits) if over ~4h. Pair in LobbyDO / joinRoom / hydration specs.
- **P-SEC-5 - Score authority + anomaly-filter-on-read** (paired). Reject `competitive`/`timed` on public `/api/score`; gate the leaderboard read on `score_anomalies IS NULL` (migration-0003 index exists); validate daily date vs UTC + sheepCount vs `dailySeed`. Pair in the index.ts REST-handshake spec.

### Lane B - Determinism + sim coverage (the fence pin)

- **P-DET-1 - Seed spawn + corral RNG, regenerate sim-baseline ONCE** (paired, HIGH fence, intentional regen). Both the corral-retirement RNG and the two spawn sites live in the same file (`shared/GameStateValidation.js`) and `shared/Random.js` already ships `mulberry32` + `withSeededRandom` unused. One fence touch, one regeneration, recorded acceptance. The master sequencing pin.
- **P-DET-2 - Sim-core characterization specs against the NEW baseline** (autonomous, read-only). `harness-parity.spec.ts` (keystone) + Vector2D / mulberry32 golden / withSeededRandom restore-on-throw / validateEntityState NaN / updateMovement / applyAcceleration / updateStamina / boid components / corral state machine / tickObjective. Written after P-DET-1 so asserted numbers match intended behavior. `P-COV-1` and `P-COV-2` block on this.

### Lane C - Perf

- **P-PERF-1 - shared/ scratch-pooling, ONE verify-unchanged fence touch** (paired, HIGH fence, verify-only). All 9 byte-identical `shared/FlockingAlgorithms.js` + `MovementPhysics.js` allocation sites in one PR; sim-baseline is VERIFIED unchanged (any ULP drift aborts). Must NOT share P-DET-1's regenerate PR.
- **P-PERF-2 - Worker GameSim.js allocations** (autonomous, wire-shape only). The O(N^2) filter (485), per-sheep/per-dog validateEntityState fallbacks (609/400), per-tick snapshot maps (1040/1059/1078). Run after P-SEC-4's min-player gate (both touch 485). Pair the worker-snapshot-shape spec.
- **P-PERF-3 - Client per-frame allocations** (autonomous, mostly non-fence). main.js grass gather + interaction literals; OptimizedSheep obstacle/gate scratch; Sheepdog move() cluster + Heightfield.normal; CameraController transformMovement; GrassSystem Sphere/Map iteration. Prefer client-side pooling for the two shared-origin alloc sites to avoid the fence.

### Lane D - Independent coverage

- **P-COV-1 - Worker competitive/timed authoritative-tick specs** (autonomous, read-only). Competitive boundary/gate/retirement/win-progress + timed removal/respawn/timeout. Blocks on P-DET-2's harness-parity.
- **P-COV-2 - New sim-baseline fixtures** (paired, HIGH fence, additive). Field-gate retirement trace + harness call; Chaos-scale trace (fence-free perf-vitest alternative exists). After P-DET-1.
- **P-COV-3 - Client render-module + i18n parity specs** (autonomous, no fence). CameraController, StructureBuilder, interpolateRotation, locale parity + placeholder consistency + LanguageSelector. No ordering constraint; ideal autonomous filler. Unlocks the missing-locale-key quick wins.

### Sequencing

```
Lane A (security): P-SEC-1 -> P-SEC-2 -> (P-SEC-3 || P-SEC-4) -> P-SEC-5   [parallel to all other lanes]
Lane B (det pin):  P-DET-1 -> P-DET-2 -> (unblocks P-COV-1, P-COV-2)
Lane C (perf):     P-PERF-1 (order vs P-DET-1) ; P-PERF-2 (after P-SEC-4) ; P-PERF-3 (independent)
Lane D (cov):      P-COV-3 (anytime) ; P-COV-1 + P-COV-2 (after P-DET-2)
```

Do not interrupt Cycle 50. Natural order after it closes: the determinism-fix cycle (Lane B) is imminent, security (Lane A) is highest-severity and can interleave or precede, perf and the broad coverage lanes follow.

## Two structural insights that shape execution

1. **Batch `shared/` fence touches by change-class, never by audit.** Three classes: P-DET-1 regenerates (intentional trace change), P-PERF-1 verifies-unchanged (drift aborts), P-COV-2 adds fixtures. Merging the byte-identical perf pooling into the determinism regen PR would hide a real ULP regression inside the deliberate diff. Keep them in separate PRs so "sim-baseline changed" always means exactly one thing.
2. **`harness-parity.spec.ts` is the coverage keystone.** Until it lands, none of the sim-baseline traces actually guard the authoritative Worker, so adding fixtures or trusting competitive specs is built on sand.

Also worth fixing while in the area: both audits independently found that [`tests/integration/harness.spec.ts`](../tests/integration/harness.spec.ts) round-trips a fictional wire shape (`t:'state'`, `dogs:{...}`, `dogType:'rex'`) the producer never emits (real: `t:'gameStateUpdate'`, `sheepdogs:[...]`). The worker-snapshot-shape spec (paired into P-PERF-2) should assert against the real `createGameStateSnapshot` output.

## Quick wins (status as of 2026-05-31)

Applied to the working tree (worker + client, non-fence, behavior-identical for legitimate inputs):

- [x] `index.ts:472` read `claims.persistent_id` not `claims.sub` (un-nulls authenticated telemetry).
- [x] `GameSim.js:337` clamp as `if (!(d2 <= 25)) return;` (NaN fails closed instead of bypassing).
- [x] `OptimizedSheep.js:555` hoist `new THREE.Object3D()` to `this._dummy`.
- [x] `GrassSystem.js:1632` hoist `new THREE.Sphere()` to `this._cullSphere`; swap two Map-entry loops to `.values()`.

Deploy of the worker change is a separate explicit step (the worker is live); not auto-deployed.

Remaining quick win, deferred to P-COV-3 + a locale backfill: wire `PublicLobbyList` to the already-existing `multiplayer.publicLobbies` key.

## Caveats

- The determinism "0 confirmed" rests on 33 completed verdicts + a structural argument; verifier subagents failed at high fan-out (see above).
- The perf audit's raw "11 critical" over-weights the `shared/` boid path; the honest top-4 is above.
- Full per-finding detail (every `why`/`fix`/`refutation`) lived in the workflow run outputs, which are ephemeral; this doc captures the actionable subset.
