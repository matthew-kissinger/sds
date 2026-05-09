# Apple-platform water-render bug + validation gap

> Research note for Cycle 32. Authored 2026-05-09 from a single iPhone screenshot ([`cycle32-validation/iphone-screenshots/iphone-rh-water-2026-05-09.jpg`](../cycle32-validation/iphone-screenshots/iphone-rh-water-2026-05-09.jpg)) plus code archaeology + external evidence pull. Companion to [`cross-platform-testing.md`](cross-platform-testing.md) (the living doc) and [`archive/research/mac-bug-research.md`](archive/research/mac-bug-research.md) (the prior chapter, Cycle 12).
>
> The user's framing on this work: **proper engineering fix, not patchwork.** Whatever Cycle 32 ships here should rearchitect the fragile path, not paper over the symptom.

## Symptom (2026-05-09)

iPhone screenshot, Rolling Hills, Follow camera looking out across water:

- The entire water region renders as a near-solid `#eaf6ff` off-white.
- The visible land strip (golden grass tips, dark green slope, dog) renders correctly.
- The shoreline reads as a hard binary edge between the off-white wash and the rendered land, not as a fogged horizon blend.
- Tested device: iPhone (work-managed, 5G+, iOS version not yet captured). Same behaviour pattern previously observed on Mac Safari.
- Android Chrome + Windows Chrome render correctly on the same build.

The user reports the bug used to cover both land **and** water on Mac Safari + iPhone Safari, and has narrowed to water-only over the last cycle, suggesting prior fixes (Cycle 12 sky precision + dither, Cycle 26 Neutral tonemap on Apple, v2.0.4 iPhone tonemap extension) addressed the land path but not the water path.

## Code arc (what already exists)

Full map produced 2026-05-09 by an Explore agent. Key parts:

| Surface | File | Notes |
|---|---|---|
| Water material | [`js/water/AnimeWater.js`](../js/water/AnimeWater.js) | Custom `ShaderMaterial`. Two-band depth gradient + voronoi-modulated foam + cel sparkles + sun glint. `precision highp float;` declared. `uniform highp sampler2D uDepthTex;`. Fog chunks wired in. |
| Depth pre-pass | [`js/water/DepthPrePass.js`](../js/water/DepthPrePass.js) | One `WebGLRenderTarget` with `DepthTexture` (`UnsignedInt248Type` + `DepthStencilFormat`). Half-res on mobile. **`render()` is wrapped in try/catch that silently swallows Safari/Metal failures (lines 75-83).** Logs to [`js/diagnostics/glProbe.js`](../js/diagnostics/glProbe.js) but never alarms. |
| Atmosphere | [`js/atmosphere/Atmosphere.js`](../js/atmosphere/Atmosphere.js) | Drives `scene.fog.color` per-frame from sky horizon LUT. Both terrain + water inherit via `<fog_fragment>` chunks. |
| Sky | [`js/atmosphere/HosekWilkieSky.js`](../js/atmosphere/HosekWilkieSky.js) + [`skyShader.glsl.js`](../js/atmosphere/skyShader.glsl.js) | `precision highp float; precision highp int;` + 1/255 dither. Cycle 12 Phase 4 fix. |
| Renderer | [`js/SceneManager.js`](../js/SceneManager.js) | `antialias: !isIOS`. `NeutralToneMapping` on Mac/iPhone/iPad (Cycle 26 → v2.0.4 commit `0e686fa`). |
| Validation | [`tests/shader-precision.spec.js`](../tests/shader-precision.spec.js), [`tests/safari-smoke/run.mjs`](../tests/safari-smoke/run.mjs), [`js/diagnostics/glProbe.js`](../js/diagnostics/glProbe.js) | Static-parse precision guard, macOS Safari smoke (no iOS), `?debug=gl` runtime probe. |

## Root-cause hypothesis (high confidence pending device capture)

Trace what happens in [`AnimeWater.js:97-148`](../js/water/AnimeWater.js#L97-L148) when `texture2D(uDepthTex, screenUv).x` returns `1.0` (the depth-far value, which is what you get when the depth-stencil texture sampling fails on Apple Metal-ANGLE):

```glsl
fragDepth  = 1.0
sceneViewZ = perspectiveDepthToViewZ(1.0, near, far) ≈ -far  (e.g. -1000)
diff       = max(0, sceneViewZ - waterViewZ) = max(0, -1000 - (-50)) = 0
foamMask   = 1.0 - step(uFoamThickness, 0)    = 1.0 - 0    = 1.0
color      = mix(baseColor, uFoamColor, 1.0)  = uFoamColor = #eaf6ff
```

That output matches the iPhone screenshot pixel-mean: solid `~#eaf6ff` with a binary shoreline edge (because foam is `step()`, not `smoothstep()`). The foam color is the saturation point.

Same shape if `fragDepth = NaN` (Apple Metal often clamps NaN-step results to 1).

So: **the depth pre-pass is silently failing on Apple, the water shader has no signal that this happened, and its near-white fallback path takes over.** Cycle 26's tonemap fix did not touch this path; it would not have caught this even in principle.

## External evidence (this is a known WebKit pattern)

| Source | What it says | Relevance |
|---|---|---|
| [three.js #25741 (iOS 16.4 WebGL regression)](https://github.com/mrdoob/three.js/issues/25741) | Apple's `kkinnunen-apple` confirmed (June 2024): rendering to / filtering 32-bit float textures **is not supported on any iOS device.** iOS 15.3 incorrectly advertised `EXT_color_buffer_float` + `EXT_float_blend`; "fixed" in 15.4 by removing the false advertisement, breaking apps that relied on it. **No upstream Apple fix shipped.** Workaround is to use `EXT_color_buffer_half_float`. | Direct. Our depth pre-pass uses a render target whose silent failure mode matches this class of breakage. |
| [three.js #26829 (iOS 17 blank white canvas)](https://github.com/mrdoob/three.js/issues/26829) | Blank white canvas + `getShaderPrecisionFormat(...).precision` returns `null` → context lost loop. Apple shipped fix in iOS 17.1.1. WebKit bug [264684](https://bugs.webkit.org/show_bug.cgi?id=264684). | Different symptom from ours (full canvas, context lost). Confirms WebKit ships rendering regressions across major releases that take Apple weeks to patch. |
| [three.js #30767 (M3/M4 + iOS 18.3+ context lost)](https://github.com/mrdoob/three.js/issues/30767) | Same `getShaderPrecisionFormat` null + context lost on Apple Silicon (M3/M4). Once context dies in any Safari tab, all WebGL on the M-chip is dead until Safari is quit. WebKit bug [289601](https://bugs.webkit.org/show_bug.cgi?id=289601), open. | Affects exactly the platforms the user mentioned (M-chip Mac + iPhone). Tells us Apple's WebGL has been broken in unique ways on every major iOS for the last three years. |
| [three.js Metal Z-fighting](https://discourse.threejs.org/t/rendering-bug-with-metal-ios-macos/29812) | ANGLE+Metal precision issues with `DEPTH_COMPONENT16`. Fixed in three.js r157 by defaulting to `DEPTH_COMPONENT24` on WebGL2. | Tells us depth-buffer format choice on Apple is historically fragile. Our `UnsignedInt248Type` is the sane choice but doesn't guarantee sampling works. |
| [Chrome blog: use mediump in WebGL when possible](https://developer.chrome.com/blog/use-mediump-precision-in-webgl-when-possible) | Default `highp` is fine on desktop; on mobile it's a precision tax + compatibility risk. | Our blanket `precision highp float; precision highp int;` is safe but not validated against known iOS precision floors. |

## Why our existing approach failed to catch this

The current Apple-bug loop has been:

1. Matt sees the bug on his one Apple device (one shape, one OS).
2. Screenshot, file as a bug.
3. Add a static shader-source guard or change a renderer flag.
4. Ship. Hope it doesn't regress.

That loop:

- Has no real iOS device in CI ([`cross-platform-testing.md`](cross-platform-testing.md) explicitly defers BrowserStack until traffic justifies it; today's matrix is GH `macos-latest` Safari + Playwright WebKit).
- Has no per-frame health check that the depth pre-pass actually rendered (the existing `try/catch` swallows the failure).
- Has no shader-output unit test (the existing [`tests/shader-precision.spec.js`](../tests/shader-precision.spec.js) statically asserts `precision highp` is declared; it never executes the shader against synthetic inputs).
- Has no visual-regression baseline diff per platform.
- Surfaces every Apple bug **after** Matt sees it, not in CI.

Playwright's WebKit binary is not real iOS Safari and does not use Apple's Metal-ANGLE backend. It will not reproduce this class of bug. The macOS Safari smoke harness ([`tests/safari-smoke/run.mjs`](../tests/safari-smoke/run.mjs)) runs on GH `macos-latest` VMs, which use VM-provisioned hardware that hides Apple-Silicon-specific Metal quirks (this caveat already documented in [`mac-bug-research.md`](archive/research/mac-bug-research.md)).

That is the structural gap.

## Proposed engineering direction (not patchwork)

The user explicitly called out: no hacky patchwork. So the work splits into two intertwined tracks.

### Track A. Architectural change to the water render path

The current water path has a one-frame-tight dependency on a per-frame scene-depth pre-pass. That dependency is **the** fragile surface on Apple. Fixing it means removing the dependency, not babysitting the failure mode.

**Option A1: Replace per-frame depth sampling with scene-load shoreline distance field.**

The water shader's only consumers of depth are (a) the two-band shallow→deep gradient, and (b) the foam mask at the shore. Both are functions of "how far is this water fragment from the nearest shore?" rather than "what's the depth at this screen pixel?"

A baked **shoreline distance field** (a 2D texture covering the water plane, computed once at scene load by sampling the heightfield + the water's Y) gives the same visual outputs without any per-frame render-to-texture, without any depth-stencil sampling, without any cross-platform RTT fragility. This is the standard approach in shipped games (e.g. Sea of Thieves, Genshin Impact, most Unity/Unreal water packages).

Trade-offs:
- One-time scene-load cost (a 512×512 R16F or R8 texture, ~0.5 MB, computed once).
- Depth gradient becomes a function of `(distance-from-shore, water-bottom-from-heightfield)` rather than `(scene-depth, water-view-Z)`. Same visual semantic, different math.
- Loses the "depth-aware foam against any opaque object placed in water" property. No object in SDS currently uses it (no boats, no rocks-in-water, no sheep-in-water as a real case).
- Removes [`js/water/DepthPrePass.js`](../js/water/DepthPrePass.js) entirely; AnimeWater no longer needs `uDepthTex`, `uCameraNear`, `uCameraFar`, `uResolution`.
- Removes one full scene-render per frame on every platform (the depth pre-pass was ~10-15% of mobile frame budget per [`DepthPrePass.js:11`](../js/water/DepthPrePass.js)).

This is the proper fix. The bug class disappears, perf improves, the code shrinks.

**Option A2: Keep the depth pre-pass; add a startup capability check + graceful degradation.**

If we want to retain depth-aware water for some future feature (boats, rocks-in-water), instead detect at scene-init whether the depth pre-pass actually works on this device:

1. Render a known geometry (a single test quad at a known depth) into the depth target.
2. `readPixels` 1×1 from the result.
3. Compare against expected. If mismatched, set `__sdsDiag.depthPrePassWorking = false` and fall back to the no-depth water path (foam disabled or driven by a shoreline distance field as in A1).

This is a smaller change but doesn't actually remove the fragile surface, just gates it. Architecturally weaker than A1 but might be the right step if A1 turns out to break something we haven't anticipated.

**Author lean: A1.** The fragility is the architecture, not the implementation. Removing the architecture removes the bug class.

### Track B. Validation harness so we catch the next one in CI, not on Matt's phone

Independent of Track A, we need real Apple-device coverage so we don't relive this. Four pillars:

**B1. Real iOS Safari in CI via LambdaTest** (paid, ~$15/mo Lite).
- Real iPhone running real Safari, scriptable via Selenium / Playwright Real Device API.
- Connects to local dev tunnel (Vite + wrangler) so we can hit `http://localhost:3000` from the cloud iPhone.
- One automated screenshot test: load `?scene=rolling-hills`, advance to gameplay, screenshot, assert pixel-mean of the water region is **not** within ε of `#eaf6ff` (the canary for our exact bug). Fails PR if water goes white.
- Free 60-min/mo tier for spot debugging; paid for ongoing CI.
- User's plan: set up account + pay if needed.

**B2. Per-shader unit tests with synthetic input** (free, open-source `headless-gl`).
- Compile + render the AnimeWater fragment in Node (via `headless-gl`) with controlled uniforms.
- Assert: with `uDepthTex = solid 1.0`, output is **NOT** within ε of `uFoamColor` (catches our exact failure mode in CI on every PR).
- Assert: with `uTime = 1e30`, output is not NaN.
- Same harness applies to sky, terrain, grass shaders.
- Catches NaN / saturation regressions deterministically. Doesn't depend on device.
- Open source: [`stackgl/headless-gl`](https://github.com/stackgl/headless-gl).

**B3. Frame-end pixel sampling gate** (extends existing `glProbe`).
- The existing [`glProbe.js`](../js/diagnostics/glProbe.js) already samples an 8×8 framebuffer patch.
- Run it once-per-N-seconds on player sessions; if pixel mean is within ε of `#eaf6ff` AND a water plane is in view, fire a Sentry-grade alarm.
- Players become an opt-in test farm.

**B4. Local debug device. Used iPhone SE + Inspect.dev** (one-time ~$50-120 + $50/yr).
- The user is currently charging an old iPhone SE. If it boots and updates, it becomes a permanent test device on the desk.
- [Inspect.dev](https://inspect.dev) ($50/yr personal) lets us attach Safari Web Inspector from Windows over USB. The free alternative ([RemoteDebug iOS WebKit Adapter](https://github.com/RemoteDebug/remotedebug-ios-webkit-adapter)) is archived and brittle on modern iOS but worth trying first.
- This is the cheapest way to capture `__sdsDiag` while the bug is live, without needing a Mac in the loop.

### Phase ordering (proposed for Cycle 32)

If Cycle 32 takes Apple-platform validation as its goal:

1. **Phase 0 (~30m)**: Get a real iPhone to reproduce + capture `__sdsDiag` while the bug is live. Path A: iPhone SE boots → Inspect.dev / `remotedebug-ios-webkit-adapter` → grab diag. Path B: iPhone SE doesn't boot → LambdaTest free 60 min → connect Safari Web Inspector → grab diag. Capture goes to `cycle32-validation/iphone-screenshots/diag-<ts>.json`. **This phase decides what the rest of the cycle does.**
2. **Phase 1 (~2hr)**: Add `headless-gl` per-shader unit tests asserting AnimeWater output for synthetic depth inputs. Includes the canary test for our exact failure (depth=1 → foam everywhere). Lands first because it works without LambdaTest and makes the bug reproducible in CI.
3. **Phase 2 (~half-day)**: Wire LambdaTest into CI for real iOS Safari screenshot test. One scene, one camera, one assertion (water pixel-mean is not within ε of foam color).
4. **Phase 3 (~1 day)**: Track A architecture change. Either A1 (shoreline distance field, remove DepthPrePass) or A2 (capability check + graceful degrade). Decision driven by Phase 0 diag + a research spike.
5. **Phase 4 (~1hr)**: Extend `glProbe` for frame-end pixel sampling gate. Low-cost insurance.
6. **Phase 5 (~30m)**: Doc updates. [`cross-platform-testing.md`](cross-platform-testing.md) gets the new tooling matrix. New rule file [`.claude/rules/apple-platform.md`](../.claude/rules/) (or a section in [`scene-and-render.md`](../.claude/rules/scene-and-render.md)) codifies "no per-frame RTT in shader paths without a capability check."

If Cycle 32's goal is `mp-island-scenes` instead, the validation work splits into a smaller cycle of its own; minimum scope is Phase 0 + Phase 1 + Phase 2 (real device + canary tests), deferring the architecture change to a later cycle.

## Tooling decision (current)

| Tool | Decision | Notes |
|---|---|---|
| LambdaTest | **Use, paid Lite (~$15/mo)** | User to set up account + pay. Free tier covers initial reproduction. |
| BrowserStack Live | Skip for now | LambdaTest is cheaper for the same coverage. Reconsider if LT misses iOS versions we need. |
| Sauce Labs | Skip | Enterprise-shaped pricing. |
| TestingBot | Skip | Less polished UX than LambdaTest at similar price. |
| Appetize.io | Skip | Simulator-only, doesn't reproduce GPU bugs. Good for layout only. |
| iOS Simulator | Skip | Requires Mac. |
| Playwright WebKit | Keep for what we already use it for | NOT real iOS Safari. Already in our matrix per [`cross-platform-testing.md`](cross-platform-testing.md). |
| `headless-gl` | **Use, open-source** | Per-shader unit tests in CI on every PR. |
| Inspect.dev | **Use IF iPhone SE boots** ($50/yr) | Windows-side iOS Safari Web Inspector. |
| `remotedebug-ios-webkit-adapter` | Try first (free), fall back to Inspect.dev | Archived 2020, brittle on iOS 16+ but free. |
| Used iPhone SE | **Already on hand**, currently charging | Permanent local test device if it boots. |
| Used Mac Mini M1 (~$300-400) | Defer | Only if iPhone SE path fails AND we want local Safari iOS Simulator + safaridriver automation. |

## What this is NOT

- Not a request to migrate from Three.js to a different renderer. Three.js's water issues here are inherited from Apple's WebKit, not from Three.js itself.
- Not a request to migrate WebGL2 → WebGPU. WebGPU on Apple Safari is still gated behind a flag in May 2026; not yet a production target.
- Not a generic visual-regression overhaul. Track B scopes to "catch the Apple regression class," not "diff every frame on every browser."
- Not an excuse to defer the architecture change. Track A is the actual engineering fix; Track B is the safety net that keeps us from shipping the next Apple regression to production.

## Open questions for `/cycle-start`

1. Goal-paragraph confirmation: is Apple-platform validation Cycle 32's primary goal, or does it run alongside `mp-island-scenes`?
2. Does the iPhone SE boot? Outcome routes Phase 0 to local-debug or LambdaTest-only.
3. LambdaTest plan: free tier first (60 min) for the spike, then Lite ($15/mo) for ongoing? User has signaled willingness to pay.
4. Track A1 vs A2: ship the shoreline-distance-field architecture change in Cycle 32, or scope it as a separate later cycle and ship A2 capability-check-and-degrade now?

## References

- [`cycle32-validation/iphone-screenshots/iphone-rh-water-2026-05-09.jpg`](../cycle32-validation/iphone-screenshots/iphone-rh-water-2026-05-09.jpg). The source artifact.
- [`cross-platform-testing.md`](cross-platform-testing.md). Living doc; updated alongside this note with new tooling.
- [`archive/research/mac-bug-research.md`](archive/research/mac-bug-research.md). Cycle 12 prior chapter on the white-ground bug.
- [`js/water/AnimeWater.js`](../js/water/AnimeWater.js). The affected shader.
- [`js/water/DepthPrePass.js`](../js/water/DepthPrePass.js). The fragile dependency.
- [three.js #25741](https://github.com/mrdoob/three.js/issues/25741). iOS 16.4 / Apple no-fix.
- [three.js #26829](https://github.com/mrdoob/three.js/issues/26829). iOS 17 white canvas.
- [three.js #30767](https://github.com/mrdoob/three.js/issues/30767). M3/M4 + iOS 18.3+.
- [WebKit bug 289601](https://bugs.webkit.org/show_bug.cgi?id=289601). Open, M-chip WebGL.
- [WebKit bug 264684](https://bugs.webkit.org/show_bug.cgi?id=264684). Fixed iOS 17.1.1.
- [Chrome blog: use mediump in WebGL when possible](https://developer.chrome.com/blog/use-mediump-precision-in-webgl-when-possible).
- [LambdaTest pricing](https://www.lambdatest.com/pricing)
- [Inspect.dev](https://inspect.dev)
- [headless-gl](https://github.com/stackgl/headless-gl)
