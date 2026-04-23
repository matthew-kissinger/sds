# 2-Player Local Mode - Investigation Report

## 1. Current Architecture

```
StartScreen (LocalModeSetup)
    |
    v
startLocalGame(localConfig)
    |
    +-- LocalMultiplayerManager (game state, scoring, gates)
    +-- LocalInputHandler (WASD + Shift / Arrows + Shift, pause)
    +-- Sheepdog x2 (P1, P2 instances)
    +-- TwoPlayerCamera (frames both players)
    |
    v
GameLoop: updateLocalMultiplayer()
    |
    +-- Input polling (both players)
    +-- Sheep AI (flee both dogs, closest priority)
    +-- Scoring (mode-specific)
    |
    v
Completion (LocalCompletionOverlay)
```

Clean separation: input handler, state manager, dual dogs, shared camera via FOV-based distance. Scoring per-mode: co-op (shared gate), versus (gates assigned by position), timed (shared clock).

## 2. What's Broken

- **js/LocalInputHandler.js:72** - Uses `event.location` to differentiate left vs. right Shift. Not standardized; left/right sprint detection fails on some browsers.
- **js/main.js:1839** - TODO: "Implement proper gate assignment tracking" for versus mode. Versus scoring is stubbed; no code maps retiring sheep to player gates.
- **js/GameState.js:321** - Pause race: if pause toggles during sheep update, sheep briefly move despite isPaused flag.

## 3. What's Awkward

- **Input recovery** - resetAllKeys() on blur is harsh; refocus drops mid-sprint input.
- **Sprint fallback logic (line 99-108)** - Guesses which player sprints if Shift has no location. Fragile under simultaneous input.
- **Camera padding hardcoded at 25 units** - Fixed padding causes unnatural zoom-out if dogs approach each other.
- **Versus gate scoring** - Sheep passage tracked but not attributed to player gate zones.

## 4. Keyboard Conflict Map

| Key | P1 | P2 | Conflict | Risk |
|-----|----|----|---|---|
| W/A/S/D | Move | - | - | None |
| Arrows | - | Move | Browser scroll (prevented) | Low |
| Left Shift | Sprint | - | - | None |
| Right Shift | - | Sprint | - | None |
| Escape | Pause | Pause | Browser default (prevented) | None |

No conflicts. preventDefault() covers all. Arrow key risk is low on desktop.

## 5. Recommendation: (A) Targeted Patches

Option A: Fix 4 focused issues in 2-3 days without architecture rewrite.

1. **Fix Shift detection** - Use event.code (ShiftLeft/ShiftRight) instead of event.location.
2. **Implement versus gate scoring** - Call checkGateProximity() at main.js:1839 to assign retiring sheep to P1 or P2.
3. **Fix pause race** - Defer sheep retirement logic until isPaused check completes atomically.
4. **Document camera padding** - Add JSDoc that 25 units is field-size-dependent.

Preserves clean local-first design. Versus becomes playable. Shift input reliable cross-browser.

## 6. Proposed P1/P2 Defaults

- **P1:** W/A/S/D + Left Shift (proven)
- **P2:** Arrows + Right Shift (couch co-op)
- **Camera:** Shared dynamic (TwoPlayerCamera only, no split-screen yet)
- **Dogs:** P1=Jep, P2=Pip (both selectable)
- **Modes:**
  - Co-op: Single gate north, shared herd
  - Versus: Opposite gates (P1 west, P2 east), first to 100 wins
  - Timed: Single gate, highest score in 3 minutes

No changes needed; defaults tested.

## 7. Out of Scope for E2

Split-screen, gamepad dual input, network sync, advanced UI, spectator mode.

