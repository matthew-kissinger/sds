/**
 * Cycle 51 P6: shared presentation building blocks for the world-first
 * entrance, promoted from the bake-off shell. The world render, the dog
 * avatar, the loading bar, and the dusk motes. Pastoral tokens, no inline hex.
 */
import { useMemo, type CSSProperties } from 'react';
import { pastoral } from '../ui/tokens';
import type { World, Dog } from './worlds';

/** Absolute-fill scene backdrop: the fresh render over a gradient fallback. */
export function WorldImage({
  world, radius = 0, overlay, style,
}: { world: World; radius?: number; overlay?: string; style?: CSSProperties }) {
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', background: world.gradient, ...style }}>
      <img
        src={world.render}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {overlay && <div style={{ position: 'absolute', inset: 0, background: overlay }} />}
    </div>
  );
}

/**
 * Circular dog portrait, the persistent "your dog" avatar. Presentational (a
 * div, not a button) so callers can nest it inside their own clickable pill or
 * swap-row buttons without invalid nested-interactive markup.
 */
export function DogAvatar({
  dog, size = 44, active = false, ring,
}: { dog: Dog; size?: number; active?: boolean; ring?: string }) {
  return (
    <div
      role="img"
      aria-label={`Dog: ${dog.name}`}
      title={dog.name}
      style={{
        width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
        border: `2px solid ${active ? (ring ?? pastoral.accentGold) : pastoral.glassWarmBorder}`,
        background: pastoral.glassWarm, lineHeight: 0,
        boxShadow: active ? `0 0 0 3px ${pastoral.accentGold}33` : 'none',
      }}
    >
      <img src={dog.portrait} alt={dog.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );
}

/** The calm pastoral loading bar, driven by the real per-stage build progress. */
export function LoadingBar({
  pct, label, accent, width = 360,
}: { pct: number; label: string; accent?: string; width?: number }) {
  return (
    <div style={{ width: '100%', maxWidth: width }}>
      <div style={{ height: 10, borderRadius: 999, background: pastoral.glassWarm, border: `1px solid ${pastoral.glassWarmBorder}`, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: accent ?? pastoral.accentMeadow, borderRadius: 999, transition: 'width 240ms cubic-bezier(0.25, 0.8, 0.35, 1)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, color: pastoral.inkSoft }}>
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

/** Faint drift of dusk motes. Decorative, collapses to still on reduced motion. */
export function MoteField({
  count = 16, reducedMotion = false, color = 'rgba(255,255,255,0.55)',
}: { count?: number; reducedMotion?: boolean; color?: string }) {
  const motes = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      left: (i * 37) % 100,
      top: (i * 53) % 100,
      size: 2 + (i % 3),
      delay: (i % 7) * 0.8,
      dur: 8 + (i % 5) * 2,
    })),
    [count],
  );
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
      {motes.map((m, i) => (
        <span
          key={i}
          style={{
            position: 'absolute', left: `${m.left}%`, top: `${m.top}%`,
            width: m.size, height: m.size, borderRadius: '50%', background: color,
            animation: reducedMotion ? 'none' : `sds-mote ${m.dur}s ease-in-out ${m.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
