# Performance, Extensibility, Memory, and Rust/WASM Options Spike - 2026-05-16

## Question

What could SDS use to gain performance headroom, cleaner extensibility, better
memory behavior, or Rust-powered CPU-side modules without breaking the current
web game, multiplayer determinism, or WebGL-default release posture?

This is research only. It does not approve a Rust rewrite, a `shared/` sim
rewrite, a Worker backend rewrite, a new dependency, or a WebGPU-default policy
change.

## Current SDS constraints

- `shared/**` is deterministic game logic imported byte-identically by the
  browser client and Cloudflare Worker. Any real change there requires explicit
  cycle-plan authorization and sim-baseline acceptance.
- The main runtime is a Three.js plus React/Vite web game. The renderer and
  DOM/UI architecture should not be rewritten to chase theoretical speed.
- WebGL remains the default route. WebGPU/TSL can improve opt-in rendering, but
  fallback and migration gates stay intact.
- Current perf tools already include frame-time validation, screenshot gates,
  browser probes, and native preflight. Any new performance claim should land
  in those tools or a similarly repeatable proof.

## Decision frame

The performance question should be split into four lanes:

1. **JS architecture and allocation discipline.** Usually the best first return:
   typed arrays, object pools, fewer per-frame allocations, precomputed
   placement data, batched update loops, and explicit profiler marks.
2. **Browser parallelism.** Web Workers, Comlink-style RPC, OffscreenCanvas, and
   transferable buffers can move CPU work away from the main thread, but they
   create protocol and browser/WebView compatibility work.
3. **Rust/WASM modules.** Good for pure CPU kernels, offline tools, asset
   baking, spatial data, and batch computations. Risky for small per-frame
   calls or deterministic multiplayer unless the whole contract is designed
   around one shared WASM module.
4. **WebGPU compute.** Good for visual-only simulation such as particles, grass
   interaction fields, wind, flock-like ambient motion, and GPU-side culling.
   Not the first place to put authoritative multiplayer rules.

## High-return JS work before Rust

Before moving code into Rust, profile and tighten the JS hot path:

- Capture Chrome Performance traces for Field, Rolling Hills, and Open Country
  under WebGL default and explicit WebGPU.
- Add `performance.mark()` / `performance.measure()` around scene rebuilds,
  grass update, sheep update, water update, tree/rock placement, objective
  visuals, multiplayer state application, and render submission.
- Track per-frame allocation pressure with Chrome Memory and targeted counters.
- Convert repeated object churn in hot loops to reused vectors, typed arrays, or
  struct-of-arrays storage where the profiler justifies it.
- Precompute or cache deterministic placement and visual metadata outside the
  frame loop.
- Keep UI and telemetry work off the critical render frame where possible.

This lane is boring, but it is the least risky path to memory stability.

## Browser worker options

| Option | SDS use | Fit | Risk |
| --- | --- | --- | --- |
| Dedicated Web Worker | Offload non-render CPU work such as placement planning, analytics preparation, replay compression, path search, or expensive validation. | Good first parallelism path. | Message protocol, transfer costs, and lifecycle/debug complexity. |
| Comlink | Cleaner worker RPC for coarse-grained jobs. | Useful if worker APIs grow beyond one-off messages. | Hides message costs if used too casually. |
| Transferable ArrayBuffers | Move large buffers without copying. | Good for heightfields, placement arrays, replay chunks, or baked visual data. | Ownership transfer must be explicit; bugs look like detached buffers. |
| SharedArrayBuffer | Low-latency shared memory between threads. | Interesting for future perf labs. | Requires cross-origin isolation and store/WebView proof; not a default assumption. |
| OffscreenCanvas | Potentially move rendering to a worker. | Lab-only candidate for main-thread relief. | Three/WebGPU/WebView support and DOM input/HUD bridging make this high risk. |

Recommended worker first target: non-deterministic visual prep or tool-like
work, not `shared/` authoritative game rules.

## Rust/WASM options

Rust and WASM are useful when the work is:

- Pure CPU.
- Batch-oriented.
- Easy to test with golden input/output files.
- Able to cross the JS/WASM boundary rarely.
- Valuable in both browser and Node/tooling contexts.

Good SDS candidates:

- Heightfield and terrain analysis tools.
- Rock/tree/grass placement planning and validation tools.
- Spatial indexing kernels for broad-phase queries if current JS proves hot.
- Replay compression or deterministic replay diff tooling.
- Asset-pipeline utilities for GLB/sidecar validation.
- Offline screenshot/perf analysis helpers.
- Browser worker-side pathfinding or background preprocessing.

Bad first candidates:

- Tiny per-entity calls from JS into WASM every frame.
- Direct Three.js renderer work.
- React/UI work.
- The deterministic `shared/` sim without a full contract redesign.
- Cloudflare Durable Object room orchestration only because Rust sounds faster.

## Shared sim in Rust/WASM

Porting `shared/**` to Rust/WASM is possible, but it should be treated as a
large migration, not an optimization patch.

Required contract:

1. One Rust/WASM module is used by browser and Worker paths.
2. The public API is batch-oriented, not per-entity chatter.
3. State serialization is explicit and versioned.
4. Randomness, floating-point behavior, iteration order, and time steps are
   documented and tested.
5. Existing sim-baseline goldens are regenerated only after explicit acceptance.
6. JS and WASM outputs are compared in an overlap period before removing the JS
   implementation.

This could give cleaner memory layout and stronger module boundaries, but it is
not guaranteed to be faster once browser/Worker boundary costs are counted.

## Cloudflare Worker and Rust/WASM

Cloudflare Workers can run WebAssembly modules, which makes Rust-built kernels
plausible for pure CPU work inside the backend. That does not mean SDS should
rewrite the Worker in Rust.

Potential uses:

- CPU-heavy score validation or replay verification.
- Compression/diff kernels.
- Deterministic helper code shared with browser tooling.

Risks:

- Durable Object WebSocket orchestration, D1 access, and current Worker code are
  already shaped around JavaScript/TypeScript.
- WASM module startup, binary size, and API marshalling must be measured.
- WebAssembly threads are not a safe assumption in Workers for SDS planning.

Lean recommendation: keep backend orchestration in TypeScript and consider WASM
only for measured pure functions.

## WebGPU compute and TSL options

WebGPU compute is the most interesting bleeding-edge visual path because SDS is
already migrating node-material islands and WebGPU proofs.

Good visual-only candidates:

- Grass interaction field: dog/sheep generate influence data, GPU computes bend
  or recovery field for blades.
- Ambient flock/bug/particle systems that add zen/mystery without CPU pressure.
- Water ripple and shoreline sparkle fields.
- Wind gust texture/LUT for trees and grass so branches, leaves, and meadow
  motion stay coherent.
- GPU-side culling or LOD metadata for high-count future vegetation, if Three
  integration stays manageable.
- Async compute-style prepass experiments for visual data only.

Avoid first:

- Authoritative sheep/dog simulation.
- Multiplayer objective logic.
- Anything that must match WebGL exactly.
- Anything that makes the WebGPU path mandatory before WebGL fallback data says
  it is safe.

The most SDS-aligned compute experiment is a grass/wind interaction field:
visual, contained, player-visible, and easy to disable if unsupported.

## Native shell extension options

If a desktop shell lands later:

- Electron can use Node native modules, Node-API, and `napi-rs` for Rust-backed
  native addons. Use this for desktop-only tooling or store integrations, not
  browser gameplay rules that must also run on web/mobile.
- Tauri can expose Rust commands and plugins. Use this for filesystem,
  diagnostics, crash logs, updater/store glue, and Steamworks wrappers if Tauri
  wins.
- Steamworks integration should live at the shell boundary. The web game should
  talk to a narrow achievements/cloud/overlay adapter so the browser build still
  runs without Steam.
- Native shell memory diagnostics can expose process memory, GPU info, and crash
  logs that browsers do not expose cleanly.

## OSS watchlist

### Rust and WASM

- [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen) - Rust/JS binding
  layer.
- [wasm-pack](https://github.com/rustwasm/wasm-pack) - Rust-to-WASM packaging.
- [wasm-bindgen-rayon](https://github.com/GoogleChromeLabs/wasm-bindgen-rayon) -
  worker-backed Rust Rayon support for browser WASM. Requires careful isolation
  and WebView proof.
- [wasm-opt / Binaryen](https://github.com/WebAssembly/binaryen) - WASM
  optimization tooling.
- [napi-rs](https://github.com/napi-rs/napi-rs) - Rust native addons for
  Node/Electron tooling or desktop shell extensions.
- [wasmtime](https://github.com/bytecodealliance/wasmtime) - native/server-side
  WASM runtime, useful conceptually for tools but not a browser runtime.

### Worker and browser parallelism

- [Comlink](https://github.com/GoogleChromeLabs/comlink) - ergonomic Web Worker
  RPC.
- [Partytown](https://github.com/BuilderIO/partytown) - worker offload for
  third-party scripts; not a game-loop tool, but relevant to main-thread
  hygiene.
- [threads.js](https://github.com/andywer/threads.js) - higher-level worker
  abstractions. Verify maintenance before adoption.

### Three.js and asset/perf tools

- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) - accelerated
  raycasting/spatial queries. Candidate if terrain/object queries become hot.
- [gltf-transform](https://github.com/donmccurdy/glTF-Transform) - already
  aligned with SDS-style GLB optimization and validation.
- [meshoptimizer](https://github.com/zeux/meshoptimizer) - mesh compression and
  optimization primitives.
- [Basis Universal](https://github.com/BinomialLLC/basis_universal) - KTX2/Basis
  texture compression pipeline.
- [Rapier](https://github.com/dimforge/rapier) - Rust physics with WASM builds.
  Interesting only if SDS adds physical gameplay that the current boid sim does
  not cover.
- [bitecs](https://github.com/NateTheGreatt/bitECS) - JS ECS with data-oriented
  storage. Candidate for a measured subsystem rewrite, not whole-game churn.

### WebGPU ecosystem

- [Three.js WebGPU examples](https://github.com/mrdoob/three.js/tree/master/examples)
  - current examples for WebGPU renderer, TSL, and compute patterns.
- [webgpu-samples](https://github.com/webgpu/webgpu-samples) - canonical WebGPU
  sample patterns.
- [gpu-curtains](https://github.com/martinlaxenaire/gpu-curtains) - WebGPU
  rendering experiments and library ideas. Treat as inspiration, not a
  dependency target.

### Native-engine rewrite watchlist

- [Bevy](https://github.com/bevyengine/bevy) - Rust/wgpu engine. Strongest
  true-native Rust idea, but it means a real port.
- [Godot](https://github.com/godotengine/godot) - native engine and editor with
  web export. Also a port.

## Proposed next spike

Before any Rust/WASM implementation:

1. Run a CPU and memory profile packet on the current WebGL default and explicit
   WebGPU route for Field, Rolling Hills, and Open Country.
2. Produce a ranked hotspot table with frame-time cost, allocation pressure,
   call count, and whether the work is deterministic gameplay or visual-only.
3. Pick one contained proof:
   - **Preferred:** Rust/WASM or native Rust CLI for an offline asset/placement
     validation tool.
   - **Alternative:** Web Worker offload for visual prep or replay compression.
   - **Visual WebGPU option:** grass/wind interaction compute field.
4. Compare before/after with `npm test`, `npm run build`, targeted Playwright,
   and the relevant perf proof.
5. Only consider `shared/**` Rust/WASM after a separate accepted design doc.

## Sources

- MDN WebAssembly:
  https://developer.mozilla.org/en-US/docs/WebAssembly
- MDN Web Workers:
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
- MDN OffscreenCanvas:
  https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas
- wasm-bindgen guide:
  https://rustwasm.github.io/docs/wasm-bindgen/
- Cloudflare Workers WebAssembly:
  https://developers.cloudflare.com/workers/runtime-apis/webassembly/
- Three.js TSL wiki:
  https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language
- Three.js WebGPU examples:
  https://github.com/mrdoob/three.js/tree/master/examples
