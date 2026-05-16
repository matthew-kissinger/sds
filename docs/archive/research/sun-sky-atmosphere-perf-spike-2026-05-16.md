# Sun, Sky, Atmosphere, and Perf Spike - 2026-05-16

## Question

How should SDS improve the WebGPU sun and sky so the game feels calmer, more
beautiful, more mysterious, and more adventurous while staying ready for real
performance work?

This is research and implementation prep only. It does not approve changing the
default renderer, removing WebGL fallback, adding a new atmosphere dependency,
or starting a full volumetric atmosphere rewrite.

## Current SDS atmosphere shape

The current atmosphere stack is already modular enough to improve without a
rewrite:

- `js/atmosphere/Atmosphere.js` orchestrates `HosekWilkieSky`, `CloudLayer`,
  `SunSystem`, day/night state, and scene fog.
- `js/atmosphere/HosekWilkieSky.js` owns the WebGL analytic sky dome and a
  CPU-visible LUT used for fog tint and lighting packets.
- `js/atmosphere/CloudLayer.js` adds a finite planar procedural cloud layer for
  parallax.
- `js/effects/SunBillboard.js` adds a separate camera-facing sun disc/halo.
- `js/atmosphere/skyFogSamplePacket.js` can produce a renderless packet for
  WebGPU factory inputs.
- `js/atmosphere/konveyorSkyNodeMaterial.js`,
  `js/atmosphere/konveyorCloudNodeMaterial.js`, and
  `js/effects/konveyorSunNodeMaterial.js` are the current WebGPU/TSL surfaces.

The first WebGPU visual-polish pass made the sun readable, softened the worst
cutoff, and improved overall mood, but the sun/sky should still become a
focused atmosphere pass rather than remain incidental polish.

## Current technical risks

1. **Two sun owners.** The sky node material can paint a sun disc/glow, while
   `SunBillboard` also paints a disc/halo. The game needs one explicit sun-disc
   contract so sky glow, visible disc, water glint, tree/grass lighting, and
   fog all agree.

2. **WebGPU sky is simpler than WebGL sky.** The WebGL path is based on
   Preetham-style Rayleigh/Mie scattering math with turbidity, Rayleigh, Mie,
   exposure, and cloud coverage. The WebGPU node material currently uses a
   simplified art-directed gradient plus sun terms. That is fine for a design
   pass, but the next atmosphere pass should decide which terms are canonical.

3. **Cloud plane still has finite-plane risk.** `CloudLayer` is a single huge
   plane with footprint and horizon fades. Prior fixes reduced the cutoff line,
   but a flat cloud layer can still betray itself at low camera pitch or when
   fog/sky/cloud alpha do not share the same horizon model.

4. **Fog ownership is fragmented.** Scene fog, WebGPU material fog constants,
   sky horizon color, cloud fade, terrain fog, grass fog, tree fog, and water
   fog are connected by convention. A focused pass should make the atmosphere
   packet the explicit source of truth for all WebGPU material factories.

5. **Perf proof is not atmosphere-specific.** Current perf proofs tell whether
   the whole WebGPU route is within budget. They do not isolate sky, cloud, sun,
   fog, or downstream material fog cost.

## External methods worth using

### Preetham / Three SkyMesh

Three's classic `Sky` and WebGPU `SkyMesh` are based on the Preetham analytic
daylight model. This is the closest external model to SDS's current WebGL
shader and the lowest-risk WebGPU alignment target.

Use it as a reference for:

- Dot-product sun disc and glow based on view direction and sun direction.
- Turbidity, Rayleigh, Mie coefficient, Mie directional G, and exposure as
  stable atmosphere parameters.
- A WebGPU-native TSL/NodeMaterial expression surface.

SDS should not import `SkyMesh` blindly because it needs scene-specific clouds,
fog packets, water/sun handoff, and current renderer gates. But it is a good
reference for repairing the WebGPU sky math.

### Hillaire production atmosphere

Sebastien Hillaire's production sky/atmosphere technique and the accompanying
Unreal sample are the modern high-end direction. The technique uses compact
LUTs and approximations for sky and aerial perspective rather than full
per-pixel brute force.

This is the right long-range reference if SDS later wants:

- Aerial perspective as a first-class atmosphere volume.
- Better sun low-angle glow and horizon mystery.
- Proper transmittance and multiple-scattering approximations.
- WebGPU compute or render-pass LUT generation.

It is not the right first implementation step. SDS is a stylized browser game
with WebGL fallback and current perf uncertainty. A Hillaire-style LUT system
would create new render-pass, texture, update, and fallback contracts before
the sun/sky art problem is solved.

### Bruneton precomputed atmosphere

Bruneton-style precomputed atmosphere is a stronger physical model and is well
documented, but it is a larger system than SDS currently needs. Treat it as a
reference for validation and future architecture, not as the next code path.

### WebGPU OSS implementations

- `webgpu-sky-atmosphere` implements Hillaire-style atmosphere in WebGPU and
  exposes compute and raster renderers with LUT options. It is useful for
  architecture and parameter references, not as an immediate dependency.
- `takram/three-geospatial` includes a precomputed-atmosphere package and is
  moving toward node-based WebGPU support. It is useful as a watchlist for
  Three-compatible atmosphere APIs and physically plausible material lighting.

## Recommended SDS architecture

### 1. Create an explicit `AtmosphereFrame` contract

The atmosphere pass should produce one frame packet consumed by WebGPU material
factories and diagnostics:

```js
{
  presetName,
  sunDirection,
  sunColor,
  sunAngularRadius,
  sunDiscIntensity,
  sunGlowIntensity,
  zenithColor,
  horizonColor,
  fogColor,
  fogNear,
  fogFar,
  fogStrength,
  turbidity,
  rayleigh,
  mieCoefficient,
  mieDirectionalG,
  exposure,
  cloudCoverage,
  cloudScale,
  cloudHorizonFade,
  cameraHeight
}
```

This should be derived from `Atmosphere`, `HosekWilkieSky`, scene fog, and the
current scene definition. It should replace ad hoc per-material defaults where
possible.

### 2. Choose a single sun-disc owner

For SDS, the best visual contract is:

- Sky material owns broad solar aureole, horizon warmth, and directional glow.
- `SunBillboard` owns the readable disc and near-disc halo.
- Water, grass, trees, terrain, and sheep consume the same `sunDirection` and
  `sunColor`.
- The billboard can use an art-directed readability clamp, but it must expose
  both physical direction and visual direction in diagnostics so it does not
  silently diverge from lighting.

The sky material should not draw a second hard sun disc if the billboard is
enabled. It may draw a broad glow based on `dot(viewDir, sunDirection)`.

### 3. Fix sky math before adding heavy atmosphere tech

The next implementation should improve the existing WebGPU TSL sky material:

- Use view-direction dot sun terms rather than UV-only sun placement for glow.
- Keep a soft zenith-to-horizon gradient driven by the CPU-visible sky packet.
- Add a stable low-sun warm horizon band for `dawn`, `dusk`, and
  `golden-hour`.
- Keep all color math in linear color space until the material output.
- Remove any hard sky/cloud alpha thresholds near the horizon.
- Keep the effect to one sky draw, one optional cloud draw, and one sun draw.

Do not start with full-resolution atmospheric ray marching, volumetric clouds,
or a post-process light-shaft pass.

### 4. Replace the cloud cutoff with a horizon model

The current cloud plane can stay if its alpha model is made coherent:

- `CloudLayer` horizon alpha should be driven by the same horizon/fog values as
  the sky material.
- Plane footprint fade should be invisible at normal gameplay camera angles.
- The dome cloud field and planar cloud layer should not both create distinct
  horizon bands.
- Open Country and Rolling Hills should each get screenshot probes with camera
  pitch low enough to stress the horizon line.

If the planar layer keeps producing a seam, the safe fallback is to reduce
planar cloud opacity and let the dome sky carry more of the cloud read for the
WebGPU path.

### 5. Add atmosphere-specific diagnostics before perf edits

Add a small probe surface before changing more visuals:

- Current `AtmosphereFrame` packet dump.
- `SunBillboard` physical direction, visual direction, intensity, size, and
  screen-space visibility.
- Sky/cloud material mode and key tuning values.
- Draw counts for sky, cloud, and sun.
- Optional flags to disable sky glow, cloud layer, or sun billboard for A/B
  measurement.

The probe should be captured in the same browser proof tools used for the
visual-polish pass.

## Perf plan

The next perf work should be measurement-first:

1. Wait until no other GPU/CPU-heavy perf jobs are running on the workstation.
2. Build production output and use Vite preview, not dev-server subjective feel.
3. Run installed Chrome with the existing WebGPU proof path and GPU flags.
4. Capture Open Country and Rolling Hills in both default WebGL and explicit
   WebGPU.
5. Record whole-route frame metrics, screenshots, and atmosphere diagnostics.
6. If WebGPU fails budget, rerun with atmosphere toggles:
   - sun billboard off
   - planar clouds off
   - sky glow simplified
   - water/grass unchanged
7. Change one atmosphere cost at a time and re-run the same proof.

Suggested atmosphere budget:

- No more than 3 atmosphere draws: sky dome, optional cloud layer, sun
  billboard.
- No new full-screen postprocess in the first pass.
- No full-resolution atmosphere raymarch in the first pass.
- No per-frame CPU LUT rebuild except when sun/preset changes beyond the
  existing threshold.
- No WebGPU compute LUT until the current TSL path is measured and insufficient.

## Implementation order

1. **Isolated perf recapture.** Rerun production preview WebGPU perf for Open
   Country and Rolling Hills when the machine is not contaminated by other perf
   jobs.
2. **AtmosphereFrame packet.** Add or formalize the one packet consumed by sky,
   cloud, sun, terrain, grass, water, trees, and sheep WebGPU factories.
3. **Sun-disc contract.** Make the sky material broad-glow-only and the
   billboard the readable disc, with diagnostics proving physical and visual
   directions.
4. **Sky TSL repair.** Move the WebGPU sky closer to the current Preetham-style
   parameter surface without chasing exact WebGL parity.
5. **Cloud horizon repair.** Make cloud alpha and sky/fog horizon coherent, and
   prove no cutoff line in Rolling Hills/Open Country captures.
6. **Perf A/B.** Add atmosphere toggles only if the isolated proof shows a real
   budget problem.
7. **Validation.** Run fresh browser screenshots/probes, isolated perf proof,
   `npm test`, `npm run build`, and targeted Playwright.

## What not to do yet

- Do not import a full atmosphere engine before the current SDS sky contract is
  formalized.
- Do not add volumetric clouds.
- Do not add bloom/light shafts as a cover-up for a weak sun disc.
- Do not make WebGPU the default renderer.
- Do not optimize by deleting atmosphere features before the isolated perf
  proof says which feature is expensive.
- Do not treat a busy workstation subjective review as a confirmed performance
  regression.

## Sources

- Three Sky docs:
  https://threejs.org/docs/pages/Sky.html
- Three SkyMesh docs:
  https://threejs.org/docs/pages/SkyMesh.html
- Three SkyMesh source:
  https://github.com/mrdoob/three.js/blob/master/examples/jsm/objects/SkyMesh.js
- Three TSL:
  https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language
- GPU Gems 2, Accurate Atmospheric Scattering:
  https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-16-accurate-atmospheric-scattering
- Hillaire, A Scalable and Production Ready Sky and Atmosphere Rendering
  Technique:
  https://diglib.eg.org/items/8a3e5350-18b3-46bd-9274-3add5af88c75
- Unreal Engine Sky Atmosphere documentation:
  https://dev.epicgames.com/documentation/en-us/unreal-engine/sky-atmosphere-component-in-unreal-engine
- UnrealEngineSkyAtmosphere sample:
  https://github.com/sebh/UnrealEngineSkyAtmosphere
- Bruneton precomputed atmospheric scattering:
  https://ebruneton.github.io/precomputed_atmospheric_scattering/
- WebGPU Sky Atmosphere:
  https://github.com/JolifantoBambla/webgpu-sky-atmosphere
- Takram Three Geospatial:
  https://github.com/takram-design-engineering/three-geospatial
