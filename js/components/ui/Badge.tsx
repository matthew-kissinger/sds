// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Badge Component
 *
 * A small uppercase pill label — the "NEW", "LOCKED", scene-difficulty tags.
 * Three tones map to the danger / accent / neutral token families; the glow
 * shadow is a color-mix() alpha of the tone color. Foreground colors use the
 * text / on-accent tokens so the label stays legible on each tone.
 *
 * Cycle 47 P4: new token-driven .tsx primitive (no hex literals).
 */
import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { color, radius } from './tokens';

export type BadgeTone = 'danger' | 'accent' | 'neutral';

interface ToneTheme {
    background: string;
    foreground: string;
    glow: string;
}

const TONE: Record<BadgeTone, ToneTheme> = {
    danger: {
        background: color.danger,
        foreground: color.text,
        glow: `color-mix(in srgb, ${color.danger} 45%, transparent)`,
    },
    accent: {
        background: color.accent,
        foreground: color.onAccent,
        glow: `color-mix(in srgb, ${color.accent} 55%, transparent)`,
    },
    neutral: {
        background: color.surfaceGlass,
        foreground: color.text,
        glow: 'transparent',
    },
};

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'style'> {
    children?: ReactNode;
    tone?: BadgeTone;
    style?: CSSProperties;
}

export function Badge({ children, tone = 'neutral', style = {}, ...props }: BadgeProps) {
    const theme = TONE[tone];

    const badgeStyle: CSSProperties = {
        display: 'inline-block',
        padding: '2px 9px',
        fontSize: '0.62rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        borderRadius: radius.pill,
        background: theme.background,
        color: theme.foreground,
        boxShadow: `0 2px 6px ${theme.glow}`,
        ...style,
    };

    return (
        <span style={badgeStyle} {...props}>
            {children}
        </span>
    );
}
