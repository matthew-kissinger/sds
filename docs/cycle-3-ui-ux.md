# Cycle 3 Track 2 — UI/UX Vision Pass

> Depends on Track 1 (cleanup) landing — done 2026-04-24. Shares a delivery beat with Track 3 (scene architecture) — together they ship "scene-first menu + one new biome."

## Vision — decided 2026-04-24: mode-shaped

- **Classic (solo + cooperative MP)** → zen register. No timer visible. Soft stamina. Completion copy reads "you brought them home." Ambient.
- **Timed / Racing** → arcade register. Timer prominent, score + rank, "new best" celebration, scoreboard.
- **Sandbox** → playground register. Tools + freedom, no score, no clock.

The shell stays tonally neutral ("Play Solo", "Online"); tone lives inside mode tiles and HUD. Each mode commits fully to its register — resist splitting the difference. Track work below assumes this decision.

## Work items

### 1. Menu — scene-first, not mode-first

[`js/components/StartScreen/ModeSelection.js`](../js/components/StartScreen/ModeSelection.js) currently renders a 2×3 grid: Solo, Local 2P, Sandbox, Multiplayer, Leaderboard, Settings.

Problems:
- Leaderboard and Settings get equal visual weight to "Solo Play" — wrong hierarchy for a game's primary CTA.
- No affordance for the biomes/scenes that the roadmap is building toward.
- Solo/Sandbox/Local/MP are *routes into the same content*, not distinct content.

New layout:

```
┌─────────────── Scenes ──────────────────────┐
│  [ Fenced Valley ]   [ Rolling Hills ]      │
│  [ + more coming ]   [ Sandbox (custom) ]   │
└─────────────────────────────────────────────┘

    [ Play Solo ]  [ Online ]  [ Local 2P ]
        (these act on the selected scene)

           ⚙  🏆  (corner icons — settings, leaderboard)
```

Files to touch:
- Replace `ModeSelection.js` with `SceneSelection.js` + `PlayModeBar.js` (new).
- `App.js` state machine: introduce `selectedScene` as top-level state alongside `selectedDog`. The mode-selection case-switch becomes: pick scene → pick dog → pick play mode (solo / MP / local) → dog selection already wires into any of those.
- Demote `leaderboard` and `settings` to fixed-position corner icons rendered at the top level, not inside the main grid.

### 2. Mode-shaped HUD

Today [`SheepCounter.js`](../js/components/GameHUD/SheepCounter.js) and [`GameTimer.js`](../js/components/GameHUD/GameTimer.js) render unconditionally. The HUD reads the same in Classic (no time limit) as in Timed (with time limit) as in Racing.

Change:

- Classic solo: hide `GameTimer` entirely. Show sheep progress + stamina ring.
- Timed: `GameTimer` prominent + countdown color shift in last 30 s. Stamina secondary.
- Racing: player score prominent, scoreboard secondary, `GameTimer` tertiary.
- Cooperative MP: team progress prominent, player names secondary.

Route the toggles through `useGameState` after Track 1 lands — the hook already knows `gameMode` and `singlePlayerMode`. Add a `hudProfile` derived value.

### 3. First-run onboarding

On the very first game (any mode), the new player has zero idea what to do. They see a field, sheep, and a dog.

Add a 3-step tutorial overlay:

1. **"Move with WASD / joystick"** — pulses the movement input area, waits for any input.
2. **"Sprint with Shift / button"** — pulses the sprint affordance.
3. **"Herd the sheep into the pen"** — draws a soft arrow from the player's position toward the pen's direction.

State in `localStorage` (`sds.onboarded=true`). Skip entirely for returning players. Don't gate gameplay behind it; it's contextual, dismissable, and advances on natural input.

File: new `js/components/GameHUD/Onboarding.js`. Mounted inside `GameHUD`.

### 4. In-game locator

From the zoomed-out screenshot ([`assets/images/sds-zoomedout.png`](../assets/images/sds-zoomedout.png)), a first-time player cannot immediately tell where the sheep are or where the pen is. This is the #1 UX failure in a game whose loop *is* "find sheep, drive to pen."

Two candidates — pick one:

- **Compass chevron.** A soft screen-edge arrow that points to the nearest un-penned flock center, and a second that points to the pen. Minimal screen real-estate, zero map cognitive load.
- **Minimap.** Top-right corner, shows player dot + sheep dots + pen. Higher information density, but more UI chrome and more expensive (per-frame sampling of sheep positions).

Recommendation: **compass chevron**, because the game is intentionally about presence in the field, not top-down management. Minimap is the wrong aesthetic.

File: new `js/components/GameHUD/Compass.js`. Consumes positions from `GameState` via event subscription (Track 1 prerequisite).

### 5. Real dog thumbnails

[`DogSelection.js`](../js/components/StartScreen/DogSelection.js) uses color-coded SVG silhouettes from game-icons.net. The game has real dog models. Render each model to a transparent PNG (offline, one-time) and ship as `assets/images/dogs/{id}.png`.

Steps:

1. Write a small scene in `tools/render-dog-thumbs.mjs` that loads each dog glTF, places it on a turntable pose, renders at 512×512 with a transparent background, writes a PNG per dog. Run once locally; commit the PNGs.
2. Replace the `DogAvatar` SVG in `DogSelection.js` with an `<img>` that uses the generated PNG. Keep the color tint + stat bars.

This is the single highest-impact visual change in the UI layer.

### 6. Menu hierarchy polish

After items 1-5, the menu tree is:

```
/
├── scene picker (grid)
├── play-mode bar (solo / online / local)
├── ⚙ settings (overlay)
├── 🏆 leaderboard (overlay)
└── (scene-selected) → dog selection → play
```

- `PlayerIdentitySetup` stays as a one-shot first-run modal.
- `SandboxSetup`, `FenceEditor`, `ShapeEditor`, `LocalModeSetup` are all reachable from the scene picker's "Sandbox" tile.
- Multiplayer options (`MultiplayerOptions`, `RoomCreation`, `RoomJoining`, `Lobby`, `PublicLobbyList`) are reachable from the play-mode bar's "Online" button after a scene is chosen.

No component needs to be deleted; many need the `onBack` flow re-pointed.

### 7. Completion screen — keep, extend

[`CompletionScreen.js`](../js/components/GameHUD/CompletionScreen.js) is the best UI in the codebase. Don't touch it. Extend its mode-dispatch to support scene-specific copy ("You herded the Rolling Hills!") when Track 3 lands.

### 8. Pause menu — keep, extend

[`PauseMenu.js`](../js/components/GameHUD/PauseMenu.js) is solid. Add a "Change scene" action (only visible in non-MP contexts) that returns to the scene picker.

## Success criteria

- [ ] Main menu top-level choices are scenes, not modes. Settings/Leaderboard are corner icons.
- [ ] HUD is visibly different between Classic, Timed, Racing, Cooperative.
- [ ] First-time visit triggers a dismissable 3-step tutorial. Second visit does not.
- [ ] An in-game locator exists and helps a blind-test player find the flock within 15 s of spawn.
- [ ] `DogSelection` shows rendered dog PNGs, not SVG placeholders.
- [ ] User playtests the shell on live, confirms it "feels right" for the chosen vision.

## Open questions for user

1. **Vision pick.** Zen / arcade / mode-shaped. Decides HUD and copy everywhere.
2. **Menu copy register.** "Fenced Valley" as the default scene name — keep or rename? "Sandbox" as a tile vs a separate mode?
3. **Compass vs minimap.** If user disagrees with the compass recommendation, change it here before work starts.
