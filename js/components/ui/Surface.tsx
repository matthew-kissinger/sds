// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Surface Component
 *
 * The base glass primitive: a translucent white surface with a hairline border
 * and optional backdrop blur. Card, Badge, and the menu chrome compose on top
 * of this. The surface colors read design tokens (surfaceGlass, surfaceGlassBorder)
 * rather than raw rgba literals, so a theme change propagates from one place.
 *
 * Cycle 47 P4: new token-driven .tsx primitive (no prior .js equivalent — this
 * factors the repeated glass rgba surface out of inline call sites).
 */
import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { color } from './tokens';

export interface SurfaceProps extends Omit<HTMLAttributes<HTMLDivElement>, 'style'> {
    children?: ReactNode;
    /** Apply a 20px backdrop blur. Default true. */
    blur?: boolean;
    radius?: string;
    style?: CSSProperties;
}

export function Surface({ children, blur = true, radius = '1rem', style = {}, ...props }: SurfaceProps) {
    const surfaceStyle: CSSProperties = {
        background: color.surfaceGlass,
        border: `1px solid ${color.surfaceGlassBorder}`,
        borderRadius: radius,
        ...(blur ? { backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } : {}),
        ...style,
    };

    return (
        <div style={surfaceStyle} {...props}>
            {children}
        </div>
    );
}
