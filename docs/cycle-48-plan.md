# Cycle 48 — ui-conversion-sweep

> Drafted 2026-05-29 after Cycle 47 closed; authored the same day from the Cycle 47 carryover. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. The foundation this cycle builds on is Cycle 47 ([`archive/cycles/cycle-47-plan.md`](archive/cycles/cycle-47-plan.md)); the research both draw from is the entrance/UI spike at [`../cycle45-validation/entrance-ui-spike.md`](../cycle45-validation/entrance-ui-spike.md). Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Cycle 47 laid the UI foundation: a design-token palette (Tailwind `@theme` plus the typed [`js/components/ui/tokens.ts`](../js/components/ui/tokens.ts) mirror), JSX/TSX on globally, six hand-owned token-driven `.tsx` primitives (Button, Panel, Card, Badge, IconButton, Surface), lucide-react icons, a `SceneGlyph` for the bespoke scene art, a Motion layer on the StartScreen transitions, a change-gated `useSyncExternalStore` HUD store, and one exemplar leaf conversion (`ScenePicker.tsx`). It deliberately converted one leaf and left the other createElement component files (about 33 files) as carryover. Cycle 48 is the sweep: convert the leaf-tier components (the HUD readouts, the presentational StartScreen menu screens, the presentational Multiplayer screens, and the `ui` leftovers) from `React.createElement` to token-driven `.tsx`, render-spec each against the Cycle 47 jsdom harness, and retire the inline hex in every file it touches (including the two named carryover sites, `App.js` and `MenuOption.js`'s `DEFAULT_ACCENT`). It also moves the ScenePicker scene-card slide off CSS keyframes onto Motion. The user-visible difference is small by design: the HUD, menus, and multiplayer screens look the same, the scene-card slide animates a touch more smoothly, and reduced-motion is honored everywhere. The internal win is the payoff Cycle 47 promised: the next change to a HUD readout or a menu screen edits a typed `.tsx` that reads one palette, instead of a createElement tree with raw hex. This cycle deliberately does not convert the big stateful containers (`App.js`'s full body, PauseMenu, CompletionScreen, SettingsPanel, SandboxSetup, the editors, MobileHUD). Leaf-first means leaves; containers convert after their children, in a later cycle.

## How to read this plan

This doc fixes the *shape* of the changes (which files convert, the behavior contracts they must preserve, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code. The React 19 patterns, Motion's reduced-motion APIs, and Testing Library idioms all evolve.
- **Read the files named in the phase before editing them.** The plan names files by intent; confirm their actual shape first. A "leaf" that turns out to own non-trivial state is a signal to reslot it to the container carryover, not to force the conversion.
- **Pick the simplest behavior-preserving conversion.** The goal is a typed, token-reading `.tsx` that renders the same tree. Do not redesign the component while converting it; visual/UX changes are a separate, paired concern (see Q2).

## Resolved open questions

This cycle inherits the Cycle 47 resolutions: **Q4 leaf-first incremental** (not a big-bang sweep) and **Q5 hand-owned token-driven primitives, no Base UI or Radix**. Two new questions govern this cycle:

1. **Q1: How far does the sweep reach in one cycle?** Resolved: **leaf-tier only.** Convert the pure-presentational leaves (HUD readouts, StartScreen menu screens, Multiplayer screens, `ui` leftovers). Leave the stateful containers (`App.js` body, PauseMenu, CompletionScreen, SettingsPanel, SandboxSetup, FenceEditor, ShapeEditor, LocalModeSetup, MobileHUD, Lobby, RoomCreation) as carryover. Rationale: the same low-blast-radius philosophy as Cycle 47. A container converts cleanly only after its leaves are typed; converting a 75-createElement container blind, with no composite validation, is exactly the unvalidatable-drift risk Cycle 47 avoided.
2. **Q2: Are the deferred picker affordances autonomous or paired?** Resolved: **paired / Matt-pickup.** The scene-preview, stream-progress, and combined scene-plus-mode-gate affordances need composite validation (blocked headless) and two of them touch the Cycle 46 crossfade contract. They are listed as the optional final phase and default to deferral on an autonomous run, exactly as in Cycle 47. Promote them to in-scope only on a paired pass.

No new runtime or dev dependencies this cycle. The foundation deps (lucide-react, motion, jsdom, @testing-library/react) all landed in Cycle 47.

## Architecture / shared changes

None. This is a render/UI-only cycle that consumes the Cycle 47 foundation. A converted file reads existing tokens; if a color it needs has no token yet, add it to the `@theme` block plus the `tokens.ts` mirror in the same phase, never a raw hex. No `SceneDef` changes. No deterministic-sim changes. No Worker / DO / wire-protocol changes.

## Phase 1 — HUD readout leaf conversions (~3.5hr) [autonomous]

**Independently testable.** The truest leaves, and they exercise the Cycle 47 change-gated `useGameState` store directly.

1. **Convert the HUD readout leaves to `.tsx` in place** (Vite resolves the `.js` specifier to `.tsx`, so importers are unchanged): [`GameTimer`](../js/components/GameHUD/GameTimer.js), [`SheepCounter`](../js/components/GameHUD/SheepCounter.js), [`CompactStaminaBar`](../js/components/GameHUD/CompactStaminaBar.js), [`ObjectiveBanner`](../js/components/GameHUD/ObjectiveBanner.js), [`CameraModeIndicator`](../js/components/GameHUD/CameraModeIndicator.js), [`CorralCompass`](../js/components/GameHUD/CorralCompass.js), [`PracticeHint`](../js/components/GameHUD/PracticeHint.js), [`HudLayout`](../js/components/GameHUD/HudLayout.js). Each reads tokens plus the Cycle 47 primitives (Badge / Surface / IconButton), zero raw hex.
2. **Extract a shared HUD-readout primitive only if three or more readouts share the same chrome** (a labelled pill). Decide by inspection; do not force a primitive that is used once.
3. **Render-spec each converted leaf** in the jsdom harness.

**Acceptance (EARS):**

- When Phase 1 ships, then the HUD readout leaves (GameTimer, SheepCounter, CompactStaminaBar, ObjectiveBanner, CameraModeIndicator, CorralCompass, PracticeHint, HudLayout) shall exist as `.tsx`.
- When Phase 1 ships, then `grep -c createElement` across those files shall return 0.
- When Phase 1 ships, then `grep -cE '#[0-9a-fA-F]{6}'` across those files shall return 0.
- When Phase 1 ships, then a render spec shall mount each converted leaf in jsdom and pass.
- While the change-gated store emits an unchanged HUD snapshot, the converted readouts shall not force a re-render (the Cycle 47 store contract holds).
- When `npm test` and `npm run build` run, both shall pass.

## Phase 2 — StartScreen menu-leaf conversions (~4hr) [autonomous]

**Depends on: nothing beyond the Cycle 47 foundation.** Independent of Phase 1.

1. **Convert the presentational StartScreen screens to `.tsx`:** [`SinglePlayerModes`](../js/components/StartScreen/SinglePlayerModes.js), [`ModeSelection`](../js/components/StartScreen/ModeSelection.js), [`DogSelection`](../js/components/StartScreen/DogSelection.js), [`PlayerIdentitySetup`](../js/components/StartScreen/PlayerIdentitySetup.js), [`PointerTour`](../js/components/StartScreen/PointerTour.js). Use Card / Button / Badge / tokens and the lucide icons, zero raw hex.
2. **Preserve each screen's behavior exactly** (selection callbacks, keyboard nav, the dog/mode data wiring). These are presentational; no state-machine change.
3. **Render-spec each.**

**Acceptance (EARS):**

- When Phase 2 ships, then SinglePlayerModes, ModeSelection, DogSelection, PlayerIdentitySetup, PointerTour shall exist as `.tsx`.
- When Phase 2 ships, then `grep -c createElement` across those files shall return 0.
- When Phase 2 ships, then `grep -cE '#[0-9a-fA-F]{6}'` across those files shall return 0.
- When Phase 2 ships, then a render spec shall mount each in jsdom and pass.
- When `npm test` and `npm run build` run, both shall pass.

## Phase 3 — Multiplayer leaf conversions (~4hr) [autonomous]

**Depends on: nothing beyond the foundation.**

1. **Convert the presentational Multiplayer components to `.tsx`:** [`MultiplayerOptions`](../js/components/Multiplayer/MultiplayerOptions.js), [`RoomJoining`](../js/components/Multiplayer/RoomJoining.js), [`PublicLobbyList`](../js/components/Multiplayer/PublicLobbyList.js), [`MultiplayerScoreboard`](../js/components/Multiplayer/MultiplayerScoreboard.js), [`GlobalLeaderboard`](../js/components/Multiplayer/GlobalLeaderboard.js). The rank colors (gold / silver / bronze) read the Cycle 47 rank tokens, not inline hex.
2. **Leave the stateful Lobby and RoomCreation as carryover** (host migration, room lifecycle). They are containers, not leaves.
3. **Preserve the wire-facing behavior exactly** (no NetworkManager or message-shape change; this is presentational only). Render-spec each.

**Acceptance (EARS):**

- When Phase 3 ships, then MultiplayerOptions, RoomJoining, PublicLobbyList, MultiplayerScoreboard, GlobalLeaderboard shall exist as `.tsx`.
- When Phase 3 ships, then `grep -c createElement` across those files shall return 0.
- When Phase 3 ships, then `grep -cE '#[0-9a-fA-F]{6}'` across those files shall return 0.
- When Phase 3 ships, then a render spec shall mount each in jsdom and pass.
- If a conversion appears to need a NetworkManager or wire-protocol change, then stop and surface (fence); presentational conversion only.
- When `npm test` and `npm run build` run, both shall pass.

## Phase 4 — `ui` leftovers + named hex retirement (~3hr) [autonomous]

**Depends on: nothing beyond the foundation.** Closes the named inline-hex carryover.

1. **Convert [`MenuOption`](../js/components/ui/MenuOption.js) to `.tsx`** and retire `DEFAULT_ACCENT = '#3b82f6'` to a token (the accent already lives in the `@theme` palette from Cycle 47).
2. **Convert [`LanguageSelector`](../js/components/ui/LanguageSelector.js) and [`SceneSwapOverlay`](../js/components/ui/SceneSwapOverlay.js) to `.tsx`.** SceneSwapOverlay keeps its Cycle 46 `window.__sdsAttractCrossfadeActive` contract exactly.
3. **Retire the 7 inline hex in [`App.js`](../js/components/App.js) to tokens.** This is a hex-to-token retirement, not a full App.js conversion: App.js's createElement body stays; only the raw color values move to tokens.

**Acceptance (EARS):**

- When Phase 4 ships, then MenuOption, LanguageSelector, SceneSwapOverlay shall exist as `.tsx`.
- When Phase 4 ships, then `grep -c DEFAULT_ACCENT` across the converted MenuOption file shall return 0.
- When Phase 4 ships, then `grep -cE '#[0-9a-fA-F]{6}' js/components/App.js` shall return 0.
- When Phase 4 ships, then a render spec shall mount the converted `ui` leftovers in jsdom and pass.
- While SceneSwapOverlay is converted, the Cycle 46 crossfade-skip contract (`window.__sdsAttractCrossfadeActive`) shall be preserved.
- When `npm test` and `npm run build` run, both shall pass.

## Phase 5 — Card-slide Motion (~2.5hr) [autonomous]

**Depends on: the Cycle 47 Motion layer.** Closes carryover theme 4.

1. **Move the ScenePicker scene-card slide** from the `sds-slide-in-right` / `sds-slide-in-left` CSS keyframes to Motion (the same `motion` dependency the StartScreen transitions already use), reduced-motion-aware via the Cycle 47 `useReducedMotion` hook.
2. **Preserve the picker swap contract exactly** (the Cycle 46 crossfade handoff, latest-wins coalescing, debounce, swipe, ArrowLeft / ArrowRight). The card slide is a presentational layer over the existing swap; it does not change swap timing or coalescing.
3. **Remove the now-unused `sds-slide-in` keyframes** from `css/main.css` only if nothing else references them.

**Acceptance (EARS):**

- When Phase 5 ships, then the ScenePicker scene-card enter/exit shall use Motion and honor `prefers-reduced-motion`.
- When Phase 5 ships, then if the `sds-slide-in` keyframes are unreferenced, `grep -c 'sds-slide-in' css/main.css` shall return 0.
- While an attract field is active, the converted card slide shall preserve the Cycle 46 crossfade swap contract.
- If the card-slide Motion cannot be made behavior-identical to the keyframe slide under composite validation, then revert to the keyframes rather than ship a behavior change.
- When `npm test` and `npm run build` run, both shall pass.

## Phase 6 — Picker affordances (optional, paired, ~3.5hr)

**Depends on: Phases 1-5.** This is the Cycle 47 deferred Phase 8, carried forward unchanged. **Paired / Matt-pickup (Q2):** it needs composite validation (blocked headless) and items 1 and 3 touch the Cycle 46 crossfade contract. Defaults to deferral on an autonomous run.

1. **Scene-preview affordance** in the picker, built on the Cycle 47 primitives.
2. **Stream-progress affordance** on the load overlay during the prefetch / crossfade window.
3. **Combined scene-plus-mode gate** reachable from the picker (the deferred C46 picker-overlay item).

**Acceptance (EARS):**

- When Phase 6 ships, then the picker shall present a scene-preview affordance and the load overlay shall present a stream-progress affordance, both on the Cycle 47 primitives.
- When Phase 6 ships, then a combined scene-plus-mode gate shall be reachable from the picker.
- If the cycle runs autonomously or fills before Phase 6, then Phase 6 shall be deferred to [`docs/BACKLOG.md`](BACKLOG.md) carryover rather than shipped shallow.
- When `npm test` and `npm run build` run, both shall pass.

## Dependencies

The conversion phases (1, 2, 3, 4) are mutually independent and can run in any order or in parallel; each touches a disjoint set of files. Phase 5 depends on the Cycle 47 Motion layer and the existing `ScenePicker.tsx`. Phase 6 depends on the converted primitives and the picker, and is paired/optional.

```
(Cycle 47 foundation) ─┬─> Phase 1 (HUD readouts) ──┐
                       ├─> Phase 2 (StartScreen)  ──┤
                       ├─> Phase 3 (Multiplayer)  ──┼─> Phase 6 (optional, paired)
                       ├─> Phase 4 (ui + hex)     ──┤
                       └─> Phase 5 (card Motion)  ──┘
```

Executed serially on an autonomous run: 1, 2, 3, 4, 5. Phase 6 deferred unless paired.

## Frozen files (cycle-specific additions)

No durable frozen file is modified.

- **`shared/scenes/types.js` (SceneDef) stays frozen.** Conversions are presentational; no schema field.
- **The deterministic sim core and `tests/sim-baseline/*.json` stay untouched.** Render/UI-only cycle.
- **The Worker / DO / wire protocol stays untouched.** The Multiplayer conversions (Phase 3) are presentational; no NetworkManager or message-shape change.
- **`tests/refactor-baseline/__fixtures__/bundle-sizes.json`** is the soft ratchet. This cycle adds no new deps; createElement-to-JSX should keep `main-*.js` flat. If `main-*.js` grows, that is a flag to investigate before bumping the fixture (a behavior-preserving conversion should not grow the main chunk).

## Hard stops

Durable hard stops apply on every cycle (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific additions:

1. If a leaf conversion cannot be made behavior-identical (pointer-events gating, the multiplayer hard-reload path, the Cycle 46 crossfade contract, keyboard / swipe nav), then revert the conversion rather than ship a behavior change.
2. If any conversion appears to need a `shared/scenes/types.js` SceneDef change or a Worker / wire-protocol change, then stop and surface to the user (fence).
3. Headless WebGPU visual validation is blocked locally (the preview tab runs `visibilityState: hidden` and does not composite). Do not block the cycle on visual goldens; the look is Matt's post-deploy call on prod.
4. If the measured `main-*.js` chunk grows, then investigate the cause before updating `tests/refactor-baseline/__fixtures__/bundle-sizes.json`; a behavior-preserving conversion should not grow it.
5. Phase 6 (picker affordances) touches the crossfade contract and needs composite validation. If it cannot be validated or made behavior-preserving, defer it rather than ship.

## What NOT to do during this cycle

- **Do not convert the big stateful containers** (`App.js` full body, PauseMenu, CompletionScreen, SettingsPanel, SandboxSetup, FenceEditor, ShapeEditor, LocalModeSetup, MobileHUD, Lobby, RoomCreation). Leaf-first: leaves this cycle, containers carry over.
- **Do not add new runtime or dev dependencies.** The foundation deps landed in Cycle 47.
- **Do not add Base UI or Radix.** Primitives are hand-owned and token-driven.
- **Do not touch `shared/` or regenerate sim-baseline fixtures.** Render/UI-only.
- **Do not change the Worker, DO, or wire protocol.** The Multiplayer conversions are presentational.
- **Do not bump the app version.** v2.1.10 stands unless Matt calls a release.
- **Do not use the View Transitions API.** The crossfade is in-engine (Cycle 46 decision).
- **Do not put per-frame HUD values back into plain `setState`.** The Cycle 47 change-gated store stays.
- **Do not decompose `GrassSystem.js`, `OptimizedSheep.js`, or `main.js`'s per-frame loop.** Cohesive by design (see [`DECISIONS.md`](../DECISIONS.md)).
- **Do not redesign components while converting them.** Visual/UX changes are the paired Phase 6 concern, not the autonomous sweep.
- **Do not auto-post devlog or marketing content.** Matt's voice.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the cycle closes, the converted leaf files (HUD readouts, StartScreen menu screens, Multiplayer screens, `ui` leftovers) shall exist as `.tsx` with zero `createElement` (grep) and zero raw 6-digit hex (grep).
- [ ] When the cycle closes, `grep -cE '#[0-9a-fA-F]{6}' js/components/App.js` shall return 0 and the converted MenuOption shall contain no `DEFAULT_ACCENT`.
- [ ] When the cycle closes, the ScenePicker scene-card enter/exit shall use Motion and honor `prefers-reduced-motion`.
- [ ] When the cycle closes, `git diff` against the cycle-start commit shall show `shared/` and `tests/sim-baseline/` untouched.
- [ ] When the cycle closes, the measured `main-*.js` chunk shall be <= the recorded bundle ratchet (or the fixture updated in the same commit with a measured justification).

## References

- [`archive/cycles/cycle-47-plan.md`](archive/cycles/cycle-47-plan.md) — the UI foundation this cycle builds on
- [`../cycle45-validation/entrance-ui-spike.md`](../cycle45-validation/entrance-ui-spike.md) — the research both cycles draw from
- [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
