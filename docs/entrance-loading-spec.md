# Entrance and Loading Spec

> Cycle 49 (`pastoral-vision`), Phase 5. The behavior spec for the instant entrance and the pastoral loading experience that Cycle 50 builds. It fixes the shape and the contracts, not the implementation. The look is reviewed through internal gallery mockups (`EntranceMock`, `LoadingMock`). Aligned with [`ui-design-language.md`](ui-design-language.md).

## Entrance

A plain open mounts an instant lightweight menu, not a built scene. No heavy 3D at entry: no WebGPU renderer pass for a hero scene, no `buildSceneBody`, no attract field. First paint is the menu on a painterly pastoral backdrop, and it is interactive immediately.

- **The boot gate flips.** Today `shouldBootAttract()` in [`js/boot/bootAttract.js`](../js/boot/bootAttract.js) gates a plain open into the drifting-boid attract field. Cycle 50 re-points that plain-open branch to mount the instant menu and to NOT call `buildSceneBody` or mount the attract field at boot. The deep-link and multiplayer branches are unchanged (see Deep-link below).
- **Backdrop (Q1 resolved).** A layered 2D / CSS / SVG painterly pastoral scene: a golden-hour sky gradient that drifts on a long loop, soft rolling-hill silhouette layers with a light parallax on pointer move, a faint drift of dusk motes, and a small dog-and-sheep silhouette on the ridge so it reads unmistakably as this game. It is cheap to render and composites headlessly (no WebGPU), so it previews in the gallery smoke surface. With `prefers-reduced-motion`, the backdrop is a still painterly frame.
- **Foreground.** The game title (display face) and the scene picker float over the backdrop on warm glass. The picker is the primary control. The picker keeps its current behavior (ordering, keyboard, swipe); only its surround changes to the pastoral backdrop.
- **Why this replaces the zen field.** The drifting-boid (zen) field read as abstract birds, disconnected from herding, and building a heavy scene behind the menu made entry slow. The instant menu is unmistakably the game and is fast. The zen field code is archived behind a flag in Cycle 50, not deleted.

## Loading

The playable level builds only when the player commits to a scene. The build runs the existing pipeline ([`buildSceneBody`](../js/boot/initWorld.js), roughly 430 to 1574ms warm-to-cold), covered by a pastoral loading experience that replaces the current shimmer-skeleton cover in [`js/components/ui/SceneSwapOverlay.tsx`](../js/components/ui/SceneSwapOverlay.tsx).

- **Build on commit.** Picking a scene (or a deep-link arriving) is what triggers the build. Nothing builds at boot on a plain open.
- **Idle prefetch.** While the menu is up, the likely-next scene's assets warm during idle (the existing prefetch seam), so the bar often starts partly filled and the build feels near-instant.
- **Progress source (Q2 resolved).** The progress reflects real build-stage marks: the per-stage timing the loader already records in [`js/boot/initWorld.js`](../js/boot/initWorld.js) and threads into the `scene_swapped` telemetry (heightfield, terrain, grass, trees, structures, flock). The bar is eased so it animates continuously between milestones and never visibly stalls or jumps backward, and it starts partly filled when idle prefetch has pre-paid assets. A smoothed timer calibrated to the measured range is the fallback only if surfacing the real marks proves too costly.
- **Pastoral surface.** The cover is a warm pastoral surface (warm glass over a golden-hour wash), not a dark blurred box, with a calm one-line label. It replaces the shimmer-skeleton placeholder rows, which read as broken rather than streaming.
- **Reduced motion.** With `prefers-reduced-motion`, the bar fills without the easing flourish and the surface holds still.

## Crossfade

The handoff from the menu backdrop to the built scene is an in-engine crossfade, never a DOM swap of a frozen canvas.

- **In-engine only.** Reuse the existing in-engine dissolve (opacity and render-order based) that today fades the zen field out over the streaming scene. Cycle 50 re-points it to dissolve the instant-menu backdrop into the built scene. Do not introduce the View Transitions API: it snapshots a live canvas as a frozen image and cannot crossfade two live scenes, so it is a frozen-canvas pitfall and is out of scope.
- **DOM-cover skip preserved.** The `window.__sdsAttractCrossfadeActive` flag still gates [`SceneSwapOverlay`](../js/components/ui/SceneSwapOverlay.tsx) so the DOM cover is skipped during the in-engine handoff (no DOM flash), exactly as in the Cycle 46 contract. Normal scene-to-scene swaps still get the pastoral cover.
- **Event contract preserved.** The GameBridge `scene-swap-start`, `scene-swap-end`, and `scene-swap-error` events keep their current shape and timing so the cover and any progress affordance stay in sync.

## Deep-link

The instant menu is the plain-open path only. Direct-entry paths keep working unchanged.

- **`?scene=<id>`** streams that scene directly, skipping the menu, with the pastoral loading cover over the build.
- **`#/r/<code>`** (multiplayer room invite) preserves the scene-lock at room creation and the hard-reload fallback in [`swapScene`](../js/main.js). The instant menu does not change the multiplayer entry.
- **Sandbox deep-links (`#s/`, `#/s/`) and `?autostart=1`** keep building a scene directly, as today.
- **Headless and capture flags (`?testNoCanvas=1`, `?cinematic=1`)** keep their current behavior.

## What Cycle 50 must not break

- The deterministic sim, `shared/`, and the wire protocol stay untouched (entrance and loading are client render only).
- The multiplayer scene-lock and hard-reload fallback stay intact.
- The in-engine crossfade and the `window.__sdsAttractCrossfadeActive` skip stay intact.
- No version bump unless Matt calls a release.
