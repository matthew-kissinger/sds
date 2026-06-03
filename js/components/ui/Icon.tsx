/**
 * Cycle 51 P8: the bespoke pastoral icon system.
 *
 * One hand-authored vector family - outline line-art at a soft 1.7 stroke with
 * rounded caps and joins - covering every IconName the app names (HUD, entrance,
 * chrome). This replaces the lucide-react + 2-glyph version: lucide is dropped
 * entirely (no third-party set, no dependency) so the look is cohesive and ours.
 *
 * No fallback by design (Cycle 51 rule): a missing name throws rather than
 * silently rendering a default glyph, so a typo surfaces in testing instead of
 * hiding behind a stand-in. Callers are typed against IconName, so a bad name
 * can only reach here through an untyped cast - exactly the case we want loud.
 *
 * Crisp tintable UI chrome is vector and lives here; raster art (dog portraits,
 * in-world props) is Pixel Forge's job, not this file's.
 */
import type { CSSProperties, ReactNode } from 'react';

// Each entry is the inner geometry of a 24x24 viewBox. The shared <svg> wrapper
// supplies stroke (currentColor by default, so icons tint with surrounding
// text), fill:none, and rounded caps/joins. A few "dot" marks use a short
// `h.01` segment with a thicker round cap so they read as filled pips while
// still tinting via stroke. Keep every glyph legible at 16-28px.
const GLYPHS = {
  // playback / flow
  play: <path d="M9 7.2 16.6 12 9 16.8 Z" />,
  pause: (
    <>
      <path d="M9.5 7.5V16.5" />
      <path d="M14.5 7.5V16.5" />
    </>
  ),
  replay: (
    <>
      <path d="M19 12a7 7 0 1 1-2-4.9" />
      <path d="M17 4v3.6h-3.6" />
    </>
  ),

  // navigation / chrome
  prev: <path d="M14.5 7l-5 5 5 5" />,
  next: <path d="M9.5 7l5 5-5 5" />,
  close: <path d="M7 7l10 10M17 7L7 17" />,
  check: <path d="M6 12.4l3.8 3.8L18 7.6" />,
  menu: <path d="M5 8h14M5 12h14M5 16h14" />,
  home: (
    <>
      <path d="M4 11.5 12 5l8 6.5" />
      <path d="M6 10.5V19h12v-8.5" />
      <path d="M10.5 19v-4.5h3V19" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.6h.01" strokeWidth={2.2} />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4.5V6.5M12 17.5V19.5M4.5 12H6.5M17.5 12H19.5M6.7 6.7l1.4 1.4M15.9 15.9l1.4 1.4M17.3 6.7l-1.4 1.4M8.1 15.9l-1.4 1.4" />
    </>
  ),
  fullscreen: (
    <>
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </>
  ),
  sound: (
    <>
      <path d="M5 10h3l4-3.5v11L8 14H5z" />
      <path d="M15.5 9.5a4 4 0 0 1 0 5" />
      <path d="M17.8 7.4a7 7 0 0 1 0 9.2" />
    </>
  ),

  // destinations / modes
  trophy: (
    <>
      <path d="M8 5h8v3a4 4 0 0 1-8 0V5z" />
      <path d="M8 6H6a2 2 0 0 0 2 3.4" />
      <path d="M16 6h2a2 2 0 0 1-2 3.4" />
      <path d="M12 12v3" />
      <path d="M9.5 18h5" />
      <path d="M10.6 15h2.8l-.4 3h-2z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.6" r="2.6" />
      <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
      <path d="M15 6.3a2.6 2.6 0 0 1 0 4.8" />
      <path d="M16 13.5a4.5 4.5 0 0 1 3.5 4.5" />
    </>
  ),
  sandbox: (
    <>
      <path d="M5 19l.8-3.3L15 6.5l2.5 2.5L8.3 18.2z" />
      <path d="M13.7 7.8l2.5 2.5" />
    </>
  ),
  local: (
    <>
      <rect x="3.5" y="9" width="17" height="7" rx="3.5" />
      <path d="M7 11v3M5.5 12.5h3" />
      <path d="M16 11.7h.01M17.6 13.6h.01" strokeWidth={2.4} />
    </>
  ),

  // in-game HUD readouts
  timer: (
    <>
      <circle cx="12" cy="13.5" r="6.5" />
      <path d="M12 13.5V9.6" />
      <path d="M12 13.5l2.6 1.6" />
      <path d="M9.7 3.6h4.6" />
      <path d="M12 3.6v3.4" />
    </>
  ),
  stamina: (
    <>
      <path d="M5 16.5a7 7 0 0 1 14 0" />
      <path d="M12 16.5l3.2-3.8" />
      <path d="M12 16.5h.01" strokeWidth={2.4} />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.8 14.4 12 7l2.2 7.4L12 12.4z" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L18 8h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.1" />
    </>
  ),
  sprint: <path d="M13 3 6.5 13H11l-1 8 7.5-11H12.5z" />,
  zoomIn: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M10.5 7.8v5.4M7.8 10.5h5.4" />
      <path d="M15 15l4.2 4.2" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M7.8 10.5h5.4" />
      <path d="M15 15l4.2 4.2" />
    </>
  ),

  // creature marks (canonical sheep + dog, carried from the prior bespoke pair)
  sheep: (
    <>
      <path d="M7.5 10.5c-1.4 0-2.5-1-2.5-2.3 0-1.2 1-2.2 2.3-2.2.3-1 1.3-1.8 2.5-1.8.7 0 1.3.3 1.8.7.5-.4 1.1-.7 1.9-.7 1.2 0 2.2.8 2.5 1.8 1.3 0 2.3 1 2.3 2.2 0 1.3-1.1 2.3-2.5 2.3" />
      <ellipse cx="12" cy="13.5" rx="5.2" ry="4.3" />
      <path d="M8.5 17.5v2M15.5 17.5v2M10.7 11.8c.4.4 1 .6 1.3.6s.9-.2 1.3-.6" />
    </>
  ),
  dog: (
    <>
      <path d="M4 8l2-2 2 1h6l2-1 2 2v3c0 4-2.5 7-6 7s-6-3-6-7V8z" />
      <path d="M10 13h.01M14 13h.01" strokeWidth={2.4} />
      <path d="M11 16c.3.3.7.4 1 .4s.7-.1 1-.4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof GLYPHS;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, color = 'currentColor', style, strokeWidth = 1.7 }: IconProps) {
  const glyph = GLYPHS[name];
  if (glyph === undefined) {
    // No fallback by design - surface the bad name loudly (see file header).
    throw new Error(`Icon: unknown name "${String(name)}" (no fallback by design)`);
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}
