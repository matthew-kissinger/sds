# Konveyor Atmosphere Ownership

Captured 2026-05-14 on `exp/konveyor-webgpu-migration` after the first
diagnostic material islands.

## Current Contract

`HosekWilkieSky` owns the analytic sky shader and the CPU LUT that produces
derived zenith, horizon, and sun colors. `Atmosphere` is the orchestrator that
applies those derived values to the rest of the scene.

A production-facing sky-dome adapter now exists in
`js/atmosphere/konveyorAtmosphereMaterialAdapter.js`, and `HosekWilkieSky` can
receive an injected material factory for that adapter. The adapter only
activates for `?renderer=webgpu&konveyorAtmosphere=1` plus an explicit
`createSkyDomeMaterial` factory; otherwise the injected path returns the
existing WebGL `ShaderMaterial`. The seam passes the shared sky uniform state,
but it does not move fog or sun ownership out of the CPU-visible LUT contract.

The WebGPU diagnostic path now uses
`js/atmosphere/skyFogSamplePacket.js` for the same contract. That helper can
sample an existing `HosekWilkieSky` instance, or create a renderless
`HosekWilkieSky({ createRenderable: false })` when a diagnostic needs a
standalone packet. Do not move fog, sun, or ambient ownership into a GPU-only
sky shader unless these CPU-visible packet values remain equivalent.

Runtime ownership today:

| Value | Owner | Consumers | WebGPU migration note |
|---|---|---|---|
| Sky dome color | `HosekWilkieSky` shader + CPU mirror | Backdrop, atmosphere specs | Production-facing material creation can now route through the explicit atmosphere adapter, but do not replace the sky with a visual-only shader unless the CPU LUT contract stays equivalent. |
| Horizon color | `HosekWilkieSky.getHorizon()` | `Atmosphere.applyFogColor()` | Fog color follows horizon every frame, including linear `sceneDef.fog` overrides. |
| Sun color | `HosekWilkieSky.getSun()` unless preset has a direct hint | `SunSystem`, `CloudLayer`, sun billboard, rocks/impostors through `main.js` | WebGPU cloud/sky work must preserve this color handoff before production wiring. |
| Fog density | `Atmosphere.baseFogDensity` plus weather multiplier | `scene.fog`, terrain fog chunks, grass fog uniforms | Fog type can be `FogExp2` or scene-level linear `Fog`; color source is still horizon. |
| Cloud coverage/scale | Sky preset + weather intent | `HosekWilkieSky`, `CloudLayer` | Dome clouds and parallax cloud plane share coverage and feature-scale intent. |

## Pinned Evidence

`tests/atmosphere.spec.js` now asserts:

- `Atmosphere.update()` copies `HosekWilkieSky.getHorizon()` into `scene.fog`
  and applies weather darkening.
- Scene-level linear fog overrides keep their near/far distances while horizon
  color remains authoritative.
- `CloudLayer` receives the sky-derived sun color during `Atmosphere.update()`.
- `HosekWilkieSky({ createRenderable: false })` can sample horizon, zenith, and
  sun colors without allocating a sky mesh or material.
- `sampleSkyFogPacketFromSky()` and `createSkyFogSamplePacket()` emit a
  CPU-visible packet with horizon, zenith, sun, fog, preset, and cloud values.

`tests/konveyor-atmosphere-material-adapter.spec.js` asserts:

- The sky material adapter requires both `renderer=webgpu` and
  `konveyorAtmosphere=1`.
- Missing factories fall back to the default sky material with an explicit
  reason.
- `HosekWilkieSky` can receive an explicit sky material factory while keeping
  shared uniforms available to the factory.
- The default `HosekWilkieSky` constructor remains on the WebGL
  `ShaderMaterial` path.

`tests/webgpu-diagnostic.spec.js` asserts the diagnostic WebGPU sky/fog packet
keeps fog color derived from the CPU horizon sample and matches the production
Hosek-Wilkie LUT. The Chrome diagnostic probe records
`skyFog.horizonColor`, `skyFog.sunColor`, `skyFog.fogColor`, and
`skyFog.fogNear/fogFar` in
`cycle36-validation/runtime/webgpu-diagnostic-chrome.json`.

`cycle36-validation/runtime/sky-fog-preset-matrix.json` records the same
renderless packet for every required sky preset (`pastoral-noon`, `dusk`,
`overcast`, `dawn`, and `golden-hour`) using
`tools/konveyor-sky-fog-matrix.mjs`. This is analytic color parity evidence
only; preset screenshots and production renderer wiring are still separate
gates.

`cycle36-validation/runtime/sky-lut-profile.json` records a renderless CPU LUT
profile for the same five presets using `tools/konveyor-sky-lut-profile.mjs`.
The current LUT has 256 RGB entries; in this local profile the worst bake was
1.4724 ms and the worst 1024-direction sample batch was 1.0535 ms. That makes
the current SDS CPU-visible LUT a contract surface, not a measured bottleneck.

## Next Migration Shape

Do not wire production WebGPU cloud or sky rendering until a diagnostic island
proves both pieces of the atmosphere handoff:

1. A cloud-plane TSL prototype can consume explicit sun color, sun direction,
   coverage, edge fade, and time inputs without broadening the default WebGL
   bundle.
2. A sky/fog prototype can preserve a CPU-accessible horizon/sun color source,
   or can expose an equivalent renderer-agnostic sample API for fog, cloud,
   sun billboard, rock rim, water, grass, and impostor tint consumers.

The diagnostic cloud-plane TSL island now proves the smaller cloud material
inputs, and the diagnostic sky/fog island proves a renderer-visible material can
share a renderless CPU-accessible horizon/sun/fog packet. Production sky, fog,
terrain, water, grass, and impostor wiring still needs parity evidence before
any default renderer path changes.

The production-facing atmosphere adapter is only a seam. The next sky step
still needs an explicit TSL sky material factory, preset screenshot parity, and
fog-consumer proof before the production renderer can claim WebGPU sky
coverage.

## Cross-Project Lesson

The relevant Terror in the Jungle atmosphere lesson is not to rebuild an
expensive CPU LUT into every consumer. Its shipped contract keeps fog, ambient,
water, terrain, and billboards sampling the same atmosphere state, while
deferring heavier Hillaire-style LUT/cubemap backends until their lifecycle and
budget are owned explicitly. SDS should keep the current CPU-visible sky/fog
packet as the contract authority, then move work onto GPU textures only when a
measured WebGPU path reduces cost or removes visible parity drift without
splitting atmosphere ownership.

## Best-Practice Alignment

Three's WebGPU migration guidance says `ShaderMaterial`, `RawShaderMaterial`,
and `onBeforeCompile()` surfaces need to move to node materials and TSL for
`WebGPURenderer`, while WebGL 2 fallback remains part of the renderer strategy
during migration. That matches the SDS island approach: keep WebGL default,
port one material contract at a time, and keep the CPU-visible atmosphere
packet stable until the WebGPU path proves equivalent.

Three's TSL docs also frame node materials as reusable graph components that
can target WGSL or GLSL. For SDS, that means fog, sun color, water, grass,
rock, tree, and impostor consumers should share one atmosphere packet or one
equivalent node/texture source rather than each rebuilding a sky formula.

The WebGPU best-practice notes from Google's Chrome/WebGPU work emphasize
labels/debug groups, compressed texture formats, asynchronous pipeline
creation, and shared bind groups/layouts. Applied here: a future GPU LUT should
be an explicitly owned texture/pipeline resource with labels and lifecycle
evidence, not an implicit replacement for the CPU API that gameplay and visual
systems already consume.

References:

- Three.js WebGPURenderer manual: https://threejs.org/manual/en/webgpurenderer
- Three.js TSL docs: https://threejs.org/docs/TSL.html
- WebGPU Best Practices, Google/Khronos slides: https://www.khronos.org/assets/uploads/developers/presentations/WebGPU_Best_Practices_Google.pdf
