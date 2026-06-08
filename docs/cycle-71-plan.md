# Cycle 71 - newsheepdogland-load-fix-and-hero

> Drafted 2026-06-07. Reframed from the `feel-and-media-live` stub after a live
> production crash surfaced: newsheepdogland freezes/crashes on load in the
> browser. Cold-start agents: read [`../NEXT_SESSION.md`](../NEXT_SESSION.md)
> first, then this doc top-to-bottom. Prior cycle plans live in
> [`archive/cycles/`](archive/cycles/).
>
> The paired `feel-and-media-live` track (survival feel LIVE tuning, two-client
> co-op playtest, the `multiplayer.md` doc fix) is **deferred to the next cycle**
> in favour of the crash. The hero FINAL shot rides along here since it is the
> second clause of the goal.

## Goal

Stop the newsheepdogland load crash and replace the placeholder hero with a real
capture. Root cause (measured, [`cycle71-validation/webgpu-crash/findings.md`](../cycle71-validation/webgpu-crash/findings.md)):
on the WebGPU renderer (the default), the heaviest scene's cold pipeline compile
blocks the main thread ~43 s on first load (D3D12 WGSL->DXIL, cached after), which
trips Windows GPU TDR and freezes/crashes the tab. WebGL loads the same scene in
2.2 s and renders it correctly (the WebGPU path also has a lighting bug on this
scene). The before/after a player sees: newsheepdogland loaded fresh on a WebGPU
browser used to hang on the loading screen and die; after, it loads in ~2 s on
WebGL with correct lighting, and its entrance tile shows a real screenshot
instead of a flat gradient. Other scenes keep WebGPU.

## Open questions to resolve before writing code

1. **Q1: Pin the scene to WebGL, or make WebGPU cold-compile fast?** Author lean:
   pin to WebGL. WebGL renders this scene correctly and fast today; the WebGPU
   path is both cold-slow AND visually wrong here (node lights not binding). A
   genuine WebGPU cold-compile fix is konveyor-subsystem-deep and risky, and
   would still leave the lighting bug. Pin now, defer the WebGPU speedup to a
   backlog konveyor cycle.
2. **Q2: How is the renderer switched without losing survival-mode intent?** The
   scene builds at world-pick (before mode/dog selection - the attract field
   streams the scene in on first pick). So a hard-reload to WebGL at swap time
   lands on the newsheepdogland entrance with the menu over it; the player picks
   survival there. Nothing to preserve. Fresh / deep-link loads pick WebGL at
   boot with no reload at all.

## Phase 1 - Root-cause the crash (DONE, measure-first) (~done)

**Independently testable.** Measured on the real RTX 3070 via the preview probe;
evidence in `cycle71-validation/webgpu-crash/findings.md`.

1. Bisected WebGL vs WebGPU, cold vs warm, per load stage. Cold WebGPU trees step
   43,378 ms (main thread blocked) vs warm 1,824 ms vs WebGL 1,118 ms. The delta
   is cold GPU pipeline compilation, not mesh construction (17.5 ms) and not grass
   (266-413 ms).
2. Found the Cycle 70 far-ring is inert in production (`meadowQuadEnabled` false on
   every tier) and a WebGPU node-lighting bug on this scene. Both noted for backlog.

**Acceptance (EARS):**

- When Phase 1 ships, then `cycle71-validation/webgpu-crash/findings.md` shall record the cold/warm/WebGL load-stage numbers and name cold WebGPU pipeline compile as the cause.

## Phase 2 - Pin newsheepdogland to WebGL (the crash fix) (~2hr) — SHIPPED 2026-06-07

**Independently testable.** WebGL is proven on this scene; the pin routes it there
before any WebGPU cold compile can run.

> Shipped + verified on the real RTX 3070: `?renderer=webgpu&scene=newsheepdogland`
> now resolves to `effective: webgl` (`fallbackReason: scene-pinned-webgl`) and
> builds without a main-thread block; an in-app swap from a WebGPU `field` session
> hard-reloads to `?renderer=webgl&scene=newsheepdogland`; `field` stays
> `webgpu-production` (pin correctly scoped). `npm test` 1135 pass; `npm run lint`
> clean; `npm run build` clean. The two guards nudged the main bundle from 584.81
> KiB to ~585.6 KiB (+~0.6 KiB of necessary guard logic) - the tracked ~585 KiB
> target moves to ~586 KiB; not an enforced build gate.

1. **SceneDef field.** Add optional `renderer: 'webgl'` to the `SceneDef` typedef
   ([`shared/scenes/types.js`](../shared/scenes/types.js)) - additive optional
   field, default absent = follow the global renderer choice (the cheap fence
   case; no existing consumer changes).
2. **Pin the scene.** Set `renderer: 'webgl'` on
   [`shared/scenes/newsheepdogland.js`](../shared/scenes/newsheepdogland.js) with a
   rationale comment.
3. **Boot guard (no reload).** In [`js/main.js`](../js/main.js) DOMContentLoaded,
   before the productionWebGpu block: if the resolved deep-link/default scene pins
   WebGL, disable productionWebGpu so the WebGPU renderer is never created. Covers
   fresh loads and `?scene=` deep-links.
4. **Swap guard (hard reload).** At the top of `swapScene`: if the target scene
   pins WebGL and the effective renderer is WebGPU, hard-reload to
   `?renderer=webgl` via the existing `_buildSwapUrl` path (mirrors the MP
   fallback). Covers in-app transitions.

**Acceptance (EARS):**

- When a player loads newsheepdogland fresh on a WebGPU-default browser, then the renderer shall resolve to WebGL and the scene shall finish building without a multi-second main-thread block.
- When a player swaps to newsheepdogland from a WebGPU session, then the app shall hard-reload onto WebGL and build the scene.
- While a scene has no `renderer` pin, the renderer selection shall be byte-identical to before (every other scene keeps WebGPU).
- If `npm run build` runs, then the production bundle shall stay within the main.js ratchet.

## Phase 3 - Real hero capture (~1.5hr) — SHIPPED 2026-06-07

**Independently testable.** Replaces the gradient placeholder with a real in-engine
screenshot.

> Shipped: `assets/scenes/entrance/newsheepdogland.webp` is now a real dusk
> sunset-over-water capture (1920x1080, 214 KB), replacing the 7.5 KB flat
> gradient. Captured headed on the real GPU (the headless tool + cinematic FREE
> camera both render the sun billboard as a black dome; the natural gameplay
> camera renders it correctly). Final beauty-shot dialing remains Matt's pass.

1. Capture newsheepdogland rendering correctly on WebGL (real RTX 3070 via the
   preview probe, or `tools/hero-capture.mjs`), posed to a hero framing, UI hidden,
   at the entrance hero aspect/size used by the other three scenes.
2. Replace [`assets/scenes/entrance/newsheepdogland.webp`](../assets/scenes/entrance/newsheepdogland.webp)
   (the 7.5 KB flat gradient). Final beauty-shot dialing remains Matt's browser
   pass per the media-prep memory; this ships the best real capture.

**Acceptance (EARS):**

- When Phase 3 ships, then `assets/scenes/entrance/newsheepdogland.webp` shall be a real scene render (not the flat dusk gradient placeholder) at the shared hero size.

## Dependencies

```
Phase 1 (done) -> Phase 2 -> Phase 3
```

## Frozen files (cycle-specific additions)

- **`shared/scenes/types.js`** (fence-frozen `SceneDef` schema). Migration story:
  adding the optional `renderer` field is the cheap additive case. Default absent
  preserves every existing scene's behavior; the only new consumer is the Cycle 71
  boot + swap guard. No rename/removal. Worker sim ignores it (render-only).
- **`shared/scenes/newsheepdogland.js`** is a scene def (data), not a frozen
  module; the `renderer: 'webgl'` addition is render-only and the Worker ignores it.

## Hard stops

Durable stops apply on every cycle - see [`EMERGENCY_STOPS.md`](EMERGENCY_STOPS.md).
Cycle-specific additions:

1. **No `shared/` sim change.** The renderer pin is render-only; the 10 survival
   sim-baselines and every sim-baseline stay byte-identical by construction.
2. **No change to the WebGPU production subsystem.** This cycle routes one scene
   off WebGPU; it does not modify the konveyor node-material / native-instancing
   path. The genuine WebGPU cold-compile fix is a separate backlog cycle.
3. **WebGL render path for newsheepdogland stays byte-identical** to before the
   pin (the pin only changes which renderer is chosen, not how WebGL builds).

## What NOT to do during this cycle

- Don't try to make the WebGPU cold compile fast (konveyor-deep; backlog).
- Don't reactivate / rip out the inert far-ring (grass cohesion rule; backlog).
- Don't touch the survival feel tuning or the co-op playtest (deferred track).
- Don't edit `.claude/rules/multiplayer.md` (still needs Matt's OK).

## Success criteria (cycle close)

`/cycle-close` reads this section and asks the user to confirm each item. Don't pre-check.

- [ ] When the cycle closes, all phases shall be shipped or explicitly deferred to next cycle's `BACKLOG.md` carryover.
- [ ] When `npm test` runs at cycle close, all vitest specs shall pass.
- [ ] When `npm run build` runs at cycle close, the production build shall be clean.
- [ ] When newsheepdogland is loaded on a WebGPU-default browser, it shall load on WebGL without the cold-compile freeze.
- [ ] When the close commit lands on `main`, sheepdogsim.com deploy shall succeed via GH Actions.

## References

- [`cycle71-validation/webgpu-crash/findings.md`](../cycle71-validation/webgpu-crash/findings.md) - the measured root cause
- [`docs/CYCLE_TEMPLATE.md`](CYCLE_TEMPLATE.md) - the template
- [`docs/INTERFACE_FENCE.md`](INTERFACE_FENCE.md) - durable frozen files
- [`docs/BACKLOG.md`](BACKLOG.md) - closed cycles + deferred items (incl. the deferred feel/media-live track)
