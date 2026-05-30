# Cycle 49 — pastoral-vision

> Drafted 2026-05-29 after Cycle 48 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. This is the first cycle of the **Pastoral UI/UX rework program** (Cycles 49-52); the program-level plan Matt approved is the source of intent. The entrance + UI history this builds on is Cycles 46-48 ([`archive/cycles/`](archive/cycles/)); the research the program draws from is the entrance/UI spike at [`../cycle45-validation/entrance-ui-spike.md`](../cycle45-validation/entrance-ui-spike.md).

## Goal

Define the calm-pastoral / painterly UI design language for sds and produce the reviewable artifacts the implementation cycles (50-52) execute against, with zero behavior change to the running game. This cycle writes a design-language doc (principles, mood, the golden-hour target look, motion stance), lands a v2 pastoral token palette as a real additive `@theme` block in [`css/main.css`](../css/main.css) mirrored in [`js/components/ui/tokens.ts`](../js/components/ui/tokens.ts), scaffolds a standalone `/gallery` route (`gallery.html`) that renders the primitives and mockups without booting the WebGPU game so the new look is eyeballable headlessly and provable by `npm run build`, previews the six primitives restyled under the pastoral palette in that gallery, specs the instant-entrance and pastoral-loading concepts as static mockups, and produces a component inventory + migration map sequencing the 13 stateful containers for Cycles 51-52. The user-visible difference in the running game is none by design; the payoff is a `/gallery` page Matt opens on the deploy and a written spec that turns "calm pastoral" from taste into executable scope. The cycle only adds tokens, docs, a gallery route, and tests, touching no game-runtime path, so it needs no fence authorization.

## How to read this plan

This doc fixes the *shape* of the changes (which artifacts land, the contracts they must preserve, acceptance criteria), **not the implementation choices**. Where it suggests a specific technique, treat it as a starting point for research, not the final answer.

Each agent picking up a phase should:

- **Research current best practice** for the specific sub-problem before writing code (Tailwind v4 `@theme`, multi-input Vite/rollup, React 19, Testing Library idioms all evolve).
- **Read the files named in the phase before editing them.** The plan names files by intent; confirm their actual shape first.
- **Keep the running game untouched.** This is a vision/spec cycle. The entrance/loading rework is Cycle 50; the container restyle is 51-52. This cycle inventories, specs, and previews, it does not change live behavior.

Recommended posture: the agent **drafts** the design language, palette, and mockups (a reasonable pastoral interpretation), and they are **review-gated on the deployed `/gallery`** before Cycles 50-52 execute. Taste phases are marked paired below; on an autonomous run they ship a draft for Matt's post-deploy review on the gallery rather than blocking.

## Open questions to resolve

These do not block scaffolding but should be resolved during the cycle (the spec phases are where they land).

1. **Q1: Does the instant menu keep any ambient backdrop motion, or is it truly static?** Author lean: a simple pastoral backdrop with gentle pure-CSS/2D ambient motion (a soft golden-hour gradient drift), reduced-motion-aware. Hard line: no heavy 3D at entry (no WebGPU renderer, no `buildSceneBody`, no `ZenAttract`); any ambient is CSS/2D only. Decided on the `EntranceMock` (Phase 5).
2. **Q2: Loading-progress source?** Author lean: real stage marks (the data exists in `summarizeLoadStages` in [`js/boot/initWorld.js`](../js/boot/initWorld.js)) if cheap to surface, else a smoothed timer calibrated to the measured 430-1574ms range. Specced in Phase 5, built in Cycle 50.
3. **Q3: Typography.** Author lean: system fonts for this cycle; if a pastoral display face is wanted for the title, spec it in the design-language doc and decide font loading in Cycle 50.
4. **Q4: Zen-boids fate.** Resolved: archive-as-default, keep the code. This cycle only documents `ZenAttract` as superseded-as-default; the boot-gate flip and crossfade re-point are Cycle 50.

## Architecture / shared changes

Additive only, no fence change:

- **v2 pastoral palette** added to the `css/main.css` `@theme` block and mirrored in `tokens.ts`. No existing token is removed or repointed; the old palette stays live until Cycles 50-52 migrate components onto the new one.
- **`/gallery` route** added as a second rollup input in [`vite.config.js`](../vite.config.js) (the `about.html` multi-input pattern is the precedent). The gallery is a pure React + CSS page that imports no game-runtime module, so it composites headlessly. This becomes the durable headless-validation surface for the whole program.

## Phase shape rules

A cycle has **<= 8 phases**. Each phase is either fully autonomous or fully paired; this is a design cycle, so several phases are paired (taste), shipping a draft for gallery review on an autonomous run. Each phase has a single sharp goal and <= 4 hours of work.

## Acceptance criteria — EARS format

Every phase's Acceptance section uses [EARS notation](https://kiro.dev/docs/specs/) so the lines are grep-testable. A design cycle's outputs are made testable by landing each as a **file artifact, a named token, a build input, or a render spec**: `test -f` on docs with required `## ` section greps; pastoral tokens greppable in both `css/main.css` and `tokens.ts` with a Node parity spec; `gallery.html` as a rollup input with `dist/gallery.html` after build; mockups asserted by jsdom via `data-testid`; the migration map naming all 13 containers with a target cycle each.

## Phase 1 — Design-language doc (~3hr) [paired - taste]

**Independently testable.** Establishes the written north star the rest of the program references. Paired because mood and principles are Matt's call; ships a draft for review on an autonomous run.

1. **Author [`docs/ui-design-language.md`](ui-design-language.md)** with sections `## Principles`, `## Mood` (calm-pastoral, herding-at-dusk, Rolling Hills golden hour), `## Palette` (names + intent; hex defined in Phase 2), `## Typography`, `## Motion` (gentle, reduced-motion-first), `## Surfaces` (airy glass over warm backdrops), `## Entrance` (instant lightweight menu, pointer to Phase 5), `## Anti-goals` (no dark slate glass, no neon, no heavy 3D at entry).
2. **Cross-link** this program plan and the prior spike ([`../cycle45-validation/entrance-ui-spike.md`](../cycle45-validation/entrance-ui-spike.md)), recording that zen-boids-as-entrance is superseded.

**Acceptance (EARS):**

- When Phase 1 ships, then `docs/ui-design-language.md` shall exist.
- When Phase 1 ships, then `grep -cE '^## (Principles|Mood|Palette|Typography|Motion|Surfaces|Entrance|Anti-goals)' docs/ui-design-language.md` shall return 8.
- If the doc contains an em-dash, an exclamation mark, or an emoji, then the prose-rule guard grep shall return 0 (house prose rules).
- When `npm test` and `npm run build` run, both shall pass.

## Phase 2 — v2 pastoral token palette (~3.5hr) [paired - taste]

**Depends on: Phase 1 (palette names).** Lands the palette as real tokens, additive, so nothing in the running app changes color yet.

1. **Add a marked `Cycle 49 pastoral palette v2` block** to the `@theme` in [`css/main.css`](../css/main.css) with the golden-hour / pasture family (for example `--color-pasture-dawn`, `--color-pasture-dusk`, `--color-hill-shadow`, `--color-glass-warm`, `--color-glass-warm-border`, warm text tokens, a soft accent set, pastoral motion durations/easings if the stance differs from the existing tokens). Names per Phase 1's `## Palette`.
2. **Mirror every new token** in [`js/components/ui/tokens.ts`](../js/components/ui/tokens.ts) under a `pastoral` grouping as `var(--token)` strings.
3. **Additive only.** Do not delete or repoint any existing token. The old palette stays live until 50-52 migrate.
4. **Add `tests/ui/tokens.parity.spec.ts`** (Node env) that reads both files as text, extracts the `--color-*` names, and asserts the pastoral set is present and symmetric across the two files.

**Acceptance (EARS):**

- When Phase 2 ships, then `css/main.css` shall contain a `Cycle 49 pastoral palette v2` marker (grep >= 1).
- When Phase 2 ships, then each new pastoral token name shall appear in both `css/main.css` and `js/components/ui/tokens.ts` (the parity spec asserts the two `--color-*` sets symmetric for the pastoral group).
- While Phase 2 is additive, `git diff` shall show no existing `--color-*` value removed or repointed (additions only).
- When `npm test` runs, then `tests/ui/tokens.parity.spec.ts` shall pass.
- When `npm run build` runs, it shall pass.

## Phase 3 — Standalone `/gallery` route scaffold (~4hr) [autonomous]

**Depends on: nothing (can start in parallel with Phase 1).** The keystone that works around the headless-WebGPU block.

1. **Add `gallery.html`** at repo root (modeled on `about.html`) with its own mount div and a `<script type="module">` entry importing `css/main.css`. It must NOT import `js/main.js`, `SceneManager`, `buildSceneBody`, or `ZenAttract`, so it composites headlessly.
2. **Add the entry + root under `js/gallery/`** (for example `gallery.jsx` + `Gallery.tsx`): a palette swatch grid (every pastoral token as a chip) and a primitives section (every primitive from [`js/components/ui/index.ts`](../js/components/ui/index.ts) in its variants). Sections carry `data-testid`.
3. **Wire the build:** add `gallery: 'gallery.html'` to `rollupOptions.input` in [`vite.config.js`](../vite.config.js) without perturbing `main` / `about` / `manualChunks`.
4. **Add `tests/ui/Gallery.smoke.spec.tsx`** (jsdom) asserting the gallery root mounts and renders the palette + primitives sections.

**Acceptance (EARS):**

- When Phase 3 ships, then `gallery.html` shall exist and `grep -c gallery vite.config.js` shall return >= 1.
- When `npm run build` runs, then `dist/gallery.html` shall exist.
- If the gallery entry imports `js/main.js`, `SceneManager`, `buildSceneBody`, or `ZenAttract`, then a guard grep shall return 0 (the gallery stays WebGPU-free so it composites headlessly).
- When `npm test` runs, then `tests/ui/Gallery.smoke.spec.tsx` shall mount the gallery root in jsdom and pass.
- When `npm run build` runs, then the `main-*.js` chunk shall stay <= the [`tests/refactor-baseline/__fixtures__/bundle-sizes.json`](../tests/refactor-baseline/__fixtures__/bundle-sizes.json) ratchet.

## Phase 4 — Pastoral primitive preview in the gallery (~3.5hr) [paired - taste]

**Depends on: Phase 2 (tokens) + Phase 3 (gallery shell).** Lets Matt eyeball restyled primitives headlessly before any container work. Preview-only; live rendering is unchanged because live components still pass the old tokens.

1. **Add a pastoral path to the six primitives without breaking their API.** Lean: a gallery-only theming wrapper that overrides the `--color-*` vars on a container, so the primitives need zero change (lowest blast radius). Decide wrapper-vs-flag by which keeps the live API untouched.
2. **Render every primitive in every variant** under the pastoral wrapper on a golden-hour backdrop.
3. **Extend `tests/ui/Gallery.smoke.spec.tsx`** to assert the pastoral primitive section renders.

**Acceptance (EARS):**

- When Phase 4 ships, then the gallery shall render all six primitives (Button, Panel, Surface, Card, Badge, IconButton) under the pastoral palette (render spec finds each by section testid).
- While Phase 4 previews the pastoral look, the live primitive APIs shall be unchanged (`git diff` shows no change or only additive optional props; the existing primitive smoke specs pass unmodified).
- When `npm test` runs, then the extended gallery spec and the existing primitive specs shall pass.
- When `npm run build` runs, it shall pass.

## Phase 5 — Entrance + loading concept spec and mockups (~4hr) [paired - taste]

**Depends on: Phase 2 + Phase 3.** Specs the instant-entrance and pastoral-loading experiences as a doc plus static gallery mockups, so Cycle 50 executes against an approved target.

1. **Author [`docs/entrance-loading-spec.md`](entrance-loading-spec.md)** with `## Entrance` (instant menu: title + scene picker on a simple pastoral backdrop; the static-vs-gentle-ambient decision per Q1; explicit "no heavy 3D at entry"; zen-boids stops being default), `## Loading` (build-on-commit, idle-prefetch, the pastoral progress that replaces shimmer-skeleton, what it shows during the 430-1574ms `buildSceneBody`), `## Crossfade` (in-engine, `window.__sdsAttractCrossfadeActive` preserved, never View Transitions), `## Deep-link` (`?scene=` and `#/r/` keep working).
2. **Add `EntranceMock` and `LoadingMock` to the gallery** as static React mockups under the pastoral palette, no WebGPU behind them; `LoadingMock` may animate a fake progress bar on a timer to show motion feel.
3. **Extend the gallery render spec** to assert both mocks mount.

**Acceptance (EARS):**

- When Phase 5 ships, then `docs/entrance-loading-spec.md` shall exist and `grep -cE '^## (Entrance|Loading|Crossfade|Deep-link)'` shall return 4.
- When Phase 5 ships, then `grep -c 'View Transitions' docs/entrance-loading-spec.md` shall return >= 1 (names the rejected approach) and `grep -ci zen docs/entrance-loading-spec.md` shall return >= 1 (records the retirement).
- When Phase 5 ships, then the gallery shall render `EntranceMock` and `LoadingMock` (render spec finds both by testid).
- When `npm test` and `npm run build` run, both shall pass.

## Phase 6 — Component inventory + migration map (~2.5hr) [autonomous]

**Depends on: nothing (doc-only, can start immediately).** Produces executable scope for 51-52.

1. **Author [`docs/ui-migration-map.md`](ui-migration-map.md):** one row per container with file path, current `createElement` count, current inline-hex count, target cycle (51 or 52), dependency notes. All 13: `App.js`, `StartScreen/{SettingsPanel,SandboxSetup,LocalModeSetup,FenceEditor,ShapeEditor}.js`, `GameHUD/{MobileHUD,MobileControls,PauseMenu,CompletionScreen,ExtremeTuningPanel}.js`, `Multiplayer/{Lobby,RoomCreation}.js`.
2. **Record the cycle split** (51 = StartScreen/setup + MP containers; 52 = HUD/overlay + program polish) and the per-cycle acceptance shape (zero createElement, zero hex, gallery coverage, render spec per container).

**Acceptance (EARS):**

- When Phase 6 ships, then `docs/ui-migration-map.md` shall exist and shall name all 13 container basenames (grep for each >= 1).
- When Phase 6 ships, then `grep -cE 'Cycle 5[12]' docs/ui-migration-map.md` shall return >= 13 (a target cycle per container).
- When `npm test` and `npm run build` run, both shall pass.

## Dependencies

```
Phase 1 (doc) ──> Phase 2 (palette) ──> Phase 4 (primitive preview)
                       \
Phase 3 (gallery scaffold) ──────────────> Phase 4 + Phase 5 (mocks)
Phase 6 (migration map) independent.
```

Phases 1, 3, and 6 can start immediately (1 and 6 are doc-only; 3 is independent). Phase 2 depends on 1's palette names. Phases 4 and 5 need both tokens (2) and the gallery shell (3). Serial autonomous order: 1, 6, 2, 3, 4, 5.

## Frozen files (cycle-specific additions)

No durable frozen file is modified; no fence authorization needed.

- **`shared/scenes/types.js` (SceneDef) stays frozen.** No schema field this cycle.
- **The deterministic sim core and `tests/sim-baseline/*.json` stay untouched.** Render/UI/doc-only cycle.
- **The Worker / DO / wire protocol stays untouched.**
- **`vite.config.js` is edited additively** (one `gallery` input); the change must not alter `main` / `about` inputs or `manualChunks`.
- **`css/main.css` `@theme` and `js/components/ui/tokens.ts` are additive only** (new tokens, no removals or repoints).
- **`tests/refactor-baseline/__fixtures__/bundle-sizes.json`** is the soft ratchet; the gallery is a separate entry and must not grow `main-*.js`.

## Hard stops

Durable hard stops apply on every cycle (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific additions:

1. If the gallery requires importing any WebGPU/game-runtime module to render, stop and re-scope the mock; the gallery must stay WebGPU-free so it composites headlessly.
2. If landing v2 tokens appears to require deleting or repointing an existing token (breaking the live look before 50-52 migrate), stop and keep it additive.
3. Headless WebGPU visual validation is blocked locally. Do not block on in-engine goldens; the gallery is the headless eyeball surface and the live look is Matt's post-deploy call.
4. If `npm run build` shows `main-*.js` growing from the gallery entry, investigate before bumping the bundle ratchet.

## What NOT to do during this cycle

- **Do not change any live game-runtime path** (`js/main.js`, `js/boot/*`, `js/attract/ZenAttract.js`, `js/rendering/*`). Entrance/loading rework is Cycle 50; this cycle only specs it.
- **Do not convert or restyle any container.** That is Cycles 51-52; this cycle inventories and maps them.
- **Do not delete or repoint existing tokens.** v2 is additive.
- **Do not delete the zen-boids code.** Only document it as superseded-as-default; retirement-as-default is Cycle 50.
- **Do not add Base UI or Radix**, and **do not add new runtime deps** (lucide-react + motion already present).
- **Do not touch `shared/`**, regenerate sim-baseline, or change the Worker / wire protocol.
- **Do not bump the app version.** v2.1.10 stands unless Matt calls a release.
- **Do not use the View Transitions API** anywhere in the mocks.
- **Do not auto-post devlog or marketing content.** Matt's voice.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs (including the token-parity and gallery smoke specs) shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean and `dist/gallery.html` shall exist.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions and `/gallery` shall be reachable for review.
- [ ] When the cycle closes, `docs/ui-design-language.md`, `docs/entrance-loading-spec.md`, and `docs/ui-migration-map.md` shall exist with their required sections (grep).
- [ ] When the cycle closes, the v2 pastoral tokens shall exist in both `css/main.css` and `tokens.ts` (parity spec) with no existing token removed or repointed (`git diff`).
- [ ] When the cycle closes, `git diff` against the cycle-start commit shall show `shared/`, `tests/sim-baseline/`, the Worker, and every live game-runtime file untouched.
- [ ] When the cycle closes, the measured `main-*.js` chunk shall be <= the recorded bundle ratchet.

## References

- Program plan (Matt-approved): the Pastoral UI/UX rework program (Cycles 49-52), entrance = instant lightweight menu, loading = build-on-commit + idle prefetch, visual style = calm pastoral.
- [`../cycle45-validation/entrance-ui-spike.md`](../cycle45-validation/entrance-ui-spike.md) — the research the program draws from
- [`archive/cycles/cycle-48-plan.md`](archive/cycles/cycle-48-plan.md) — the leaf-conversion cycle this follows
- [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — this template
- [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files
- [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard-stop list
- [`NEXT_SESSION_CONTRACT.md`](NEXT_SESSION_CONTRACT.md) — pickup-state contract
- [`BACKLOG.md`](BACKLOG.md) — closed cycles + deferred items
- [EARS notation](https://kiro.dev/docs/specs/) — testable acceptance lines
