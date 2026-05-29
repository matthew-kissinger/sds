# Cycle 46 — entrance-zen-boids-and-cleanup

> Drafted 2026-05-29, pre-authored from [`cycle45-validation/entrance-ui-spike.md`](../cycle45-validation/entrance-ui-spike.md). Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).
>
> **Status note:** Cycle 45's formal `/cycle-close` is pending. This plan is the first half of the approved entrance/UI split (Cycle 46 = entrance + cleanup; Cycle 47 = UI foundation overhaul). **Cycle 46 supersedes Cycle 45 Phase 2** (scene-select-before-load gate): the zen-boids entrance is the richer version of "let the player pick before we build a scene." Cycle 45's Phase 4 (grass body-deform) is unrelated and is **not** absorbed here; it is finished-or-deferred at the Cycle 45 close.

## Goal

Replace the boot-time full-scene build and auto-loading card picker with a fast, satisfying **zen attract scene** as first paint: a TSL WebGPU compute-boids field over a gradient sky, with the scene picker live on top. Selecting a scene streams the real scene into a detached graph (assets prefetched during the zen idle) and crossfades it in-engine, with no DOM flash and no frozen-canvas snapshot. Today the app builds Rolling Hills behind the menu at boot and every scene action is a multi-hundred-ms-to-~1.9s teardown and rebuild; after this cycle, first paint is a near-instant zen field you can act on immediately, and picking a scene feels like it streams in rather than stalls. The cycle also clears 632 lines / ~58 KiB of dead CSS and the stale "Step 1 scaffolding" comments that no longer describe the code.

## How to read this plan

This doc fixes the *shape* of the changes (where new code slots in, the swap seam it reuses, acceptance criteria), not the implementation choices. Where it names a technique (TSL compute boids, `uAlpha` crossfade), treat it as a researched starting point, not a locked answer.

Each agent picking up a phase should:

- **Research current best practice** for the sub-problem first. Use the bundled `webgpu-threejs-tsl` skill for TSL compute and node-material specifics.
- **Measure on the actual target** (RTX 3070 desktop, mid-tier mobile) before committing. The whole cycle is justified by a speed win; prove it.
- **Pick the simplest thing that meets the budget.** The zen field is a render-only toy, not the game sim. Keep it cheap.

## Open questions to resolve before writing code

1. **Q1: Zen-field aesthetic?** Boids over what backdrop — neutral gradient sky and light fog, or a hint of the pasture? Bounded bounce, or open drift? *Author lean: neutral gradient sky and fog, gentle open drift with soft bounds.* **Paired taste call** (Matt's eye before P1 locks).
2. **Q2: Does the zen field replace the StartScreen card picker, or wrap it?** *Author lean: replace the card-grid background with the zen field and keep the picker as a floating overlay, reusing `ScenePicker` selection logic. Restyle the overlay later in Cycle 47, not here.*
3. **Q3: Deep-link behavior?** Confirm `?scene=` skips the zen field and streams that scene directly. *Author lean: yes, skip the zen field on deep-link; preserve the multiplayer hard-reload fallback.*
4. **Q4: Compute-boids budget?** How many boids, what first-interactive-paint target? *Author lean: measure on RTX 3070; aim first interactive paint well under the current scene-build cost, boid count chosen to stay trivially cheap (a few thousand) and degrade on mobile.*
5. **Q5: Does the zen field need any `SceneDef` metadata?** *Author lean: no. The zen field is a render-only attract mode, not a `SceneDef` scene, so the fence-frozen schema stays untouched. If a per-scene prefetch hint proves useful, add it as an optional field with a default plus the authorization in this plan's Frozen-files section — never a rename.*

## Architecture / shared changes

- **New zen attract scene module, client-only.** Lives under `js/` (render path), never `shared/`. It is a tiny GPU toy: a TSL compute pass for boid velocity/position plus an instanced draw, over a gradient-sky + fog background, rendered by the already-up persistent renderer. It is **not** the `shared/` flocking sim.
- **Reuse, do not rebuild.** The persistent renderer/canvas/`THREE.Scene` and GLB cache already survive swaps ([`js/rendering/SceneManager.js:46-82`](../js/rendering/SceneManager.js); [`js/boot/loadScene.js`](../js/boot/loadScene.js) keeps the renderer alive). Cycle 46 inserts a cheap first scene and a detached-build + crossfade in front of the existing `swapScene` seam ([`js/main.js:657-727`](../js/main.js)); it does not rewrite the swap machinery.
- **Boot path change.** [`js/main.js:111`](../js/main.js) (`loadScene(activeSceneId)`) and the `buildSceneBody` call at [`js/main.js:659`](../js/main.js) stop running for the default scene at boot; the zen field mounts instead. The `SceneSwapOverlay` event contract (`scene-swap-start` / `-end` / `-error`) stays.

## Phase shape rules

≤ 8 phases, each a single sharp goal and ≤ 4 hours. Phases are labeled `(autonomous)` or `(autonomous build, paired taste)` per the Cycle 45 precedent — the build ships autonomously; a taste checkpoint gates only the look, not the code.

## Acceptance criteria — EARS format

Every phase's Acceptance section is grep-testable by construction. The `/cycle-close` reconciliation hook walks each line.

## Phase 1 — Zen attract scene as first paint (~4hr) (autonomous build, paired taste)

**Independently testable.** This is the headline: the app must paint the zen field, not build a hero scene, on boot.

1. **Add the zen attract module** under `js/` — TSL compute-boids field + gradient sky + fog, rendered by the persistent renderer. Use the `webgpu-threejs-tsl` skill for the compute-pass shape.
2. **Rewire boot** so the default scene's `buildSceneBody` does not run at startup; the zen field mounts as first paint with the picker overlay live ([`js/main.js:108-111`](../js/main.js), [`js/main.js:659`](../js/main.js)).
3. **Capture a first-paint timing** into `cycle46-validation/entrance-timing.md` against the spike's boot baseline.

**Acceptance (EARS):**

- When the app boots with no `?scene=` param, then `buildSceneBody` shall not run for the default scene before a pick (grep the boot path; the dev `[LOAD]` summary shall not fire at startup).
- When the zen field is mounted, the picker overlay shall be interactive within the first-paint budget recorded in `cycle46-validation/entrance-timing.md`.
- While the zen field renders, the CPU cost of the boid update shall be on the GPU compute path (no per-frame main-thread flocking loop for the attract scene).

## Phase 2 — Pick-then-stream + in-engine crossfade (~4hr) (autonomous)

**Depends on:** Phase 1.

1. **Build the selected scene into a detached graph** off the visible one, via the existing rebuild seam, so the zen field keeps rendering while the real scene constructs.
2. **Prefetch the likely-next scene's assets during the zen idle** (GLB, terrain, textures) so most of the stream cost is pre-paid.
3. **Crossfade in-engine** with a fullscreen `uAlpha` blend from the zen field to the real scene once ready, then drop the zen field. No DOM swap, no View Transitions API.

**Acceptance (EARS):**

- When a scene is selected, then the real scene shall build into a detached graph while the zen field still renders (no black frame between pick and ready).
- When the real scene is ready, then the transition shall be an in-engine alpha crossfade (grep: no `document.startViewTransition` in the swap path).
- While assets prefetch during the zen idle, the post-pick stream time shall be measurably below the Phase-1 baseline swap cost, recorded in `cycle46-validation/entrance-timing.md`.

## Phase 3 — Deep-link + multiplayer fallback (~2hr) (autonomous)

**Depends on:** Phase 2.

1. **`?scene=` streams directly,** skipping the zen field.
2. **Preserve the multiplayer hard-reload fallback** in `swapScene` (MP locks the scene at room creation).
3. **Add a guard spec** asserting the deep-link path skips the zen field and the MP path still hard-reloads.

**Acceptance (EARS):**

- When the app boots with `?scene=<id>`, then it shall stream that scene directly and shall not mount the zen field.
- If a multiplayer room is active, then the scene path shall preserve the existing hard-reload fallback (a spec asserts this).
- When `npm test` runs, then the new entrance guard spec shall pass.

## Phase 4 — Dead-code and drift cleanup (~2hr) (autonomous)

**Parallel-safe** with Phases 1-3.

1. **Verify-then-delete the three dead CSS files:** [`css/production.css`](../css/production.css) (44 KiB precompiled dump), [`css/multiplayer-react.css`](../css/multiplayer-react.css), [`css/components/index-styles.css`](../css/components/index-styles.css). Confirm no `<link>` and no JS import before removing. Only [`css/main.css`](../css/main.css) is live (`index.html:273`).
2. **Fix stale comments:** the "Step 1 scaffolding / falls back to legacy hard-reload" block at [`js/main.js:703-713`](../js/main.js) and the matching stale Step comments in [`js/App.js`](../js/App.js) no longer describe the code.

**Acceptance (EARS):**

- When the cleanup lands, then `index.html` shall reference only `css/main.css` and the three dead CSS files shall not exist (grep returns nothing).
- When `npm run build` runs after the deletes, then the production build shall be clean (the dead files were unreferenced).
- When the stale comments are fixed, then no comment in `js/main.js` or `js/App.js` shall describe `swapScene` as "Step 1 scaffolding" with a hard-reload fallback for single-player.

## Phase 5 — Polish (optional, ~3hr)

Absorbs Cycle 45's deferred Phase 5. Skip any that don't move playtest.

1. Scene preview affordance in the picker overlay.
2. Load-overlay progress affordance during the stream.
3. Combined scene + mode gate before the stream begins.

## Dependencies

```
Phase 1 → Phase 2 → Phase 3 → Phase 5 (optional)
Phase 4 runs parallel to 1-3.
```

## Frozen files (cycle-specific additions)

The durable fence is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). Cycle-46-specific:

- **[`shared/scenes/types.js`](../shared/scenes/types.js) (`SceneDef` schema):** default is **untouched** (Q5 lean: the zen field is not a `SceneDef` scene). *Only if* a per-scene prefetch hint proves necessary in Phase 2, an **optional** field with a default may be added here, with the migration story written into the phase brief. Never a rename or removal.
- **[`js/main.js`](../js/main.js):** boot-sequence rewiring is in scope; the per-frame update loop and mode dispatch are cohesive by design (`scene-and-render.md`) and shall not be refactored in this cycle.

## Hard stops

Durable stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

1. **If the zen field's first interactive paint is not faster than the current boot scene-build, stop and reassess.** The cycle's entire justification is the speed-and-feel win; a zen field that is not faster is a regression, not a feature.
2. **If the crossfade can only be done via the View Transitions API canvas-snapshot path, stop.** It freezes the live canvas to an image and cannot blend two live WebGPU scenes. The crossfade must be in-engine.
3. **No per-frame value in React `setState`.** (Carries into Cycle 47.) Live HUD/menu values go through refs or an external store.
4. **Stay out of `shared/`.** The entrance is pure client/render; the deterministic-sim boundary is untouched, so `tests/sim-baseline/*.json` are not regenerated.

## What NOT to do during this cycle

- **No TSX migration, no component-library adoption, no design-token system.** That is Cycle 47 (the UI foundation overhaul). Cycle 46 stays in the current `.js` + `React.createElement` UI; it restyles nothing beyond what the entrance requires.
- **No View Transitions API** for the scene swap.
- **Don't decompose `GrassSystem.js` / `OptimizedSheep.js`.**
- **Don't bump the version.** v2.1.10 stands unless Matt calls a release.
- **Don't auto-post devlog or marketing copy.**
- **Don't pull Cycle 45's grass body-deform (Phase 4) in here.** It is unrelated; it is resolved at the Cycle 45 close.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to `BACKLOG.md` carryover.
- [ ] When the app boots, the zen attract scene shall be first paint and `buildSceneBody` shall not run for the default scene before a pick.
- [ ] When a scene is picked, the stream-in shall crossfade in-engine and feel faster than the Cycle 45 baseline swap (timing in `cycle46-validation/entrance-timing.md`).
- [ ] When the cleanup lands, the three dead CSS files shall be gone and `index.html` shall link only live CSS.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass (including the new entrance guard spec).
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When the close commit lands on `main`, the sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When the zen-field look is reviewed (Q1), Matt shall sign off on the aesthetic before P1 is considered done.

## References

- [`cycle45-validation/entrance-ui-spike.md`](../cycle45-validation/entrance-ui-spike.md) — the research spike this plan is authored from.
- [`cycle45-validation/load-baseline.md`](../cycle45-validation/load-baseline.md) and [`phase3-results.md`](../cycle45-validation/phase3-results.md) — boot/swap perf context.
- `webgpu-threejs-tsl` skill — TSL compute-boids and node-material reference.
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) — durable frozen files.
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) — durable hard stops.
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) — plan template.
