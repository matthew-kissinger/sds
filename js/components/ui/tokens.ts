/**
 * Cycle 47 design tokens — typed mirror of the css/main.css @theme block.
 *
 * One source of truth for color/radius/motion lives in the Tailwind @theme
 * layer. This module exposes the same tokens to inline-style call sites and
 * .tsx primitives as `var(--token)` strings, so a converted component reads
 * `tokens.color.accent` instead of a raw hex literal. Tailwind v4 emits every
 * @theme var to :root, so the var() references resolve in React inline styles.
 *
 * Keep this file in lockstep with the @theme block: add a token in CSS, mirror
 * it here; remove one, remove it here.
 */

export const color = {
  accent: 'var(--color-accent)',
  accentStrong: 'var(--color-accent-strong)',
  accentSoft: 'var(--color-accent-soft)',

  sceneRollingHills: 'var(--color-scene-rolling-hills)',
  sceneOpenCountry: 'var(--color-scene-open-country)',
  sceneField: 'var(--color-scene-field)',

  danger: 'var(--color-danger)',
  dangerSoft: 'var(--color-danger-soft)',
  warn: 'var(--color-warn)',
  warnStrong: 'var(--color-warn-strong)',
  success: 'var(--color-success)',
  info: 'var(--color-info)',
  infoStrong: 'var(--color-info-strong)',
  // Cycle 48 P3: lighter info (blue-300) for the leaderboard player-row
  // highlight + clear-filter affordance; distinct from info (#60a5fa).
  infoSoft: 'var(--color-info-soft)',

  // Cycle 48 P1: HUD readout accents. The stamina ramp green/red stops reuse
  // accent/success/danger/dangerSoft; only the amber + orange mid-stops need
  // their own token. Objective progress fills + the practice-hint glass too.
  staminaAmber: 'var(--color-stamina-amber)',
  staminaOrange: 'var(--color-stamina-orange)',
  objectiveHold: 'var(--color-objective-hold)',
  objectiveGather: 'var(--color-objective-gather)',
  hintSurface: 'var(--color-hint-surface)',
  hintBorder: 'var(--color-hint-border)',
  hintText: 'var(--color-hint-text)',

  // Cycle 48 P2: menu + dog selection accent hues. Decorative per-tile brand
  // colors. Emerald/red/amber/orange/blue reuse accent/danger/staminaAmber/
  // staminaOrange/infoStrong; only these four needed a new token.
  hueCyan: 'var(--color-hue-cyan)',
  huePurple: 'var(--color-hue-purple)',
  huePink: 'var(--color-hue-pink)',
  hueViolet: 'var(--color-hue-violet)',

  // Foreground text/icon on dark + glass surfaces.
  text: 'var(--color-text)',
  onAccent: 'var(--color-on-accent)',
  dangerText: 'var(--color-danger-text)',
  dangerTextStrong: 'var(--color-danger-text-strong)',

  rankGold: 'var(--color-rank-gold)',
  rankSilver: 'var(--color-rank-silver)',
  rankBronze: 'var(--color-rank-bronze)',

  titleBright: 'var(--color-title-bright)',
  titleMid: 'var(--color-title-mid)',
  titleDeep: 'var(--color-title-deep)',
  titleShadow: 'var(--color-title-shadow)',

  surfaceGlass: 'var(--color-surface-glass)',
  surfaceGlassBorder: 'var(--color-surface-glass-border)',
  surfaceScrim: 'var(--color-surface-scrim)',
  // Cycle 48 P3: opaque slate backing for native <select><option> menus, which
  // ignore translucent surfaces and would render near-white on the dark page.
  surfaceSelect: 'var(--color-surface-select)',

  brandIndigo: 'var(--color-brand-indigo)',
} as const;

/**
 * A color at `percent`% opacity composited over transparent. The token-safe
 * replacement for an 8-digit `#rrggbbaa` hex suffix: color-mix() resolves a
 * `var(--color-x)` token, which the old string concatenation (`${hex}22`)
 * could not. Byte-to-percent for the common suffixes: 0x11≈7, 0x22≈13,
 * 0x33≈20, 0x44≈27, 0x66≈40, 0x88≈53, 0xdd≈87.
 */
export const alpha = (c: string, percent: number): string =>
  `color-mix(in srgb, ${c} ${percent}%, transparent)`;

export const radius = {
  pill: 'var(--radius-pill)',
} as const;

export const duration = {
  instant: 'var(--duration-instant)',
  fast: 'var(--duration-fast)',
  base: 'var(--duration-base)',
  slow: 'var(--duration-slow)',
} as const;

/** Raw millisecond values for JS timers / Motion configs that need a number. */
export const durationMs = {
  instant: 160,
  fast: 200,
  base: 240,
  slow: 320,
} as const;

export const easing = {
  emphasized: 'var(--ease-emphasized)',
} as const;

/** Raw cubic-bezier for Motion / canvas contexts that need the literal value. */
export const easingValue = {
  emphasized: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
} as const;

/** Per-scene accent lookup keyed by scene id (matches SCENE_CHROME ids). */
export const sceneAccent: Record<string, string> = {
  'rolling-hills': color.sceneRollingHills,
  'open-country': color.sceneOpenCountry,
  field: color.sceneField,
};

export const tokens = {
  color,
  radius,
  duration,
  durationMs,
  easing,
  easingValue,
  sceneAccent,
} as const;

export default tokens;
