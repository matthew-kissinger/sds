// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 51 P6: the pastoral loading surface, promoted from the Golden Pasture
 * bake-off skin. Replaces both old skeletons (the boot skeleton-loader.html and
 * the SceneSwapOverlay shimmer): a calm glass panel over the armed world's
 * render, with one honest bar driven by the real per-stage build marks
 * (js/boot/loadProgress.js). When the build completes the App fades this out to
 * reveal the live scene.
 *
 * Cycle 112 Phase 5: the backdrop is no longer blurred. It held the armed
 * world's hero under `filter: blur(2px)` and a 1.05 upscale, which threw away
 * the one image doing the work of making the wait feel like an approach rather
 * than a gate. The scrim stays, since the panel still needs contrast to read.
 */
import type { CSSProperties } from 'react';
import { pastoral, alpha } from '../ui/tokens';
import { WorldImage, LoadingBar } from './sceneComponents';
import type { BootFlow } from './useBootFlow';

const glass: CSSProperties = {
  background: alpha(pastoral.cream, 82),
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${pastoral.glassWarmBorder}`,
  borderRadius: 22,
  color: pastoral.ink,
  boxShadow: '0 10px 34px rgba(43,38,32,0.22)',
};

export function LoadingScreen({ flow }: { flow: BootFlow }) {
  return (
    <div data-sds-loading-screen="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Sharp, and held at the same framing the entrance showed, so the cut
          from entrance to loading reads as continuity rather than a swap. */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <WorldImage world={flow.world} />
      </div>
      {/* Lighter than the old 38: with the blur gone the panel reads against a
          sharper image, and the hero should still be legible behind it. */}
      <div style={{ position: 'absolute', inset: 0, background: alpha(pastoral.ink, 28) }} />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ ...glass, padding: '30px 28px', width: 'min(440px, 92%)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600 }}>{flow.world.name}</div>
          <div style={{ fontSize: 13, color: pastoral.inkSoft, marginTop: 4, marginBottom: 22 }}>{flow.dog.name} · {flow.mode.name}</div>
          {/* Cycle 112 Phase 3 (D6): the copyright and AGPL line was here too.
              It moved to the entrance info menu. A loading screen is the last
              place someone reads licensing, and it was the widest block of text
              on a surface that should be calm. */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <LoadingBar pct={flow.loading.pct} label={flow.loading.label} accent={pastoral.accentMeadow} />
          </div>
        </div>
      </div>
    </div>
  );
}
