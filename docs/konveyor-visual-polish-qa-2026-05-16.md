# Konveyor Visual Polish QA - 2026-05-16

Branch: `exp/konveyor-webgpu-migration`

Context: local Chrome review of the explicit WebGPU route at
`http://127.0.0.1:3000/?renderer=webgpu&scene=open-country&autostart=1&mode=classic`.

Active direction: keep WebGL as the default and preserve the existing migration
gates. Do not chase strict WebGL parity. Treat WebGL, prior screenshots, the
roadmap, and current scene identity as art-direction references only. The
WebGPU path should become a calmer, richer, more intentional version of SDS:
relaxing and zen-like, but with mystery, adventure, a readable sun, and a
clearer horizon.

## Current Read

The WebGPU route works, but it is not yet production-polished. Treat the prior
renderer/look as a direction reference, not as something to copy exactly. The
next visual pass should channel the better art direction while fixing the
WebGPU-specific material, animation, and scene-composition defects below.

## Pass Status

2026-05-16 WebGPU visual-polish pass implemented on
`exp/konveyor-webgpu-migration`.

- The release path now makes WebGPU the progressive default, while explicit
  `?renderer=webgl`, unsupported-device fallback, and the experimental settings
  toggle keep a WebGL escape hatch intact.
- Final browser proof:
  `cycle36-validation/runtime/visual-polish-final2-webgpu-request.json`.
- Final screenshots:
  `cycle36-validation/runtime/visual-polish-final2-webgpu-request/rolling-hills.png`
  and
  `cycle36-validation/runtime/visual-polish-final2-webgpu-request/open-country.png`.
- Perf proof:
  `cycle36-validation/runtime/visual-polish-final-webgpu-perf.json`.
- Current refresh proof:
  `cycle36-validation/runtime/visual-polish-refresh-webgpu-request.json`.
- Current refresh screenshots:
  `cycle36-validation/runtime/visual-polish-refresh-webgpu-request/rolling-hills.png`
  and
  `cycle36-validation/runtime/visual-polish-refresh-webgpu-request/open-country.png`.
- Current refresh perf proof:
  `cycle36-validation/runtime/visual-polish-refresh-webgpu-perf.json`.
- Current refresh grass-interaction proof:
  `cycle36-validation/runtime/visual-polish-refresh-grass-interaction.json`.
- Grass interaction probe confirmed WebGPU grass controls receive live interactor
  uniforms in Open Country (`grassInteractorCount=129`,
  `nodeInteractorCount=1` in the refresh proof).
- Validation passed: focused Konveyor material specs, `npm test`,
  `npm run build`, and targeted Chromium Playwright smoke.
- Residual: this is a design-led first polish pass, not strict WebGL parity
  sign-off or production-default renderer approval.
- Live review caveat: Matt later reported that the WebGPU look reads well, but
  interactive perf felt terrible while another agent was running perf tests for
  a different game on the same machine. Treat that as a
  machine-load-contaminated warning, not a confirmed SDS regression, until an
  isolated Chrome-channel production preview perf proof is rerun with no other
  GPU/CPU-heavy perf jobs active.
- Follow-up direction: the sun and sky should become a focused atmosphere pass,
  backed by
  `docs/archive/research/sun-sky-atmosphere-perf-spike-2026-05-16.md`, before
  any broad perf optimization or rollback. Active follow-up is Cycle 37 in
  `docs/cycle-37-plan.md`: isolate perf first, then repair atmosphere/sun/sky,
  then start Native Packaging Proof 0.

## Findings

1. Grass is not interactive.
   - Current WebGPU visual does not show the expected player/flock interaction
     response.
   - Next work should inspect whether interaction/trample/bending uniforms or
     update inputs are missing from the WebGPU grass path.

2. Water shader is bland compared with the target look.
   - The water works technically, but lacks the visual richness of the intended
     style.
   - Next work should compare WebGL and WebGPU water inputs for color ramp,
     foam, ripple, sun glint, shoreline response, and time/update wiring.

3. Sky/clouds show a cutoff line.
   - There is a visible horizon/cloud discontinuity.
   - Next work should inspect cloud layer bounds, fog blend, sky dome/far ring
     overlap, and any WebGPU node-material alpha/fog mismatch.

4. The sun is not visible enough in the explicit WebGPU scene.
   - Local review did not show a readable sun anchor.
   - Next work should verify the WebGPU effect adapter, sky/fog/sun direction
     handoff, cloud occlusion/fog blend, and camera-facing billboard scale so
     the sun reads as part of the calmer adventure mood without washing out the
     scene.

5. Leaves sway while branches stay still.
   - Wind amplitude makes leaves look detached from the branch structure.
   - Next work should either reduce leaf amplitude, add coherent trunk/branch
     motion, or make leaf displacement attenuate by anchor/height so the tree
     reads as one object.

6. Ground texture/material mapping is incorrect.
   - Ground reads black or incorrectly mapped in places.
   - Edge areas show texture palette bands on the ground.
   - Next work should inspect terrain material UVs, palette/debug texture
     routing, far-ring blend, and WebGPU terrain factory inputs.

## Priority Order

1. Ground material/texture mapping, because black/palette artifacts undermine
   the whole scene.
2. Sky/cloud cutoff and missing sun, because the horizon and sun anchor define
   the scene mood immediately.
3. Water richness and shoreline response.
4. Tree wind coherence.
5. Grass interaction.

## Validation Expectation

For this pass, proofs should include side-by-side WebGL/WebGPU screenshots for
Open Country and Rolling Hills plus targeted probes for the affected material
inputs. Do not accept perf/pass status alone as visual readiness.
