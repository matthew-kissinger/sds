# UI Container Migration Map

> Cycle 49 (`pastoral-vision`), Phase 6. The executable scope for the implementation cycles of the Pastoral UI/UX rework program. It inventories the 13 stateful containers that still render through `React.createElement` and sequences them across Cycle 51 (StartScreen and setup surfaces) and Cycle 52 (in-game HUD and overlays plus program polish). Counts are the before-baseline, measured 2026-05-29 (total occurrences of `createElement` and 6-digit hex per file).

## Why three implementation cycles

Cycle 48 swept the leaf-tier components to token-driven `.tsx`. What remains are the 13 stateful containers below, about 579 `createElement` calls in total. Each is a restyle-and-convert (pastoral look from first principles), not a mechanical leaf port, so packing them into one cycle would force multiple blind containers per phase, which is the unvalidatable-drift risk the leaf-first rule guards against. The natural seams give two container cycles: Cycle 51 takes the StartScreen and setup surfaces plus the two multiplayer containers; Cycle 52 takes the in-game HUD and overlay containers and carries the program polish. Cycle 50 (entrance and loading) sits between this cycle and the container work and is specced in [`entrance-loading-spec.md`](entrance-loading-spec.md).

## The 13 containers

| Container | Path | createElement | inline hex | Target cycle | Notes |
|---|---|---|---|---|---|
| SettingsPanel | `js/components/StartScreen/SettingsPanel.js` | 71 | 19 | Cycle 51 | Audio/graphics/controls settings. Most inline hex of the setup surfaces. |
| SandboxSetup | `js/components/StartScreen/SandboxSetup.js` | 76 | 6 | Cycle 51 | Sandbox configuration. Highest createElement count; pairs with the editors. |
| LocalModeSetup | `js/components/StartScreen/LocalModeSetup.js` | 48 | 13 | Cycle 51 | 2-player local setup. |
| FenceEditor | `js/components/StartScreen/FenceEditor.js` | 48 | 16 | Cycle 51 | Sandbox fence tool. Convert with ShapeEditor (shared editor chrome). |
| ShapeEditor | `js/components/StartScreen/ShapeEditor.js` | 28 | 13 | Cycle 51 | Sandbox shape/pen tool. Convert with FenceEditor. |
| Lobby | `js/components/Multiplayer/Lobby.js` | 29 | 5 | Cycle 51 | Pre-game lobby. Stateful (host migration, room lifecycle); presentational restyle only, no NetworkManager or wire change. |
| RoomCreation | `js/components/Multiplayer/RoomCreation.js` | 27 | 0 | Cycle 51 | Create-room dialog. Already hex-clean; presentational restyle only. |
| MobileHUD | `js/components/GameHUD/MobileHUD.js` | 23 | 6 | Cycle 52 | Mobile HUD shell. Per-frame values stay in the useSyncExternalStore store, never setState. |
| MobileControls | `js/components/GameHUD/MobileControls.js` | 18 | 1 | Cycle 52 | Joystick + sprint. Preserve pointer-events gating so it does not eat canvas input. |
| PauseMenu | `js/components/GameHUD/PauseMenu.js` | 75 | 14 | Cycle 52 | Pause overlay. Tied with SandboxSetup for the most createElement. |
| CompletionScreen | `js/components/GameHUD/CompletionScreen.js` | 61 | 31 | Cycle 52 | Victory/complete screen. Most inline hex of any container. |
| ExtremeTuningPanel | `js/components/GameHUD/ExtremeTuningPanel.js` | 13 | 5 | Cycle 52 | Extreme-mode tuning. Lightest container; good first pass in the batch. |
| App | `js/components/App.js` | 62 | 0 | Deferred | The 1185-line orchestrator and React shell. Already hex-clean (Cycle 48 retired its inline hex). Best left as the shell that composes the converted containers; converting its createElement body is its own later cycle, not part of this program. Recorded here so the decision is explicit. |

## Cycle split summary

- **Cycle 51 (StartScreen and setup surfaces):** SettingsPanel, SandboxSetup, LocalModeSetup, FenceEditor, ShapeEditor, Lobby, RoomCreation. Seven containers, about 327 createElement. FenceEditor and ShapeEditor share editor chrome and convert together; the two multiplayer containers are presentational restyles only.
- **Cycle 52 (in-game HUD, overlays, and program polish):** MobileHUD, MobileControls, PauseMenu, CompletionScreen, ExtremeTuningPanel. Five containers, about 190 createElement, the lightest batch, which is why Cycle 52 also carries the program polish (motion and reduced-motion consistency, dead-CSS and stale-comment cleanup, final gallery completeness).
- **Deferred:** App.js stays as the composing shell for this program.

## Per-container acceptance shape (Cycles 51 and 52)

Each container conversion lands as a restyle to pastoral token-driven `.tsx`, validated the same way the Cycle 48 leaves were, with the gallery as the headless review surface:

- The container exists as `.tsx` and `grep -c createElement` over it returns 0.
- `grep -cE '#[0-9a-fA-F]{6}'` over it returns 0 (inline hex retired to pastoral tokens).
- The container gets a section in the gallery (rendered under the pastoral palette) so the look is reviewable headlessly.
- A jsdom render spec mounts it and pins its behavior contracts (selection callbacks, keyboard, pointer-events gating, the multiplayer scene-lock and hard-reload fallback where relevant).
- Behavior is preserved exactly: no `shared/` change, no SceneDef change, no NetworkManager or wire-protocol change. If a conversion appears to need one, stop and surface (fence).
- `npm test` and `npm run build` pass, and the `main-*.js` chunk stays within the bundle ratchet.

## References

- [`ui-design-language.md`](ui-design-language.md) - the pastoral look the containers convert toward.
- [`entrance-loading-spec.md`](entrance-loading-spec.md) - Cycle 50, which precedes the container work.
- [`cycle-49-plan.md`](cycle-49-plan.md) - this cycle's plan.
- [`archive/cycles/cycle-48-plan.md`](archive/cycles/cycle-48-plan.md) - the leaf-conversion precedent the per-container acceptance mirrors.
