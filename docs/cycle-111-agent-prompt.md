# Cycle 111 Fresh Agent Prompt - Core Bark and Onboarding

You are working in `C:\Users\Mattm\X\games-3d\sds`, the Sheep Dog Simulator repo. Read `AGENTS.md`, `NEXT_SESSION.md`, `docs/INTERFACE_FENCE.md`, and `docs/cycle-111-plan.md` before editing. This cycle comes from Matt's playtest notes: bark should become a core skill, onboarding should route players toward easy scored dopamine, completion/leaderboard surfaces should be clearer, and Newsheepdogland/survival should remain a tech sandbox.

## Product Alignment

- Make bark a primary skill verb, not a small assist.
- Bark response should be hybrid: a directional sound wave from the dog's facing plus radial pressure away from the dog.
- Bark audio should be short, immediate, calm, and pastoral. Avoid aggressive guard-dog barks.
- Bark visuals should show range, width, speed, and amplitude without blocking play.
- The first-session/tutorial experience should teach bark and then point toward an easy leaderboard-eligible run.
- Leaderboards should surface boards that already have scores and easy ranked targets.
- The win/completion screen should feel like the modern game UI, with prominent save/rank feedback and clear next actions.
- Newsheepdogland/survival stays gated. Do not make it public or promote it as a finished mode.

## Source Candidates For Bark Audio

Prefer CC0 sources and document every committed sound in `docs/`. These candidates were checked on 2026-06-28 and their pages showed Creative Commons 0:

- Tiny Dog Bark by qubodup, 0.222s: https://freesound.org/people/qubodup/sounds/813120/
- Dog Shih Tzu Bark Single 06.wav by Glitchedtones, 1.082s: https://freesound.org/people/Glitchedtones/sounds/372527/
- Dog bark 3 by Sadiquecat, 0.433s: https://freesound.org/people/Sadiquecat/sounds/850824/
- Small dog bark by giddster, 1.991s: https://freesound.org/people/giddster/sounds/484297/

Use only sounds that remain license-compatible after verification. Normalize them into short runtime MP3s in `assets/sounds_compressed/`. Target roughly 300-900ms of usable bark length unless playtesting proves otherwise. The current `dog_bark_jep.mp3` is about 3 seconds and feels too long/delayed; replace it or stop using it.

## Important Constraints

- Do not introduce JSX.
- Do not add dependencies unless there is a clear reason and bundle impact is checked.
- Do not touch frozen shared files casually. Bark changes in `shared/` require intentional test/baseline handling.
- Do not regenerate sim-baselines just to make tests pass.
- Do not re-enable Newsheepdogland publicly.
- Keep the work scoped to bark as core skill, onboarding, leaderboards, and completion UX.

## Task DAG

T0. Confirm repo constraints and active plan.

- Depends on: none.
- Read `AGENTS.md`, `NEXT_SESSION.md`, `docs/INTERFACE_FENCE.md`, `docs/cycle-111-plan.md`.
- Confirm current git status and distinguish user changes from agent changes.
- Do not modify frozen shared files except `shared/BarkImpulse.js`, which is authorized in `docs/cycle-111-plan.md` for this cycle only.
- Do not touch D1 migrations or re-enable Newsheepdogland/survival.

EARS:

- When the agent starts, then it shall identify the active cycle as Cycle 111 core-bark-onboarding.
- When the worktree is dirty, then the agent shall identify which changes are pre-existing and shall not revert unrelated work.
- If a proposed change touches a frozen shared module other than `shared/BarkImpulse.js`, then the agent shall stop and ask.
- If a proposed change would promote NSL/survival publicly, then the agent shall reject that change.

T1. Audit current ownership before edits.

- Depends on: T0.
- Inspect bark input, bark physics, sheep integration, Worker authority, audio playback, bark HUD, tutorial, leaderboard, completion, and NSL gating files listed in `docs/cycle-111-plan.md`.

EARS:

- When audit is complete, then the final handoff shall name the files changed and the files intentionally left alone.
- If an existing behavior is unclear, then the agent shall inspect call sites before changing it.

T2. Replace or add calm bark audio assets.

- Depends on: T1.
- Source 2-4 calm bark sounds, ideally CC0.
- Trim/normalize to short, immediate barks suitable for repeated skill use. Target roughly 300-900ms unless playtest proves otherwise.
- Update `js/AudioManager.js` and preload paths if required.
- Add a small docs file recording source URL, author, license, original title, and runtime path.

EARS:

- When the player barks, then the sound shall start immediately and finish before the bark cooldown under normal playback.
- When multiple dogs bark, then dog-specific bark selection shall still work or intentionally map to documented shared sounds.
- If a source license is not clearly compatible, then the sound shall not be committed.

T3. Implement hybrid bark response.

- Depends on: T1.
- Modify only `shared/BarkImpulse.js` for deterministic bark behavior.
- Keep the existing acceleration-intent model; do not directly edit sheep velocity.
- Retune `DEFAULT_BARK_CONFIG` only enough to make bark readable and useful.
- Preserve Worker and client byte-identical behavior through the existing import.

EARS:

- When a sheep is inside bark range and cone, then it shall receive steering in a normalized hybrid of dog-facing direction and dog-to-sheep radial direction.
- When a sheep is outside bark range or cone, then bark shall leave it untouched.
- When the next sheep update runs after bark, then sheep speed shall remain within the configured speed envelope.
- When survival wolves exist in sandbox contexts, then the existing wolf repel path shall still work.

T4. Add bark readiness and world-space bark wave feedback.

- Depends on: T2, T3.
- Add desktop and mobile bark readiness/cooldown feedback through the existing HUD/state system.
- Add a subtle world-space wave/cone effect on bark fire. Use existing Three.js primitives unless WebGPU/TSL fits without renderer branching or fragility.
- Do not cover the playfield with instructional text.

EARS:

- When bark is ready, then the HUD shall show bark availability.
- When bark is cooling down, then the HUD shall show cooldown progress.
- When bark fires, then the world shall show an expanding wave/cone matching bark range and cone width.
- If WebGPU/TSL is unavailable, then the bark effect shall still render without console errors.

T5. Make onboarding teach bark and route to easy ranked play.

- Depends on: T2, T3, T4.
- Update tutorial machine/copy so bark is taught as a skill.
- Fix stale copy such as "Just 30 sheep" when the configured intro/practice count is 3 sheep.
- Keep tutorial/practice unranked unless a separate intentional board is added.
- After intro/practice completion, recommend a quick/easy ranked challenge.

EARS:

- When a first-time player accepts the tutorial, then bark shall be introduced as a required or explicit skill step.
- When tutorial/practice copy mentions sheep count, then it shall match the configured count.
- When an unranked intro/practice run ends, then the UI shall avoid fake leaderboard credit and recommend the next scored run.

T6. Improve leaderboard surfacing.

- Depends on: T1.
- Make active/scored boards and easy ranked targets easier to find.
- Preferred beginner options are to make Quick 25 the obvious first ranked goal or add a separate small First Pen board only if the product/design impact is accepted.
- Preserve the scene-aware leaderboard contract. Prior repo context indicates leaderboard API calls require an explicit `scene` parameter.
- Do not invent ranked tutorial credit unless product explicitly chooses that.

EARS:

- When the leaderboard opens, then boards with scores and quick ranked boards shall be easier to locate than empty or niche boards.
- When switching scenes/modes, then requests shall continue to include the correct scene identifier.
- If a board has no scores, then it shall not visually outrank a board with recent or existing scores unless it is the recommended beginner target.
- If adding a new leaderboard partition, then worker validation, client tabs, tests, and copy shall all be updated consistently.

T7. Modernize completion/win screen.

- Depends on: T5, T6.
- Improve completion UI around score, save state, rank/leaderboard feedback, replay/share, quick retry, next recommended run, and main menu.
- Keep layout compact and readable on mobile and desktop.

EARS:

- When a ranked run saves, then the completion screen shall prominently show saved/leaderboard feedback.
- When a ranked run fails to save, then the completion screen shall make retry or failure state clear without implying success.
- When a practice/tutorial run completes, then the screen shall recommend an easy ranked run and avoid fake rank language.
- When viewed at mobile and desktop sizes, then controls and text shall not overlap or overflow.

T8. Keep Newsheepdogland as a sandbox.

- Depends on: T0.
- Keep Newsheepdogland/survival publicly gated.
- Ensure bark, tutorial, leaderboard, and completion changes do not accidentally promote NSL or survival in the entrance/default flow.
- Dev/deep-link access for testing may remain if it already exists.

EARS:

- When the public entrance loads, then the NSL tile shall remain unavailable/coming soon unless Matt explicitly approves re-enable work.
- When bark changes land, then sandbox wolf/bark behavior shall still pass any applicable tests or probes.
- If any task requires changing NSL public availability, then the agent shall stop and ask before implementing.

T9. Validate and record acceptance.

- Depends on: T2, T3, T4, T5, T6, T7, T8.
- Run focused bark tests first.
- Run `npm test` before finalizing client/shared changes.
- Run `npm run build` after imports/UI/assets change.
- Run browser smoke for bark, tutorial/onboarding, leaderboard, completion, and NSL gating.
- If bark sim-baseline fixture changes, regenerate only the intentional bark fixture and record why in `docs/cycle-111-plan.md` Acceptance Notes.

EARS:

- When validation completes, then the final handoff shall list commands run and results.
- If a no-bark sim-baseline fixture changes, then the agent shall revert that fixture before final handoff.
- If a required validation cannot run, then the final handoff shall name the remaining risk and the exact command that still needs to pass.

## Implementation Notes From Audit

- Current shared bark owner: `shared/BarkImpulse.js`.
- Current client bark call path: `js/main.js` calls `sheepdog.triggerPlayerBark()` and `startBarkSteering(...)`.
- Current Worker bark call path: `worker/src/GameSim.js` calls `startBarkSteering(...)` after cooldown checks.
- Current sheep application path: `js/OptimizedSheep.js` calls `tickBarkSteering(this)`.
- Current bark audio owners: `js/AudioManager.js`, `js/Sheepdog.js`, `assets/sounds_compressed/`.
- Current bark hint/HUD owners: `js/components/GameHUD/BarkHint.js`, `js/components/hooks/useGameState.js`, `js/components/App.js`, `js/components/GameHUD/MobileControls.tsx`.
- Current tutorial owners: `js/components/Tutorial/tutorialMachine.js`, `js/components/Tutorial/startTutorial.js`, `js/components/Tutorial/TutorialOverlay.tsx`, `js/components/Tutorial/TutorialOffer.tsx`, `js/locales/en/index.js`.
- Current leaderboard owner: `js/components/Multiplayer/GlobalLeaderboard.tsx`.
- Current completion owner: `js/boot/completionOverlay.js`, `js/components/GameHUD/CompletionScreen.tsx`.
- Current NSL gating owner: `js/components/entrance/worlds.ts`, `js/components/entrance/Entrance.tsx`.

## Final Handoff Format

Return:

1. What changed.
2. What was intentionally not changed.
3. Validation commands and results.
4. Any EARS criteria not fully satisfied.
5. Source/license notes for bark audio.
6. Screenshots or browser observations for bark visual, tutorial, leaderboard, completion, and NSL gating.

## Recommended Implementation Order

1. T0
2. T1 and T2 in parallel conceptually, but implement T1 first if asset choice affects feel testing.
3. T3
4. T4
5. T5
6. T6
7. T7
8. T8 guard check
9. T9 validation
