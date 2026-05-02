# Mac rendering bug research

> Cycle 12 Phase 4 deliverable. Photos at `~/Downloads/sds-mac-bug/` (NOT in repo).
> Status as of 2026-05-02: bug does NOT reproduce on GH Actions Safari (`macos-latest` runner with `safaridriver`). Two daily nightly runs in a row green: 2026-04-30, 2026-05-01.
>
> **Update 2026-05-02 (post-cycle-close):** the sky-banding fix sketched below was actually shipped (commit `04e62e7` — `precision highp float;` + `precision highp int;` in sky/cloud/grass shaders, plus 1/255 hash dither at sky's final fragment write). Verification on Matt's actual Mac is still pending; trigger the macOS Safari workflow manually via `gh workflow run macos-safari.yml` after deploy lands. White-ground hypothesis is unchanged — still pending Matt's `__sdsDiag` capture.

## Symptoms (from photo evidence)

Two distinct issues, conflated in field reports as "the Mac bug":

### 1. White-ground (gameplay-blocking)

- **Terrain only**. Trees, sheep, rocks, fence, sheepdog, mountains, water all render correctly. The terrain mesh itself is fully white.
- **Manifests during Solo Classic** on Matt's specific Mac (Safari). Does not reproduce in [GH `macos-latest` Safari smoke](../tests/safari-smoke/run.mjs).
- Narrows the suspect surface to: terrain inline `THREE.ShaderMaterial` ([`js/TerrainBuilder.js:468-575`](../js/TerrainBuilder.js)), grass `ShaderMaterial` + external `.glsl` shaders ([`js/GrassSystem.js:443`](../js/GrassSystem.js)), or per-frame uniform binding into either of those.

### 2. Rainbow horizon-band (cosmetic; pre-bug frame)

- Visible BEFORE the white-ground manifests, in the same play session. A wide rainbow stripe spans the horizon from one edge of the screen to the other.
- Reads as 8-bit color quantization OR ACES tonemap precision loss across the very low-luminance horizon gradient.

## Source-tree map of the suspect surfaces

| Surface | File | Texture? | Precision declared? | Risk |
|---|---|---|---|---|
| Terrain shader | [`js/TerrainBuilder.js:468`](../js/TerrainBuilder.js) | None — procedural FBM | `precision highp float;` in fragment | Low |
| Grass shader (vertex) | [`js/GrassSystem.js:457`](../js/GrassSystem.js) | `noiseTexture` (DataTexture, RGBA8) | None — Three default | Medium |
| Grass shader (fragment) | external `.glsl` files | n/a | Unknown — read the file | Medium |
| Sky shader (Hosek-Wilkie) | [`js/atmosphere/skyShader.glsl.js`](../js/atmosphere/skyShader.glsl.js) | None | **None — Three default** | **High (banding)** |
| Cloud shader | [`js/atmosphere/cloudShader.glsl.js`](../js/atmosphere/cloudShader.glsl.js) | None | Unknown | Low |
| AnimeWater | [`js/water/AnimeWater.js`](../js/water/AnimeWater.js) | DepthTexture (highp sampler) | `precision highp float;` declared | Low |
| Renderer config | [`js/SceneManager.js:45-106`](../js/SceneManager.js) | n/a | SRGB + ACES, no Safari path | Medium |

**Note:** there is no `BlendedTerrainMaterial` class in the repo — that name appears only in the Cycle 12 plan. The actual terrain material is the inline `ShaderMaterial` cited above.

## Hypothesis: rainbow-banding (Cycle 12 Phase 4 finding)

Hosek-Wilkie sky fragment shader has **no explicit precision declaration** ([`js/atmosphere/skyShader.glsl.js`](../js/atmosphere/skyShader.glsl.js)). Three.js injects `precision highp float;` for WebGL2 fragment shaders by default, but the math here is unusually precision-sensitive:

- **`pow( vSunE * (...) * (1.0 - Fex), vec3(1.5) )`** at line 149. `Fex` is `exp(-(betaR*sR + betaM*sM))` and the `(1 - Fex)` term sits very close to 0 over the entire upper hemisphere. Raising small numbers to a fractional power amplifies any precision loss into visible banding.
- **`pow( vSunE * (...) * Fex, vec3(0.5) )`** on line 150 — same pattern, smaller exponent, same vulnerability.
- The horizon gradient is exactly where these `pow()` calls live in the smallest-magnitude regime. Banding at the horizon line is the textbook symptom.

Apple's WebKit on Metal can downcast `highp` to a hardware `mediump` for certain ops in the fragment stage, particularly when register pressure is high — and this shader allocates many `vec3` locals.

**Recommended remediation (low-risk, high-confidence):**

1. **Force precision in the shader source itself**, not the Three.js injection. Add `precision highp float;` at the top of the fragment shader (and `precision highp int;`) in [`js/atmosphere/skyShader.glsl.js`](../js/atmosphere/skyShader.glsl.js).
2. **Add a stable dither** on the final `gl_FragColor` write: 1/255 noise in linear color before tonemap. Cheap fix that masks any residual 8-bit quantization without changing the analytic math. Pattern: `gl_FragColor.rgb += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;` after the existing color math.
3. **Apply the same precision fix to grass and cloud shaders** as a belt-and-suspenders pass.

**Acceptance for the banding fix:** rainbow stripe gone in Matt's Safari capture; ` window.__sdsDiag.shader.compile.success === true` for sky/grass/cloud on a fresh load. No frame-rate regression on RTX 3070.

## Hypothesis: white-ground (less confident)

Three plausible causes, ranked:

1. **Grass `noiseTexture` upload failure on Safari/Metal** — silent texture-upload error that returns a 0×0 texture; sampling it returns 0,0,0,0; some shader path then divides by it → NaN propagation into the terrain pass via shared depth or fog uniforms.
2. **Terrain shader `<fog_fragment>` chunk + Atmosphere fog timing** — already fixed once in Cycle 9 (terrain compile-time `sceneFog` check). Possible regression where the chunk binds a stale fog reference on some compile order. If `scene.fog` is null at compile but bound at draw, Safari may read undefined uniforms as garbage that overflow → white.
3. **Hardware-specific Metal driver bug** on Matt's specific Mac (model unknown). GH `macos-latest` runners use VM-provisioned hardware that hides many Apple-Silicon-specific Metal quirks.

**Investigation steps gated on Matt:**

1. Capture `window.__sdsDiag` via Safari Web Inspector → Console → `JSON.stringify(window.__sdsDiag).slice(0, 4000)` while the bug is on screen. Save to `~/Downloads/sds-mac-bug/diag-<timestamp>.json`.
2. Capture a `framebufferSample` for the in-game frame: `__sdsDiag.captureFramebufferSample('white-ground')` then read `__sdsDiag.framebufferSample.pixels` for the centermost 8×8 patch — confirms whether the white reaches the framebuffer (shader output) or only the screen (display pipeline).
3. With the diag data: compare `extensions` list, `vendor`, `renderer`, `shadingLanguageVersion` against the GH-runner Safari baseline at run [25208443221](https://github.com/matthew-kissinger/sds/actions/runs/25208443221).

## Browserbase remote-Safari spike

**Conclusion: Browserbase does NOT support Safari/WebKit.**

Verified 2026-05-02:
- [docs.browserbase.com](https://docs.browserbase.com) and `/llms.txt` do not mention Safari or WebKit as supported browsers.
- The supported integrations are Playwright, Puppeteer, and Selenium against Chromium-family browsers. Real Safari requires a macOS host, and Browserbase does not provision macOS containers.
- "WebKit" in Playwright's documentation refers to Playwright's bundled WebKit build, NOT Safari/Metal. The bundled build does not use Metal and therefore does not reproduce Metal-specific bugs (this is exactly why Cycle 9 Phase 3 stood up the GH `macos-latest` + `safaridriver` workflow rather than relying on Playwright WebKit).

**Recommendation: pivot Phase 4's "remote-Safari" budget to extending the existing GH workflow** at [`.github/workflows/macos-safari.yml`](../.github/workflows/macos-safari.yml). Specifically:

1. **Extend [`tests/safari-smoke/run.mjs`](../tests/safari-smoke/run.mjs)** to wait for actual gameplay frames (currently only captures a static start-screen and a static post-transition frame). Animate for ~60 frames after the in-game transition so the dynamic shader paths (grass wind, water depth, cloud drift) actually run.
2. **Capture a center-of-frame pixel patch from the framebuffer** at the end of each scene smoke. White-ground would manifest as RGB ~ (255,255,255) for a center fragment that should be terrain-green.
3. **Fail the smoke loudly** on any framebuffer read that's >95% white — gives us a reproducer-on-CI for the white-ground class even if the specific Mac model differs from GH's.
4. **Add a Browserbase-style "real Mac"** option: defer to user-driven runs of `tests/safari-smoke/run.mjs` against `--device=mac` on Matt's actual machine when CI doesn't reproduce. Cycle 12 closing leaves a `BROWSERBASE_API_KEY` provisioned at `~/.config/mk-agent/env`, but it is **only useful for Chromium scenarios**; document this in Cycle 13's plan if Safari-via-3rd-party becomes a goal.

**Free-tier limits** for Browserbase are not a constraint here because we are not using Safari support that does not exist. The key remains in `~/.config/mk-agent/env` for any future Chromium-based remote work.

## Sky-banding fix — implementation (shipped 2026-05-02 in commit `04e62e7`)

Originally documented as deferred; pulled forward and shipped post-cycle-close. The sketch below is the actual diff that landed:

```glsl
// js/atmosphere/skyShader.glsl.js — fragment header
export const hosekWilkieFragmentShader = /* glsl */ `
precision highp float;
precision highp int;

varying vec3 vWorldDirection;
// ... rest unchanged
```

And at the end of `void main()`:

```glsl
// 1/255 hash dither to break 8-bit color quantization on the horizon
// gradient. Stable per-fragment (no temporal animation) so it does not
// shimmer.
float dither = (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
gl_FragColor = vec4(texColor + vec3(dither), 1.0);
```

`hash21` is already defined in this shader (line 95).

**Test plan when shipping:** run `npm test`, run `npm run build`, smoke locally, then trigger the macOS Safari workflow manually via `gh workflow run macos-safari.yml` and inspect the artifact for any banding-style diffs in the captured framebuffer samples.

**Test status (shipped 2026-05-02):** 149/149 vitest pass, including 8 new cases in `tests/shader-precision.spec.js` pinning the precision declarations + the dither math in source. Production build clean. `gh workflow run macos-safari.yml` verification still pending after the deploy lands.

## Open questions

- Matt's specific Mac model + macOS version (Apple Silicon vs Intel; macOS 14 vs 15 vs 26). Knowing whether it's Apple Silicon narrows the precision/Metal hypothesis.
- Whether `?debug=gl` was active when the bug was captured. The probe pass adds a few extra render targets; if it's a render-target alloc cliff it would matter.

## References

- [Cycle 9 Phase 3 — macOS Safari workflow stand-up](archive/cycles/cycle-9-plan.md)
- [Photo evidence captured 2026-05-02](https://example.local/sds-mac-bug-photos) — local-only, `~/Downloads/sds-mac-bug/`
- Browserbase docs: https://docs.browserbase.com (verified 2026-05-02 — no Safari support)
- `safaridriver` reference: https://developer.apple.com/documentation/webkit/about_webdriver_for_safari
