# Konveyor Visual Polish QA - 2026-05-16

Branch: `exp/konveyor-webgpu-migration`

Context: local Chrome review of the explicit WebGPU route at
`http://127.0.0.1:3000/?renderer=webgpu&scene=open-country&autostart=1&mode=classic`.

## Current Read

The WebGPU route works, but it is not yet production-polished. Treat the prior
renderer/look as a direction reference, not as something to copy exactly. The
next visual pass should channel the better art direction while fixing the
WebGPU-specific material, animation, and scene-composition defects below.

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

4. Leaves sway while branches stay still.
   - Wind amplitude makes leaves look detached from the branch structure.
   - Next work should either reduce leaf amplitude, add coherent trunk/branch
     motion, or make leaf displacement attenuate by anchor/height so the tree
     reads as one object.

5. Ground texture/material mapping is incorrect.
   - Ground reads black or incorrectly mapped in places.
   - Edge areas show texture palette bands on the ground.
   - Next work should inspect terrain material UVs, palette/debug texture
     routing, far-ring blend, and WebGPU terrain factory inputs.

## Priority Order

1. Ground material/texture mapping, because black/palette artifacts undermine
   the whole scene.
2. Sky/cloud cutoff, because it breaks the horizon read immediately.
3. Water richness and shoreline response.
4. Tree wind coherence.
5. Grass interaction.

## Validation Expectation

For this pass, proofs should include side-by-side WebGL/WebGPU screenshots for
Open Country and Rolling Hills plus targeted probes for the affected material
inputs. Do not accept perf/pass status alone as visual readiness.
