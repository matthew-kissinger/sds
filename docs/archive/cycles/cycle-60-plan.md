# Cycle 60 - playtest-and-controller

> Drafted 2026-06-05 after Cycle 59 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Turn the freshly-shipped Counting Sheep build into something Matt can sit down and actually playtest end-to-end, from a controller and from the Samsung Tab S10 FE, while taking notes in the moment. Before: the game is mouse-plus-keyboard on desktop and touch on mobile; a gamepad can drive the dog but cannot operate a single menu, the only way onto the tablet is ad hoc, and feedback has to be typed into a separate window. After: a controller drives the whole loop (entrance to play to pause to bank to completion to play again), every menu and HUD button has a controller path, the tablet loads a clean LAN build with an on-screen perf readout and no stale-cache surprises, and an in-game note key/button captures timestamped notes with full session context (scene, mode, round, counted, fps, build). This cycle also closes out the Cycle 59 reserved touch-points (family/curve naming, curve feel, the live leaderboard smoke) as a paired pass, since those are exactly the things a real playtest surfaces.

## How to read this plan

This doc fixes the shape of the changes and the acceptance criteria, not the implementation choices. The big architectural finding from exploration is in the next section: **gamepad gameplay support already exists**, so most of this cycle is bridging that existing input into the React menu layer, not building gamepad support from scratch. Cite the file:line references below as starting points, but confirm them against the current tree before editing (line numbers drift).

## The key finding: gamepad gameplay already works, menus do not

Exploration of the current tree (2026-06-05) established:

- [`js/GamepadManager.js`](../js/GamepadManager.js) is a full implementation: `gamepadconnected`/`disconnected` listeners (59-99), per-frame `update()` poll of `navigator.getGamepads()` (104-129), left-stick `getMovementDirection()` with a 0.15 circular deadzone (185-208), right-trigger `isSprinting()` (213-229), right-stick yaw `getRightStickX()` (235-237), edge-detected `isPausePressed()` on START/button 9 (282-292), A/B zoom (260-277), and a complete button map (18-35: A=0, B=1, X=2, Y=3, LB=4, RB=5, LT=6, RT=7, SELECT=8, START=9, LS=10, RS=11, DPAD_UP=12, DOWN=13, LEFT=14, RIGHT=15).
- [`js/InputHandler.js`](../js/InputHandler.js) already prioritizes the gamepad: `getMovementDirection()` checks the gamepad first (258), `isSprinting()` checks RT (322).
- [`js/main.js`](../js/main.js) `runFrame` already polls gamepad pause (2100-2102), zoom (2112), and right-stick yaw (2115-2121) every frame **while a game is running**.
- The unified movement seam all three input paths write is the `Vector2D` returned by `InputHandler.getMovementDirection()`; the touch path writes `MobileControls.movementVector` directly ([`js/components/GameHUD/MobileControls.tsx`](../js/components/GameHUD/MobileControls.tsx):83-84).

What does **not** exist (confirmed by grep): any `tabIndex`, `.focus()`, roving-focus, or arrow/d-pad navigation in the React UI. The only keyboard handlers in components are the name-field Enter/Escape and the PauseMenu Escape-to-resume ([`PauseMenu.tsx`](../js/components/GameHUD/PauseMenu.tsx):432-445). So a controller can pause the game but cannot move within the pause menu, cannot operate the entrance, and cannot pick Play Again. **That gap is the spine of this cycle.**

Two consequences for design:

1. The existing gamepad poll lives inside `main.js runFrame`, which does **not** tick on the entrance before a game starts (and must not drive gameplay while a menu is open). The menu-navigation layer therefore needs its **own** lightweight gamepad/keyboard poll, active only while a menu surface is visible. Phase 2 builds that.
2. Make the menu focus model accept **keyboard arrows + Enter/Escape as well as** d-pad/stick + A/B, sharing one code path. That gives keyboard menu navigation for free and makes the whole thing Playwright-testable (Phase 8) without a physical gamepad.

## Build status (2026-06-05)

Shipped end-to-end and deployed to prod so Matt can playtest on sheepdogsim.com (P7's taste finalization stays a paired post-deploy pass):

- **P1 - tablet baseline:** shipped. `?stats=1` perf chip, the service-worker private-LAN fix, `docs/playtest-tablet.md`. Verified on the real Tab S9 FE.
- **P2 - menu focus core:** shipped. `js/input/menuNav.js` (pure, unit-tested in `tests/menu-nav.spec.js`), `js/input/menuGamepad.js` (rAF poll), `js/components/hooks/useMenuNavigation.ts`, plus the `[data-navfocus]` ring in `css/main.css`. Additive: every existing mouse/touch onClick is untouched, and the ring only appears on the first directional input.
- **P3 - entrance:** shipped. `useMenuNavigation` on the entrance root; world, family, difficulty, dog, Play, corner nav, and ways-to-play are all controller-reachable, A or Enter activates.
- **P4 - pause / completion / HUD:** shipped. The hook roves the pause and completion panels; Y cycles the camera, X banks a Counting run, Select opens the note box (all via a new `GamepadManager.wasJustPressed`). Gameplay zoom/move stays gated behind `!isPaused`, so there is no double-action while paused.
- **P5 - parity audit:** shipped. `docs/cycle-60-controller-parity.md`: the core loop is WIRED; settings, leaderboard, editors, and MP are explicitly DEFERRED (mouse/touch primary).
- **P6 - playtest notes:** shipped. `js/playtest/noteLog.js` + `js/components/GameHUD/PlaytestNote.tsx`, opt-in via `?notes=1` / `?stats=1`; N key, gamepad Select, and a right-edge tab open it; notes persist with context (scene, mode, round, counted, fps, build) and export as JSON.
- **P7 - reserved finalize (PAIRED):** shipped with the strawman naming (Solo / Counting Sheep / Objective, Incremental / Exponential, "Bank and finish"), which is prose-clean; curve constants unchanged. Final taste tuning and the live Incremental-on-Home-Field leaderboard smoke are Matt's post-deploy playtest.
- **P8 - validation + close prep:** `npm test` 983 pass / 0 fail / 7 skipped; build clean (main 555 KiB, ratchet bumped 554 -> 555 for the inline stats + gamepad gates; the focus/note modules are lazy chunks); new files are type-clean. Formal `/cycle-close` (archive + scaffold Cycle 61) waits on Matt's playtest sign-off.

## Open questions to resolve before writing code

1. **Q1: Which button opens the in-game note overlay, and what is the capture UX?** Author lean: `N` on keyboard and SELECT/Back (button 8) on the controller open a small modal text field that pauses play; submit appends to localStorage with full context; on touch, a small HUD note button (the tablet has no keyboard). Resolvable inside Phase 6.
2. **Q2: How is the on-screen perf readout surfaced?** Author lean: a `?stats=1` URL flag plus a Settings toggle, rendered as a dependency-free chip (fps, frametime, draw calls, active sheep). Do **not** rely on the CDN-loaded Stats.js in [`js/PerformanceMonitor.js`](../js/PerformanceMonitor.js) for the tablet baseline, since LAN/offline can stall the CDN. Resolvable inside Phase 1.
3. **Q3: Should menu navigation work via keyboard arrows too, not just gamepad?** Author lean: yes, unify them in one focus manager (see finding above). This is a design decision, not a question for Matt; recorded here for visibility.
4. **Q4: Which gamepad button cycles the camera mode in-game?** Author lean: a face button (Y / button 3) plus keep the `C` key ([`InputHandler.js`](../js/InputHandler.js):140-145). Resolvable inside Phase 4.
5. **Q5: Is the cycle scope playtest-readiness only, or does it also pull deferred backlog items (MP Counting, object-impostor Cycle B, container-restyle, audit phases)?** Author lean: playtest-readiness only. The heavy items stay in [`BACKLOG.md`](BACKLOG.md). Surface to Matt at `/cycle-start` for a yes/no.

## Architecture / shared changes

One new client-only primitive: a **menu focus/navigation manager**. Proposed shape:

- A hook/provider (working name `js/components/hooks/useMenuNavigation.ts`) that owns a registry of focusable controls for the currently-visible menu surface, a focus index, and a unified input subscription (keyboard arrows/Enter/Escape + a self-contained `navigator.getGamepads()` edge-detect poll that runs only while a menu is open).
- A focus-ring visual state added to the shared primitives [`Button.tsx`](../js/components/ui/Button.tsx), [`IconButton.tsx`](../js/components/ui/IconButton.tsx), [`Card.tsx`](../js/components/ui/Card.tsx) using the existing token palette, so focus reads consistently everywhere.
- Reuse the existing [`GamepadManager.js`](../js/GamepadManager.js) button constants for the mapping; the menu poll is separate from (does not disturb) the gameplay poll in `main.js runFrame`.

No deterministic-sim change. No Worker change. No `SceneDef` schema change. No D1 migration. No wire-protocol change. Everything in this cycle is client-side UI, input, and local-only persistence, with one bounded exception called out under Frozen files (the `COUNTING_HARD_CEILING` constant, only if Matt retunes the ceiling in Phase 7).

## Phase 1 - Tablet LAN baseline and on-screen perf readout (~3hr, autonomous)

**Independently testable. Comes first so Matt can start playing on the tablet immediately, before controller nav lands.**

1. **Serve.** Confirm `npm run preview:lan` ([`package.json`](../package.json):20, `vite preview --host`) and `npm run dev:lan` (14, `vite --port 3000 --host`) bind to `0.0.0.0`; document the exact tablet steps (PC LAN IP `192.168.1.100`, the preview port, and the ADB-via-hub launch path `ssh l "adb ... am start -a android.intent.action.VIEW -d <url>"`). Land the steps in a short `docs/playtest-tablet.md`.
2. **Stale-cache fix.** The service worker registers on any non-localhost origin ([`index.html`](../index.html):337-394 gates only on `localhost`/`127.0.0.1`). On the LAN IP it registers and can serve a stale build mid-iteration. Extend the disable check to also skip private-LAN origins (10.x / 192.168.x / 172.16-31.x) or a `?nosw` flag, so the tablet always gets the live build during playtest.
3. **On-screen readout.** Add a dependency-free perf chip (fps, frametime, draw calls, active sheep) gated by `?stats=1` plus a Settings toggle, independent of the CDN Stats.js in [`PerformanceMonitor.js`](../js/PerformanceMonitor.js). Read counts from the renderer info the perf harness already uses ([`main.js`](../js/main.js):262-444).
4. **Document the capture path.** The `?perfMode=1` `window.__perfHarness` (`startSampling`/`getSummary`, [`main.js`](../js/main.js):402-443) already exists; document a one-line capture so a paired tablet run (Phase 7) can record a baseline.

**Acceptance (EARS):**

- When the PC runs `npm run preview:lan`, then the build shall bind to `0.0.0.0` and load on the tablet at `http://192.168.1.100:<port>`.
- While the build is served from a private-LAN origin, the service worker shall not register, so no stale build is served during playtest.
- When `?stats=1` is set, then the HUD shall show a dependency-free readout of fps, frametime, draw calls, and active sheep, updating at least once per second.
- When the tablet steps are needed, then `docs/playtest-tablet.md` shall document the serve URL and the ADB launch.

**Status - shipped 2026-06-05 (autonomous), uncommitted in the working tree.** Landed: a dependency-free `?stats=1` perf chip ([`js/perf/StatsChip.js`](../js/perf/StatsChip.js), lazy-imported, bottom-left fps/frametime/peak/draws/tris/sheep, persisted to `sds.show-stats`, `?stats=0` clears), the service-worker private-LAN fix ([`index.html`](../index.html)), and [`docs/playtest-tablet.md`](playtest-tablet.md). Verified on the real device over USB. Notes:

- **Device of record is `SM-X518U` (Galaxy Tab S9 FE)**, not an S10 FE. Lands on the `low` hardware tier.
- **Primary path is PC-USB `adb reverse`, not the hub.** The hub (`192.168.1.218`) was unreachable, but the PC has ADB and sees the tablet directly. `adb reverse tcp:4173 tcp:4173` + `http://localhost:4173/?stats=1` is cleaner than wifi because `localhost` already auto-disables the SW. The wifi-LAN path (`http://192.168.1.100:4173`, covered by the new SW fix) still works for untethered play.
- **First perf baseline (Rolling Hills, Hard / 200 sheep, low tier): fps 37, frametime 27.1ms, peak 53.0ms, draws 20,436, tris 774k.** The entrance idles ~60fps. The standout is the ~20k draw-call count - the tablet is draw-call-bound on the hero scene, a candidate for a future perf pass (out of scope here).
- **Deviation:** `main` grew ~1 KiB (554 -> ~555 KiB) from the inline `?stats` gate. Surface the byte delta and bump the ratchet at P8 close per Hard stop 6; full `npm test` / bundle validation runs at P8.

## Phase 2 - Menu focus/navigation core (~4hr, autonomous)

**The central new primitive. Depends on nothing; unblocks Phases 3-5.**

1. **Focus manager.** Build `js/components/hooks/useMenuNavigation.ts`: a registry of focusable controls, a focus index, directional move (next/prev/up/down), activate, and back. Drive it from a unified input source: keyboard `ArrowUp/Down/Left/Right` + `Enter` + `Escape`, and a self-contained `navigator.getGamepads()` edge-detect poll (d-pad 12-15, left stick axes 0/1, A=0 activate, B=1 back) that runs via `requestAnimationFrame` only while a menu is mounted.
2. **Focus ring.** Add a `focused` visual state to [`Button.tsx`](../js/components/ui/Button.tsx), [`IconButton.tsx`](../js/components/ui/IconButton.tsx), [`Card.tsx`](../js/components/ui/Card.tsx) using the token palette; ensure each forwards `tabIndex`/ref.
3. **Edge-detect helper.** Reuse the `isPausePressed` edge pattern ([`GamepadManager.js`](../js/GamepadManager.js):282-292) for press-not-hold semantics so a single d-pad tap moves focus once.
4. **Unit tests.** Cover directional move wrap-around, activate, and back against a mock registry (no DOM needed for the pure logic).

**Acceptance (EARS):**

- When a menu surface is mounted and no game loop is ticking, then a dedicated gamepad/keyboard poll shall drive menu focus.
- When the d-pad, left stick, or an arrow key indicates a direction, then focus shall move to the adjacent registered control.
- When A (button 0) or Enter is pressed on a focused control, then that control's activate handler shall fire.
- When B (button 1) or Escape is pressed in a sub-menu, then the back action shall fire.
- While a control is focused, then a visible focus ring shall render on it.
- When the focus-core unit tests run, then directional wrap-around, activate, and back shall pass.

## Phase 3 - Entrance fully controller-driven (~3hr, autonomous)

**Depends on Phase 2.**

Wire every entrance control ([`Entrance.tsx`](../js/components/entrance/Entrance.tsx)) into the focus manager: world prev/next (217/222, map to LB/RB and d-pad left/right), family chips (233-247), difficulty/curve rung chips (262-275), dog selector (281/302), Play (288, A activates), corner nav leaderboard/settings/about (68-70), and the secondary ways-to-play (312-314). Define a sensible focus order and group movement. `commit()` ([`useBootFlow.ts`](../js/components/entrance/useBootFlow.ts):139-141) is the existing Play seam; A on Play calls it.

**Acceptance (EARS):**

- When the entrance is shown and a gamepad is connected, then the world, family, difficulty, dog, and Play controls shall all be reachable and activatable by controller.
- When Play is activated by controller, then the armed world, mode, and dog shall start with parity to a mouse click.
- While the entrance is shown, then keyboard arrow navigation shall move focus identically to the d-pad.

## Phase 4 - Pause, completion, and in-game HUD on controller (~3hr, autonomous)

**Depends on Phase 2.**

1. **Pause menu.** START already toggles pause ([`main.js`](../js/main.js):2100-2102 to [`InputHandler.togglePause`](../js/InputHandler.js):218-235 to the `game-pause-change` event [`App.js`](../js/components/App.js):732). When the pause menu opens, capture controller focus over its buttons ([`PauseMenu.tsx`](../js/components/GameHUD/PauseMenu.tsx):555-610: Resume, Bank if round-based, Restart, Settings, Fullscreen, Main Menu); B resumes.
2. **Completion.** Make [`CompletionScreen.tsx`](../js/components/GameHUD/CompletionScreen.tsx):695-787 (Play Again, Main Menu) controller-navigable; A activates.
3. **Camera mode.** Bind a gamepad button (Q4 lean: Y / button 3) to the camera cycle that `C` triggers ([`InputHandler.js`](../js/InputHandler.js):140-145), wired near the existing gamepad reads in `runFrame` (2112-2121).
4. **Counting bank.** Ensure Bank and finish is controller-reachable both via the pause-menu Bank entry (already present, 564-571) and a direct in-game button.

**Acceptance (EARS):**

- When the game is paused via START, then the pause menu shall capture controller focus and its buttons shall be navigable and activatable.
- When the completion screen is shown, then Play Again and Main Menu shall be controller-navigable.
- When the camera-mode button is pressed on the controller, then the camera mode shall cycle with parity to the `C` key.
- While a Counting run is active, then the controller shall be able to trigger Bank and finish.

## Phase 5 - Missing-button audit and parity sweep (~2hr, autonomous)

**Depends on Phases 3 and 4.**

Enumerate every interactive control across entrance, in-game HUD, pause, completion, settings ([`SettingsPanel.js`](../js/components/StartScreen/SettingsPanel.js)), and leaderboard ([`GlobalLeaderboard.tsx`](../js/components/Multiplayer/GlobalLeaderboard.tsx)); confirm a controller path for each; fill the gaps (settings tabs/toggles/sliders, leaderboard scene selector and mode tabs, sandbox/local/multiplayer entry buttons at minimum reachable). Produce `docs/cycle-60-controller-parity.md` as the checklist of record.

**Acceptance (EARS):**

- When the parity audit runs, then every interactive control in entrance, pause, completion, settings, and leaderboard shall have a documented controller path in `docs/cycle-60-controller-parity.md`.
- If a control has no controller path, then the phase shall not close until it is wired or explicitly deferred in this plan.

## Phase 6 - In-game playtest note capture (~3hr, autonomous)

**Depends on nothing structural; sequence after Phase 1 so notes can record fps.**

1. **Store.** New `js/playtest/noteLog.js` persisting to localStorage `sds.playtest-notes` (follow the [`playerIdentity.js`](../js/components/shared/playerIdentity.js):10-27 try/catch JSON pattern), an array of `{ ts, note, sceneId, gameMode, curve, round, counted, fps, tier, buildId }`.
2. **Capture UI.** New `js/components/GameHUD/PlaytestNote.tsx`: opens on `N` (keyboard, via [`InputHandler.js`](../js/InputHandler.js):97-145) and SELECT (button 8); pauses play while open; a small HUD note button for touch (the tablet has no keyboard).
3. **Context.** Pull scene/mode/round/counted from game state (`countingState` round/counted), fps from the Phase 1 readout, and `__BUILD_ID__`.
4. **Export.** A copy-all-as-JSON / download affordance reachable from Settings, so notes survive a session.

**Acceptance (EARS):**

- When the note key or button is pressed, then a note overlay shall open and pause play.
- When a note is submitted, then it shall persist to localStorage `sds.playtest-notes` with scene, mode, round/counted, fps, and buildId context.
- When the export affordance is used, then all captured notes shall be retrievable as JSON.
- While on a touch device, then a note-capture button shall be reachable in the HUD without a keyboard.

## Phase 7 - Reserved Cycle 59 finalization (PAIRED, ~ a session with Matt)

**Fully paired. Matt's hands on the keyboard and the controller. Depends on Phases 1, 3, 6 being live so the finalization happens in the real playtest surface.**

1. **Naming.** Finalize the family names (Solo / Counting Sheep / Objective), the curve names (Incremental / Exponential), and the "Bank and finish" copy in [`worlds.ts`](../js/components/entrance/worlds.ts) and [`js/locales/en/index.js`](../js/locales/en/index.js), in-browser, to Matt's voice.
2. **Curve feel.** Tune the curve constants in [`js/gamestate/countingMode.js`](../js/gamestate/countingMode.js) (the client curve module, not a `shared/` deterministic file) to feel; if the 5000 ceiling moves, that is the one bounded shared touch (see Frozen files).
3. **Live leaderboard smoke.** Run an Incremental-on-Home-Field run against prod, bank it, and confirm the row appears on the counting board (the one open acceptance carried from Cycle 59).
4. **Tablet perf baseline.** Capture the Tab S10 FE baseline (`?perfMode=1` plus the Phase 1 readout) and record the numbers as the testing baseline.

**Acceptance (EARS):**

- When Matt finalizes the naming, then the entrance, HUD, and locale strings shall reflect the agreed names, and `grep -c` for an em-dash, an exclamation mark, or an emoji in the changed strings shall return 0.
- When a live Incremental-on-Home-Field run is banked against prod, then the score shall appear on the counting board.
- While the curve constants are tuned, then the change shall stay client-side with no sim-baseline regeneration and no D1 migration.
- When the tablet baseline is captured, then the Tab S10 FE fps/frametime summary shall be recorded in this plan or `BACKLOG.md`.

## Phase 8 - Validation, smoke, prose, docs, close prep (~2hr, autonomous)

**Depends on all prior phases.**

Full `npm test` + `npm run build`; a keyboard-driven Playwright e2e of the menu focus model (the shared path the gamepad rides, so it proves controller nav without a physical pad); prose hygiene on all new strings; `DECISIONS.md` entry for the menu-focus primitive and the playtest-baseline plumbing; `BACKLOG.md` and `NEXT_SESSION.md` at close.

**Acceptance (EARS):**

- When `npm test` and `npm run build` run at close, then both shall pass with no new failures.
- When the keyboard-driven menu e2e runs, then entrance focus-move, activate, and back shall pass headless.
- When a full controller playthrough is smoke-tested, then entrance to play to pause to bank to completion to play again shall be drivable end-to-end on the controller (paired confirmation acceptable).
- When the cycle closes, then `DECISIONS.md` shall record the menu-focus navigation primitive.

## Dependencies

```
Phase 1 (tablet baseline)  ----------------------------\
Phase 2 (focus core) -> Phase 3 (entrance) -------\      \
                     -> Phase 4 (pause/HUD) ------> Phase 5 (audit) -> Phase 7 (paired) -> Phase 8 (close)
Phase 6 (notes, after P1) ------------------------/
```

- Phase 1 and Phase 2 can run in parallel (no shared files).
- Phase 6 needs Phase 1's fps readout to record fps in notes.
- Phase 7 is paired and needs Phases 1, 3, 6 live so the finalization happens in the real surface.
- Phase 8 validates everything and runs the close.

## Frozen files (cycle-specific additions)

The durable fence ([`INTERFACE_FENCE.md`](INTERFACE_FENCE.md)) is otherwise untouched: no `shared/` sim core, no `SceneDef` schema, no Worker, no migrations. One bounded exception:

- [`shared/countingModes.js`](../shared/countingModes.js) `COUNTING_HARD_CEILING` - **only** if Matt retunes the ceiling in Phase 7. Migration story: the constant is read by both the client and the Worker submit validation (`[0, COUNTING_HARD_CEILING]`); a change updates both in the same commit, with no D1 migration and no sim-baseline (it is a validation bound, not a deterministic-sim value). If untouched, no fence interaction at all.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific additions:

1. **Do not regress existing input.** Keyboard WASD, mouse camera, and the mobile joystick must stay byte-identical for gameplay. The menu focus poll must not run (or must not steer the dog) while a game is active and unpaused.
2. **No double-input.** The menu gamepad poll runs only while a menu surface is visible; the gameplay poll in `main.js runFrame` stays the sole driver during play.
3. **Client-only.** If a phase reaches into `shared/` sim core, the Worker DO tick, or a D1 migration, stop and surface. The only allowed shared touch is the bounded `COUNTING_HARD_CEILING` case above.
4. **No CDN dependency for the tablet readout.** The on-screen perf chip must work offline on the LAN; do not route it through the CDN Stats.js.
5. **Stale cache.** If the tablet ever serves an old build during playtest (service worker not disabled on the LAN origin), stop and fix Phase 1 before trusting any perf or visual reading.
6. **Bundle-size regression.** Surface the byte delta before any ratchet bump; the React focus layer and the note UI are the likely additions.

## What NOT to do during this cycle

- **Do not build the second mode edition.** The old Cycle 60 stub framing (a new edition after Counting Sheep) is deferred again; this cycle is playtest-readiness. The edition idea stays in `BACKLOG.md`.
- **Do not rewrite the GamepadManager gameplay bindings or the mobile joystick.** They work. Only add menu navigation and any genuinely missing bindings.
- **Do not auto-finalize the naming or curve constants.** That is Matt's paired call in Phase 7.
- **Do not pull deferred backlog items** (MP Counting, object-impostor Cycle B, the paused container-restyle, audit phases) into this cycle.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks Matt to confirm each item. Do not pre-check.

- [ ] When the cycle closes, then all phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, then all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, then the production build shall be clean (bundle delta surfaced before any ratchet bump).
- [ ] When the close commit lands on `main`, then the sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When a controller is connected, then entrance to play to pause to bank to completion to play again shall be drivable end-to-end on the controller.
- [ ] When the parity audit is complete, then every interactive menu and HUD control shall have a documented controller path or an explicit deferral.
- [ ] When the tablet is used, then the Tab S10 FE shall load the LAN build with no stale-cache, and a perf baseline shall be recorded.
- [ ] When a note is captured in-game, then it shall persist with session context and be exportable as JSON.
- [ ] When the Cycle 59 reserved items close, then the family/curve naming shall be finalized (no em-dash, exclamation, or emoji) and a live Incremental-on-Home-Field leaderboard write shall be confirmed.

## References

- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`docs/NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) - pickup-state contract
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items
- [`docs/archive/cycles/cycle-59-plan.md`](archive/cycles/cycle-59-plan.md) - Counting Sheep (prior cycle)
- [EARS notation](https://kiro.dev/docs/specs/) - testable acceptance lines
