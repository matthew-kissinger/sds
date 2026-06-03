/**
 * Cycle 51 P6: the production icon system, promoted from the bake-off shell
 * (js/mockups/shell/icons.tsx) into the live app. Semantic names route to a
 * single source so callers write <Icon name="play" /> and never re-draw a path.
 * Today that source is lucide-react plus two custom glyphs (sheep, dog) that
 * lucide lacks; when Pixel Forge bakes the bespoke pastoral set, the swap is
 * centralized here. This replaces the duplicated inline SVG paths in the old
 * HUD (P8 migrates the HUD readouts onto it).
 */
import type { CSSProperties } from 'react';
import {
  Play, Settings, Trophy, Users, Pencil, Gamepad2, Pause, Timer, Gauge,
  Maximize2, Navigation, Volume2, ChevronLeft, ChevronRight, X, Check,
} from 'lucide-react';

const LUCIDE = {
  play: Play,
  settings: Settings,
  trophy: Trophy,
  users: Users,
  sandbox: Pencil,
  local: Gamepad2,
  pause: Pause,
  timer: Timer,
  stamina: Gauge,
  fullscreen: Maximize2,
  compass: Navigation,
  sound: Volume2,
  prev: ChevronLeft,
  next: ChevronRight,
  close: X,
  check: Check,
} as const;

export type IconName = keyof typeof LUCIDE | 'sheep' | 'dog';

function SheepGlyph({ size, color }: { size: number; color: string }) {
  // Single canonical sheep mark (a soft fleece silhouette), the one source for
  // every sheep-count readout across the app.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.5 10.5c-1.4 0-2.5-1-2.5-2.3 0-1.2 1-2.2 2.3-2.2.3-1 1.3-1.8 2.5-1.8.7 0 1.3.3 1.8.7.5-.4 1.1-.7 1.9-.7 1.2 0 2.2.8 2.5 1.8 1.3 0 2.3 1 2.3 2.2 0 1.3-1.1 2.3-2.5 2.3"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
      <ellipse cx="12" cy="13.5" rx="5.2" ry="4.3" stroke={color} strokeWidth="1.5" />
      <path d="M8.5 17.5v2M15.5 17.5v2M10.7 11.8c.4.4 1 .6 1.3.6s.9-.2 1.3-.6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function DogGlyph({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8l2-2 2 1h6l2-1 2 2v3c0 4-2.5 7-6 7s-6-3-6-7V8z"
        stroke={color} strokeWidth="1.5" strokeLinejoin="round"
      />
      <path d="M10 13h.01M14 13h.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M11 16c.3.3.7.4 1 .4s.7-.1 1-.4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, color = 'currentColor', style, strokeWidth = 2 }: IconProps) {
  if (name === 'sheep') return <span style={style}><SheepGlyph size={size} color={color} /></span>;
  if (name === 'dog') return <span style={style}><DogGlyph size={size} color={color} /></span>;
  const C = LUCIDE[name] ?? Play;
  return <C size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}
