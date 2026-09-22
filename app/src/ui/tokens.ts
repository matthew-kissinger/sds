// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * The only styling authority for player-facing UI. Components describe roles
 * with class names; this module owns the colour, type, spacing, depth and motion
 * values behind those roles.
 */
export const UI_TOKENS = {
  color: {
    ink: '#30281f',
    inkSoft: '#625748',
    paper: '#f4ead7',
    paperSolid: '#eadfca',
    paperGlass: 'rgba(244, 234, 215, 0.84)',
    paperQuiet: 'rgba(244, 234, 215, 0.58)',
    /**
     * The fill for a control that sits ON the field rather than on a panel:
     * the touch buttons and the pause key. They are large, they are in the
     * corners a player is looking past, and at the 0.84 of `paperGlass` four
     * of them read as holes punched in the game. Sheer enough to see the
     * grass through, and legibility is bought back where it belongs - a full
     * `lineStrong` border so the target's extent is unambiguous, and the
     * halo on the label so the type does not have to rely on the fill.
     */
    paperSheer: 'rgba(244, 234, 215, 0.34)',
    /**
     * The fill for something that TRAVELS across the field instead of parking
     * at the edge of it. Everything on `paperSheer` is furniture a player
     * looks past; the gate cue crosses what they are looking AT, and at the
     * same 0.34 it reads as a coin sliding over the game. It can afford to be
     * thinner than the buttons because nothing has to hit it - there is no
     * target extent to make unambiguous, only a needle to keep readable, and
     * on dark grass it is this fill rather than any outline that keeps the
     * dark needle legible. Sampled against the field's own range, from bright
     * grass to cloud shadow to the barn roof, this is the sheerest value that
     * still carries the needle on the darkest of them.
     */
    paperDrift: 'rgba(244, 234, 215, 0.24)',
    line: 'rgba(92, 72, 47, 0.42)',
    lineStrong: '#745a3a',
    fieldGold: '#c69b58',
    fieldSage: '#81945f',
    marker: '#2f69b7',
    shadow: 'rgba(48, 35, 23, 0.2)',
  },
  /**
   * Text that sits on the live field rather than on paper. Three tight stops
   * rather than one wide blur: an 18px halo spreads too thin to lift 13px
   * type off moving grass. Anything using this must set it explicitly on a
   * <button>, because the user-agent stylesheet resets text-shadow there and
   * a button will not inherit it from its row.
   */
  halo: '0 0 3px #f4ead7, 0 0 7px #f4ead7, 0 1px 10px #f4ead7',
  /**
   * The same idea as `halo`, for a drawing rather than for text, and it is
   * deliberately NOT the same weight. `halo`'s three stops are sized to carry
   * 13px type, which is a scatter of thin strokes; put that behind a filled
   * 44px dial and every stop lands on the same disc, so the lift stops being
   * an edge and becomes an opaque coin with a bloom around it. That is the
   * whole of why the gate cue read as blocking the field rather than crossing
   * it. One stop at 1.5px is all a 1px stroke needs to separate from grass.
   */
  fieldLift: 'drop-shadow(0 0 1.5px rgba(244, 234, 215, 0.6))',
  space: {
    x1: '4px',
    x2: '8px',
    x3: '12px',
    x4: '16px',
    x5: '20px',
    x6: '28px',
    x7: '36px',
  },
  type: {
    /**
     * `--herd-font` and `--herd-display-font` are declared in `app/index.html`,
     * not here, and this module deliberately does not re-emit them. The static
     * shell paints its title before any bundle has parsed, so the families and
     * their `@font-face` rules have to exist in the document head; emitting a
     * second definition from here would mean two places to keep in step and a
     * visible reflow the moment React mounted. `spec/11-typography.md` records
     * the contract, including why display type has its own family.
     */
    keyFamily: 'system-ui, sans-serif',
    key: '11px',
    title: 'clamp(58px, 12vw, 126px)',
    display: 'clamp(42px, 8vw, 80px)',
    body: '17px',
    small: '13px',
    tracking: '0.08em',
    trackingWide: '0.14em',
  },
  radius: {
    round: '999px',
    panel: '30px',
    control: '18px',
    key: '4px',
  },
  z: {
    hud: 4,
    controls: 5,
    modal: 8,
    boot: 10,
  },
  motion: {
    quick: '150ms',
    normal: '220ms',
    slow: '300ms',
    ease: 'cubic-bezier(0.22, 0.72, 0.24, 1)',
  },
  target: {
    // One-pixel safety margin keeps transformed/mobile subpixels above the
    // 44 CSS-pixel interaction minimum in delivered Pages builds.
    minimum: '45px',
  },
} as const;

/** CSS variables are emitted from the typed source above, never restated. */
export function uiTokenVariables(): string {
  const t = UI_TOKENS;
  return `
    --herd-ink:${t.color.ink}; --herd-ink-soft:${t.color.inkSoft};
    --herd-paper:${t.color.paper}; --herd-paper-solid:${t.color.paperSolid};
    --herd-paper-glass:${t.color.paperGlass}; --herd-paper-quiet:${t.color.paperQuiet};
    --herd-paper-sheer:${t.color.paperSheer}; --herd-paper-drift:${t.color.paperDrift};
    --herd-line:${t.color.line}; --herd-line-strong:${t.color.lineStrong};
    --herd-gold:${t.color.fieldGold}; --herd-sage:${t.color.fieldSage};
    --herd-marker:${t.color.marker}; --herd-shadow:${t.color.shadow};
    --herd-halo:${t.halo}; --herd-field-lift:${t.fieldLift};
    --herd-s1:${t.space.x1}; --herd-s2:${t.space.x2}; --herd-s3:${t.space.x3};
    --herd-s4:${t.space.x4}; --herd-s5:${t.space.x5}; --herd-s6:${t.space.x6};
    --herd-s7:${t.space.x7};
    --herd-key-font:${t.type.keyFamily}; --herd-key-size:${t.type.key}; --herd-key-radius:${t.radius.key};
    --herd-title:${t.type.title}; --herd-display:${t.type.display};
    --herd-body:${t.type.body}; --herd-small:${t.type.small};
    --herd-track:${t.type.tracking}; --herd-track-wide:${t.type.trackingWide};
    --herd-round:${t.radius.round}; --herd-panel:${t.radius.panel};
    --herd-control:${t.radius.control}; --herd-z-hud:${t.z.hud};
    --herd-z-controls:${t.z.controls}; --herd-z-modal:${t.z.modal};
    --herd-z-boot:${t.z.boot}; --herd-quick:${t.motion.quick};
    --herd-normal:${t.motion.normal}; --herd-slow:${t.motion.slow};
    --herd-ease:${t.motion.ease}; --herd-target:${t.target.minimum};
  `.replace(/\s+/g, ' ').trim();
}
