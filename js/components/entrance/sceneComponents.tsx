// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 51 P6: shared presentation building blocks for the world-first
 * entrance, promoted from the bake-off shell. The world render, the dog
 * avatar, the loading bar, and the dusk motes. Pastoral tokens, no inline hex.
 */
import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
import { pastoral } from '../ui/tokens';
import type { World, Dog } from './worlds';

/** Absolute-fill scene backdrop: the fresh render over a gradient fallback. */
export function WorldImage({
  world, radius = 0, overlay, style, reducedMotion = false,
}: { world: World; radius?: number; overlay?: string; style?: CSSProperties; reducedMotion?: boolean }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  // Cycle 51 P11 blur-up: hold the gradient until the render decodes, then fade
  // it in. A cached/preloaded image is already `complete` on mount, so it shows
  // instantly with no gradient flash - which is the case on world switches (the
  // siblings are prefetched on idle) and on first paint (the armed backdrop is
  // <link rel=preload fetchpriority=high>ed in index.html).
  useEffect(() => {
    const img = imgRef.current;
    setLoaded(!!(img && img.complete && img.naturalWidth > 0));
  }, [world.render]);
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', background: world.gradient, ...style }}>
      <img
        ref={imgRef}
        src={world.render}
        alt=""
        aria-hidden="true"
        draggable={false}
        onLoad={() => setLoaded(true)}
        style={{
          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
          // Cycle 113 Phase 6: which column of a 16:9 hero a portrait crop
          // keeps. Per world, because the dog is in a different place in each.
          objectPosition: `${world.objectPosition ?? '50%'} center`,
          opacity: reducedMotion || loaded ? 1 : 0,
          transition: reducedMotion ? 'none' : 'opacity 500ms ease',
        }}
      />
      {overlay && <div style={{ position: 'absolute', inset: 0, background: overlay }} />}
    </div>
  );
}

/**
 * The armed world's name and tagline, set over the photograph (Cycle 113).
 * Shared by the entrance and the loading surface so the name does not move at
 * the moment the player presses Play.
 *
 * It also publishes `--sds-toast-top-offset`, which is the shared overlay
 * rail's existing knob for "start below this". The rail is fixed top-centre and
 * so is the masthead, so without it the WebGL-fallback notice lands on the
 * world's name - visible in the first Phase 6 capture. HudLayout publishes the
 * same variable for the in-game HUD; this is the entrance's half of that
 * contract rather than a second mechanism.
 */
export function Masthead({
  world, badge, children,
}: { world: World; badge?: ReactNode; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const publish = () => {
      document.documentElement.style.setProperty(
        '--sds-toast-top-offset',
        `${Math.ceil(el.getBoundingClientRect().bottom)}px`,
      );
    };
    publish();
    // Guarded: jsdom has no ResizeObserver, and neither did Safari before 13.1.
    // The resize listener alone still covers the case that actually moves this
    // box (an orientation change), so the fallback is not a stub.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    ro?.observe(el);
    window.addEventListener('resize', publish);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', publish);
      document.documentElement.style.removeProperty('--sds-toast-top-offset');
    };
  }, []);

  return (
    <div className="sds-ent-masthead" ref={ref}>
      <div className="sds-ent-world-name">{world.name}{badge}</div>
      <div className="sds-ent-world-tagline">{world.tagline}</div>
      {children}
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

/**
 * The calm pastoral loading bar, driven by the real per-stage build progress.
 *
 * Cycle 113 Phase 5: styling moved to css/entrance.css (`.sds-ent-bar*`). The
 * one inline value left is the fill width, which is a datum rather than a
 * style: it changes every build mark and there is no class that can express it.
 * Keeping it here rather than in LoadingScreen is deliberate, so the surface
 * itself carries no inline style at all, the same way WorldImage and DogAvatar
 * hold their own dynamic values.
 */
export function LoadingBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="sds-ent-bar">
      <div
        className="sds-ent-bar-track"
        role="progressbar"
        aria-label="Building the scene"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="sds-ent-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="sds-ent-bar-meta">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

// MoteField (decorative dusk motes) removed 2026-06-03 (Matt: "random white
// dots"). The entrance leads with the world render + the warm legibility
// gradient; no overlaid particle field.
