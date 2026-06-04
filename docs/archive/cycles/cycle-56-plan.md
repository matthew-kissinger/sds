# Cycle 56 — entity-collision

> Drafted + executed 2026-06-04 (autonomous, on Matt's "all, use your best judgement in line with vision" directive). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Give the dog a body the sheep cannot occupy. Before this cycle, the dog influenced sheep only through the soft flee steering force, so a dog charging a tight cluster visibly passed through the flock (it "ghosted"). After this cycle, the dog has hard-body presence: any sheep the dog overlaps is pushed out to the sum of body radii, so the dog plows the flock instead of sliding through it. This is the deferred physical-collision half of the session's original notes ("make dog grass and sheep collision better, make collision mesh?"); Cycle 55 did the grass half. Scoped conservatively to **dog to sheep** separation. Sheep to sheep hard-body collision is deliberately deferred (it needs in-browser tuning to avoid mutual-push jitter and is the perf-risky part at 5,000 sheep).

## Architecture / shared changes

This is a deterministic-sim change, so it follows the [`shared-sim.md`](../.claude/rules/shared-sim.md) discipline. The resolver is a new pure module so it can be called identically by all three sheep-integration paths the codebase maintains:

- **`shared/EntityCollision.js`** (new): `resolveDogSheepCollision(sheep, dogPos)` + `resolveDogSheepCollisions(sheep, dogs)`. Pure, deterministic (Math.sqrt only, no trig, no Math.random, no DOM, no `js/` import). Positional correction along the contact normal + removal of the into-the-dog velocity component, mirroring the dog-to-tree/rock push-out in [`js/Sheepdog.js`](../js/Sheepdog.js). Capped at `MAX_DOG_SHEEP_PUSH_PER_TICK` (0.35m) so a deep overlap resolves over a few ticks instead of snapping. Body radii: `DOG_BODY_RADIUS` 1.1, `SHEEP_BODY_RADIUS` 0.6.
- Three integration paths call it (the codebase keeps three separate sheep loops): the Worker authoritative tick, the client predictor/solo path, and the sim-baseline harness. Putting the math in one pure function keeps them in lockstep.

## Phase 1 — Pure resolver + unit test (autonomous)

1. `shared/EntityCollision.js` with the pure resolver and the body-radius/cap constants. Export from [`shared/index.js`](../shared/index.js).
2. `tests/entity-collision.spec.js` covering: no-op beyond range, push-out to the combined radius, the per-tick cap, inward-velocity removal, away-velocity preserved, co-located no-op (no NaN), determinism, and the multi-dog iterable helper.

**Acceptance (EARS):**

- When two entities are closer than the combined body radius, then `resolveDogSheepCollision` shall move the sheep out to exactly that radius (capped per tick).
- While the sheep is beyond the combined radius, then the resolver shall make no change and return false.
- When `npm run lint` runs, then `shared/EntityCollision.js` shall pass the `shared/**` no-restricted-imports + no-undef rules.

## Phase 2 — Worker + sim-baseline parity (autonomous)

1. Call `resolveDogSheepCollisions(sheep, this.sheepdogs.values())` in [`worker/src/GameSim.js`](../worker/src/GameSim.js) `updateSheep`, after `updateSheepMovementClientStyle` and before the hard boundary clamp (so the clamp re-contains any push).
2. Mirror the identical call (same order) in both tick functions of [`tests/sim-baseline/harness.js`](../tests/sim-baseline/harness.js).

**Acceptance (EARS):**

- When the sim-baseline suite runs, then `harness-parity.spec.ts` shall confirm `GameSim.updateSheep` is bit-identical to the harness tick (collision included).
- When the committed sim-baseline fixtures are compared, then they shall stay byte-identical (the baselines never bring a sheep within contact range, so collision is a no-op on them; no regeneration required).

## Phase 3 — Client predictor / solo path (autonomous)

1. Import `resolveDogSheepCollision` in [`js/OptimizedSheep.js`](../js/OptimizedSheep.js) and call it per active sheep after `updatePosition`, against `sheepdog` and `sheepdog2`.

**Acceptance (EARS):**

- When a sheep overlaps the dog in solo play, then the client shall push it out (the dog stops ghosting through the flock).
- While in multiplayer, then the Worker stays authoritative and any client prediction drift self-corrects on reconcile.

## Phase 4 — Validate + close (autonomous)

**Acceptance (EARS):**

- When `npm test` runs, then all vitest specs shall pass.
- When `npm run build` runs, then the production build shall be clean.
- When the close commit lands on `main`, then the deploy shall succeed via GH Actions.

## Frozen files (cycle-specific authorization)

This cycle adds a new file to the deterministic core (`shared/EntityCollision.js`) and adds one export line to the `shared/index.js` barrel. It does **not** modify any fence-frozen algorithm file ([`shared/MovementPhysics.js`](../shared/MovementPhysics.js), `FlockingAlgorithms.js`, `BoundaryCollision.js`, `GameStateValidation.js`, `Vector2D.js`, `objective.js`, `terrain/Heightfield.js`). Authorization for the deterministic-core addition: Matt's per-cycle "use your best judgement in line with vision" directive. The [`shared-sim.md`](../.claude/rules/shared-sim.md) discipline is satisfied (pure, lint-clean, baselines byte-identical, worker-to-harness parity verified).

## Migration story (multiplayer in-flight sessions)

- **No wire-format change.** Collision only moves existing sheep position fields; the MessagePack snapshot shape is unchanged, so no version tag is needed.
- **Deploy-window behavior.** A client on the old build (no collision) joining a room whose Worker has the new build predicts sheep without collision, but the Worker is authoritative and broadcasts collision-resolved positions at 60Hz; the old client reconciles to them. The only effect is slightly-less-accurate local prediction for old clients during the deploy window, which self-corrects. New clients predict with collision and track the Worker more closely.
- **Consumer updates (same commit):** worker `GameSim.js`, client `OptimizedSheep.js`, sim-baseline `harness.js`.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

1. If the resolver introduces `Math.random`, trig, a `three` import, or a `js/` import into `shared/`, stop (it breaks determinism / the shared boundary).
2. If `harness-parity.spec.ts` reports worker-to-harness drift, stop and reconcile before continuing (it predicts MP desync).
3. If the committed sim-baseline fixtures change unexpectedly, read the diff and decide intentionality before regenerating (they should stay byte-identical this cycle).

## What NOT to do during this cycle

- Do not add sheep-to-sheep hard-body collision. It needs in-browser tuning to avoid mutual-push jitter and is the perf-risky O(n^2) part at 5,000 sheep. Deferred to a future cycle.
- Do not make the collision push the dog (it would fight player input). One-directional only.
- Do not modify the fence-frozen algorithm files; the resolver is a new standalone module.

## Success criteria (cycle close)

- [x] When the cycle closes, all phases shall be shipped or deferred to BACKLOG carryover. (P1-P4 shipped; sheep-to-sheep deferred.)
- [x] When `npm test` runs, all vitest specs shall pass. (879 passed, 7 skipped, 0 failed; +10 from the new collision spec.)
- [x] When `npm run build` runs, the production build shall be clean.
- [x] When `npm run lint` runs, `shared/` shall pass. (clean.)
- [x] When the close commit lands on `main`, the deploy shall succeed via GH Actions. (Triggered by the close-commit push; run verified post-push.)
- [ ] When the dog charges a tight flock after this cycle, it shall plow the sheep rather than ghost through, and the push shall read as solid not jittery. DEFERRED to Matt's in-browser review (carried to BACKLOG); the autonomous run could not composite the look to taste-tune.

## Progress (closeout 2026-06-04)

Shipped autonomously in one close commit.

- **P1.** `shared/EntityCollision.js` (pure resolver, body radii 1.1 dog / 0.6 sheep, 0.35m/tick cap) + `shared/index.js` export + `tests/entity-collision.spec.js` (10 tests, all pass).
- **P2.** Wired into `worker/src/GameSim.js` (after integration, before boundary clamp) and both `tests/sim-baseline/harness.js` tick functions. `harness-parity.spec.ts` confirms worker-to-harness bit-identity with collision present. Committed sim-baseline fixtures stayed byte-identical (collision is a no-op on baseline scenarios), so no regeneration was needed.
- **P3.** Wired into `js/OptimizedSheep.js` per active sheep after `updatePosition`, against `sheepdog` + `sheepdog2`.
- **P4.** `npm run lint` clean, `npm test` 879 pass / 0 fail, `npm run build` clean.
- **Files touched:** new `shared/EntityCollision.js`, new `tests/entity-collision.spec.js`, `shared/index.js`, `worker/src/GameSim.js`, `js/OptimizedSheep.js`, `tests/sim-baseline/harness.js`.
- **Carryover:** in-browser feel review (Matt); sheep-to-sheep hard-body collision (future cycle); optionally add a sim-baseline fixture that starts a sheep under the dog so the regression net exercises the collision path directly (the unit test + parity test cover it for now).

## References

- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) — deterministic-sim discipline.
- [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) — DO-authoritative / client-predict contract.
- [`js/Sheepdog.js`](../js/Sheepdog.js) — the dog-to-obstacle hard push-out this mirrors.
