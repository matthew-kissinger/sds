# Cycle 52 - pastoral-polish

> Drafted 2026-06-03 after Cycle 51 closed. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md) first, then this doc top-to-bottom. Prior cycle plans live in [`archive/cycles/`](archive/cycles/).

## Goal

Cycle 51 shipped the world-first pastoral entrance but landed its scene reveal as a DOM opacity fade (the start surface fades out over the live canvas). The entrance-loading spec (Q4) calls for an **in-engine** dissolve instead: the menu backdrop dissolves into the freshly built scene inside the renderer, never a DOM swap of a frozen canvas. This cycle lands that reveal, retires the now-orphaned zen-crossfade scaffold it reuses, migrates the last `createElement` HUD holdout (`ExtremeTuningPanel`) to `.tsx` for parity, and runs a bounded polish sweep over the pastoral finish. The user-visible difference: pressing Play melts the still backdrop into the living scene in one continuous in-engine motion, with no DOM flash.

## How to read this plan

This doc fixes the *shape* of the changes (where new code slots into the existing module map, acceptance criteria), **not the implementation choices**. Where it suggests a technique, treat it as a starting point for research, not the final answer. Each agent picking up a phase should research current best practice, measure on the actual hardware target (RTX 3070 desktop, mid-tier mobile), and pick the simplest thing that meets the budget.

## Background - why the in-engine reveal is mostly already wired

The renderer already contains a complete in-engine crossfade scaffold from Cycle 46 (the zen attract dissolve): on a pick out of attract, the dart field was kept alive through scene teardown, scene render was suppressed during the build so the canvas held the last attract frame, then the field's opacity ramped to 0 over the built scene in `runFrame`, with `window.__sdsAttractCrossfadeActive` suppressing the DOM `SceneSwapOverlay` so there was no DOM flash.

Cycle 51 P7 deleted `js/attract/ZenAttract.js`. The scaffold survives but `this._zenAttract` is now only ever assigned `null` (main.js:135, main.js:1088, loadScene.js:31). So `attractCrossfade = this._attractMode && !opts.noCrossfade && !!this._zenAttract` can never be true: the entire reveal scaffold is **unreachable dead code**. The spec's Q4 intent is to reuse this exact scaffold, repointed from the dart field to the menu backdrop. That is what P1 + P2 do: P1 generalizes the dead seam into a clean `RevealLayer` contract (no behavior change), P2 plugs a backdrop-textured fullscreen quad into it and drives the reveal on boot commit.

The dissolve is **opacity-and-render-order based** (entrance-loading-spec.md line 28), not a noise-threshold shader. A fullscreen quad textured with the armed world's backdrop webp, drawn last (depth-test off, high render order), opacity ramped 1 to 0 over the built scene, is the whole mechanism. `MeshBasicMaterial` with `map` plus animated `opacity` works identically on WebGL and WebGPU, so no custom shader and no TSL is needed.

## Open questions to resolve before writing code

1. **Q1: Does the backdrop quad render correctly under the active renderer (WebGL today, WebGPU in migration)?** Author lean: yes - a `MeshBasicMaterial` fullscreen quad in a dedicated overlay scene rendered after the main scene works on both backends with no custom shader. Confirm by reading which renderer `SceneManager` instantiates before writing the quad; if a post-processing composite owns the final present, draw the quad into that composite's output, not a stray second render pass.
2. **Q2: Does the armed-world backdrop align closely enough with the built scene's opening camera frame for the dissolve to read as "the photo comes alive"?** Author lean: close enough - the backdrops are close-eye renders of each armed world. Even a slight misalignment still reads as a soft dissolve, not a hard cut, because both layers are full-frame. Measure in-browser; if a backdrop is badly off, that is a backdrop-recapture follow-up (BACKLOG), not a blocker for the mechanism.

## Phase shape rules

≤ 8 phases, each fully autonomous or fully paired (no mixed mode), each a single sharp goal of ≤ 4 hours. This cycle is fully autonomous.

## Phase 1 - Generalize the reveal seam (retire the zen coupling) (~1.5hr)

**Independently testable.** The reveal scaffold currently names a deleted class (`_zenAttract`). Generalize it to a backend-agnostic `RevealLayer` contract so P2 can plug in, and so the dead ZenAttract coupling is gone. **No behavior change**: with no reveal layer set, the boot reveal stays exactly today's DOM opacity fade.

1. **Define the contract.** A `RevealLayer` is any object with `beginCrossfade()`, `setOpacity(a: number)`, `update(dt: number)`, `dispose()`. Document it in [`js/main.js`](../js/main.js) where the scaffold lives.
2. **Rename the field + flags** from zen-specific to reveal-generic: `_zenAttract` -> `_revealLayer`, `_keepZenForCrossfade` -> `_keepRevealLayer`, `_zenCrossfadeT/_zenCrossfadeDur` -> `_revealT/_revealDur`, `_endZenCrossfade` -> `_endReveal`, `_attractCrossfade` -> `_revealActive`. Update the three sites in [`js/boot/loadScene.js`](../js/boot/loadScene.js).
3. **Keep the DOM-cover skip global name** `window.__sdsAttractCrossfadeActive` (it is read by [`SceneSwapOverlay.tsx`](../js/components/ui/SceneSwapOverlay.tsx) and asserted in tests); add a one-line comment that the name is historical.

**Acceptance (EARS):**

- When Phase 1 ships, then `grep -rn "_zenAttract\|_zenCrossfade\|_endZenCrossfade\|_keepZenForCrossfade" js/` shall return zero matches.
- When Phase 1 ships, then `grep -rn "RevealLayer\|_revealLayer" js/main.js` shall return at least one match.
- When `npm test` runs after Phase 1, then all vitest specs shall pass (the reveal scaffold is dead today, so renaming it changes no observable behavior).
- If no reveal layer is set, then the boot reveal shall remain the DOM opacity fade (App.js start-presence), unchanged.

## Phase 2 - In-engine backdrop dissolve reveal (~4hr)

**Depends on:** Phase 1.

1. **Build the backdrop layer.** New [`js/render/BackdropReveal.js`](../js/render/BackdropReveal.js): a fullscreen quad (`PlaneGeometry` sized to the camera frustum or an orthographic overlay scene) with `MeshBasicMaterial({ map: <armed world backdrop texture>, transparent: true, depthTest: false, depthWrite: false })`, drawn after the main scene. Implements the `RevealLayer` contract: `setOpacity` writes `material.opacity`, `update` is a no-op (static image), `dispose` frees the texture + geometry.
2. **Load the backdrop texture from the same webp the entrance shows** (`assets/scenes/entrance/<world>.webp`) so the quad is byte-identical to the menu image the player just saw. The armed world id is known at commit time.
3. **Drive the reveal on boot commit.** When the world-first Play builds the armed scene: set `_revealLayer` to a `BackdropReveal` for that world, arm the existing scaffold (render-suppression during build holds the backdrop; on build-complete, `runFrame` ramps opacity 1 to 0 over `_revealDur`, then `_endReveal` disposes it). Set `window.__sdsAttractCrossfadeActive = true` for the window so the DOM cover is skipped.
4. **Replace the DOM opacity fade.** In [`js/components/App.js`](../js/components/App.js) the start-presence `exit: { opacity: 0 }` reveal becomes an instant unmount once the in-engine reveal owns the handoff (gate on the same boot-loading signal). Reduced-motion: skip the ramp, dispose immediately (instant reveal), matching the rest of the entrance.
5. **Validate in-browser.** Drive a real browser, press Play, confirm the backdrop dissolves into the live scene with no DOM flash and no black frame, on desktop and at a mobile viewport (390x844). Close every probe page/server after (browser-probe hygiene).

**Acceptance (EARS):**

- When the world-first Play commits and the armed scene finishes building, then the renderer shall dissolve the backdrop quad's opacity from 1 to 0 over the built scene (in-engine), not fade a DOM layer.
- While the in-engine reveal is active, the `SceneSwapOverlay` DOM cover shall stay suppressed (`window.__sdsAttractCrossfadeActive === true`), so no DOM flash occurs.
- While `prefers-reduced-motion` is set, the reveal shall be instant (no opacity ramp).
- When the reveal completes, then `BackdropReveal.dispose()` shall free the texture and geometry (no leaked GPU resource across repeated Play/return cycles).
- If the backdrop texture fails to load, then the reveal shall fail loud (console error) and fall through to an instant scene show, never silently hold a blank cover. (No silent fallback that masks the load failure.)
- When `npm test` and `npm run build` run after Phase 2, then specs shall pass and the build shall be clean.

## Phase 3 - ExtremeTuningPanel `.tsx` migration (~2hr)

**Depends on:** nothing (parallel with P1/P2).

1. **Migrate** [`js/components/GameHUD/ExtremeTuningPanel.js`](../js/components/GameHUD/ExtremeTuningPanel.js) from `createElement` to `.tsx` JSX, typed props, deleting the `.js`. Vite resolves the `./ExtremeTuningPanel.js` import in [`GameHUD/index.js`](../js/components/GameHUD/index.js) to the new `.tsx` with no importer change.
2. **Restyle to pastoral tokens** to match the P9 HUD: the purple slider/reset accents (`#a855f7`, `#e9d5ff`) become `pastoral.accentGold` / `pastoral.accentMeadow`; white text becomes `pastoral.ink` / cream; the panel uses the shared warm glass. Use the shared `Icon` for the close affordance.
3. **Preserve behavior exactly**: the same `FIELDS`, the same `gs.params` live-write, the same reset, the same compact mode. Dev-only panel; not a player-visible surface, but it should read as part of the same family.

**Acceptance (EARS):**

- When Phase 3 ships, then `js/components/GameHUD/ExtremeTuningPanel.js` shall not exist and `ExtremeTuningPanel.tsx` shall exist.
- When Phase 3 ships, then `grep -n "createElement" js/components/GameHUD/ExtremeTuningPanel.tsx` shall return zero matches.
- When the panel opens in an extreme/insane run, then adjusting a slider shall live-write `gameState.params[key]` exactly as before.
- When `npm test` runs after Phase 3, then all specs shall pass.

## Phase 4 - Polish sweep + validate + close (~2hr)

**Depends on:** Phases 1-3.

A **bounded** sweep (not an open redesign) over the Cycle 51 pastoral finish, then full validation.

1. **Prose hygiene.** The em-dash count is zero across any prose this cycle touches; no exclamation marks; no incorrect island framing (the game is one fenced pasture and two islands).
2. **HUD token consistency.** No stray pre-pastoral hex (cyan `#22d3ee`, blue, purple) left in the migrated HUD components; all read from `pastoral`/`tokens`.
3. **Mobile re-verify.** The custom joystick still drives movement and releases cleanly at a 390x844 viewport; the entrance + reveal work at that viewport.
4. **Boot cleanliness.** No new console errors/warnings on a cold boot through to a live scene.
5. **Validate + close.** `npm test` green, `npm run build` clean, then `/cycle-close`.

**Acceptance (EARS):**

- When Phase 4 ships, then the em-dash count over this cycle's touched prose files shall return 0.
- When a cold boot runs to a live scene, then the browser console shall log no new errors or warnings introduced this cycle.
- When the cycle closes, then `npm test` shall pass, `npm run build` shall be clean, and the `main` deploy shall succeed via GH Actions.

## Dependencies

```
Phase 1 → Phase 2 ┐
Phase 3 (parallel) ┴→ Phase 4 (validate + close)
```

P1 → P2 is serial (P2 plugs into P1's seam). P3 is independent and can run any time. P4 is last.

## Frozen files (cycle-specific additions)

The durable fence list is in [`INTERFACE_FENCE.md`](INTERFACE_FENCE.md). This cycle touches `js/main.js`'s reveal scaffold - that is the **guarded reveal mode-dispatch block**, not the per-frame loop's shape (scene-and-render.md permits this: repointing an existing guarded crossfade block, not reshaping the loop). No frozen-file authorization needed: no `shared/`, no `SceneDef`, no sim-baseline, no Worker, no wire protocol changes.

## Hard stops

Durable hard stops apply (see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md)). Cycle-specific:

1. **No silent fallback in the reveal.** If the backdrop texture or the in-engine quad fails, fail loud (console error) and show the scene instantly. Never hold a blank cover that masks the failure (the no-fallbacks rule).
2. **No `shared/` or sim-baseline change.** Entrance and reveal are client render only. If a change reaches into `shared/`, stop and surface.
3. **No version bump.** v2.1.10 stands unless Matt calls a release.

## What NOT to do during this cycle

- Do not add a noise-threshold dissolve shader. The spec is opacity-and-render-order based; a custom shader is scope creep and a WebGPU/WebGL portability risk.
- Do not introduce the View Transitions API (it snapshots a frozen canvas; the spec rules it out).
- Do not start the Pixel Forge bespoke-asset program (dog portraits, in-world props) - that is a separate `pastoral-assets` cycle.
- Do not start the security audit / P-SEC-1 - its own cycle.
- Do not recapture scene backdrops unless Q2 measurement shows a backdrop is badly misaligned; if so, log it to BACKLOG, do not expand this cycle.

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, production build shall be clean.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.
- [ ] When Play commits, the scene reveal shall be the in-engine backdrop dissolve, not the DOM opacity fade.
- [ ] When the HUD migration completes, `ExtremeTuningPanel` shall be `.tsx` with no `createElement`.

## References

- [`docs/entrance-loading-spec.md`](entrance-loading-spec.md) - Q4 in-engine crossfade intent (lines 24-30)
- [`docs/ui-design-language.md`](ui-design-language.md) - pastoral tokens + reveal language
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - this template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md) - durable hard-stop list
- [`.claude/rules/scene-and-render.md`](../.claude/rules/scene-and-render.md) - render-path + main.js loop rules
- [`.claude/rules/prose-and-voice.md`](../.claude/rules/prose-and-voice.md) - prose hygiene for P4
