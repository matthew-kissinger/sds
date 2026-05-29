/**
 * IconButton Component
 *
 * A circular glass button sized for a single icon (the picker chevrons, close
 * affordances, HUD toggles). Pairs with a lucide-react icon as its child. The
 * scrim background and hairline border read tokens; the border alpha is a
 * color-mix() of the text token rather than a baked rgba.
 *
 * Cycle 47 P4: new token-driven .tsx primitive (no hex literals).
 */
import { type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { color, radius, duration } from './tokens';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
    children?: ReactNode;
    /** Square edge length in pixels. Default 40. */
    size?: number;
    style?: CSSProperties;
}

export function IconButton({ children, size = 40, style = {}, ...props }: IconButtonProps) {
    const buttonStyle: CSSProperties = {
        width: size,
        height: size,
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        background: color.surfaceScrim,
        border: `1px solid color-mix(in srgb, ${color.text} 18%, transparent)`,
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        color: color.text,
        cursor: 'pointer',
        transition: `background ${duration.instant}, border ${duration.instant}`,
        ...style,
    };

    return (
        <button type="button" style={buttonStyle} {...props}>
            {children}
        </button>
    );
}
