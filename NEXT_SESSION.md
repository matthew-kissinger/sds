# Next Session - Cycle 48

> **Updated:** 2026-05-29
> **For:** Cycle 48
> **Pickup priority:** Cycle 48 (`ui-conversion-sweep`) is authored ([`docs/cycle-48-plan.md`](docs/cycle-48-plan.md)): 6 phases, leaf-first TSX conversion of the HUD readouts (P1), the StartScreen menu screens (P2), the Multiplayer screens (P3), and the `ui` leftovers plus the `App.js` / `MenuOption` hex retirement (P4), then the ScenePicker card-slide onto Motion (P5); P6 (picker affordances) is optional/paired and defaults to deferral. Run `/cycle-start` to begin Phase 1. First, verify the Cycle 47 UI look post-deploy (see "Cycle 47 post-deploy verification" below).

## Cold-Start Orientation

Read in order: [`AGENTS.md`](AGENTS.md) -> [`CLAUDE.md`](CLAUDE.md) -> this file -> [`docs/cycle-48-plan.md`](docs/cycle-48-plan.md). The UI-foundation work this cycle builds on is in [`docs/archive/cycles/cycle-47-plan.md`](docs/archive/cycles/cycle-47-plan.md); the research both cycles draw from is the entrance/UI spike at [`cycle45-validation/entrance-ui-spike.md`](cycle45-validation/entrance-ui-spike.md). Closed-cycle context is in [`docs/BACKLOG.md`](docs/BACKLOG.md).

## Current State

Cycle 47 (`ui-foundation-overhaul`) closed 2026-05-29: shipped 7/8 phases. The UI now has a design-token palette (Tailwind `@theme` plus a typed `js/components/ui/tokens.ts` mirror), JSX/TSX turned on globally, a set of hand-owned token-driven `.tsx` primitives (Button, Panel, Card, Badge, IconButton, Surface), lucide-react for generic icons, a `SceneGlyph` component holding the bespoke scene art, and Motion driving the StartScreen screen-state transitions. The scene picker was converted to `ScenePicker.tsx` as the exemplar leaf (zero createElement, zero raw hex, zero `dangerouslySetInnerHTML`). The HUD no longer re-renders every frame: `useGameState` is now a change-gated `useSyncExternalStore` store, and a `prefers-reduced-motion` path (the `useReducedMotion` hook plus a `main.css` reduced-motion block) makes both Motion and the CSS keyframes honor the OS setting. The cycle deliberately converted one leaf, not all ~50 components. No version bump; v2.1.10 stands.

Cycle 48 (`ui-conversion-sweep`) is the natural continuation and is now authored. It sweeps the leaf-first TSX conversion across the leaf-tier createElement components (HUD readouts, StartScreen menu screens, Multiplayer screens, `ui` leftovers), retires the named inline hex (`App.js`'s 7 literals and `MenuOption.js`'s `DEFAULT_ACCENT`) as those files convert, and moves the ScenePicker scene-card slide off CSS keyframes onto Motion. Q1 scopes it to leaves only (the stateful containers - `App.js` body, PauseMenu, SettingsPanel, SandboxSetup, the editors, MobileHUD, Lobby, RoomCreation - carry over to a later cycle); Q2 keeps the picker affordances paired/optional. Run `/cycle-start` to begin Phase 1.

## Cycle 47 post-deploy verification (Matt-pickup, blocked headless)

These could not be verified locally because headless WebGPU does not composite (the preview tab runs `visibilityState: hidden`, so screenshots time out). Verify on the live site after the close deploy:

- **Menu + picker look.** Confirm the token-driven primitives and the converted scene picker read the same or slightly cleaner than before. No color drift, no broken spacing.
- **Motion feel.** The StartScreen screen-state transitions (main / dogSelection / modes / settings) should fade and slide smoothly through Motion. Confirm no jarring pop or layout shift at rest.
- **Reduced-motion.** With the OS "reduce motion" setting on, the transitions should collapse to a plain near-instant swap and the CSS keyframes should not animate.
- **HUD smoothness.** In-game, confirm the HUD (timer, sheep counter, stamina) still updates correctly once per second / on real change, with no visible stutter from the store change-gate.

## Cycle 47 deviations (documented, for context)

Both were forced by the local visual-validation block (headless WebGPU does not composite):

- **Scene-card slide stayed on CSS keyframes.** Motion was applied to the StartScreen screen-state transitions (the EARS target). The ScenePicker scene-card content slide kept its `sds-slide-in-*` keyframes (already reduced-motion-aware via the P6 block) rather than moving to Motion, since the card slide could not be visually validated locally and migrating it risked the picker behavior under hard-stop #2. Card-Motion is available as Cycle 48 carryover.
- **App.js hex drift-sweep deferred.** The converted surface (ScenePicker.tsx and all six `ui` primitives) is already at zero hex. The 7 inline hex in `App.js` (an unconverted createElement component) and `MenuOption.js` `DEFAULT_ACCENT` were left rather than edited blind, since changing inline color values without composite validation risks unvalidatable visual drift.

## Carryover into Cycle 48

- **Phase 8 picker affordances (deferred whole from Cycle 47).** Scene-preview affordance, load-overlay stream-progress affordance, combined scene-plus-mode gate. All need composite validation (blocked headless) and two touch picker behavior / the Cycle 46 crossfade contract; defer rather than ship shallow.
- **Remaining ~49 component conversions.** The leaf-first conversion was proved on ScenePicker; the other createElement components are the sweep target for this cycle.
- **Inline-hex drift sweep.** `App.js` (7) and `MenuOption.js` `DEFAULT_ACCENT` still carry raw hex; retire them to tokens as the files convert.
- **Card-slide Motion.** Move the ScenePicker scene-card slide from CSS keyframes to Motion once it can be visually validated.
- **Cycle 46 post-deploy checks** still open and Matt-pickup: Q1 zen-field aesthetic sign-off, crossfade feel/speed, deep-link + MP smoke. Same headless-WebGPU block.
- **Grass body-deform visual taste check (from Cycle 45).** `js/world/konveyorGrassBladeNodeMaterial.js` shipped post-Cycle-45-close; structurally validated, visual eyeball still open (same block). Matt pre-accepted the look.
- **Cycle 44 paired buckets C/D/E** (WebGPU painterly parity, mobile/real-device proofs, multiplayer playtest) stay under "Deferred / not blocking" for a later paired cycle.

## Release reference (Cycle 42 / v2.1.10)

- Commit `fb78851`, tag `v2.1.10`, deploy run `26595530924` (success on `main`). Cycles 43 through 47 shipped no version bump, so v2.1.10 is still the current release. Do not bump the version unless Matt calls a release.

## Reference Table

| Area | Source of truth |
|---|---|
| Active cycle | [`docs/cycle-48-plan.md`](docs/cycle-48-plan.md) |
| Latest closed cycle | [`docs/archive/cycles/cycle-47-plan.md`](docs/archive/cycles/cycle-47-plan.md) |
| Closed-cycle log | [`docs/BACKLOG.md`](docs/BACKLOG.md) |
| Entrance/UI research spike | [`cycle45-validation/entrance-ui-spike.md`](cycle45-validation/entrance-ui-spike.md) |
| Frozen files | [`docs/INTERFACE_FENCE.md`](docs/INTERFACE_FENCE.md) |
| Durable hard stops | [`docs/EMERGENCY_STOPS.md`](docs/EMERGENCY_STOPS.md) |
| Architecture | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Decisions log | [`DECISIONS.md`](DECISIONS.md) |
| Player changelog | [`CHANGELOG.md`](CHANGELOG.md) |
| Portable agent context | [`AGENTS.md`](AGENTS.md) |
| Claude overlay | [`CLAUDE.md`](CLAUDE.md) |
| NEXT_SESSION contract | [`docs/NEXT_SESSION_CONTRACT.md`](docs/NEXT_SESSION_CONTRACT.md) |
