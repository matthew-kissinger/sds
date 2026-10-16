# Renderer boot architecture, adversarial review - 2026-10-16

Why this exists. Release 1 upgraded `@react-three/fiber` to 9.8 and the hub
measured a startup regression: fiber now gates a Canvas whose `gl` factory
returns a promise behind its own Suspense boundary, and React's fallback
throttle holds the resolved commit for 300 ms. The fix that shipped in
`10bd9be6` hands fiber the `WebGPURenderer` before `init()` resolves, exposes
the init promise as `rendererReady()`, awaits it in the capability probe, and
keeps the frame loop paused until the scene is ready because three throws on a
render before init. The owner did not want time spent proving an upstream bug
and asked instead whether the architecture was wrong to begin with. An Opus
reviewer was briefed to argue against both the design and the fix, read-only,
from the installed fiber 9.8.2, three 0.186.1 and react-dom code. This is its
report, lightly edited; `[V]` marks what it read in code, `[I]` what it infers.

## Verdict

**(b): sound, with concrete defects to fix.** Every call fiber makes at mount
was checked against the pre-init renderer and none reaches the backend. The
fix does sit outside fiber's stated contract ("a factory must await init()
before returning its renderer", in fiber's teardown comment). A
re-architecture is not justified by the data: the hub shows no player-facing
gain left for one to win back.

## 1. Is a pre-init renderer safe under fiber 9.8.2's mount? Yes [V]

- The factory is called once per root and its result stored.
- `setSize` and `setPixelRatio` only touch three's `_canvasTarget`; the resize
  path calls `backend.updateSize()` only when `_initialized`.
- `gl.xr.addEventListener`: `XRManager` is built in the constructor and is an
  event dispatcher, not backend code.
- `shadowMap`, `outputColorSpace`, `toneMapping`: plain properties.
- Events connect to the wrapper div. Activation calls `invalidate`, which
  returns early while `frameloop === 'never'`.
- The one backend-touching call is `gl.render` inside the loop, which throws
  before `init()`. The pause is load-bearing, as the code comment says.
- Teardown skips `dispose()` when `hasInitialized()` is false.

## 2. What fiber intends, and whether the 300 ms is inherent [V]

The 9.8.0 changelog says configure is synchronous "unless `gl` is an async
factory (WebGPU)" and the canvas "suspends on `root.ready` internally", so an
async factory that awaits `init()` is the intended WebGPU path. The cost is
fiber's, not this app's: the gate is fiber's own `<Suspense fallback={null}>`
beside the canvas; its fallback commit stamps React's most-recent-fallback
time, and the settle arrives as a retry-only render that react-dom holds until
that time plus 300 ms. Moving this app's Suspense boundary cannot help, since
the boundary is not the app's. `useTransition` cannot help, since fiber calls
`waitFor` from its own layout effect. Awaiting `init()` in app code before
`<Canvas>` mounts cannot work with `<Canvas>`, because the renderer must be
built on the canvas element `<Canvas>` creates; a renderer instance as `gl` is
synchronous but needs an app-owned canvas, which means fiber's `createRoot`.

`[I]` An on-contract way out, worth one hub A/B: keep the async factory and
have `HerdApp` re-render on the `renderer` boot step, so the gate's content
retries as an ordinary update rather than a retry, which React does not
throttle.

## 3. The capability probe

Sound `[V]`: it renders to an offscreen target, restores the previous target,
runs with the loop paused, and has a timeout. A separate offscreen renderer
before mount would be worse (a second device or context, timing a different
context), and an adapter query alone cannot measure fill. Pre-mount capability
only makes sense with a single app-owned renderer, and what it would buy is
small: the canvas would mount at its final pixel ratio instead of the low
tier's 0.8 and resizing once the receipt lands, and the probe's
requestAnimationFrame wait would go. The probe is probably not on the critical
path: the fix removed about 150 ms from renderer-to-capability on WebGPU, yet
the boot-only median ready moved 2,662 to 2,645 ms, and WebGL2 runs spread
1,833 to 2,702 ms. "Ready faster than the previous release" is within noise;
assets and shaders likely dominate `[I]`.

## 4. Hazards found

- **The asset lab is broken by the fix** `[V code, I runtime]`.
  `lab/src/LabApp.tsx` uses the same now-synchronous factory with
  `frameloop="always"`, and `10bd9be6` did not touch it. The loop calls
  `gl.render` before `init()` resolves, so it throws on each frame until then,
  most visibly on WebGPU where init is slower.
- **Tone mapping is not what the code says** `[V code, runtime unchecked;
  predates the fix]`. With a function `gl`, fiber's `glProps` is undefined, so
  its first configure sets `ACESFilmicToneMapping`, overwriting the
  `NeutralToneMapping` the factory set. The shipped look is probably ACES.
  Check `renderer.toneMapping` at runtime: 4 is ACES, 7 is Neutral. Fiber also
  sets `PCFSoftShadowMap`, which three warns about in `compileAsync`;
  cosmetic.
- **The memoised factory is now a liability** `[V]`. Fiber 9.8 calls the
  factory once per root, so the memo's stated reason (fiber issue #3782) no
  longer applies. On a remount the memo hands back a renderer fiber has
  already disposed, bound to the old canvas. Production never remounts
  (graphics recovery reloads the page); the lab and hot reload can. Hot
  reload of `glFactory.ts` resets module state, so `rendererReady()` throws
  and dev shows the graphics-lost screen.
- `rendererInit.catch(() => undefined)` is harmless `[V]`: consumers get the
  original promise and a rejection reaches GraphicsRecovery.
- **No deadline on `init()`** `[I]`. The 750 ms timeout covers only the fill
  measurement; if `requestAdapter` never settles, boot stays on the renderer
  step forever.
- WebGL2 fallback is fine `[V]`: the WebGPU backend calls `getContext('webgpu')`
  lazily, both backends report device loss through `renderer.onDeviceLost`,
  and `renderer.backend` is only read after init.
- No GPU at all: init rejects and the player sees "Reload game", which cannot
  help. Wording, not architecture.
- The frame loop has three writers: the prop, `CapabilityProbe` (now
  redundant) and `SceneReadySignal`. The prop flip at scene-ready calls
  `setFrameloop` again, which resets fiber's clock. Harmless unless something
  reads `clock.elapsedTime`.
- `[I]` The same throttle may hit the field: fiber's bundled reconciler has the
  same 300 ms rule and the FieldScene `use()` loaders are not tagged with a
  status, so the in-canvas boundary can pay part of it.
- **spec/01 no longer matches** `[V]`: it still says React under 19.3, fiber
  9.7, three 0.185, an async factory that awaits `init()`, and
  `frameloop="always"`.

## 5. Recommendation (b)

1. Fix the lab: hold `frameloop` at `never` until `rendererReady()`, as the
   game does, ideally by sharing the game's gating.
2. Remove the memo, and the "memoization is mandatory" sentence in spec/01.
3. Decide tone mapping on purpose: confirm the runtime value first. If Neutral
   is wanted, set it where fiber cannot overwrite it. That changes the look,
   so it goes through the visual review gate.
4. Rewrite spec/01's renderer section to the shipped contract: a pre-init
   renderer, and a frame-loop pause that is load-bearing.
5. Optional: an `init()` deadline that routes to the recovery screen.

**The (c) design, held back until there is evidence for it.** A plain
`rendererBoot` module builds the renderer on a canvas the app owns, awaits
`init()`, and measures capability with no React involved. Fiber then gets an
already-initialised instance through `createRoot(canvas).configure({ gl })`:
synchronous, no Suspense gate, and since the app owns the renderer fiber never
disposes it. The Canvas mounts already knowing its tier and the `frameloop`
prop becomes the only writer. The cost is re-implementing what `<Canvas>`
gives today: sizing, context bridging (`AudioGraphContext`), events, and the
Activity and StrictMode handling 9.8.1 hardened.

**What the hub should check before (c) is reconsidered.**
- Critical path: in three boot-only runs per backend, does
  `herd:boot:capability` land before the last of `herd:boot:terrain`, `grass`,
  `treeline` and `scatter`? If it does every time, capability is not on the
  critical path and (c) cannot move ready.
- The A/B: async factory plus a `HerdApp` re-render on the renderer step,
  against the shipped build. Renderer-to-capability should stay within 64 to
  87 ms. If it does, the on-contract path is viable and the pre-init renderer
  can be retired.

## What was verified by the orchestrator afterwards

- `lab/src/LabApp.tsx` passes `glFactory` with `frameloop="always"`: confirmed
  in source.
- Fiber's configure sets `gl.toneMapping` to ACES when `glProps` is undefined,
  on its first `changed('flat')`: confirmed in the installed
  `events-e51d7528.esm.js`.

Items 1 to 4 are Release 2 work; the tone-mapping decision is the owner's
because it changes the shipped look.
