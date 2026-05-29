/**
 * Card Component
 *
 * A selectable accent-framed surface — the scene/mode tile shape. The accent
 * defaults to the global accent token but each call site can pass a per-scene
 * accent. Alpha variants of the accent (the soft border and the glow shadow)
 * are derived with CSS color-mix() against the token color instead of the old
 * `${hex}33` string concatenation, which only worked on raw hex literals.
 *
 * Cycle 47 P4: new token-driven .tsx primitive. `active` swaps the hairline
 * accent border for a solid 2px frame plus a focus ring, matching the previous
 * inline picker-tile styling.
 */
import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { color, duration } from './tokens';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'style'> {
    children?: ReactNode;
    active?: boolean;
    accent?: string;
    radius?: string;
    style?: CSSProperties;
}

export function Card({
    children,
    active = false,
    accent = color.accent,
    radius = '1.25rem',
    style = {},
    ...props
}: CardProps) {
    const border = active
        ? `2px solid ${accent}`
        : `1px solid color-mix(in srgb, ${accent} 40%, transparent)`;

    const boxShadow = active
        ? `0 8px 28px color-mix(in srgb, ${accent} 20%, transparent), 0 0 0 4px color-mix(in srgb, ${accent} 13%, transparent)`
        : `0 8px 24px color-mix(in srgb, ${accent} 20%, transparent)`;

    const cardStyle: CSSProperties = {
        position: 'relative',
        overflow: 'hidden',
        borderRadius: radius,
        border,
        boxShadow,
        transition: `border ${duration.base}, box-shadow ${duration.base}`,
        ...style,
    };

    return (
        <div style={cardStyle} {...props}>
            {children}
        </div>
    );
}
