# Konveyor Atmosphere Ownership

Captured 2026-05-14 on `exp/konveyor-webgpu-migration` after the first
diagnostic material islands.

## Current Contract

`HosekWilkieSky` owns the analytic sky shader and the CPU LUT that produces
derived zenith, horizon, and sun colors. `Atmosphere` is the orchestrator that
applies those derived values to the rest of the scene.

The WebGPU diagnostic path now uses
`js/atmosphere/skyFogSamplePacket.js` for the same contract. That helper can
sample an existing `HosekWilkieSky` instance, or create a renderless
`HosekWilkieSky({ createRenderable: false })` when a diagnostic needs a
standalone packet. Do not move fog, sun, or ambient ownership into a GPU-only
sky shader unless these CPU-visible packet values remain equivalent.

Runtime ownership today:

| Value | Owner | Consumers | WebGPU migration note |
|---|---|---|---|
| Sky dome color | `HosekWilkieSky` shader + CPU mirror | Backdrop, atmosphere specs | Do not replace with a visual-only sky shader unless the CPU LUT contract stays equivalent. |
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

## Cross-Project Lesson

The relevant Terror in the Jungle atmosphere lesson is not to rebuild an
expensive CPU LUT into every consumer. Its shipped contract keeps fog, ambient,
water, terrain, and billboards sampling the same atmosphere state, while
deferring heavier Hillaire-style LUT/cubemap backends until their lifecycle and
budget are owned explicitly. SDS should keep the current CPU-visible sky/fog
packet as the contract authority, then move work onto GPU textures only when a
measured WebGPU path reduces cost or removes visible parity drift without
splitting atmosphere ownership.
