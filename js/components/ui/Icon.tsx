// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 51 P8: the bespoke pastoral icon system.
 *
 * One hand-authored vector family - outline line-art at a soft 1.7 stroke with
 * rounded caps and joins - covering the UI chrome the app names (HUD, entrance,
 * chrome). This replaces the lucide-react + 2-glyph version: lucide is dropped
 * entirely (no third-party set, no dependency) so the look is cohesive and ours.
 *
 * No fallback by design (Cycle 51 rule): a missing name throws rather than
 * silently rendering a default glyph, so a typo surfaces in testing instead of
 * hiding behind a stand-in. Callers are typed against IconName, so a bad name
 * can only reach here through an untyped cast - exactly the case we want loud.
 *
 * Two render models live here: the hand-authored UI chrome (stroke, 24x24,
 * GLYPHS) and a small set of illustrated creature marks (filled, their own
 * viewBox, ILLUSTRATED). The sheep is Microsoft Fluent Emoji "ewe" (MIT) - a
 * polished high-contrast monochrome icon that tints via currentColor like the
 * rest. A hand-authored sheep kept reading as a turtle; the sourced one reads.
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

  // creature marks
  // The sheep is an illustrated mark (filled, 32x32) - see ILLUSTRATED below.
  dog: (
    <>
      <path d="M4 8l2-2 2 1h6l2-1 2 2v3c0 4-2.5 7-6 7s-6-3-6-7V8z" />
      <path d="M10 13h.01M14 13h.01" strokeWidth={2.4} />
      <path d="M11 16c.3.3.7.4 1 .4s.7-.1 1-.4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

/**
 * Illustrated creature marks: complete, self-contained icons with their own
 * viewBox, filled rather than stroked. Sourced from a polished open set because
 * a legible hand-authored sheep proved elusive (it kept reading as a turtle).
 *
 * sheep - Microsoft Fluent Emoji "ewe", MIT-licensed, (c) Microsoft. Recoloured
 * to a single currentColor fill so it tints exactly like the stroke glyphs;
 * geometry unchanged. Source: https://github.com/microsoft/fluentui-emoji (see
 * LICENSING.md). The original full-rect clipPath was a no-op and was dropped.
 */
const ILLUSTRATED = {
  sheep: {
    viewBox: '0 0 32 32',
    body: (
      <g fill="currentColor">
        <path d="M11.19 7.53a.313.313 0 0 0-.48.04c-.52.78-.44 1.84.24 2.53l.01.01c.69.69 1.78.8 2.56.28c.17-.11.19-.34.05-.48zm-4.7 2.01c-.278 0-.5-.24-.5-.54v-.81c0-.3.222-.54.5-.54s.5.24.5.54V9c0 .3-.231.54-.5.54" />
        <path d="M9.721 0a4.4 4.4 0 0 0-2.89 1.034H5.6A3.59 3.59 0 0 0 2.041 4.02a3.44 3.44 0 0 0 .492 2.363L.94 7.967A3.2 3.2 0 0 0 0 10.229a3.77 3.77 0 0 0 2.005 3.328a3.64 3.64 0 0 0 2 3.056v2.857a5.01 5.01 0 0 0 4.106 4.92A3.06 3.06 0 0 0 9 25.837v2.823A2.343 2.343 0 0 0 11.34 31h1.36a2.3 2.3 0 0 0 2.3-2.34V27.6a5 5 0 0 0 .886-1.642c.479-.383.83-.902 1.007-1.489H18v1.071c0 .56.46 1.02 1.02 1.02v.98c0 .16-.04.31-.11.45l-1.8 2.53c-.11.22.05.49.3.49h2.12c.32 0 .55-.16.81-.4l2.59-2.37c.29-.25.34-.65.34-1.01v-.617q.09.006.18.006h.777L26 27.844v.826a2.3 2.3 0 0 0 2.31 2.34h1.35A2.343 2.343 0 0 0 32 28.67v-4.42a3.7 3.7 0 0 0-1.016-2.542L30 20.594v-1.75a3.03 3.03 0 0 0 2-2.874v-.91a7.53 7.53 0 0 0-7.52-7.52a8.8 8.8 0 0 0-2.395.336l-5.977 1.709l-1.879-3.759a4 4 0 0 0-.229-.4V4.243A4.28 4.28 0 0 0 9.8 0zm0 2h.042A2.263 2.263 0 0 1 12 4.243V6h-.087c.214.21.392.453.527.72l1.93 3.86a.2.2 0 0 0 .02.04a1.86 1.86 0 0 0 1.656.985q.271 0 .534-.075l6.05-1.73a6.8 6.8 0 0 1 1.85-.26A5.52 5.52 0 0 1 30 15.06v.91a1 1 0 0 1-.93 1.03a.985.985 0 0 1-1.07-.963V16v4.98c.003.267.11.522.3.71l1.21 1.37c.313.317.488.745.49 1.19v4.42a.336.336 0 0 1-.34.34h-1.35a.31.31 0 0 1-.31-.34v-1.54a.7.7 0 0 0-.31-.55l-2.84-1.96h-1.4a1.024 1.024 0 0 1-1.02-1.02v-1.13h-7.41v1.13a1.025 1.025 0 0 1-.9 1.013a3.02 3.02 0 0 1-.875 1.957a.72.72 0 0 0-.24.48v1.61a.306.306 0 0 1-.3.34H11.34a.336.336 0 0 1-.34-.34v-4.04a1.025 1.025 0 0 1-1-1.02v-1.13H9a3 3 0 0 1-3-3V15h-.37A1.63 1.63 0 0 1 4 13.37V13h2.698a2.58 2.58 0 0 0 2.58-2.571V7.856c0-.457.176-.872.459-1.18L11.277 5H6.03c-.446 0-.869.18-1.171.48l-.247.246a1.46 1.46 0 0 1-.595-1.4A1.575 1.575 0 0 1 5.6 3.034h1.672a.88.88 0 0 0 .678-.3A2.3 2.3 0 0 1 9.721 2m-5.94 10c-.474 0-.905-.184-1.224-.483L2.334 11H3a.5.5 0 0 0 0-1h-.978a1.2 1.2 0 0 1 .328-.615L5.564 6.19A.67.67 0 0 1 6.03 6H9a2.74 2.74 0 0 0-.721 1.856v2.573A1.58 1.58 0 0 1 6.699 12zm-1.224-.483L2.334 11h-.156a1.8 1.8 0 0 0 .379.517" />
      </g>
    ),
  },
} satisfies Record<string, { viewBox: string; body: ReactNode }>;

export type IconName = keyof typeof GLYPHS | keyof typeof ILLUSTRATED;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, color = 'currentColor', style, strokeWidth = 1.7 }: IconProps) {
  // Illustrated marks (filled, their own viewBox) render directly; UI chrome
  // goes through the shared 24x24 stroke wrapper below.
  const illustrated = (ILLUSTRATED as Record<string, { viewBox: string; body: ReactNode }>)[name];
  if (illustrated) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={illustrated.viewBox}
        fill="currentColor"
        style={{ color, ...style }}
        aria-hidden="true"
      >
        {illustrated.body}
      </svg>
    );
  }
  const glyph = (GLYPHS as Record<string, ReactNode>)[name];
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
      style={{ color, ...style }}
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}
