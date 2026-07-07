# Cycle 111 - core-bark-onboarding

> Drafted 2026-06-28 from Matt's playtest transcript and follow-up product decisions.

## Goal

Make bark a core skill verb, improve the first-session path into an easy scored run, surface leaderboard progress more clearly, and modernize the completion screen. Newsheepdogland and survival remain a tech sandbox and must not be re-enabled publicly in this cycle.

## Product Decisions

1. Bark is a core skill, not a minor assist.
2. Sheep bark response is hybrid: directional sound wave from the dog facing plus radial pressure away from the dog.
3. Bark audio should be short, immediate, calm, and pastoral rather than aggressive, targeting roughly 300-900ms unless playtesting proves otherwise.
4. The bark visual should show range, cone width, speed, and amplitude without covering the playfield.
5. The first 60 seconds means tutorial/introductory experience, not a marketing splash; it should teach bark and route players toward an easy leaderboard-eligible run.
6. Leaderboards should favor quick dopamine by surfacing active/scored boards and easy ranked targets.
7. Preferred beginner leaderboard options are Quick 25 as the obvious first ranked goal or a new small First Pen board only if product/design impact is accepted.
8. Newsheepdogland/survival stays publicly gated.

## Phase 1 - Audit and Asset Sources

1. Record the current bark, tutorial, leaderboard, completion, and NSL gating files.
2. Source 2-4 calm bark sounds from license-compatible sources. Prefer CC0.
3. Document source URL, author, license, and runtime asset path.

**Acceptance (EARS):**

- When Phase 1 ships, then the cycle plan shall name the files that own bark input, shared bark physics, audio playback, bark HUD, tutorial, leaderboards, completion, and NSL gating.
- When bark audio assets are added or replaced, then each committed bark shall be trimmed/normalized for short, immediate skill use.
- When bark audio assets are added or replaced, then docs shall list source URL, author, license, and target runtime path.
- If a sound's license is unclear or incompatible, then it shall not be committed.

## Phase 2 - Shared Hybrid Bark

**Fence authorization:** This phase modifies `shared/BarkImpulse.js`. It is not listed in `docs/INTERFACE_FENCE.md`, but it is a deterministic shared module imported by browser and Worker. This phase authorizes only the bark primitive and its direct tests/fixtures. It does not authorize `shared/MovementPhysics.js`, `shared/FlockingAlgorithms.js`, `shared/Vector2D.js`, `shared/terrain/Heightfield.js`, scene schemas, migrations, or unrelated sim tuning.

1. Retune `DEFAULT_BARK_CONFIG` only as needed to make bark a visible core skill.
2. Change `startBarkSteering()` so affected sheep steer along a normalized hybrid of dog-facing wave direction and dog-to-sheep radial pressure.
3. Keep the response bounded through acceleration intent only; do not directly edit sheep velocity.
4. Update solo and Worker behavior through the existing callers.
5. Update `tests/bark-steering.spec.js`, `tests/worker/bark-wire.spec.js`, and the bark-specific sim-baseline fixture only if the diff matches this phase's accepted behavior.

**Acceptance (EARS):**

- When a sheep is inside bark range and cone, then it shall receive steering in a hybrid direction with both forward-wave and radial components.
- When a sheep is outside range or cone, then bark shall leave it untouched.
- When the next sheep update runs after bark, then speed shall stay within the configured sheep speed envelope.
- When survival wolves exist, then the existing wolf repel path shall remain functional.
- If the bark sim-baseline fixture changes, then this plan's Acceptance Notes shall record why the new trace is intentional.
- If any no-bark sim-baseline fixture changes, then the change shall be reverted before continuing.

## Phase 3 - Bark UI and World Wave

1. Add a bark readiness/cooldown HUD affordance for desktop and mobile.
2. Add a world-space sound-wave effect at bark fire time. Use existing Three.js render primitives unless TSL/WebGPU fits without fragile renderer branching.
3. Keep the lower-middle playfield clear and avoid a modal or large explanatory panel.

**Acceptance (EARS):**

- When bark is ready, then the HUD shall show bark availability.
- When bark is cooling down, then the HUD shall show cooldown progress.
- When bark fires, then the world shall show a subtle expanding cone/wave matching bark range and width.
- If WebGPU/TSL is unavailable, then the effect shall still render without console errors.

## Phase 4 - Introductory Path

1. Teach bark in the tutorial/introductory experience.
2. Fix stale practice/tutorial copy that still says 30 sheep when the configured intro run is 3 sheep.
3. Route completion/skips toward an easy ranked challenge.

**Acceptance (EARS):**

- When a first-time player accepts the tutorial, then bark shall be taught as an intentional skill.
- When tutorial/practice copy mentions sheep count, then it shall match the configured count.
- When an intro/practice run completes, then the completion flow shall recommend an easy ranked challenge instead of fake leaderboard credit.

## Phase 5 - Leaderboard and Completion UX

1. Surface easy scored boards and boards with scores more clearly.
2. Make Quick 25 the obvious first ranked goal, or add a separate small First Pen board only if the product/design impact is accepted.
3. Keep tutorial/practice unranked unless a separate small board is intentionally added.
4. Modernize completion screen layout and copy around score, leaderboard save state, next action, replay, leaderboard, and menu.

**Acceptance (EARS):**

- When the leaderboard opens, then active/scored boards shall be easier to find.
- If a new leaderboard partition is added, then worker validation, client tabs, tests, and copy shall all be updated consistently.
- When a ranked run saves, then leaderboard feedback shall be prominent on the completion screen.
- When a practice/tutorial run completes, then the screen shall avoid fake leaderboard language and recommend the next scored run.
- When viewed on mobile and desktop, then the completion screen shall fit without overlapping controls or overflowing.

## Phase 6 - Newsheepdogland Sandbox Guard

1. Keep Newsheepdogland/survival publicly gated.
2. Ensure bark, tutorial, leaderboard, and completion changes do not accidentally promote NSL or survival in the entrance/default flow.
3. Keep existing dev/deep-link access for testing only if it already exists.

**Acceptance (EARS):**

- When the public entrance loads, then the NSL tile shall remain unavailable/coming soon unless Matt explicitly approves re-enable work.
- When bark changes land, then sandbox wolf/bark behavior shall still pass any applicable tests or probes.
- If any task requires changing NSL public availability, then the implementation shall stop for product approval before continuing.

## Phase 7 - Validation

1. Run focused bark tests after shared changes.
2. Run `npm test` before finalizing player-facing client/shared changes.
3. Run `npm run build` after import, UI, or asset changes.
4. Run browser smoke for bark visual, tutorial/onboarding, leaderboard, and completion UI.
5. Confirm Newsheepdogland remains gated in the public entrance.

**Acceptance (EARS):**

- When implementation is complete, then the final handoff shall list commands run and results.
- If any required validation cannot run, then the handoff shall name the remaining risk.

## Audit Files

- Bark input: `js/InputHandler.js`, `js/main.js`, `js/MobileControls.js`, `js/components/GameHUD/MobileControls.tsx`
- Shared bark physics: `shared/BarkImpulse.js`
- Client sheep integration: `js/OptimizedSheep.js`
- Worker authority: `worker/src/GameSim.js`
- Bark audio: `js/AudioManager.js`, `js/Sheepdog.js`, `assets/sounds_compressed/*.mp3`
- Bark HUD: `js/components/GameHUD/BarkHint.js`, `js/components/GameHUD/BarkMeter.js`, `js/components/hooks/useGameState.js`, `js/components/App.js`
- Bark visual: `js/effects/BarkWaveEffect.js`, `js/main.js`
- Tutorial: `js/components/Tutorial/tutorialMachine.js`, `js/components/Tutorial/startTutorial.js`, `js/components/Tutorial/TutorialOverlay.tsx`, `js/components/Tutorial/TutorialOffer.tsx`, `js/locales/en/index.js`
- Leaderboards: `js/components/Multiplayer/GlobalLeaderboard.tsx`, `worker/src/d1.ts`, `shared/difficulty.js`
- Completion: `js/boot/completionOverlay.js`, `js/components/GameHUD/CompletionScreen.tsx`
- NSL gating: `js/components/entrance/worlds.ts`, `js/components/entrance/Entrance.tsx`

## Acceptance Notes

- Phase 1: Replaced bark runtime sounds with short CC0 Freesound-derived MP3s and documented sources/licenses in `docs/bark-audio-assets.md`.
- Phase 2: Modified only `shared/BarkImpulse.js` in the shared deterministic boundary. The bark fixture diff is intentional: bark now applies stronger 36-tick hybrid dog-facing/radial acceleration intent with minimum range falloff. `tests/sim-baseline/__fixtures__/bark-steering-60hz.json` was regenerated after verifying all nine no-bark baseline fixtures passed unchanged.
- Phase 3: Added desktop bark cooldown meter, mobile bark-button cooldown ring, and a world-space expanding cone wave driven by `DEFAULT_BARK_CONFIG`.
- Phase 4: Tutorial now includes an accepted-bark step and localized bark copy; the tutorial remains a 3-sheep goal inside the 30-sheep Just Play practice run.
- Phase 5: Public leaderboard now defaults to the first ranked 25-sheep board, surfaces non-empty board counts, keeps practice unranked, and completion recommends Quick 25 after practice while making ranked save feedback and leaderboard navigation more prominent.
- Phase 6: Newsheepdogland remains gated in the entrance and was removed from the public leaderboard picker for this cycle.
- Phase 7: Bundle-size ratchets were bumped intentionally after `npm run build`: `mainKB` 634 -> 637, main chunk budget 635 -> 638 KiB, i18n 140 -> 141 KiB for tutorial bark copy, and other 683 -> 690 KiB for the new lazy bark UI/effect chunks.
- Phase 7: Validation passed for `npm test -- --run tests/bark-steering.spec.js tests/worker/bark-wire.spec.js`, `npm test -- --run tests/ui/tutorialMachine.spec.ts`, `npm test -- --run tests/leaderboard-modes.spec.js tests/ui/tutorialMachine.spec.ts tests/ui/useGameState.store.spec.ts`, `npm test -- --run tests/sim-baseline/baseline.spec.ts`, fixture regeneration of only `tests/sim-baseline/__fixtures__/bark-steering-60hz.json`, `npm test -- --run tests/ui/locale.parity.spec.ts tests/refactor-baseline/baseline.spec.ts`, full `npm test`, `npm run build`, `npm run lint`, `npm run typecheck`, a custom installed-Chrome smoke for bark cooldown/effect plus practice completion to leaderboard navigation, and `npm run test:e2e -- --project=chromium` (11 passed, 3 skipped).
- Phase 7 follow-up: Rendered browser audit found the first-run tutorial offer was under the React overlay stacking context and could not be clicked. `js/ui/overlayRail.js` now keeps the body-level rail above `#react-overlay`, `tests/ui/toastHub.spec.ts` covers that contract, and the installed-Chrome audit now proves the offer starts the tutorial, the tutorial reaches the bark prompt, bark advances to the 3-sheep herding step, and Newsheepdogland renders as a disabled Coming soon tile.
- Phase 7 final rerun after the rail fix: `npm test`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test:e2e -- --project=chromium`, and `git diff --check` all passed. Agent-started preview/dev listeners were stopped after browser validation.
- Phase 7 controller/camera follow-up: Bundle-size ratchets were bumped intentionally after `npm run build`: `mainKB` 637 -> 638 and main chunk budget 638 -> 639 KiB for menu gamepad activation, solo arrow-key zoom, controller zoom copy, and close follow-camera tutorial framing.
