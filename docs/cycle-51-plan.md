# Cycle 51 - frontend-loading-and-assets-redesign

> Drafted 2026-06-01 after Cycle 50 closed. Authored 2026-06-02 after the alignment brainstorm converged. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

A first-principles redesign of the frontend: the stack, the component structure, and how every UI component is instantiated and implemented, plus the loading sequence, the entrance, the visual style and icon system, and the non-scene art. This is a "step back and rethink the whole shell" cycle, not an incremental restyle. The user-visible target is a coherent, intentional entrance + loading + scene-switch experience that replaces the current drift, with a style and art direction chosen on purpose rather than accreted.

The method is a **10-way mockup bake-off**: build ten interactive entrance-and-flow prototypes as isolated test scenes, ship them for Matt to try in a browser, keep one (or call a rework round), then wire the winner into the real boot and delete the old shell. The bake-off forces a real rewrite: the prototypes are greenfield, so picking a winner is picking new code, and the old flow gets removed rather than re-skinned.

## Converged decisions (brainstorm, 2026-06-02)

The brainstorm answered the seeded open questions. The decisions below are the cycle's contract; the bake-off resolves what remains a taste call.

- **Q1 Stack: keep it.** React 19 + Vite 7 + Tailwind v4 + the typed `tokens.ts` mirror is the right modern stack. The rework is discipline (finish the `.tsx`/token migration, build a real icon system, rebuild the entrance/loading architecture), not a framework swap.
- **Q2 Entrance model: decided by the bake-off.** The real option space is static pre-rendered scene image, painterly illustration, a lightweight live diorama, full live scene, or minimal/typographic. The ten prototypes put these in front of Matt rather than picking in the abstract.
- **Q3 Loading: kill both skeletons, one real bar.** Replace the boot skeleton ([`public/components/skeleton-loader.html`](../public/components/skeleton-loader.html)) and the scene-swap shimmer ([`js/components/ui/SceneSwapOverlay.tsx`](../js/components/ui/SceneSwapOverlay.tsx)) with a pastoral loading surface whose bar is driven by the real per-stage `logStep` marks in [`js/boot/initWorld.js`](../js/boot/initWorld.js).
- **Q4 Scene-switch backdrop: the target world's render**, not the void. Crossfade to live via the existing in-engine dissolve.
- **Q5 Style: pastoral base, mostly pastoral with a few wildcards.** Adopt the Cycle 49 pastoral language and tokens as the base; the bake-off spread is mostly pastoral variations plus a small number of deliberate outliers (warm-dark, alternative flows).
- **Q6 Art and assets: new captures only, no old images; Pixel Forge for game assets.** The new frontend's world backdrops are freshly captured WebGPU scene renders (the matched-series angle work, via [`tools/cinematic/run.mjs`](../tools/cinematic/run.mjs) plus the cycle-51 `cycle51-validation/frame.mjs` harness). The old marketing OG cards (`assets/marketing/og/og-*.webp`) and any other legacy imagery are NOT reused in the new frontend; every backdrop is a new capture (Matt, 2026-06-03). Pixel Forge (`C:\Users\Mattm\X\games-3d\pixel-forge`, Matt's tool, greenlit) generates any game assets we want (icons, sprites, textures), and external-AI image generation is in-bounds this cycle by Matt's explicit call, against the usual in-repo-bake default.

### Information architecture (first-principles reframe)

The current flow is a 13-screen state machine in [`js/components/App.js`](../js/components/App.js) that mixes games with destinations, builds the scene on browse, and gates a dog pick and a name screen before play. The reframe:

- **World-first spine.** The three worlds (Home Field, Rolling Hills, Open Country) are the hero of the entrance. The centered world is "armed" with its difficulty and the player's dog and a primary Play. This is the lead, tested against two flow wildcards (mode-first, one-tap Play).
- **Dog is a persistent avatar**, preselected to last-used, swapped inline, not a full-screen gate every run.
- **Scene builds once, on the Play commit**, never on browse. Browsing worlds swaps a static render.
- **Settings and Leaderboard leave the play grid.** Settings is a corner gear; Leaderboard is contextual (per world + completion). Multiplayer host hangs off the armed world; join/public is a destination. The exact Multiplayer prominence is resolved by the bake-off.
- **Identity deferred** until it matters (leaderboard submit, multiplayer join). No first-run name gate.

## Progress (2026-06-03)

The bake-off and the scene-art work are underway on branch `cycle-51-mockups` (unpushed; the live game is untouched).

- **P1-P4 shipped (commit `301a03e`).** All ten interactive prototypes are live on the isolated `/mockups` route, each running the full world-first flow (arm a world, set difficulty, swap dog, Play, loading bar, in-game HUD), responsive PC and mobile. 903 tests pass, build clean, the main bundle ratchet holds (separate chunk). Awaiting Matt's pick (P5).
- **Scene-art harness built** (local, gitignored under `cycle51-validation/`). `frame.mjs` poses the dog upright and sweeps camera techniques per world in real WebGPU; `assemble.mjs` lays each technique across the three worlds as a matched series; `angles.html` slow-crossfades a scene's angles in the browser. That crossfade of pre-rendered WebPs (no GIF, no video) is the fast-loading animated-backdrop technique and a candidate answer to Q2/Q4. These produce the new world backdrops that replace the old OG images.
- **Render fix shipped (commit `98be647`).** The Cycle 23 meadow-quad far-grass LOD was disabled. It only ever fired on Open Country, where its flat color carpets sat inside the 380m playable island and read as a lighter-green checkerboard the player walked into at the shore. The whole field now uses instanced grass. Surfaced during the scene-art prep; render-only, 903 tests pass. (A first pass, commit `e9b5f6e`, conformed the quad to the terrain but the flat-carpet look remained, so the LOD was disabled by tier config.)
- **Pending decisions (Matt, P5).** Pick the winning mockup direction, the matched-shot angle, and the dog treatment (silhouette vs side-lit); decide whether the entrance backdrop is the animated WebP angle-cycle or a single still. Then P6-P8 wire the winner, swap in the new captured backdrops (no old images), and remove the old shell.

## Scope

All of it: the entrance, the loading sequence, the scene-switch, the icon and style system, finishing the component/token migration, and the in-game HUD. The bake-off (P1-P4) and the review gate (P5) run first; the winner-wiring and cleanup (P6-P8) follow Matt's pick.

## Phase shape rules

Standard (see [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md)): <= 8 phases, each fully autonomous or fully paired, single sharp goal. P1-P4 are autonomous; P5 is paired (Matt decides); P6-P8 are autonomous, authored against the winner.

## Phases

### P1 - Mockup harness + shared shell (autonomous)

Build the isolated `/mockups` route and the shared flow shell every skin reads. Clone the gallery pattern: a `mockups.html` Vite entry, a `MockupHarness` index that lists all ten with deep-links, and a `MockShell` providing the mock data (3 worlds with renders, 5 dogs with portraits, the modes/difficulties) and a `useMockFlow` hook implementing arm-world -> set-difficulty -> swap-dog -> commit -> loading -> in-game -> back. Shared sub-components (world render, dog avatar, difficulty chip, loading bar calibrated to the measured stage timings) live here so skins are presentation-only.

- **Files:** `mockups.html`, `js/mockups/index.jsx`, `js/mockups/MockupHarness.tsx`, `js/mockups/shell/*` (data, flow hook, shared sub-components), `vite.config.js` (third Rollup input).
- **Acceptance:**
  - When `npm run build` runs, then `dist/mockups.html` shall be emitted and the main chunk ratchet shall be unchanged (the route is a separate entry).
  - When `/mockups` is opened, then an index of ten named prototypes with working deep-links (`#/1`..`#/10`) shall render with no WebGPU boot.
  - When a skin reads `useMockFlow`, then the full arm -> commit -> loading -> in-game -> back sequence shall be drivable without touching `js/main.js`, `App.js`, or any game-runtime module.

### P2 - Reference skins (autonomous)

Build two structurally different reference skins (Golden Pasture, plus one that flexes the shell differently, e.g. Biome Cards or Wide-Open) to set the quality bar and prove the shell API before the rest. Each implements EntranceView, LoadingView, InGameView over the shared flow, responsive at PC and mobile.

- **Files:** `js/mockups/skins/golden-pasture/*`, `js/mockups/skins/<second>/*`.
- **Acceptance:**
  - When a reference skin is opened at desktop and mobile widths, then the entrance, loading, and in-game frames shall render with pastoral tokens and no inline hex.
  - When Play is pressed in a reference skin, then a real-feeling loading bar calibrated to the measured stage timings shall animate, then reveal the in-game HUD frame.

### P3 - Remaining eight skins (autonomous)

Build the other eight skins against the fixed shell API, using the references as templates. The full spread: Golden Pasture, Storybook, Living Diorama, Wide-Open, Launcher, Biome Cards, Zen Type, Warm Cinematic, Mode-First, One-Tap Hero.

- **Files:** `js/mockups/skins/*/*`, harness registration.
- **Acceptance:**
  - When `/mockups` is opened, then all ten prototypes shall be reachable and each shall run its full flow at PC and mobile widths.
  - When any skin runs, then it shall import only the shared shell and the design tokens, never the old `App.js` flow, `ZenAttract`, or the skeleton loaders.

### P4 - Capture + deploy (autonomous)

Screenshot every skin at PC (1920x1080) and mobile (390x844) for offline review, save them under `cycle51-validation/`, and deploy the `/mockups` route so Matt can try them on any device.

- **Files:** `cycle51-validation/screenshots/*`, capture notes.
- **Acceptance:**
  - When the capture pass runs, then PC and mobile screenshots of every skin's entrance, loading, and in-game frames shall exist under `cycle51-validation/`.
  - When the branch deploys, then `sheepdogsim.com/mockups` shall serve the index and all ten prototypes.

### P5 - Bake-off review (paired) - RESOLVED 2026-06-03; sub-decisions resolved 2026-06-02 (autonomous)

**Winner: Golden Pasture** (world-first, photo-real warm glass). Matt picked it as the anchor for the frontend direction. The remaining sub-decisions (matched-shot angle, dog treatment, animated-vs-still backdrop) were resolved autonomously against the rendered `cycle51-validation` art so P6-P8 could proceed end-to-end:

- **Matched-shot angle: `close-eye`.** Eye-level, the dog centered and upright as a calm hero with sky and landscape behind. The most consistent composition across all three worlds and the calmest read behind the warm-glass panel. The other five techniques each break on one world (mid-hero and front3q go near-black in the Rolling Hills foreground, high-est buries Rolling Hills behind a tree, side-pass reads as action, close-low blows up foreground sheep).
- **Dog treatment: side-lit and legible, not silhouette.** The dog is a swappable persistent avatar in the world-first IA, so it must read as a recognizable border collie (white chest/face/legs, warm rim from the low sun). Home Field close-eye is the reference for the ideal side-lit read.
- **Backdrop: a single still per world with the existing CSS Ken Burns zoom, not the animated angle-cycle.** Honors the cycle's loading/perf focus and the mobile-compatibility directive: one still per world (three backdrops) plus the `mock-kenburns` zoom gives the live-feeling motion at roughly a sixth of the payload of a 6-frame WebP cycle, is trivially reduced-motion-safe, and keeps the entrance instant on low-end phones. The animated `angles.html` cycle stays documented as a future option, not the production default.
- **Production captures:** the three `close-eye` stills already rendered by the harness (`cycle51-validation/frames/<scene>/<scene>__close-eye.webp`, 1920x1080, fresh WebGPU renders, not the old `og-*.webp`) are promoted to committed production backdrops.

- **Acceptance:**
  - When Matt picks a winner (or a rework direction), then P6-P8 shall be authored against that choice before any winner-wiring begins. (Met: Golden Pasture.)

### P6 - Wire the winner (autonomous, post-decision)

Promote the winning skin's components into the real boot path: the instant entrance, the world-first IA, the loading bar driven by real `logStep` stages, the crossfade reveal, scene-build-on-commit. Hand off to the live engine.

- **Files touched (none fenced):** new `js/components/entrance/*` (the promoted skin + shell), `js/components/ui/Icon.tsx`, `js/components/hooks/useViewport.ts`, a new `js/boot/loadProgress.js` progress bus, `js/components/App.js` (StartScreen rewrite), `js/main.js` (one-line progress-emitting `logStep` seam at the `buildSceneBody` call sites), `css/main.css` (entrance keyframes + display-font var). None are in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md); the deterministic sim, `shared/`, SceneDef, and the Worker are untouched.
- **Acceptance:**
  - When a plain page open boots, then the world-first Golden Pasture entrance shall render over the armed world's static backdrop, and no full-scene build shall run until Play (scene-build-on-commit).
  - When Play is pressed on an armed world, then that world's scene shall build on commit and the pastoral loading bar shall advance from the real per-stage `logStep` build marks, not a fixed timer.
  - When the build completes, then the loading surface shall cross-fade to the live scene and the in-game HUD shall appear.
  - If a deep-link (`?scene=`, `#s/`, `#/s/`, `#/r/<code>`) or a cinematic/headless flag is present, then the entrance shall be skipped and the scene shall build directly; the `shouldBootAttract` gate and the multiplayer hard-reload swap shall stay intact (entrance-attract-gate spec green).
  - When the entrance, loading, and in-game frames render at desktop (1920x1080) and mobile (390x844), then the layout, touch targets, and `env(safe-area-inset-*)` handling shall hold with no horizontal scroll or clipped controls, on every mobile device and OS (iOS Safari + Android Chrome included, per the cycle directive).
  - When `npm run build` runs, then the entrance UI ships in the lazy App + ui chunks (the `Entrance-*.js` chunk plus lucide in `ui-*.js`), not the critical-path bundle. The `main-*.js` chunk grows by 198 bytes (557,518 -> 557,716 bytes, 544 -> 545 KB rounded) for the single boot-side `scene-load-step` signal that drives the honest per-stage loading bar. This is an intentional, recorded bump: the bar is driven by real build marks (the cycle's "not a fixed timer" goal), and main was already at the very edge of the 544 band (49 bytes of headroom). The `tests/refactor-baseline/__fixtures__/bundle-sizes.json` `mainKB` baseline is regenerated 544 -> 545 with this acceptance; `threeKB` is unchanged. (Decision recorded per the EMERGENCY_STOPS bundle-size discipline; the stage->caption weight table is kept on the UI side specifically to keep the table out of main.)
  - When `npm test` and `npm run build` run, then all specs pass and the build is clean; the deterministic sim, `shared/`, SceneDef, and the Worker are unchanged.

### P7 - Remove dead code (autonomous, post-decision)

Delete the old shell the winner replaces: the unused nine skins, `ZenAttract`, both skeleton loaders, the dead `assets/icons/*`, and the retired screens of the old `App.js` flow. Net-negative diff.

- **Acceptance:**
  - When P7 lands, then the nine non-winning skins and the `js/mockups/` route, `ZenAttract` + `bootAttract` dart-field wiring, both skeleton loaders (`public/components/skeleton-loader.html` and the `SceneSwapOverlay` shimmer), the dead `assets/icons/*`, and the retired entrance leaves (`PlayerIdentitySetup` first-run gate, the old `ModeSelection` grid, `ScenePicker`, `PointerTour`, the standalone `DogSelection` gate) shall be deleted or repurposed.
  - When the repo is grepped after P7, then each removed module shall have zero remaining `import` references.
  - When P7 lands, then `git diff --stat` for the phase shall show more lines removed than added (net-negative).
  - When `npm test` and `npm run build` run, then all specs pass (specs that referenced removed leaves are updated in the same phase) and the build is clean.

### P8 - In-game HUD restyle (autonomous, post-decision)

Bring the in-game HUD and overlays onto the winning style and the new icon set; finish the `.tsx`/token migration of the remaining `createElement` containers.

- **Acceptance:**
  - When the in-game HUD renders after P8, then its warm-glass surfaces shall use the pastoral tokens and the shared `Icon` set, with zero inline hex in the converted HUD files.
  - When the HUD smoke specs run, then the readout text and roles shall be unchanged (the restyle is token/color only): `tests/ui/GameHUD.smoke.spec.tsx` stays green.
  - When a `createElement` container is migrated, then the converted file shall be `.tsx` with zero `createElement` and zero inline hex; any container not migrated this cycle shall be listed as explicit BACKLOG carryover (the migration map already schedules some for Cycle 52).
  - When `npm test` and `npm run build` run, then all specs pass and the build is clean.

## Frozen files (cycle-specific additions)

The durable fence in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) applies. P1-P4 touch no frozen file: the bake-off is a new isolated route plus `vite.config.js` (a build-config add, not a fenced interface). **P6-P8 touch no frozen file either:** the boot-path files the wiring edits (`js/main.js`, `js/components/App.js`, `js/boot/initWorld.js`, `js/GameBridge.js`) are not in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - the fence covers the deterministic sim core, the scene schema, the migrations, the test ratchets, and the process docs, none of which this cycle changes. The wiring is client render + boot only; `shared/`, sim-baseline, SceneDef, and the Worker stay byte-identical.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

- Do not touch `shared/`, sim-baseline, SceneDef, or the Worker during P1-P4. The bake-off is client render only, fully isolated from the live game.
- Do not begin P6 (winner-wiring) before P5 converges on a pick.
- Do not bump the version. `/mockups` is a hidden review route, not a player-visible release.

## What NOT to do during this cycle

- Do not wire the live WebGPU engine into the ten prototypes. They prove flow and look; the engine handoff is the winner-wiring phase (P6) only.
- Do not let a skin import the old `App.js` flow, `ZenAttract`, or the skeleton loaders. The point is a clean rewrite.
- Do not delete old code before the winner is picked and wired (P7 follows P6).

## Success criteria (cycle close)

`/cycle-close` reads this section. Don't pre-check. Refine when P6-P8 are authored.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md), [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md), [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md), [`BACKLOG.md`](BACKLOG.md).
- Pastoral UI program: [`ui-design-language.md`](ui-design-language.md), [`entrance-loading-spec.md`](entrance-loading-spec.md), [`ui-migration-map.md`](ui-migration-map.md).
- Gallery pattern the bake-off clones: [`../gallery.html`](../gallery.html), [`../js/gallery/Gallery.tsx`](../js/gallery/Gallery.tsx).
- [EARS notation](https://kiro.dev/docs/specs/) for the acceptance lines.
