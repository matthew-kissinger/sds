# Phase F — start screen + scene selection UX — PARKED

**Trigger:** scope-too-large for autonomous overnight; React refactor
risk against existing component tests.

## Why parked

Phase F calls for a full start-screen flow rewrite:

1. **Restructure flow** Mode → Scene → Dog → Settings (was Scene →
   Mode → Dog). New `js/components/StartScreen/index.js` flow
   controller with breadcrumb nav.
2. **Hero-art ScenePicker** — large card per scene with ToD-cycler
   preview.
3. **Live WebGL DogSelection preview** — pannable inset rendering the
   selected dog mesh.
4. **Outcome-art ModeSelection** — illustrative art instead of text
   labels.
5. **Skeleton loading states** — shimmer skeleton during scene swap.
6. **Scripted background-scene orbit per selected scene** —
   `MenuController.cinematicCamera` becomes per-scene scripted path.
   Requires Phase E camera state machine (not landed).
7. **First-time tutorial overlay** — 5-step pointer tour with
   localStorage gate.
8. **Transitions + audio cues** — fade between screens, soft chime
   on select. Mobile haptic on tap.

This is multi-day UX work touching every start-screen component, the
NavigationController, MenuController.cinematicCamera, and at least 4
React components (ModeSelection, ScenePicker, DogSelection,
SettingsPanel).

## What's reverted

Nothing landed. Existing start-screen flow stays.

## Recommended morning actions

1. Schedule as a Cycle 27/28 candidate.
2. Pair with Phase E camera state-machine work (the scripted orbits
   depend on it).
3. Mock the new flow in Figma before code-touching React components
   to avoid mid-implementation pivots.

## Budget delta

Plan: 3hr autonomous. Realistic: 12-20hr (flow controller +
ScenePicker hero cards + live WebGL inset + skeleton states +
tutorial overlay + cinematic orbit integration + breadcrumb nav).
Parked rather than ship a half-rewritten start screen that breaks
existing React component tests.
