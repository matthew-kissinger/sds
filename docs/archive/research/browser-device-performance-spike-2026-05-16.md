# Browser Device Performance Spike - 2026-05-16

## Scope

This spike answers the current SDS browser/device question: how to make the game
work well across high-end PCs, low-end PCs, and mobile phones without assuming a
renderer, browser, or hardware tier.

It is grounded in current browser docs, current repo code, and a real Android
phone proof on Matt's connected device.

## Current Device Proof

Post-spike update: this document preserves the first failing/slow phone proof
and the browser-platform rationale that shaped the fix. The later
mobile-readiness implementation changed the WebGPU tree representation, cost
reporting, governor plumbing, water/grass/tree controls, and terrain policy. The
current connected-phone pass is
`cycle37-validation/runtime/android-webgpu-rolling-hills-final-2026-05-16.json`:
device `R5CX4028VGJ`, secure localhost, Android Chrome WebGPU available,
Rolling Hills follow-close full scene `p95=16.733 ms`, `p99=16.871 ms`,
`drawCalls=37`, `avgEstimatedTriangles=753920`, and no page/console errors.
Treat the older result below as root-cause evidence, not current performance
truth.

Device under test:

- Samsung `SM-S926U`
- Android 16 / API 36
- Chrome `148.0.7778.167`
- Qualcomm platform `pineapple`, WebGL renderer `Adreno (TM) 750`
- USB state: `mtp,adb`, Windows sees Samsung composite USB, MTP, and ADB
  interfaces as `OK`
- ADB reverse used: `tcp:3000 -> tcp:3000`
- Browser URL used: `http://127.0.0.1:3000/...`

Important detail: WebGPU is secure-context-only. Testing the phone over
`http://192.168.1.100:3000` can produce a false negative because a LAN HTTP
origin is not a trustworthy localhost origin. The reliable local-device route is
`adb reverse tcp:3000 tcp:3000` plus `http://127.0.0.1:3000`.

### WebGPU Rolling Hills Result

Artifact:

- `cycle37-validation/runtime/phone-sm-s926u-webgpu-rolling-hills-2026-05-16.json`
- `cycle37-validation/runtime/phone-sm-s926u-webgpu-rolling-hills-2026-05-16.png`

Result:

- `navigator.gpu`: true
- `requestAdapter()`: true
- `requestDevice()`: true
- SDS renderer: `webgpu-production`
- GPU features include `timestamp-query`, `shader-f16`, ASTC/BC/ETC2
  compression support
- rAF sample: average `26.00ms`, p50 `33.30ms`, p95 `33.40ms`, p99 `33.50ms`
- Perf harness: average frame time `27.40ms`, p99 `35.50ms`, max `72.40ms`
- `renderer.info.render.calls`: `2349`
- `renderer.info.render.triangles`: `0`
- Long Animation Frames captured: none

Interpretation: WebGPU works on the phone, but the current WebGPU production
scene is effectively a 30 fps path on high-end mobile. The empty LoAF list
suggests this is not a simple single >50ms main-thread task problem. It is more
likely renderer/GPU/submission/shader/scene-representation cost, but the current
instrumentation is not detailed enough to prove the split.

### WebGL Rolling Hills Control

Artifact:

- `cycle37-validation/runtime/phone-sm-s926u-webgl-rolling-hills-quick-2026-05-16.json`
- `cycle37-validation/runtime/phone-sm-s926u-webgl-rolling-hills-quick-2026-05-16.png`

The wrapper timed out after writing the artifact, so treat this as a quick
control proof rather than a polished harness run.

Result:

- SDS renderer: `webgl`
- rAF sample: average `16.68ms`, p95 `16.80ms`, p99 `16.80ms`
- Perf harness: average frame time `16.68ms`, p99 `16.89ms`
- Draw calls: `65`
- Triangles: `850,033`
- Tree path: old InstancedMesh2 LOD chain active, Kiln impostors available

Interpretation: on this exact phone, current WebGL is much faster and visually
more coherent than current WebGPU in Rolling Hills. Mobile defaulting to WebGPU
is not justified until WebGPU catches up on both visual parity and frame pacing.

## Browser Platform Facts

- MDN marks WebGPU as limited availability and secure-context-only. SDS must
  test `navigator.gpu`, `requestAdapter()`, and `requestDevice()` on the actual
  runtime, not infer support from browser family.
- Chrome enabled WebGPU by default in Chrome 121 on Android 12+ Qualcomm/ARM
  devices, but Chrome explicitly framed Android support as expanding by tested
  hardware coverage.
- Safari 26 adds WebGPU support on macOS, iOS, iPadOS, and visionOS. That makes
  iOS WebGPU plausible, not automatically safe for every iPhone or every
  WKWebView/native shell.
- Three's `WebGPURenderer` can target WebGPU and fall back to a WebGL 2 backend,
  but SDS still needs explicit renderer-mode truth because visual parity and
  performance can diverge across backends.
- Chrome DevTools frames/FPS tooling is useful for manual diagnosis, but
  repeatable SDS gates need scripted rAF histograms, renderer counters, WebGL
  timer-query support where available, WebGPU timestamp-query support where
  available, and real-device CDP/BrowserStack canaries.

## Current SDS Gaps

### Renderer Default

Current SDS settings default `experimentalWebGpu: true`, and main now requests
WebGPU progressively when available. The connected high-end Android device
proves that "WebGPU available" is not equivalent to "WebGPU should be default."

Recommendation: make mobile renderer choice policy-driven:

- WebGL remains the mobile default until WebGPU passes visual parity and frame
  pacing gates on real Android and iOS devices.
- WebGPU remains opt-in or allowlisted per browser/device tier.
- Runtime fallback should not wait for a catastrophic device failure; it should
  also respond to sustained frame pacing misses.

### Tree Representation

The trees were not rebuilt at runtime and were not silently upgraded during the
migration.

Current source truth:

- `@dgreenheck/ez-tree` installed: `1.1.0`
- npm latest: `1.1.0`
- Production picks remain `tree1.glb` = Aspen Small, `tree2.glb` = Oak Medium.
- Tree GLBs and LOD1 GLBs are author-time baked and committed.
- Kiln impostors are author-time sidecars under `assets/models/trees/`.

Why the migration changed the look:

- WebGL path uses InstancedMesh2 with LOD1 and LOD2 Kiln impostors.
- WebGPU production path switches to native `THREE.InstancedMesh` and reports
  `lod0-only`.
- WebGPU tree materials are separate node materials for leaves and branches.
  Leaves currently move more strongly than branches, so the canopy can read as
  disconnected from the tree structure.
- Since WebGPU is `lod0-only`, mobile is now paying for full geometric trees at
  distances where WebGL could use the old LOD/impostor chain.

Recommendation: do not just rebake trees first. First restore a proper WebGPU
tree representation contract:

- Near: LOD0 GLB, branch and leaf wind coupled from one sway packet.
- Mid: LOD1 or simplified canopy, only if silhouette proof is acceptable.
- Far: Kiln impostor or WebGPU-compatible impostor material.
- Device tier controls LOD distances and max tree density.
- Then rebake the selected presets if the silhouette still needs better leaf
  count or shape.

### Water And Ocean

WebGL water already owns a deep-blue palette and heightfield-driven shoreline
foam. The WebGPU water node material diverges:

- Depth color is driven by `uv.y`, not world-space shore/depth.
- Heightfield foam samples the height texture with water UVs, not world-space
  heightfield coordinates.
- Sun glint is a fixed UV-space path/spot instead of a sun/camera-synced
  highlight.
- The phone WebGPU screenshot shows washed/cyan water compared with the WebGL
  control's deep blue ocean.

Recommendation:

- Port WebGL water's world-space heightfield sampling contract into the WebGPU
  node material.
- Make deep ocean converge to the existing `0x103662` palette, with shallow
  color only near shore.
- Rebuild glint from sun direction, camera/view vector, normal, and a cheap
  water-normal/noise term. Clamp intensity by sky preset and camera angle.
- Add visual probes that sample ocean, near-shore foam, and glint brightness.

### Grass Interaction

WebGL grass supports multiple interactors on desktop and a mobile-limited set.
The WebGPU node material path collapses interaction to one interactor. That
explains why sheep and sheepdog interaction with grass can look absent in
Rolling Hills.

Recommendation:

- For WebGPU, replace one-uniform interactor bending with a small interaction
  texture or clustered uniform buffer.
- Keep mobile bounded: dog + nearest N sheep, updated at a capped rate.
- Add an isolated grass interaction proof with dog-only, sheep-only, and
  combined interaction modes.

### Terrain

Mobile terrain uses a lower segment count than desktop and can show planar
patches or seams on rolling hills. Current terrain and placement share the
heightfield, but visible mesh fidelity is still tied to one coarse mobile mesh.

Recommendation:

- Keep deterministic heightfield data unchanged.
- Add visual terrain LOD separate from simulation heightfield.
- Use camera-distance chunks or concentric rings: high detail near the camera,
  coarser far away, skirts or stitching at transitions.
- Add seam probes at low, mid, and high camera pitch.

## Required Performance Architecture

SDS needs two layers: initial capability classification and runtime frame pacing
governance.

### Startup Capability Packet

Collect once per session:

- Renderer requested/effective/fallback reason.
- Secure context.
- WebGPU adapter/device success and selected limits/features.
- WebGL vendor/renderer, max texture size, max uniforms, timer-query support.
- `devicePixelRatio`, viewport, `hardwareConcurrency`, `deviceMemory`, reduced
  data preference where available.
- Current scene, mode, camera preset, quality preset.

Do not treat any single field as decisive. `deviceMemory` and
`hardwareConcurrency` are coarse/fingerprinting-limited. WebGL renderer strings
can be masked. WebGPU adapter info can be empty. The only reliable answer is the
capability packet plus a short live frame-pacing sample.

### Runtime Governor

Track rolling frame timing:

- 5-10 second windows.
- p50, p95, p99, max, dropped-frame ratio.
- Hysteresis: degrade after sustained misses, upgrade only after a longer stable
  period.
- Persist a device+browser quality hint locally, but expire it after browser or
  game version changes.

Quality knobs should be independent:

- Render scale / pixel ratio.
- Grass density, grass distance, blades per clump, and interaction count.
- Tree LOD distance, far impostor threshold, tree wind complexity.
- Terrain visual mesh resolution.
- Water glint/foam complexity.
- Shadow and post effect budget.
- Sheep animation update rate and far animation LOD.
- Sky/cloud quality.

Avoid one monolithic "mobile mode." The connected phone is high-end hardware,
but current WebGPU still underperforms WebGL. Renderer backend must be part of
the tier, not an assumed upgrade.

## Test Matrix

Minimum matrix before changing defaults:

| Axis | Values |
|---|---|
| Renderer | WebGL, WebGPU |
| Device | high PC, low/integrated PC, high Android, low Android, iPhone/iPad Safari |
| Scene | Field, Rolling Hills, Open Country |
| Camera | follow close, classic max zoom, horizon/water angle, tree-occluded angle |
| Systems | full scene, terrain-only, grass-only, trees-only, water-only, sheep-only, atmosphere-only |
| Metrics | rAF p95/p99, draw calls, triangles or custom triangle estimate, shader/program count, GPU timing where available, CPU update slices |
| Visual checks | ocean color, shoreline foam, glint position/intensity, tree wind cohesion, terrain seams, grass interaction |

For WebGPU, `renderer.info.render.triangles` is not currently reliable in SDS.
Add custom geometry estimates for terrain, grass, trees, sheep, water, rocks,
and impostors so WebGPU and WebGL can be compared on the same terms.

## Implementation Order

1. Add a real-device perf harness that can run over Android CDP/ADB and emit one
   JSON record per renderer/scene/camera/system-isolation run.
2. Change mobile renderer policy so WebGL is the default mobile-safe path until
   WebGPU passes a real-device allowlist gate.
3. Fix the WebGPU water contract: deep ocean, world-space shoreline, synced
   clamped glint.
4. Fix WebGPU tree representation: restore LOD/impostor parity or a WebGPU-safe
   equivalent before rebaking presets.
5. Fix WebGPU grass interaction beyond one interactor.
6. Add visual terrain LOD/chunking for mobile instead of one coarse mesh.
7. Add runtime quality governor with hysteresis and persisted local hints.
8. Only then consider changing WebGPU from opt-in/allowlisted to default on any
   mobile class.

## References

- MDN WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- MDN `navigator.gpu`: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/gpu
- Chrome WebGPU Android support: https://developer.chrome.com/blog/new-in-webgpu-121
- WebKit Safari 26 WebGPU: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- Three WebGPURenderer: https://threejs.org/docs/pages/WebGPURenderer.html
- Chrome DevTools Performance reference: https://developer.chrome.com/docs/devtools/performance/reference
- MDN Long Animation Frames API: https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing
- MDN WebGL timer query: https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query
- MDN `navigator.deviceMemory`: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory
- MDN `navigator.hardwareConcurrency`: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency
