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
    line: 'rgba(92, 72, 47, 0.42)',
    lineStrong: '#745a3a',
    fieldGold: '#c69b58',
    fieldSage: '#81945f',
    marker: '#2f69b7',
    shadow: 'rgba(48, 35, 23, 0.2)',
  },
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
    family: 'ui-serif, Georgia, "Times New Roman", serif',
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
    minimum: '44px',
  },
} as const;

/** CSS variables are emitted from the typed source above, never restated. */
export function uiTokenVariables(): string {
  const t = UI_TOKENS;
  return `
    --herd-ink:${t.color.ink}; --herd-ink-soft:${t.color.inkSoft};
    --herd-paper:${t.color.paper}; --herd-paper-solid:${t.color.paperSolid};
    --herd-paper-glass:${t.color.paperGlass}; --herd-paper-quiet:${t.color.paperQuiet};
    --herd-line:${t.color.line}; --herd-line-strong:${t.color.lineStrong};
    --herd-gold:${t.color.fieldGold}; --herd-sage:${t.color.fieldSage};
    --herd-marker:${t.color.marker}; --herd-shadow:${t.color.shadow};
    --herd-s1:${t.space.x1}; --herd-s2:${t.space.x2}; --herd-s3:${t.space.x3};
    --herd-s4:${t.space.x4}; --herd-s5:${t.space.x5}; --herd-s6:${t.space.x6};
    --herd-s7:${t.space.x7}; --herd-font:${t.type.family};
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
