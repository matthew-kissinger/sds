// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The pastoral loading surface: the entrance holding still while its scene
 * builds. Replaces both old skeletons (the boot skeleton-loader.html and the
 * SceneSwapOverlay shimmer) with one honest bar driven by the real per-stage
 * build marks (js/boot/loadProgress.js). When the build completes the App fades
 * this out to reveal the live scene.
 *
 * Cycle 113 Phase 5: this is now the same room as the entrance, not a second
 * screen. Same stylesheet, same glass, same radii, and the panel docks where
 * the entrance panel sat instead of jumping to the middle of the frame, so the
 * commit reads as one surface changing state. The world's name stays put in the
 * masthead across the cut, which is the continuity that the old centred card
 * threw away.
 *
 * Cycle 112 Phase 5 removed the `filter: blur(2px)` and 1.05 upscale this
 * surface used to apply to the hero. That threw away the one image doing the
 * work of making a wait feel like an approach rather than a gate. The scrim
 * stays, because the panel still needs contrast to read; the panel's own
 * backdrop-filter is a different knob and also stays.
 *
 * Cycle 112 Phase 3 (D6) took the copyright and AGPL line off this surface. A
 * loading screen is the last place someone reads licensing, and it was the
 * widest block of text on a surface that should be calm.
 */
import { WorldImage, LoadingBar, Masthead } from './sceneComponents';
import type { BootFlow } from './useBootFlow';

export function LoadingScreen({ flow }: { flow: BootFlow }) {
  return (
    <div className="sds-ent-loading" data-sds-loading-screen="true">
      <div className="sds-ent-hero">
        <WorldImage world={flow.world} />
      </div>
      <div className="sds-ent-loading-scrim" />

      <Masthead world={flow.world} />

      <div className="sds-ent-dock">
        <div className="sds-ent-loading-panel" data-sds-loading-panel="">
          <div className="sds-ent-loading-sub">{flow.dog.name} &middot; {flow.mode.name}</div>
          <LoadingBar pct={flow.loading.pct} label={flow.loading.label} />
        </div>
      </div>
    </div>
  );
}
