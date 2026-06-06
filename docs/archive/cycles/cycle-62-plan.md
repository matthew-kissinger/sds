# Cycle 62 - sheep-hard-body-collision

> Drafted 2026-06-05 after Cycle 61 closed; redirected by Matt on 2026-06-06 from the wolf-predator scaffold to sheep collision feel. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Status: CLOSED 2026-06-06.** Matt asked to work on sheep-to-sheep hard-body collision and to make dog contact hold visually when sheep keep moving their heads or backs through the dog. This deterministic-sim cycle shipped the shared resolver, all consumers, tests, baselines, and `v2.2.1` release docs.

## Goal

Before: Cycle 56 gave the dog a body, but it stayed conservative and intentionally deferred sheep-to-sheep collision. The remaining issue is visual and mechanical: sheep can still pack through each other, and their elongated head/body mesh can read as sliding through the dog even when the center-point dog collision runs.

After: active sheep separate from nearby sheep through a deterministic spatial-hash pass, the dog-sheep contact radius matches the visible sheep body better, and collision corrections snap the render position when needed so the visual mesh does not lag behind the resolved physics. The solution must stay performant at the 5,000-sheep ceiling and must run through the same shared code in the Worker, client, and sim-baseline harness.

## Phase 1 - Shared collision core

1. Extend [`shared/EntityCollision.js`](../shared/EntityCollision.js) with a deterministic sheep-to-sheep resolver.
2. Use a fixed-cell spatial hash keyed by stable input order, not an O(n^2) all-pairs pass.
3. Keep the resolver pure: no DOM, no Three.js, no random draws, no trig.
4. Tune dog-sheep radius/cap for visible head/back clearance without shoving the dog.

**Acceptance (EARS):**

- When two active sheep overlap, the shared resolver shall separate them along their contact normal with a capped per-tick correction.
- When sheep are outside the hard-body radius, the resolver shall leave them untouched.
- When 5,000 sheep are distributed across a field, the resolver shall use grid-neighbor checks rather than all-pairs checks.
- If two sheep are exactly co-located, then the resolver shall choose a deterministic finite push direction.
- When a sheep is moving into another sheep or dog, the resolver shall remove the inward velocity component.

## Phase 2 - Worker, client, and harness wiring

1. Wire the sheep collision pass into [`worker/src/GameSim.js`](../worker/src/GameSim.js) after sheep integration and before final validation.
2. Wire the same pass into [`js/OptimizedSheep.js`](../js/OptimizedSheep.js), using reusable scratch storage and updating render positions for corrected sheep so the visual mesh cannot keep ghosting through a body.
3. Wire the same pass into [`tests/sim-baseline/harness.js`](../tests/sim-baseline/harness.js) so harness parity remains meaningful.

**Acceptance (EARS):**

- When the Worker ticks a flock, the authoritative positions shall include sheep-to-sheep separation.
- When the client predicts or runs solo sheep, it shall apply the same shared resolver and keep corrected render positions in sync.
- When the sim-baseline harness ticks, it shall call the same shared resolver in the same order as `GameSim`.
- If a collision correction pushes a sheep toward the dog, then the dog-sheep resolver shall still keep the sheep outside the dog body before the frame is accepted.

## Phase 3 - Tests and baselines

1. Extend [`tests/entity-collision.spec.js`](../tests/entity-collision.spec.js) for sheep-to-sheep separation, exact overlap, velocity correction, deterministic output, and grid-neighbor behavior.
2. Run the sim-baseline suite and inspect any fixture diff.
3. If existing fixtures change, accept only intentional collision behavior and record the reason here before committing regenerated goldens.

**Acceptance (EARS):**

- When `npm test` runs, collision unit tests and sim-baseline parity shall pass.
- If a sim-baseline fixture changes, then this plan shall name the changed fixture and why the new behavior is intended. INTENDED: `sheep-60hz-20s.json`, `island-boundary-rh-60hz.json`, `island-boundary-oc-60hz.json`, `corral-retirement-rh-60hz.json`, and `bark-impulse-60hz.json` were regenerated because the new sheep-to-sheep hard-body pass separates dense active sheep that previously overlapped in those traces. The unchanged dog/stamina/reconcile/objective fixtures confirm the change is limited to flock-body contact.
- When `npm run lint` runs, `shared/` shall stay clean.
- When `npm run build` runs, the production build shall be clean.

## Phase 4 - Closeout

1. Update [`NEXT_SESSION.md`](../NEXT_SESSION.md) and [`docs/BACKLOG.md`](BACKLOG.md) with the closed collision status and any remaining feel-tuning carryover.
2. Leave wolf predator mode, second mode edition, and tablet perf as future-cycle candidates unless Matt redirects again.

**Acceptance (EARS):**

- When Cycle 62 closes, all shipped collision behavior shall be documented in `BACKLOG.md`.
- When another agent picks up cold, `NEXT_SESSION.md` shall identify the latest closed cycle and the next candidate work.

## Validation

- `npm test -- tests/entity-collision.spec.js` passed.
- `npm test -- tests/sim-baseline/harness-parity.spec.ts` passed.
- `npm test -- tests/sim-baseline/baseline.spec.ts` passed after intentional fixture regeneration.
- `npm run lint` passed.
- Full `npm test` passed.
- `npm run build` passed; the main-bundle ratchet was intentionally accepted from `558 KiB` to `561 KiB` for the client collision resolver.
- `npx playwright test --project=chromium --grep-invert='@local-only'` passed, matching the GitHub Deploy E2E lane.
- A targeted `?cinematic=1` browser proof placed overlapping sheep/dog bodies and confirmed physics and rendered distances stayed outside the collision thresholds with no console errors.

## Frozen files and deterministic contract

The durable fence is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). This cycle authorizes:

- [`shared/EntityCollision.js`](../shared/EntityCollision.js) - add sheep-to-sheep collision and tune dog-sheep constants.
- [`shared/index.js`](../shared/index.js) - export new collision helper(s) and constants.
- [`tests/sim-baseline/__fixtures__/*.json`](../tests/sim-baseline/__fixtures__/) - regenerate only if the collision behavior intentionally changes a fixture; record the exact fixture and reason in this plan.

Do not edit frozen deterministic cores such as `MovementPhysics.js`, `FlockingAlgorithms.js`, `BoundaryCollision.js`, `GameStateValidation.js`, `Vector2D.js`, `objective.js`, or `terrain/Heightfield.js`.

## Hard stops

1. Do not ship an O(n^2) sheep-to-sheep pass.
2. Do not make sheep push the player-controlled dog.
3. Do not regenerate sim-baseline fixtures merely to make tests pass.
4. Stop if the collision pass creates visible jitter or sheep explosions in a normal 200-sheep flock.

## Success criteria (cycle close)

- [x] When `npm test` runs, all specs shall pass.
- [x] When `npm run lint` runs, shared lint shall pass.
- [x] When `npm run build` runs, the production build shall be clean.
- [x] When a dense flock is simulated, sheep shall no longer collapse through each other.
- [x] When sheep contact the dog, the visible mesh shall not keep sliding through the dog because of render-position lag.
- [x] When the collision path runs at flock scale, it shall use a spatial hash and bounded neighbor checks.

## References

- [`docs/archive/cycles/cycle-56-plan.md`](archive/cycles/cycle-56-plan.md) - prior dog-to-sheep collision cycle
- [`docs/BACKLOG.md`](BACKLOG.md) - deferred sheep-to-sheep item
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) - deterministic-sim discipline
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
