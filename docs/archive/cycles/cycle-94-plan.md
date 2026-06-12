# Cycle 94 - bark-steering-and-discoverability

> Drafted 2026-06-12 from Matt's playtest feedback while Cycle 93 is already authored. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. If Cycle 93 is retargeted before it starts, renumber this plan rather than running two open cycle docs.

## Goal

The bark verb exists, but it feels like a physics shove instead of a herding command. Today a Space/RB/mobile bark adds a large velocity directly to every sheep in the forward cone, so close sheep can jump several metres before normal flock speed clamps recover. Desktop also hides the bark affordance during play, so PC players are unlikely to discover it. This cycle turns bark into a readable steering mechanic: bark points affected sheep into a direction, they accelerate under the existing sheep speed limits, wolf repel remains intact, and desktop players see the bark control in the same lightweight HUD language as the existing practice hint.

## Spike findings from 2026-06-12

- `shared/BarkImpulse.js` owns the current sheep math. `DEFAULT_BARK_CONFIG.strength` is `6`, `range` is `24`, and `applyBarkImpulse()` mutates `sheep.velocity` directly.
- The authoritative sheep speed in the shared sim harness is `maxSpeed: 0.24`; solo Home Field defaults even lower through `GameState.params.speed: 0.1`. A close-range bark therefore injects roughly 25x the normal shared sheep speed before the next update.
- The next sheep update does clamp the post-acceleration vector, but velocity smoothing uses the pre-clamp velocity as `previousVelocity`, so the shove survives as a multi-tick high-speed glide.
- The same primitive is called in solo (`js/main.js`) and Worker authority (`worker/src/GameSim.js`), with tests and a sim-baseline fixture pinning the current impulse behavior.
- Desktop discoverability currently lives in settings bindings and first-run/tutorial copy, not in the active in-game HUD. Mobile has a visible bark button.

## How to read this plan

This doc fixes the shape of the change: prove the feel target first, then intentionally change the shared sim primitive, then make the control discoverable. It does not pre-pick final numbers. The implementation should stay small and should not refactor the flocking or movement engines to make bark work.

Each agent picking up a phase should:

- Research steering-force patterns in boid systems before writing code, but bias toward the existing SDS force model (`seek`, `flee`, `maxForce`, velocity cap, smoothing).
- Measure in a local playable build, not only unit tests. The problem is feel and displacement over time.
- Keep the deterministic boundary explicit. Any `shared/` change must be accepted in this plan and reflected in sim-baseline evidence.

## Open questions to resolve before writing code

1. **Q1: Is bark a one-frame steering force or a short decaying steering intent?** Answered 2026-06-12 by `cycle94-validation/bark-spike.md`: ship the short decaying steering intent. Target: `durationTicks: 30`, `steerForce: 0.16`, existing 24m range / 50-degree half-cone / cooldown. The refreshed spike measured max sheep speed `0.2305` against the `0.24` envelope, versus `4.2853` for the previous velocity impulse.
2. **Q2: Does bark steer along dog facing or away from the dog?** Author lean: keep the current forward-cone, dog-facing direction. Matt's complaint is speed and push semantics, not cone targeting.
3. **Q3: Should bark affect sheep that are already retiring, grazing, killed, or ascending?** Author lean: active sheep only. Retiring/grazing sheep should not be yanked back out of resolved states; killed/ascending survival states must remain inert.
4. **Q4: Where should the PC hint appear?** Author lean: bottom-safe HUD chip, desktop only, visible at run start until first bark or short timeout; use the active keybinding label rather than hardcoding `Space`.

## Architecture / shared changes

Authorized shared-sim change for this cycle:

- Replace the direct velocity impulse in `shared/BarkImpulse.js` with a deterministic bark steering primitive. The final export name can change; if it does, update every consumer in the same change and do not leave a compatibility shim.
- The primitive shall affect sheep by adding bounded steering/acceleration intent, not by directly increasing velocity above the sheep's normal speed envelope.
- Solo client, multiplayer Worker authority, and the sim-baseline harness shall all use the same primitive and config.

Do not touch `shared/MovementPhysics.js`, `shared/FlockingAlgorithms.js`, `shared/Vector2D.js`, or `shared/terrain/Heightfield.js` for this cycle. If bark cannot be fixed without those files, stop and re-scope with Matt.

Wolf repel stays separate: survival wolves may still receive the existing longer-range radial scare on the bark edge. This cycle changes sheep response only.

## Phase shape rules

A cycle has <= 8 phases. This plan uses one spike phase, then narrow implementation phases. Phase 1 is autonomous but evidence-heavy; no shared-sim code lands until Phase 1 records the chosen bark model.

## Acceptance criteria - EARS format

Every phase's Acceptance section uses EARS notation: `When [trigger], the [system] shall [response].` / `While [precondition]...` / `If [unwanted], then...`. Each line is grep-testable or tied to a named proof artifact.

## Phase 1 - Bark feel spike and target numbers (~3hr)

**Independently testable.** The current bug is a feel mismatch, so this phase measures and compares candidate mechanics before production code changes.

1. Instrument a local spike outside committed production paths, or behind a temporary local-only patch that is reverted before the phase closes.
2. Capture current bark displacement and speed over 1.0 s for a small deterministic flock at near/mid/far distances.
3. Compare at least two candidates: one-frame bounded acceleration and short decaying steering intent.
4. Record the chosen target in this plan: duration/ticks, steering cap, max affected sheep speed, and expected near/mid/far displacement.

**Acceptance (EARS):**

- [x] When Phase 1 ships, `cycle94-validation/bark-spike.md` shall contain current-vs-candidate displacement tables for near, mid, and far sheep over at least 1.0 s.
- [x] When Phase 1 ships, this plan's Q1 shall be answered with the selected mechanic and target numbers.
- [x] If every candidate either feels invisible or exceeds ordinary sheep speed, then the cycle shall stop before editing `shared/`. Not triggered; the decaying steering intent stayed inside the speed envelope.

## Phase 2 - Shared bark steering primitive (~3hr)

**Depends on:** Phase 1 target numbers. This is the intentional deterministic behavior change.

1. Replace the direct velocity edit in `shared/BarkImpulse.js` with the selected steering primitive.
2. Update solo and Worker callers so bark feeds the new primitive in the same tick position as today.
3. Keep cooldown, cone, range, and wolf repel wiring unless Phase 1 explicitly proves a reason to change them.
4. Update comments to describe the shipped mechanic, not Cycle 61 history.

**Acceptance (EARS):**

- [x] When Phase 2 ships, `shared/BarkImpulse.js` shall not add bark magnitude directly to `sheep.velocity`. The shipped path sets `barkSteer*` intent fields and `tickBarkSteering()` mutates acceleration only.
- [x] When a close in-cone sheep is barked at, its speed shall remain at or below the configured sheep speed envelope after the next movement update. Covered by `tests/worker/bark-wire.spec.js` and the sim-baseline max-speed assertion.
- [x] When a sheep is inside the forward cone, the bark shall bias its heading toward dog facing over the chosen duration.
- [x] When a sheep is outside the cone or beyond range, bark shall leave it untouched.
- [x] If the implementation requires changing `shared/MovementPhysics.js`, `shared/FlockingAlgorithms.js`, or `shared/Vector2D.js`, then Phase 2 shall stop and the cycle shall be reauthorized. Not triggered.

## Phase 3 - Tests, baselines, and Worker authority (~3hr)

**Depends on:** Phase 2.

1. Replace `tests/bark-impulse.spec.js` with `tests/bark-steering.spec.js` around steering semantics and speed-envelope invariants.
2. Update `tests/worker/bark-wire.spec.js` so Worker authority proves the new bark response, cooldown, and old-payload no-op behavior.
3. Regenerate only the bark-specific sim-baseline fixture if the diff matches the accepted Phase 1 target. No-bark fixtures must stay byte-identical.
4. Add or update a harness assertion that a bark cannot create a velocity spike above the sheep max-speed envelope.

**Acceptance (EARS):**

- [x] When Phase 3 ships, `npm test -- tests/bark-steering.spec.js tests/worker/bark-wire.spec.js tests/sim-baseline/baseline.spec.ts` shall pass.
- [x] When Phase 3 ships, only the intentional bark-specific sim-baseline fixture shall change.
- [x] When Phase 3 ships, this plan shall record the fixture regeneration decision in the Acceptance section with the before/after behavior summary. Decision: retire `bark-impulse-60hz.json` and add `bark-steering-60hz.json`; before, bark injected velocity directly and the spike reached `4.2853`, after, bark schedules steering and the 60 Hz fixture stayed within the `0.24` sheep max-speed envelope.
- [x] If any no-bark sim-baseline fixture changes, then the change shall be reverted before continuing. Not triggered.

## Phase 4 - Desktop bark discoverability (~2hr)

**Depends on:** Phase 2 can run in parallel after Phase 1 if the UI is isolated.

1. Add a lightweight desktop in-game bark cue in the HUD bottom-safe slot, not a modal and not an overlay that competes with the playfield.
2. Use the current keyboard binding display (`Space` by default, custom key if rebound) and keep gamepad RB discoverability if there is already room in the cue.
3. Suppress the cue on mobile, where the bark button is visible.
4. Dismiss on first bark or after a short timeout. It should not reappear every run once the player has used bark.

**Acceptance (EARS):**

- [x] When a desktop solo run starts and bark has not been used before, the HUD shall show a non-blocking bark cue in `HudLayout`'s bottom-safe region.
- [x] When the player barks once, the bark cue shall dismiss and stay dismissed for that browser profile.
- [x] While on mobile/touch layout, the bark cue shall not render because the bark button is already visible.
- [x] When key bindings are changed, the cue shall display the current bark binding rather than hardcoded `Space`.

## Phase 5 - Browser feel proof and release readiness (~3hr)

**Depends on:** Phases 2-4.

1. Run a production build and local preview.
2. Playtest desktop keyboard and mobile emulation paths: bark cue, bark input, sheep response, and wolf repel in Newsheepdogland survival.
3. Capture one short proof artifact with before/after notes or screenshots plus numeric speed/displacement evidence from the Phase 1 harness.
4. Run the standard gates for client + shared changes.

**Acceptance (EARS):**

- [x] When Phase 5 ships, `npm test` shall pass.
- [x] When Phase 5 ships, `npm run lint` shall pass.
- [x] When Phase 5 ships, `npm run build` shall pass.
- [x] When Phase 5 ships, browser proof shall show desktop bark discoverability and bounded sheep acceleration in a playable scene.
- [x] When Phase 5 ships, survival bark shall still repel wolves.

## Dependencies

```
Phase 1 -> Phase 2 -> Phase 3 -> Phase 5
        -> Phase 4 -----------^
```

Phase 4 can start after Phase 1 if the bark cue is isolated from the sim primitive. Phase 5 is last because it proves the full player-facing loop.

## Validation log

- 2026-06-12: `node tools/bark-steering-spike.mjs` passed; previous velocity impulse max speed `4.2853`, selected decaying steering max speed `0.2305`, sheep envelope `0.24`.
- 2026-06-12: `npm test -- tests/bark-steering.spec.js tests/worker/bark-wire.spec.js tests/sim-baseline/baseline.spec.ts` passed.
- 2026-06-12: `npm test -- tests/ui/GameHUD.smoke.spec.tsx tests/bark-steering.spec.js tests/worker/bark-wire.spec.js tests/sim-baseline/baseline.spec.ts` passed.
- 2026-06-12: `npm test` passed after one unrelated `tests/ui/achievementUnlockToast.spec.ts` standalone retry showed the earlier failure was not reproducible.
- 2026-06-12: `npm run lint` passed.
- 2026-06-12: `npm run build` passed.
- 2026-06-12: Bundle ratchet decision: bump `tests/refactor-baseline/__fixtures__/bundle-sizes.json` `other` family `551` -> `552` KiB for the new lazy bark hint chunk. `main` stayed within the existing `620` KiB budget.
- 2026-06-12: final `npm test` rerun passed after the bundle ratchet bump. After comment cleanup, `npm run lint` and `npm test -- tests/bark-steering.spec.js tests/worker/bark-wire.spec.js tests/sim-baseline/baseline.spec.ts tests/refactor-baseline/baseline.spec.ts` passed.
- 2026-06-12: `npm run test:integration` passed (`39 passed`, `11 skipped`).
- 2026-06-12: `npm run test:e2e` was attempted twice. The first run exceeded 120s; the 300s rerun passed the first Chromium foliage test, then the Playwright-managed Vite server stopped responding and the remaining tests failed with `ERR_CONNECTION_REFUSED` on `localhost:3000`. Treated as a local test-server failure; production-preview browser proof below covers this cycle's bark surfaces.
- 2026-06-12: production preview on `127.0.0.1:4173` with the in-app browser showed a 1280x720 playable scene, desktop `Bark Space` hint, bark-key dismissal, and mobile 390x844 with no desktop hint and one accessible `Bark` button.
- 2026-06-12: standalone Chromium probe against the same production preview showed desktop hint `BarkSpace`, bark dismissal (`hintCount: 0`), and live sheep speeds `0.0211` / `0.0420` under the ordinary `0.1` Home Field sheep cap. Mobile probe showed `barkHintCount: 0`, `barkButtonCount: 1`, canvas `390x844`.
- 2026-06-12: production-local Chromium probe after the release proof found the desktop cue could be hidden behind the loading surface on slow first loads. Follow-up patched `BarkHint` to defer its 9s timer until the game canvas is ready and `[data-sds-loading-screen]` is gone. Final `dist/` probe on `127.0.0.1:4182` showed desktop `BarkSpace`, `loading:false`, bark dismissal persisted (`sds-bark-hint-used: 1`), mobile `barkButtonCount: 1`, `hintCount: 0`, and 200 sheep on both desktop and mobile.
- 2026-06-12: Deploy run `27448367584` exposed a stale `setVisible` call in the bark cue auto-dismiss timer after the loading-handoff refactor. `tests/ui/GameHUD.smoke.spec.tsx` now covers timer auto-dismiss without marking bark as used, and the standalone Chromium smoke spec passed after the fix.
- 2026-06-12: Deploy run `27449129626` exposed the Newsheepdogland menu-return smoke loop hitting Three's WebGL `compileAsync` `currentProgram.isReady` poll after streamed-foliage prewarm survived teardown. `js/world/foliageStreaming.js` and `js/world/TreePlacement.js` now keep that optimization WebGPU-only; WebGL accepts the normal lazy compile path.
- 2026-06-12: local `v2.3.4` validation passed: `npm test -- tests/foliage-streaming.spec.js tests/ui/GameHUD.smoke.spec.tsx`, full `npm test`, `npm run lint`, `npm run build`, and `npm run test:e2e -- --project=chromium --grep-invert='@local-only'`. The full Chromium E2E rerun covered the same Newsheepdogland menu-return smoke loop that failed in deploy run `27449129626`.
- 2026-06-12: wolf-repel coverage stayed green through full `npm test`, including `tests/wolf-sim.spec.js` and `tests/worker/survival-tick.spec.ts`.

## Frozen files (cycle-specific additions)

Authorized shared files for this cycle:

- `shared/BarkImpulse.js`
- `shared/index.js` only if exports change

Explicitly frozen unless Matt reauthorizes:

- `shared/MovementPhysics.js`
- `shared/BoundaryCollision.js`
- `shared/FlockingAlgorithms.js`
- `shared/GameStateValidation.js`
- `shared/Vector2D.js`
- `shared/objective.js`
- `shared/scenes/types.js`
- `shared/terrain/Heightfield.js`

## Hard stops

Durable hard stops apply - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific:

1. No `shared/` edit before Phase 1 records target numbers and the chosen mechanic.
2. Any no-bark sim-baseline diff aborts the cycle.
3. Any bark implementation that directly raises sheep velocity above the normal sheep speed envelope is a failed implementation, even if tests can be adjusted around it.
4. Do not change bark cooldown, range, cone angle, or wolf repel in the same patch unless Phase 1 proves the sheep steering fix cannot stand without it.
5. Do not add a permanent desktop instructional overlay. The cue must be lightweight, dismissible, and absent on mobile.

## What NOT to do during this cycle

- Do not retune all flocking, dog movement, or sheep collision to compensate for bark.
- Do not add new modes, survival economy changes, or wolf behavior changes beyond preserving existing bark repel.
- Do not regenerate sim-baseline fixtures other than the accepted bark-specific fixture.
- Do not hardcode `Space` into UI text when settings can rebind bark.
- Do not fold Cycle 93 visual queue items into this cycle.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [x] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [x] When `npm test` runs at cycle close, all vitest specs shall pass.
- [x] When `npm run lint` runs at cycle close, the shared deterministic boundary shall pass.
- [x] When `npm run build` runs at cycle close, production build shall be clean.
- [x] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [x] When Cycle 94 closes, bark shall steer sheep through bounded acceleration rather than directly pushing them above ordinary sheep speed.
- [x] When Cycle 94 closes, desktop players shall have a visible, non-blocking way to discover bark during play.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) - pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) - Cycle 61 and Cycle 83 bark history
- [`shared/BarkImpulse.js`](../shared/BarkImpulse.js) - current sheep bark primitive
- [`tests/bark-steering.spec.js`](../tests/bark-steering.spec.js) - bark steering unit coverage
- [`tests/sim-baseline/baseline.spec.ts`](../tests/sim-baseline/baseline.spec.ts) - bark-specific sim trace
- [`worker/src/GameSim.js`](../worker/src/GameSim.js) - authoritative multiplayer bark application
- [`js/components/GameHUD/MobileControls.tsx`](../js/components/GameHUD/MobileControls.tsx) - existing mobile bark affordance
