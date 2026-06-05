# Cycle 60 - controller parity audit (P5)

Every interactive surface and its controller path. "Wired" means the control is reachable and activatable with a gamepad (and keyboard arrows) via the Cycle 60 `useMenuNavigation` hook or a dedicated in-game button. "Deferred" means mouse/touch stays primary for now, with a follow-up noted.

Standard mapping: left stick / d-pad move focus, A activates, B / Start back-or-pause, the amber ring shows the focused control.

## Core playtest loop - WIRED

| Surface | Controls | Path |
|---|---|---|
| Entrance | world prev/next, family chips (Solo / Counting Sheep / Objective), difficulty + curve rungs, dog picker + swap row, Play, corner nav (leaderboard / settings / about), ways to play (online / sandbox / 2-player), Playing-as, site links | `useMenuNavigation` on the entrance root. Linear focus over all visible controls; A or Enter activates; Play calls `flow.commit`. |
| In-game pause | Resume, Bank (counting), Restart, Settings, Fullscreen, Main Menu, + the settings sub-panel | Start opens pause (existing); `useMenuNavigation` on the panel roves the buttons; B resumes (or backs out of settings); Escape keeps its existing handler. |
| Completion | Play Again, Main Menu, Save dev clip | `useMenuNavigation` on the panel; A activates; B / Escape -> Main Menu. |
| In-game HUD | pause, camera mode, bank counting, playtest note | Start = pause; Y = cycle camera (parity with the C key); X = bank a Counting run; Select = open the note box. The on-screen Bank button and joystick keep their touch paths. |

## Deferred (mouse / touch primary) - follow-up

These render in the centered StartScreen modal (or are deep config surfaces) and are not yet inside a `useMenuNavigation` container. They remain fully usable by mouse and touch; controller nav is a bounded follow-up (sliders and dropdowns need a value-adjust affordance the linear rover does not give).

| Surface | Why deferred |
|---|---|
| Settings panel (full route) | Tabs, sliders, dropdowns, key-rebind. Needs a value-adjust interaction model beyond focus + activate. |
| Global leaderboard | Scene selector + mode tabs + sheep dropdown; a `<select>` is awkward for the d-pad. |
| Sandbox / Fence / Shape editors | Pointer-driven authoring surfaces; not a controller target this cycle. |
| Multiplayer lobby / room create / join | Text entry + lists; mouse/touch primary. |
| 2-player local setup | Pointer-driven. |

## Notes

- The note tab and perf chip are opt-in (`?notes=1` / `?stats=1`), so neither the audit's WIRED HUD note button nor the perf chip is visible to regular players.
- The entrance focus order is linear DOM order. It reaches every control but is not hand-tuned into rows; a 2D focus model is a possible polish follow-up.
