# Konveyor WebGPU And Native Best Practices

Captured 2026-05-15 on `exp/konveyor-webgpu-migration`.

## Question

Which current external best practices should steer the next SDS Konveyor work
without drifting from the campaign vision?

## Source-Backed Facts

| Surface | Current fact | SDS consequence |
|---|---|---|
| Three WebGPU | `WebGPURenderer` is the modern Three renderer target and can fall back to a WebGL 2 backend, but WebGPU setup is async. `ShaderMaterial`, `RawShaderMaterial`, and `onBeforeCompile()` customizations are not WebGPU-compatible without node material and TSL ports. | Keep the current material-island migration. Do not try to boot production Rolling Hills by swapping renderer construction. Keep `?renderer=webgpu` fail-closed until the real shader surfaces are ported and proven. |
| Three TSL | TSL is renderer-agnostic shader graph logic that can emit WGSL or GLSL, supports modular imports, tree shaking, uniform updates, texture nodes, instancing attributes, fog, and compute surfaces. | Keep the extracted `konveyor*NodeMaterial` factories and the central factory suite. Do not statically import `three/webgpu` into the default WebGL graph. |
| Browser WebGPU | MDN still marks WebGPU as limited availability and secure-context-only. `navigator.gpu.requestAdapter()` may return `null`, adapter choice can vary, fallback adapters can exist, and `adapter.requestDevice()` is the real device gate. | SDS runtime proof must keep checking support, adapter, and device creation on the exact browser or shell runtime. `navigator.gpu` alone is not evidence. |
| Chrome WebGPU | Chrome positions WebGPU as lower-JS-workload graphics and compute access, with broadening but still platform-specific browser support. | Optimization work needs measured SDS perf evidence. Compute remains a later opt-in experiment, not a multiplayer sim rewrite. |
| Tauri | Tauri uses WebView2 on Windows and WebKit/WKWebView/WebKitGTK on Apple/Linux platforms; WebView updates follow the platform. | Tauri remains attractive for a lightweight shell, but it cannot be treated as one pinned Chromium runtime. Each target OS needs its own WebGPU, input, audio, fullscreen, storage, and WebSocket proof. |
| WebView2 | Microsoft supports Evergreen and Fixed Version distribution; Fixed Version packages a chosen Windows runtime and increases app size. | WebView2 Fixed Version is a Windows packaging lever, not a cross-platform native answer. Use it only if Windows runtime pinning is worth the package cost. |
| Electron | Electron tracks Chromium on an eight-week major cadence and supports the latest three stable majors. | Electron remains the practical desktop fallback when SDS needs a known Chromium engine across desktop targets, at the cost of larger packaging. |
| Capacitor | Capacitor iOS uses WKWebView; Capacitor Android uses Android WebView/Chrome-backed WebView depending on OS level. | Mobile WebGPU claims need real device proofs. Safari 26 WebGPU makes an iOS path plausible, but it does not prove SDS inside WKWebView. |

## Repo-Aligned Practices

1. Keep WebGL as the default until Phase 9 records a fallback decision. Three's
   WebGPU fallback support does not remove SDS's need for explicit runtime
   probes, production screenshots, latency proof, and native-shell gates.
2. Continue the material-island strategy. It matches Three's migration rule:
   every custom `ShaderMaterial` and `onBeforeCompile()` path must become a
   node material or stay on the WebGL side.
3. Keep node-material factories explicit and injected. A factory that accepts a
   supplied WebGPU/TSL module object preserves default bundle posture and keeps
   the WebGPU code path observable.
4. Treat atmosphere as a shared contract, not a shader side effect. The current
   CPU-visible sky/fog packet should remain the authority for fog, sun color,
   clouds, water, terrain, grass, rocks, trees, and impostor tint until a GPU
   LUT or texture-backed path proves equal or better through production
   profiling and visual parity.
5. Treat the Terror in the Jungle lesson as ownership guidance: a GPU LUT can
   be the right fix when the CPU LUT becomes a measured bottleneck or when GPU
   consumers need a shared texture. It should not split fog/lighting ownership
   or rebuild the atmosphere formula independently inside each material.
6. Keep WebGPU compute isolated from deterministic multiplayer. Any compute
   boid, grass, culling, or trample experiment must be single-player-only,
   leaderboard-excluded, and outside `shared/**` until a deliberate multiplayer
   contract is designed.
7. Defer EZ-Tree asset replacement until a measured tree phase. Upstream
   generation improvements may be useful for bark, leaves, silhouettes, and
   native/WebGPU headroom, but accepted trees still need gallery review, GLB
   compression, Kiln impostor rebake where needed, material-ownership proof,
   screenshots, perf, latency, build, native, lint, and test evidence.
8. Choose native shells by proof, not preference. Tauri should prove each
   platform WebView. Electron should prove pinned-Chromium desktop behavior.
   Capacitor should prove WKWebView and Android WebView behavior on devices.
9. Keep browser/process cleanup as part of evidence hygiene. Diagnostic capture
   tools should close Playwright/browser instances and stop preview servers so
   later probes are not polluted by stale tabs or ports.

## Next Best Move

The next production-adjacent move should keep `?renderer=webgpu` fail-closed
without `diagnostic=1`, then move one already-isolated material island toward
scene-bound production parity. The strongest candidates are:

- Atmosphere/cloud: already has renderless scene fog/horizon proof and
  diagnostic screenshots; next gate is production-scene WebGPU screenshot
  parity without changing default WebGL.
- Water/terrain: already use real heightfield texture proof; next gate is
  Rolling Hills/Open Country scene-bound parity and latency/perf evidence.
- Tree/rock: EZ-Tree refresh and native instancing are important, but asset
  replacement should wait for a deliberate tree phase with before/after visual
  and perf artifacts.

## References

- Three WebGPURenderer manual: https://threejs.org/manual/en/webgpurenderer
- Three TSL specification: https://threejs.org/docs/TSL.html
- MDN WebGPU API: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- MDN `GPU.requestAdapter()`: https://developer.mozilla.org/en-US/docs/Web/API/GPU/requestAdapter
- MDN `GPUAdapter.requestDevice()`: https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapter/requestDevice
- Chrome WebGPU overview: https://developer.chrome.com/docs/web-platform/webgpu/overview
- Tauri WebView versions: https://v2.tauri.app/reference/webview-versions/
- Microsoft WebView2 distribution: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
- Electron release cadence: https://www.electronjs.org/docs/latest/tutorial/electron-timelines
- Capacitor iOS: https://capacitorjs.com/docs/ios
- Capacitor Android: https://capacitorjs.com/docs/android
- WebKit Safari 26 features: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
