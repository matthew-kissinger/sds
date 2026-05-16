# Cycle 36 Konveyor Runtime Proof

Captured 2026-05-14 for Cycle 36 Phase 3.

## Question

Which runtime assumptions are proven enough to guide the SDS WebGPU and native
shipping campaign?

## Official-source facts

| Surface | Current fact | Source |
|---|---|---|
| Tauri 2 desktop | Tauri uses the platform WebView: WebView2 on Windows, WKWebView on macOS, and WebKitGTK on Linux. It does not bundle one Chromium engine across desktop targets. | [Tauri WebView versions](https://v2.tauri.app/reference/webview-versions/) |
| WebView2 | Windows apps can use Evergreen distribution or package a Fixed Version runtime. Fixed Version is a Windows WebView2 packaging choice, not a cross-platform guarantee. | [Microsoft WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution) |
| Electron | Electron embeds Chromium and Node.js, which makes it the desktop shell option when SDS needs one pinned Chromium runtime. | [Electron documentation](https://www.electronjs.org/docs/latest/) |
| Capacitor iOS | Capacitor iOS runs the web app in WKWebView. WebGPU support therefore depends on the OS/WebKit floor and still needs a shell probe. | [Capacitor iOS](https://capacitorjs.com/docs/ios) |
| Capacitor Android | Capacitor Android runs in the Android WebView layer. Browser support must be proven on target Android System WebView or Chrome-backed devices. | [Capacitor Android](https://capacitorjs.com/docs/android) |
| Safari/WebKit | Safari 26 includes WebGPU support. This makes an iOS 26+ path plausible, but it is not a substitute for real WKWebView proof in the native shell. | [WebKit Safari 26 feature notes](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) |
| WebGPU browser proof | A browser exposing `navigator.gpu` is not enough; SDS must prove adapter and device creation on the actual runtime. | [Chrome WebGPU overview](https://developer.chrome.com/docs/web-platform/webgpu/overview) |
| Three.js WebGPU | `three/webgpu` is present in the installed Three r184 package, but WebGPU renderer use is not a drop-in path for existing GLSL `ShaderMaterial` and `onBeforeCompile` code. | [Three.js WebGPU Renderer docs](https://threejs.org/docs/#api/en/renderers/webgpu/WebGPURenderer), [Three.js WebGPU migration guide](https://github.com/mrdoob/three.js/wiki/WebGPU-Migration-Guide) |

## Local probes

Commands:

```bash
npm run probe:webgpu -- --out=cycle36-validation/runtime/webgpu-probe.json
npm run probe:webgpu -- --channel=chrome --out=cycle36-validation/runtime/webgpu-probe-chrome.json
```

Local package state:

- `three`: `^0.184.0`
- `@tauri-apps/*`: not installed
- `electron`: not installed
- `@capacitor/*`: not installed

Results:

| Probe | WebGPU result | Meaning |
|---|---|---|
| Playwright bundled Chromium 147 | `navigator.gpu` true, adapter true, `requestDevice` failed with a D3D12 `dxil.dll` load error. WebGL renderer was RTX 3070 through D3D11. | CI/tooling must not treat `navigator.gpu` or `requestAdapter()` as sufficient proof. Device creation is the minimum browser-runtime gate. |
| Installed Chrome 148 channel | `navigator.gpu` true, adapter true, device true. WebGL renderer was RTX 3070 through D3D11. | WebGPU is usable on this Windows workstation in installed Chrome. |

The probe also confirmed `three/webgpu` imports and exports
`WebGPURenderer` in the current dependency set.

## Decision

Desktop shell selection is deferred.

Tauri remains a candidate because its Windows WebView2 path can plausibly use a
modern WebGPU-capable runtime, and it is the lighter native shell. Electron
remains the fallback if SDS needs one pinned Chromium runtime across Windows,
macOS, and Linux. The current repo has no native shell dependency or booted
shell proof, so choosing either now would be premature.

## Named gaps

- No Tauri 2 app has booted SDS.
- No Electron app has booted SDS.
- No Capacitor iOS or Android shell has booted SDS.
- No WKWebView WebGPU device proof exists for SDS.
- No Android WebView WebGPU device proof exists for SDS.
- No native shell has proven live multiplayer WebSocket, fullscreen, input, or
  audio behavior.

## Consequence for Cycle 36

WebGL remains the default renderer. Any WebGPU path stays explicit and
flag-gated. Native packaging dependencies should not be added until a later
cycle is specifically scoped to boot and measure SDS in a chosen shell.
