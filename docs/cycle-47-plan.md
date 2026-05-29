# Cycle 47 — ui-foundation-overhaul

> Drafted 2026-05-29 after Cycle 46 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. The research this cycle is authored from is the entrance/UI spike at [`../cycle45-validation/entrance-ui-spike.md`](../cycle45-validation/entrance-ui-spike.md). Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Cycle 46 shipped the entrance (the zen attract field, asset prefetch, in-engine crossfade) and deleted dead CSS. Cycle 47 is the second half of that split: the UI foundation overhaul. Today the React overlay is React-without-JSX (about 50 components hand-built with `React.createElement`), with Tailwind utility classes living next to 33 ad-hoc inline-style objects, 168 hand-typed hex literals, hand-drawn inline-SVG icons, `dangerouslySetInnerHTML` keyframe injection, and an `ACCENT = '#10b981'` magic constant copied across files. There is no shared design vocabulary, so every component reinvents its colors and spacing. This cycle lays the foundation: turn on JSX/TSX, define a design-token palette in the Tailwind `@theme` layer with a typed mirror, stand up a small set of hand-owned token-driven component primitives, adopt lucide-react for generic icons and Motion for transitions, and convert the scene picker as the exemplar leaf. It also isolates the HUD from per-frame React reconciliation. The user-visible difference: the menus and picker look the same or slightly cleaner, animate a little more smoothly, and the HUD stops re-rendering every frame. The bigger win is internal: the next UI change reads from one palette instead of guessing a hex code, and conversions are type-checked. This cycle deliberately does **not** convert all 50 components. It proves the foundation on one leaf and leaves the rest as carryover.

## How to read this plan

This doc fixes the *shape* of the changes (where new code slots into the module map, data contracts, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code. Tailwind v4 `@theme`, the React 19 `useSyncExternalStore` pattern, lucide-react tree-shaking, and Motion's reduced-motion APIs all evolve.
- **Read the files named in the phase before editing them.** The plan names files by intent; confirm their actual shape first (for example `js/components/ui/Button.js` and `Panel.js` already exist and may convert in place rather than spawn new files).
- **Pick the simplest thing that meets the budget.** If a CSS keyframe reads as well as a Motion spring, ship the keyframe. Escalate only on demonstrated need.

## Resolved open questions

The entrance/UI spike carried six open questions (Q1 through Q6). Cycle 46 settled the entrance ones (attract aesthetic, crossfade mechanism, prefetch). The two that govern this cycle:

1. **Q4: How much TSX breadth in one cycle?** Resolved: **leaf-first incremental**, not a big-bang sweep. Turn on JSX/TSX globally (the compiler accepts both `.js` createElement and `.tsx`), convert the scene picker as the proof leaf, and leave the other ~49 components as carryover. Lower blast radius, every conversion stays reviewable, and the build never has a half-migrated forced-flush window.
2. **Q5: Owned primitives, or a dependency (Base UI / Radix)?** Resolved: **hand-owned token-driven primitives, no Base UI or Radix dependency.** This is a custom full-screen game UI, not a forms-and-dialogs SaaS app. The shadcn ownership model (you own the component source) is the right idea, but pulling a headless a11y library for four small primitives is weight and coupling this UI does not need. The primitives live in `js/components/ui/` as `.tsx` and read the design tokens.

New runtime dependencies this cycle: **lucide-react** (generic icons) and **motion** (transitions). Both route into a dedicated non-main manualChunk so they do not inflate the measured `main-*.js` ratchet. New dev dependencies: **jsdom** and **@testing-library/react**, for a component-render test harness that compensates for the blocked local visual review (headless WebGPU does not composite, so Matt validates the look on prod).

## Architecture / shared changes

The shared primitive this cycle introduces is the **design-token palette**, defined once and consumed two ways:

- **`css/main.css` `@theme` block** gains the color, spacing, radius, and motion-duration/easing tokens. Tailwind v4 emits these as CSS custom properties and as utility classes, so existing `className:` utilities keep working and gain new token-backed ones.
- **`js/components/ui/tokens.ts`** is a typed mirror of the same values for the inline-style call sites that have not yet moved to utility classes. One source of truth in CSS, one typed accessor in TS. A converted component reads `tokens.color.accent`, never a raw `#10b981`.

No deterministic-sim contract changes. No `SceneDef` schema changes. This is a render/UI-only cycle.

## Phase 1 — Design tokens + TSX compiler config (~3hr)

**Independently testable. Foundation for every later phase.** No new dependencies, no behavior change. This phase only adds vocabulary and turns on the compiler.

1. **Root `tsconfig.json`.** Create it (none exists at root today). Set `"jsx": "react-jsx"`, `"allowJs": true`, `"checkJs": false`, `"noEmit": true`, `"moduleResolution": "bundler"`, `"target": "ES2022"`, `"strict": true`. `@vitejs/plugin-react` is already registered in [`vite.config.js`](../vite.config.js), so `.tsx` compiles with no plugin change; this config gives the editor and `tsc --noEmit` the same view.
2. **Expand the `@theme` palette** in [`css/main.css`](../css/main.css). Add: `--color-accent` (retire the per-file `ACCENT = '#10b981'` constant), per-scene accents (rolling-hills, open-country, field), semantic colors (danger, warn, success, info), rank colors (gold/silver/bronze, currently inline in `.rank-1/2/3`), glass-surface colors, and the title greens currently hardcoded in [`App.js`](../js/components/App.js). Add spacing, radius, motion-duration (160/200/240/320 ms), and easing tokens.
3. **`js/components/ui/tokens.ts`.** Typed mirror exporting the same color/spacing/radius/motion values for inline-style call sites.
4. **Move ScenePicker keyframes into `main.css`.** [`ScenePicker.js`](../js/components/StartScreen/ScenePicker.js) injects `@keyframes sds-slide-in-right/left` via `dangerouslySetInnerHTML`. Move them into `main.css` so the picker conversion in Phase 5 has no inline keyframe to carry.

**Acceptance (EARS):**

- When Phase 1 ships, then `tsconfig.json` shall exist at repo root and set `"jsx": "react-jsx"`.
- When Phase 1 ships, then `grep -c -- '--color-accent' css/main.css` shall return >= 1.
- When Phase 1 ships, then `js/components/ui/tokens.ts` shall exist and export the accent, per-scene-accent, and semantic color tokens.
- When Phase 1 ships, then `grep -c 'dangerouslySetInnerHTML' js/components/StartScreen/ScenePicker.js` shall return 0 (the injected `<style>` is gone), and `grep -c 'sds-slide-in' css/main.css` shall return >= 1 (the keyframes moved to the shared sheet; the picker still references them by name).
- While no component has been converted yet, the token introduction shall not change runtime behavior.
- When `npm test` runs, all specs shall pass; when `npm run build` runs, the production build shall be clean.

## Phase 2 — Component-test harness (~2hr)

**Depends on: nothing (can run alongside Phase 1).** Stands up the automated safety net before any conversion, since local visual review is blocked.

1. **Add devDeps** `jsdom` and `@testing-library/react`.
2. **Configure a jsdom test environment** for component specs in [`vite.config.js`](../vite.config.js) test config (or a dedicated `vitest` workspace/project entry), scoped so the existing pure-logic and sim-baseline specs keep their fast non-DOM environment.
3. **Write render smoke specs** that mount the existing `js/components/ui/Button.js` and `Panel.js` and assert they render without throwing. These pin current behavior so Phases 4 and 5 can refactor against a green baseline.

**Acceptance (EARS):**

- When Phase 2 ships, then `package.json` devDependencies shall include `jsdom` and `@testing-library/react`.
- When Phase 2 ships, then at least one component render spec under `tests/` shall mount an existing UI component in jsdom and pass.
- When `npm test` runs, all specs (the existing suite plus the new component specs) shall pass.
- When `npm run build` runs, the production build shall be clean.

## Phase 3 — lucide-react icons + SceneGlyph extraction (~3hr)

**Depends on: Phase 1 (tokens for icon color).**

1. **Add `lucide-react`** and route it into a dedicated `ui` manualChunk in [`vite.config.js`](../vite.config.js) (next to `react`, `i18n`, `vendor`) so it stays out of the measured `main-*.js` chunk.
2. **Replace generic hand-drawn icons** with lucide equivalents: the picker chevrons (the hand-rolled `M14 6l-6 6 6 6` path), and any other generic glyphs (close, settings, arrows) found in the touched components. Icon color comes from tokens.
3. **Extract the bespoke scene illustrations** (the island/mountains/farmhouse vignettes in `SCENE_CHROME`) into a presentational `SceneGlyph` component. These are art, not generic icons; lucide does not replace them. Keep them as owned SVG, just lifted out of the picker body.

**Acceptance (EARS):**

- When Phase 3 ships, then `package.json` dependencies shall include `lucide-react`.
- When Phase 3 ships, then `vite.config.js` manualChunks shall route `lucide-react` into a non-main chunk.
- When Phase 3 ships, then `grep -c 'M14 6l-6 6 6 6' js/components/StartScreen/ScenePicker.js` shall return 0.
- If the measured production `main-*.js` size grows, then `tests/refactor-baseline/__fixtures__/bundle-sizes.json` shall be updated in the same commit with the measured value and a one-line justification.
- When `npm test` and `npm run build` run, both shall pass.

## Phase 4 — Owned TSX primitives (~3.5hr)

**Depends on: Phase 1 (tokens), Phase 2 (smoke harness).**

1. **Establish token-driven `.tsx` primitives** in [`js/components/ui/`](../js/components/ui/). Convert the existing `Button.js` and `Panel.js` in place to `.tsx`, and add the primitives the picker and HUD need: `Card`, `Badge`, `IconButton`, `Surface`. Each is typed, reads tokens, and contains zero raw 6-digit hex.
2. **Update the `js/components/ui/index.js` barrel** to export the primitives (rename to `.ts`/`.tsx` if it stays a pure re-export).
3. **Render-spec each primitive** in jsdom (extends the Phase 2 harness).

**Acceptance (EARS):**

- When Phase 4 ships, then token-driven primitives shall exist as `.tsx` under `js/components/ui/` (Button, Panel, Card, Badge, IconButton, Surface).
- When Phase 4 ships, then `grep -cE '#[0-9a-fA-F]{6}'` across the primitive files shall return 0.
- When Phase 4 ships, then a component smoke spec shall render each primitive in jsdom and pass.
- When `npm test` and `npm run build` run, both shall pass.

## Phase 5 — Convert ScenePicker to TSX (~4hr)

**Depends on: Phase 1, Phase 2, Phase 3, Phase 4.** The exemplar leaf. Behavior-preserving.

1. **Extract pure logic** from [`ScenePicker.js`](../js/components/StartScreen/ScenePicker.js) into a testable `.ts` module: scene ordering (`ORDER`), current-scene resolution, and the commit decision (debounce + latest-wins coalescing predicate). Unit-test the extracted module.
2. **Rewrite the component as `ScenePicker.tsx`** using the Phase 4 primitives, the Phase 1 tokens, the Phase 3 lucide chevrons and `SceneGlyph`, and the now-in-`main.css` keyframes. Remove `ScenePicker.js` (or leave a one-line re-export shim if any importer hardcodes the `.js` path).
3. **Preserve the swap contract exactly:** debounced auto-load, latest-wins coalescing (`pendingTargetRef`/`swapInFlightRef`/`skipNextActiveSync`), touch swipe, ArrowLeft/ArrowRight keyboard, the Cycle 46 `window.__sdsAttractActive` crossfade handoff, and `switchScene` to `game.swapScene` with `legacySwitchSceneFallback`. Zero `createElement`, zero raw hex, zero `dangerouslySetInnerHTML`, zero `ACCENT =`.

**Acceptance (EARS):**

- When Phase 5 ships, then `js/components/StartScreen/ScenePicker.tsx` shall exist.
- When Phase 5 ships, then `grep -c 'createElement' js/components/StartScreen/ScenePicker.tsx` shall return 0.
- When Phase 5 ships, then `grep -cE 'dangerouslySetInnerHTML|ACCENT *=|#[0-9a-fA-F]{6}' js/components/StartScreen/ScenePicker.tsx` shall return 0.
- When Phase 5 ships, then a pure-logic spec for the extracted picker ordering/commit module shall pass.
- While an attract field is active, the converted picker shall preserve the Cycle 46 crossfade swap contract (no DOM cover, latest-wins coalescing, debounce, swipe, ArrowLeft/ArrowRight).
- When `npm test` and `npm run build` run, both shall pass.

## Phase 6 — HUD state isolation + prefers-reduced-motion (~3hr)

**Depends on: Phase 1.** Independent of the picker conversion.

1. **Convert [`useGameState.js`](../js/components/hooks/useGameState.js) to `useSyncExternalStore`.** Today it calls `setGameData(newData)` with a fresh object on every `frame` event, forcing a full HUD reconciliation every frame. Feed a `useSyncExternalStore` store from the `frame` event and **change-gate the snapshot**: quantize the timer to whole seconds, keep `sheepCount` and stamina as integers, and only mint a new snapshot reference when a HUD-relevant value actually changes. Keep all underlying GameBridge reads (getGameState/getGameTimer/getNetworkManager/getMultiplayerState/getSheepdog/getSceneManager) identical.
2. **Respect `prefers-reduced-motion`** in the UI animation path so the later Motion layer and the CSS keyframes both honor it.

**Acceptance (EARS):**

- When Phase 6 ships, then `grep -c 'useSyncExternalStore' js/components/hooks/useGameState.js` shall return >= 1.
- When Phase 6 ships, then a spec shall assert that repeated identical `frame` snapshots do not mint a new store reference (no extra render).
- When Phase 6 ships, then `grep -c 'prefers-reduced-motion'` across the UI path shall return >= 1.
- While the game emits `frame` events whose HUD-relevant values are unchanged, the HUD store snapshot shall be referentially stable.
- When `npm test` and `npm run build` run, both shall pass.

## Phase 7 — Motion layer (~3hr)

**Depends on: Phase 1, Phase 6 (reduced-motion plumbing).**

1. **Add `motion`** and route it into the `ui` manualChunk alongside lucide-react.
2. **Apply Motion to StartScreen transitions:** the screen-state transitions (main / dogSelection / modes / settings / etc.) and the scene-card enter/exit. Every animation respects `prefers-reduced-motion` (falls back to an instant or near-instant transition).

**Acceptance (EARS):**

- When Phase 7 ships, then `package.json` dependencies shall include `motion`.
- When Phase 7 ships, then `vite.config.js` manualChunks shall route `motion` into a non-main chunk.
- When Phase 7 ships, then StartScreen screen transitions shall use `motion` and shall honor `prefers-reduced-motion`.
- If the measured production `main-*.js` size grows, then the bundle fixture shall be updated in the same commit with the measured value and justification.
- When `npm test` and `npm run build` run, both shall pass.

## Phase 8 — Picker affordances + drift sweep (optional, ~3.5hr)

**Depends on: Phase 4, Phase 5, Phase 7.** Absorbs Cycle 46's deferred Phase 5 polish. Skip and defer to BACKLOG carryover if the cycle fills.

1. **Scene-preview affordance** in the picker, built on the Phase 4 primitives.
2. **Stream-progress affordance** on the load overlay during the asset prefetch / crossfade window.
3. **Combined scene-plus-mode gate** reachable from the picker (the deferred C46 picker-overlay item).
4. **Drift sweep:** retire remaining inline 6-digit hex in the files touched this cycle, replacing with tokens.

**Acceptance (EARS):**

- When Phase 8 ships, then the picker shall present a scene-preview affordance and the load overlay shall present a stream-progress affordance, both built on the Phase 4 primitives.
- When Phase 8 ships, then a combined scene-plus-mode gate shall be reachable from the picker.
- When Phase 8 ships, then `grep -cE '#[0-9a-fA-F]{6}'` across the files touched this cycle shall trend toward 0.
- If the cycle fills before Phase 8, then Phase 8 shall be deferred to `docs/BACKLOG.md` carryover rather than shipped shallow.
- When `npm test` and `npm run build` run, both shall pass.

## Dependencies

Mostly serial, with two independent branches:

```
Phase 1 ─┬─> Phase 3 ─┐
         ├─> Phase 4 ─┼─> Phase 5 ─┐
Phase 2 ─┘            │             ├─> Phase 8 (optional)
         Phase 1 ─> Phase 6 ─> Phase 7 ─┘
```

- **Phase 1** is the foundation; nothing converts before tokens + tsconfig land.
- **Phase 2** is independent of Phase 1 and can land first or alongside; it must precede the conversion phases (4, 5) so they refactor against a green render baseline.
- **Phase 3 and Phase 4** both need Phase 1 and can run in parallel.
- **Phase 5** needs Phases 1, 2, 3, 4 (it consumes primitives, tokens, lucide, and is tested by the harness).
- **Phase 6** needs only Phase 1 and is independent of the picker branch.
- **Phase 7** needs Phase 6 (reduced-motion plumbing).
- **Phase 8** needs Phases 4, 5, 7.

Executed serially this cycle (single agent, autonomous): 1, 2, 3, 4, 5, 6, 7, 8.

## Frozen files (cycle-specific additions)

No durable frozen file is modified. Specifically:

- **`shared/scenes/types.js` (SceneDef) stays frozen.** The Phase 8 picker affordances use existing scene fields plus the presentational `SceneGlyph`, not a new schema field. If an affordance appears to need a new `SceneDef` field, that is a hard stop (see below).
- **The deterministic sim core and `tests/sim-baseline/*.json` stay untouched.** This is a render/UI-only cycle; no sim-baseline regeneration.
- **`tests/refactor-baseline/__fixtures__/bundle-sizes.json`** is a soft-fence test ratchet. This cycle updates `mainKB` only if a measured `main-*.js` growth occurs (Phases 3 and 7 record the measured value and justification in the same commit, authorized by their EARS lines). The harness `tests/refactor-baseline/harness.js` is **not** modified; new UI deps route into a non-measured `ui` chunk.

## Hard stops

Durable hard stops apply on every cycle (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific additions:

1. If any phase needs a `shared/scenes/types.js` SceneDef change, then stop and surface to the user before proceeding (fence). Picker affordances must use existing fields plus presentational art.
2. If a leaf conversion cannot be made behavior-identical (the Cycle 46 crossfade swap contract, the React-overlay pointer-events gating, or the multiplayer hard-reload path), then revert the conversion rather than ship a behavior change.
3. If the combined gzipped transfer of lucide-react plus motion exceeds roughly 60 KB (read from the `npm run build` chunk report), then drop Motion and use CSS-keyframe transitions instead.
4. If the `useGameState` refactor risks a multiplayer scoreboard desync or dropped HUD updates, then keep the change conservative (snapshot-gate only) and do not alter the underlying GameBridge reads.
5. Headless WebGPU visual validation is blocked locally (the preview tab runs `visibilityState: hidden` and does not composite). Do not block the cycle on visual goldens; the look is Matt's post-deploy call on prod.

## What NOT to do during this cycle

- **Do not convert all ~50 components.** Leaf-first: the scene picker is the exemplar; the rest is BACKLOG carryover.
- **Do not add Base UI or Radix.** Primitives are hand-owned and token-driven.
- **Do not decompose `GrassSystem.js`, `OptimizedSheep.js`, or `main.js`'s per-frame update loop.** They are cohesive by design (see [`DECISIONS.md`](../DECISIONS.md)).
- **Do not touch `shared/` or regenerate sim-baseline fixtures.** This cycle is render/UI-only.
- **Do not bump the app version.** v2.1.10 stands unless Matt calls a release.
- **Do not use the View Transitions API.** The crossfade is in-engine (Cycle 46 decision).
- **Do not put per-frame HUD values back into plain `setState`.** The whole point of Phase 6 is to stop that.
- **Do not auto-post devlog or marketing content.** Matt's voice.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the cycle closes, `tsconfig.json` shall exist with `"jsx": "react-jsx"` and `css/main.css` `@theme` shall define the color palette (`grep -c -- '--color-accent' css/main.css` >= 1).
- [ ] When the cycle closes, `js/components/StartScreen/ScenePicker.tsx` shall contain zero `createElement`, zero raw 6-digit hex, zero `dangerouslySetInnerHTML`, and zero `ACCENT =` (grep).
- [ ] When the cycle closes, `package.json` shall list `lucide-react` and `motion`, and the bundle fixture shall record any measured `main-*.js` growth with same-commit justification.
- [ ] When the cycle closes, a spec shall prove repeated identical `frame` events do not force a HUD re-render.
- [ ] When the cycle closes, `git diff` against the cycle-start commit shall show `shared/` and `tests/sim-baseline/` untouched.

## References

- [`../cycle45-validation/entrance-ui-spike.md`](../cycle45-validation/entrance-ui-spike.md) — the research this cycle is authored from
- [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [`archive/cycles/cycle-46-plan.md`](archive/cycles/cycle-46-plan.md) — the entrance half of this split
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
