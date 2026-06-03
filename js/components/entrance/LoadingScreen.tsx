/**
 * Cycle 51 P6: the pastoral loading surface, promoted from the Golden Pasture
 * bake-off skin. Replaces both old skeletons (the boot skeleton-loader.html and
 * the SceneSwapOverlay shimmer): a calm glass panel over the armed world's
 * blurred render, with one honest bar driven by the real per-stage build marks
 * (js/boot/loadProgress.js). When the build completes the App fades this out to
 * reveal the live scene.
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
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(2px)', transform: 'scale(1.05)' }}>
        <WorldImage world={flow.world} />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: alpha(pastoral.ink, 38) }} />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ ...glass, padding: '30px 28px', width: 'min(440px, 92%)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600 }}>{flow.world.name}</div>
          <div style={{ fontSize: 13, color: pastoral.inkSoft, marginTop: 4, marginBottom: 22 }}>{flow.dog.name} · {flow.mode.name}</div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <LoadingBar pct={flow.loading.pct} label={flow.loading.label} accent={pastoral.accentMeadow} />
          </div>
        </div>
      </div>
    </div>
  );
}
