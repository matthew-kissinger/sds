# Cycle 61 - pastoral-finish-and-bark-wolf

> Drafted 2026-06-05 after Cycle 60 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Scope note (Matt's calls, 2026-06-05):** this cycle bundles three notes Matt flagged into one cycle: (1) the lingering skeleton loader, (2) a real bark mechanic, (3) a wolf. Decisions confirmed in conversation:
> - **Bark pushes sheep** (the herding verb), and it is **deterministic** so it works in every solo mode AND multiplayer. The same bark event is designed to also repel a wolf later (a superset, documented intent), but no wolf reacts to bark this cycle.
> - **The wolf is ASSET-ONLY this cycle.** It is NOT wired into any current game mode. The goal is to source it (Quaternius CC0), integrate the loader + animations cleanly, and document it as a ready asset for a future predator-bearing mode. No wolf AI, no wolf in the sim, no wolf on the wire.
>
> This keeps the cycle at a comfortable **7 phases** (the earlier deterministic-wolf-antagonist phase is dropped; the wolf shrinks to one asset+doc phase).

## Goal

Cycle 61 does three things. First, it **finishes the Pastoral UI program**: the in-session scene-swap cover and the remaining stateful setup/editor/settings containers (plus the non-React fallback victory overlays) still wear the old tech palette while the entrance, HUD, pause, and completion are pastoral; this cycle retires the leftover skeleton loader and restyles those surfaces onto the pastoral design language with zero behavior change. Second, it **gives the dog a real bark verb**: bark becomes a player-triggered directional "sound wave" that drives the sheep in the dog's facing direction (a tactical burst to push a cluster through a gate, split a jam, or nudge stragglers at range), implemented in the deterministic sim so it works identically in every solo mode and in multiplayer co-op. Third, it **adds and documents the wolf as an asset**: the Quaternius CC0 wolf is integrated (loader + animation state machine, mirroring the dog) and documented as a ready drop-in for a future predator mode, with the bark-repel design intent recorded, but it is not placed in any current mode. Before: the dog can only push sheep by body-presence, there is no bark tool, some loading/menu surfaces flash the old dark shimmer, and there is no wolf asset. After: the dog has an active ranged herding tool that works everywhere, every UI surface is pastoral, and a documented wolf asset is ready for the next mode.

## How to read this plan

This doc fixes the *shape* of the changes (data contracts, where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code.
- **Measure on the actual hardware target** (RTX 3070 desktop, mid-tier mobile, Tab S9 FE) before committing to a technique.
- **Pick the simplest thing that meets the budget** rather than the most impressive.

## Open questions to resolve before writing code

(Prefix with **Q1**, **Q2**, ... so phases can refer to them.)

1. **Q1: Bark command bindings.** CONFIRMED: keyboard `Space` (currently unbound), gamepad `RB` (button 5, unused; `A`/`B` are zoom, `Y`/`X`/`Select` are camera/bank/note from Cycle 60), and a small bark button by the mobile joystick. Wired in P3; trivial to re-bind later.
2. **Q2: Bark feel constants (strawman, Matt's taste call).** CONFIRMED: bark affects sheep, gated by a **cooldown** as the single gate (no stamina cost in the baseline - add one in P7 only if a cooldown alone still feels too spammy in playtest). Author lean: forward cone half-angle ~50deg, range ~12m, one-shot impulse drive scaled by `1 - dist/range`, ~2.5s cooldown. The push is **directional forward** (drive sheep along the dog's facing), not a radial scatter; a small radial startle component can be added in P7 if the pure-forward version feels flat. Tune in P7.
3. **Q3: Which modes spawn a wolf?** RESOLVED: **none this cycle.** The wolf is asset-only (P6). It is documented as a ready asset for a future predator mode; placing it in a mode is that future mode's cycle.
4. **Q4: Non-React victory overlays - convert or retire?** RESOLVED: restyle both to pastoral in P2, don't retire. [`js/boot/completionOverlay.js`](../js/boot/completionOverlay.js) holds two: (a) the `showCompletionOverlay` fallback branch that fires only if the React `CompletionScreen` failed to register - keep it as a safety net but pastoral-skin its inline markup; (b) `showLocalCompletionOverlay`, which is NOT a fallback - it is the live completion screen for every 2-player local game, always non-React, still on the old emerald/amber/red/blue tech palette - restyle its inline markup to pastoral (real players see this one every local game). Restyle the inline `cssText`/`innerHTML` to pastoral tokens in place (zero behavior change: same buttons, handlers, scores). Do NOT reroute local-2P through React this cycle (that is a behavior change, out of P2 scope).
5. **Q5: Does bark repel the wolf?** RESOLVED for this cycle: **documented future intent, not implemented.** The bark impulse is emitted as an event (P4); a future predator mode wires the wolf to flee that same event. P6's `docs/wolf-asset.md` records this so the next-mode author inherits the design.

## Architecture / shared changes

The bark mechanic touches the deterministic-sim and wire fences; the wolf does not (it is asset-only this cycle). Two constraints keep the bark fences honest:

- **No edits to the frozen deterministic cores.** Bark is a **new** `shared/` module (`shared/BarkImpulse.js`), plus additive call sites in the non-frozen sheep-tick loops. With no bark active this tick, the sim is byte-identical to today, so every existing `tests/sim-baseline/__fixtures__/*.json` trace stays **byte-identical**. That byte-identity is the safety property and an acceptance line in P4.
- **Wire changes are additive and optional.** The bark edge on `playerInput` is an optional field. Absence = old behavior (no bark), so in-flight sessions on the old protocol soft-degrade with no version bump. P5 carries the full four-piece migration story (multiplayer.md): named change, in-flight story, consumer list, acceptance line.

Sheep-tick consumers that must stay in lockstep for the bark impulse (the three places sheep are simulated):

- **Worker authoritative MP sim:** [`worker/src/GameSim.js`](../worker/src/GameSim.js) (imports `shared/`).
- **Client MP predictor:** [`js/NetworkManager.js`](../js/NetworkManager.js) + [`js/MultiplayerState.js`](../js/MultiplayerState.js) (run shared sim for local prediction; confirm the exact entry when implementing).
- **Solo sheep system:** [`js/OptimizedSheep.js`](../js/OptimizedSheep.js) (the `flee()` / `fleeRadius` path; client-only, determinism not required but the impulse math must match the shared module so feel is identical).

The wolf is a **render-only client asset** this cycle: a new `js/Wolf.js` (GLTF + `SkeletonUtils.clone` + animation state machine, mirroring [`js/Sheepdog.js`](../js/Sheepdog.js)) and the Quaternius GLB through the existing asset pipeline. It imports nothing from `shared/` and touches no wire format.

## Phase shape rules

A cycle has **<= 8 phases**, each with a single sharp goal and EARS-format acceptance. A phase is either fully autonomous or fully paired (no mixed mode within a phase). This cycle is 7 phases, within the envelope.

## Acceptance criteria - EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/):

- **Event-driven**: `When [trigger], the [system] shall [response].`
- **State-driven**: `While [precondition], the [system] shall [response].`
- **Unwanted-event**: `If [unwanted], then the [system] shall [response].`

Each line should be **grep-testable**.

## Phase 1 - Retire the skeleton loader (~1.5hr)

**Independently testable. Comes first because it is the smallest note and unblocks the pastoral-cover consistency the rest of the restyle assumes.**

The Cycle 25 shimmer-skeleton still renders in [`js/components/ui/SceneSwapOverlay.tsx`](../js/components/ui/SceneSwapOverlay.tsx) (the `.sds-skel` hero + 3 rows + spinner, chrome in [`css/main.css`](../css/main.css) ~L248). It is skipped on the boot path (`window.__sdsBootLoading`) and the attract crossfade (`__sdsAttractCrossfadeActive`), but **every other in-session scene swap** (biome change, scene picker, some Play Again paths) falls through both gates and shows the old dark shimmer. That is the "skeleton sometimes" Matt sees.

1. **Restyle or reroute.** Either restyle `SceneSwapOverlay` to the pastoral glass look matching [`js/components/entrance/LoadingScreen.tsx`](../js/components/entrance/LoadingScreen.tsx), or route in-session swaps through the pastoral loading surface and delete the shimmer entirely. Prefer the second ("do it properly") if the swap lifecycle allows one cover to own both paths.
2. **Remove the dead `.sds-skel` CSS** from [`css/main.css`](../css/main.css) if the shimmer is fully retired.
3. **Delete the stale comment** `<!-- Skeleton loader will be dynamically loaded here -->` in [`index.html`](../index.html) (~L326).

**Acceptance (EARS):**

- When an in-session scene swap fires (not the world-first boot), the cover shall be the pastoral surface, not the dark shimmer skeleton.
- If the shimmer is fully retired, then `grep -ri "sds-skel" css/ js/` shall return no live render references.
- When `npm run build` runs, the production build shall be clean.

## Phase 2 - Pastoral container restyle sweep (~4hr, splittable)

**Depends on: Phase 1 (shared pastoral cover precedent).**

Restyle the remaining old-palette stateful containers onto the pastoral design language with **zero behavior change**: Sandbox setup, Fence editor, Shape editor, 2-player local setup, Settings, plus the non-React fallback victory overlays (Q4). The pastoral tokens and `.ui-panel` glass pattern already exist (Cycles 49-52); this is mechanical pattern-application, not new design.

1. **Inventory + map** each container to the existing pastoral token set (warm glass, cream/gold readouts, shared `Icon`).
2. **Apply** container by container; keep DOM structure and handlers identical (restyle only).
3. **Restyle both victory overlays in [`js/boot/completionOverlay.js`](../js/boot/completionOverlay.js) to pastoral** per Q4: pastoral-skin the `showCompletionOverlay` React-fallback markup (keep the safety net) and `showLocalCompletionOverlay` (the live 2-player local screen, not a fallback). Inline `cssText`/`innerHTML` restyle only, zero behavior change.

**Acceptance (EARS):**

- When each listed container renders, it shall use pastoral tokens (no old tech-palette colors).
- When a 2-player local game ends, the completion overlay shall render in pastoral tokens (no emerald/amber/red/blue tech palette).
- While a container or overlay is restyled, its behavior (handlers, state, validation) shall be unchanged from before the cycle.
- When `npm test` runs, all existing container/UI specs shall pass unchanged.

## Phase 3 - Bark command + feel (client input layer) (~3hr)

**Depends on: nothing (parallel with P1/P2). No sheep impulse yet - this phase wires the trigger and the feel.**

Make bark a **player command** that plays the existing `Bark` animation and `playSheepdogBark` audio on demand, gated by cooldown. No sheep impulse yet (that is P4), so this phase is pure client and independently shippable.

1. **Add a `bark` action** to [`js/InputHandler.js`](../js/InputHandler.js) `DEFAULT_BINDINGS` (Space) + the keydown edge handling (one-shot, not held).
2. **Gamepad:** map `RB` (Q1 confirmed) via [`js/GamepadManager.js`](../js/GamepadManager.js) `wasJustPressed` (the Cycle 60 edge primitive).
3. **Mobile:** a small bark button near the joystick in the mobile controls.
4. **Hook** the existing [`js/Sheepdog.js`](../js/Sheepdog.js) `triggerBark()` + `AudioManager.playSheepdogBark(dogType)` on the action edge, with a cooldown so it cannot be spammed.

**Acceptance (EARS):**

- When the player presses the bark key/button, the dog shall play the `Bark` animation and bark sound once, respecting the cooldown.
- While bark is on cooldown, a second press shall be ignored (no double-trigger).
- When a gamepad is connected, the mapped bark button shall trigger bark via `wasJustPressed`.

## Phase 4 - Bark deterministic impulse on sheep (shared core) (~4hr)

**Depends on: Phase 3 (the trigger exists). Fence-touching: new `shared/` module + sim-baseline regeneration.**

Add the directional push on sheep. A new module `shared/BarkImpulse.js` exports a pure `applyBarkImpulse(sheep, origin, facingAngle, config)` that, for each sheep inside the forward cone (Q2 constants), adds an outward/forward velocity impulse scaled by distance. It is called additively in all three sheep-tick consumers so solo and MP feel identical. The impulse is **directional drive** (along the dog's facing), not a radial scatter.

1. **New module** `shared/BarkImpulse.js` (pure, deterministic, no frozen-core edits). Export from [`shared/index.js`](../shared/index.js) (barrel - cycle-authorized below).
2. **Wire the call** into the authoritative sim [`worker/src/GameSim.js`](../worker/src/GameSim.js), the client predictor, and the solo [`js/OptimizedSheep.js`](../js/OptimizedSheep.js) path. Bark is event-gated: with no bark active this tick, the math is a no-op.
3. **Sim-baseline:** existing fixtures must stay byte-identical (bark is opt-in, so no-bark traces are unchanged - this is the safety check). **Add** new bark-scenario fixtures capturing a bark impulse under a fixed seed, with the decision recorded here.

**Migration story (deterministic core):** new module only; no edits to `MovementPhysics`/`FlockingAlgorithms`/etc. Existing `tests/sim-baseline/__fixtures__/*.json` regenerate **byte-identical** (proof bark is purely additive); new `bark-*.json` fixtures are added with explicit acceptance.

**Acceptance (EARS):**

- When bark fires, then sheep inside the forward cone shall receive a forward impulse scaled by distance, and sheep outside the cone/range shall be unaffected.
- When the no-bark sim-baseline fixtures regenerate, they shall be byte-identical to the committed traces.
- When a new `tests/sim-baseline/__fixtures__/bark-*.json` is added, this plan's Acceptance shall record it as intended new behavior. SHIPPED: `bark-impulse-60hz.json` (a 15-tick trace of a bark driving a 25-sheep cluster forward) is added as intended new behavior. The 8 pre-existing no-bark fixtures regenerate byte-identical, proven by running `UPDATE_FIXTURES=true` over all fixtures and confirming `git status` shows only the new bark fixture.
- When `npm test` runs, the bark-scenario spec shall pass and assert the cone/falloff shape.

## Phase 5 - Bark over the wire (MP authority) (~3hr)

**Depends on: Phase 4. Fence-touching: wire protocol (additive optional field).**

Carry the bark edge from client to the authoritative DO so multiplayer bark is server-authoritative and client-predicted.

1. **Add an optional `bark` edge** to the `playerInput` MessagePack message (a one-shot flag or input-sequence-tagged edge).
2. **Consume authoritatively** in [`worker/src/RoomDO.ts`](../worker/src/RoomDO.ts) (message handler) + [`worker/src/GameSim.js`](../worker/src/GameSim.js) (`applyPlayerInput` -> `applyBarkImpulse`), with the same input-validation trust boundary as `direction`/`inputSequence`.
3. **Send** from [`js/NetworkManager.js`](../js/NetworkManager.js); predict locally so bark feels instant.
4. **Update payload-shape tests.**

**Migration story (wire):** additive optional field; absence = no bark; **no protocol version bump** (old clients simply never send it, old DOs ignore an unknown field). Consumers updated this phase: client `NetworkManager`, Worker `RoomDO` handler + `GameSim`, any payload-shape test. Acceptance line confirms an old-format input (no `bark` field) is handled as no-bark.

**Acceptance (EARS):**

- When a client sends a bark edge, the DO shall apply the bark impulse authoritatively and broadcast the resulting sheep state.
- If an input arrives with no `bark` field (old client), then the DO shall treat it as no-bark and shall not error.
- When the bark wire spec runs, it shall assert the optional-field migration (old payload accepted).

## Phase 6 - Wolf asset integration + documentation (~4hr)

**Depends on: nothing (parallel with the bark phases). Client render only - the wolf is NOT wired into any game mode this cycle.**

Bring in the Quaternius **Ultimate Animated Animals** wolf (CC0 - license-clean, matches the repo's existing Quaternius CC0 rocks/scatter/flora and the CC BY-SA 4.0 asset posture). Stand up a `js/Wolf.js` that loads and animates it, mirroring [`js/Sheepdog.js`](../js/Sheepdog.js)'s GLTF + `SkeletonUtils.clone` + animation state machine, and document it as a ready drop-in.

1. **Source + place** the wolf GLB: raw into `assets/_originals/models/`, Draco-compressed runtime into `assets/models/` (match the dog pipeline). Record CC0 attribution.
2. **New `js/Wolf.js`** loader + animation state machine mapping Quaternius clip names to Idle / Walk / Run / Attack / Death states (the Quaternius rig is NOT the PolyArt dog rig, so this needs its own name mapping).
3. **A verification harness only** (e.g. a gated debug spawn or a `/gallery`-style preview) to confirm the wolf loads and animates. Do NOT place a wolf in any playable scene/mode.
4. **Document** `docs/wolf-asset.md`: source + license + attribution, the clip-name-to-state mapping, how to spawn it, and the **design intent for the future predator mode** (wolf prowls/chases/scatters sheep; bark repels it via the same bark event from P4; the wolf would become a deterministic `shared/WolfAI.js` + a wire field at that point).

**Acceptance (EARS):**

- When the wolf verification harness mounts a wolf, the wolf GLB shall load and play its Idle animation without console errors.
- When the wolf is driven by the harness, it shall blend Walk/Run animations by speed like the dog.
- While any current game mode is played, no wolf shall appear (asset-only this cycle).
- When `docs/wolf-asset.md` is written, it shall record the CC0 source/attribution, the clip-to-state mapping, and the future-mode bark-repel design intent.
- When `npm run build` runs, the wolf asset shall be in the build and the main-bundle ratchet shall be updated if it moved.

## Phase 7 - Bark tuning across modes + close (~3hr, paired)

**Depends on: Phases 3-5. Paired (Matt's taste + real-device).**

Tune the bark feel and close the cycle.

1. **Tune** bark cone/range/cooldown (Q2) on desktop + Tab S9 FE; baseline gate is cooldown-only, so decide whether a stamina cost is needed at all, and whether to add a small radial startle component.
2. **Confirm bark across modes:** every solo mode + Counting + a multiplayer room push sheep identically.
3. **Validate + close** via `/validate` then `/cycle-close`.

**Acceptance (EARS):**

- When the player barks in any solo mode AND in a multiplayer room, sheep shall be pushed identically.
- While bark feel is tuned, the constants shall live in one place (the bark config) for a single taste knob.
- When the cycle closes, `npm test` + `npm run build` shall pass and the sheepdogsim.com deploy shall succeed.

## Dependencies

```
P1 -> P2                         (UI restyle track, mostly serial)
P3 -> P4 -> P5                   (bark track: command -> impulse -> wire)
P6                               (wolf asset, fully independent - parallel with everything)
P3-P5 feed P7                    (tuning + close)
```

The UI track (P1-P2), the bark track (P3-P5), and the wolf asset (P6) are all independent and can run in parallel. P7 ties off bark and closes.

## Frozen files (cycle-specific additions)

The durable fence is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). This cycle authorizes these fence touches, **per the phase that names them**, with the four-piece migration story above (bark only - the wolf touches no fence this cycle):

- **[`shared/index.js`](../shared/index.js)** (barrel, multi-consumer) - P4 adds the export for `BarkImpulse`. Additive only.
- **[`tests/sim-baseline/__fixtures__/*.json`](../tests/sim-baseline/__fixtures__/)** - P4 regenerates. Existing fixtures must come back **byte-identical** (proof bark is additive); new `bark-*.json` fixtures are added with the explicit acceptance recorded in P4.
- **Wire protocol** (fence-frozen per [`multiplayer.md`](../.claude/rules/multiplayer.md)) - P5 adds the optional `bark` input edge. Consumers (`NetworkManager`, `RoomDO`, `GameSim`, payload-shape tests) updated in the same phase; additive/optional with the in-flight migration story.

No edits to the deterministic cores ([`MovementPhysics.js`](../shared/MovementPhysics.js), [`FlockingAlgorithms.js`](../shared/FlockingAlgorithms.js), [`BoundaryCollision.js`](../shared/BoundaryCollision.js), etc.). If a phase finds it needs one, **stop and surface to Matt.**

## Hard stops

Durable hard stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md). Cycle-specific additions:

1. **Any ULP drift in the no-bark sim-baseline fixtures aborts P4.** Existing traces must regenerate byte-identical. Drift there means bark is not purely additive - find the leak before continuing.
2. **A wire change that breaks an old-format payload aborts P5.** Old clients (no bark field) must soft-degrade, not error.
3. **The container restyle (P2) must be zero behavior change.** If a restyle touches a handler or changes validation, stop - that is not this phase.
4. **The wolf must not be wired into any current mode (P6).** It is asset-only. If a phase reaches to place a wolf in gameplay, stop - that is a future mode's cycle.
5. **Wolf licensing:** ship only CC0 (Quaternius) or other repo-compatible assets. Do NOT commit a paid Unity-Asset-Store GLB (e.g. PolyArt/Malbers Wolf) into the public AGPL repo.

## What NOT to do during this cycle

- **Don't edit the frozen deterministic cores.** Bark is a new module + additive call sites. (See Architecture.)
- **Don't bump the protocol version** for the additive bark field. It is optional; absence = no bark.
- **Don't make bark affect wolves this cycle.** No wolf is in any mode; the bark-repel reaction is documented future intent (P6 doc), not code.
- **Don't place a wolf in a playable scene or mode.** Asset-only. Documenting it as ready is the deliverable, not shipping it in gameplay.
- **Don't build `shared/WolfAI.js` or a wolf wire field this cycle.** Those belong to the future predator-mode cycle.
- **Don't expand the restyle** into new layouts or copy changes - it is a token-swap, zero behavior change.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass (incl. the new bark specs).
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, the sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When an in-session scene swap fires, no skeleton shimmer shall appear (Note 1 resolved).
- [ ] When the player barks in any solo mode AND in a multiplayer room, sheep shall be pushed identically (Note 2 resolved, all modes).
- [ ] When the wolf asset is added, it shall load and animate via the verification harness, appear in no current mode, and be documented in `docs/wolf-asset.md` (Note 3 resolved, asset-only).
- [ ] When the no-bark sim-baseline fixtures regenerate, they shall be byte-identical to the committed traces.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`.claude/rules/shared-sim.md`](../.claude/rules/shared-sim.md) - deterministic-sim discipline (bark phases P4)
- [`.claude/rules/multiplayer.md`](../.claude/rules/multiplayer.md) - wire-protocol change contract (P5)
- [`docs/sheep-dog-animations.md`](sheep-dog-animations.md) - dog rig + animation reference (wolf mirrors this)
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items
- [`docs/archive/cycles/cycle-60-plan.md`](archive/cycles/cycle-60-plan.md) - controller + playtest tooling (prior cycle)
- [EARS notation](https://kiro.dev/docs/specs/) - testable acceptance lines
