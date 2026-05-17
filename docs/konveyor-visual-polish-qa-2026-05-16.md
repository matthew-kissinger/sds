# Konveyor Visual Polish QA - 2026-05-16

Original branch: `exp/konveyor-webgpu-migration`. Current follow-up work is on
the post-merge `main` checkout unless a scoped `codex/` branch is created before
commit.

Context: local Chrome review of the explicit WebGPU route at
`http://127.0.0.1:3000/?renderer=webgpu&scene=open-country&autostart=1&mode=classic`.

Active direction as of the later Cycle 37 and mobile-readiness work: WebGPU is
the progressive default request on supported browsers, with WebGL fallback,
forced `?renderer=webgl`, and the experimental settings toggle preserved. Do not
chase strict WebGL parity. Treat WebGL, prior screenshots, the roadmap, and
current scene identity as art-direction references only. The WebGPU path should
become a calmer, richer, more intentional version of SDS: relaxing and
zen-like, but with mystery, adventure, a readable sun, and a clearer horizon.

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
- Residual: this was the design-led first polish pass, not strict WebGL parity
  sign-off.
- Live review caveat: Matt later reported that the WebGPU look reads well, but
  interactive perf felt terrible while another agent was running perf tests for
  a different game on the same machine. Treat that as a
  machine-load-contaminated warning, not a confirmed SDS regression, until an
  isolated Chrome-channel production preview perf proof is rerun with no other
  GPU/CPU-heavy perf jobs active.
- Follow-up status: Cycle 37 closed the focused sun/sky/atmosphere pass and
  progressive WebGPU default. The later mobile-readiness pass implemented the
  WebGPU dog-through-tree leaf occluder controls, shared branch/leaf wind
  controls, deep-blue shoreline/glint water controls, grass interaction for dog
  plus nearest sheep, tiered terrain fidelity policy, mobile tree impostor path,
  and connected Android WebGPU proof at
  `cycle37-validation/runtime/android-webgpu-rolling-hills-final-2026-05-16.json`.
  Cycle 38 follow-up on the phone fixed the dog sprint route shape and improved
  the terrain/grass code paths, but Open Country remains visually and
  performance-blocked. The current straight-line sprint proof still shows
  startup spikes, so route correctness and frame pacing must stay separate in
  the acceptance read. Use the Cycle 38 artifacts, not this older first-pass
  list, as the current acceptance truth.
- Later desktop sheep/grass status: `cycle38-validation/runtime/desktop-webgpu-sheep-grass-fix.json`
  proves the production WebGPU path applies the repaired sheep wool material and
  stronger grass interactor contract on Rolling Hills. The dedicated proof
  `cycle38-validation/runtime/desktop-webgpu-grass-interaction-evidence.json`
  captures frozen off/on/diff triptychs for dog and sheep contact and reports
  visible localized crop changes. This closes the desktop "prove the blades
  move" request, but it is not phone or mobile acceptance evidence.
- Later tree-placement status: the clumped/undersized-tree review is now
  handled as a deterministic placement-contract patch, not an impostor shader
  issue. `cycle38-validation/runtime/tree-placement-spacing-diagnostics.json`
  records zero canopy-overlap pairs in Field, Rolling Hills, and Open Country
  after cross-zone canopy spacing and tighter scale jitter floors. Desktop
  WebGPU tree-occluded visual proof lives at
  `cycle38-validation/runtime/desktop-webgpu-tree-placement-after.json`.

## Original Findings And Current Status

1. Grass is not interactive.
   - Addressed in the mobile-readiness pass at the material/control level:
     WebGPU grass now receives dog plus nearest-sheep interactor controls.
   - Cycle 38 follow-up strengthened the WebGPU bend/laydown response and
     proved `interactorCount=10` on the connected phone with nearest-sheep
     selection by dog distance, but the screenshot still does not make the bend
     obvious enough. Keep this open.
   - Later desktop installed-Chrome proof added a discrete off/on/diff harness
     and now shows localized dog/sheep blade movement. Keep normal-play and
     mobile proof open until the phone is connected again.

2. Water shader is bland compared with the target look.
   - Addressed in the mobile-readiness pass at the material/control level:
     deep-blue ocean palette, world-space shoreline response, and sun/camera
     glint inputs are wired for WebGPU.
   - Cycle 38 still needs shoreline/glint screenshots across camera poses and
     devices.

3. Sky/clouds show a cutoff line.
   - Cycle 37 addressed the focused sun/sky/atmosphere packet.
   - Keep horizon/terrain-seam camera poses in Cycle 38 so the fix stays proven
     on mobile.

4. The sun is not visible enough in the explicit WebGPU scene.
   - Cycle 37 enlarged and clarified the WebGPU sun/atmosphere read.
   - Cycle 38 glint screenshots should verify the sun remains readable without
     overdriving water highlights.

5. Leaves sway while branches stay still.
   - Addressed in the mobile-readiness pass at the material/control level:
     branches and leaves use a shared wind packet, with leaves retaining only
     smaller flutter.
   - Cycle 38 still needs visual gates before closing the user-visible defect.

6. Tree placement is too dense, clumped, or too small.
   - Addressed in the tree-placement readability patch. The current generator
     keeps deterministic seeded candidates but rejects cross-zone canopy
     overlaps and raises the minimum scale jitter floor.
   - Keep visual tree-occluded screenshots in the Cycle 38 matrix so the
     placement fix is judged in-camera, not only by metrics.

7. Ground texture/material mapping is incorrect.
   - Earlier WebGPU terrain/material work addressed the major mapping defects.
   - Cycle 38 reduced the worst Open Country center seam with the mobile
     terrain split, height-sampled shared-material skirt, and continuous WebGPU
     terrain material, but broad terrain bands/lines remain visible on the
     phone. Keep horizon/terrain-seam screenshot gates open.

## Priority Order

1. Rebuild over-budget tree/rock author-time assets and finish the true
   octahedral impostor contract.
2. Fix water grid/alignment lines and glint sync.
3. Rerun phone/mobile grass and sheep proof when hardware is connected.
4. Run Cycle 38 visual screenshot gates across the same camera poses as the perf
   matrix.
5. Wire remaining `QualityGovernor` knobs so mobile frame pacing can degrade and
   recover gracefully.
6. Expand device/browser proof beyond one Android phone.

## Validation Expectation

For the next pass, proofs should include WebGPU screenshots for Field, Rolling
Hills, and Open Country across follow-close, classic-max, tree-occluded,
shoreline/glint, and horizon/terrain-seam poses. WebGL screenshots can remain
reference controls, but production acceptance should be based on readable,
performant WebGPU output and real-device frame pacing. Do not accept perf/pass
status alone as visual readiness.
