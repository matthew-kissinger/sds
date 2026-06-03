// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Panel Component
 *
 * Glassmorphism container used for menus, dialogs, and HUD elements. Layout is
 * Tailwind utility classes; the glass surface itself lives in the `.ui-panel`
 * CSS class (css/main.css), so this component only owns padding/centering and
 * the responsive type scale of its title.
 *
 * Cycle 47 P4: converted from createElement .js to .tsx. No hex literals here
 * (the glass surface is the `.ui-panel` class; the title shadow is a neutral
 * black rgba). Behavior is identical to the previous Panel.js.
 */
import { type HTMLAttributes, type ReactNode } from 'react';
import { useResponsive } from '../hooks/usePlatform.js';

// useResponsive() comes from untyped JS; the shape we read is stable.
type ResponsiveInfo = { isCompact?: boolean; isLandscapeMobile?: boolean };

export type PanelSize = 'sm' | 'md' | 'lg';

const PADDING: Record<PanelSize, { landscape: string; compact: string; default: string }> = {
    sm: { landscape: 'p-1.5', compact: 'p-2', default: 'p-3' },
    md: { landscape: 'p-3', compact: 'p-4', default: 'p-6' },
    lg: { landscape: 'p-4', compact: 'p-6', default: 'p-10' },
};

function pick(responsive: ResponsiveInfo, values: { landscape: string; compact: string; default: string }) {
    if (responsive.isLandscapeMobile) return values.landscape;
    if (responsive.isCompact) return values.compact;
    return values.default;
}

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
    children?: ReactNode;
    size?: PanelSize;
    centered?: boolean;
    maxWidth?: string;
    className?: string;
}

export function Panel({
    children,
    size = 'md',
    centered = false,
    maxWidth = '',
    className = '',
    ...props
}: PanelProps) {
    const responsive = useResponsive() as ResponsiveInfo;

    const paddingClass = pick(responsive, PADDING[size]);
    const centerClass = centered ? 'flex flex-col items-center' : '';

    return (
        <div className={`ui-panel w-full ${paddingClass} ${centerClass} ${maxWidth} ${className}`.trim()} {...props}>
            {children}
        </div>
    );
}

export interface PanelTitleProps extends HTMLAttributes<HTMLHeadingElement> {
    children?: ReactNode;
    className?: string;
}

export function PanelTitle({ children, className = '', ...props }: PanelTitleProps) {
    const responsive = useResponsive() as ResponsiveInfo;

    const textClass = responsive.isLandscapeMobile ? 'text-md' : responsive.isCompact ? 'text-lg' : 'text-xl';
    const marginClass = responsive.isLandscapeMobile ? 'mb-2' : responsive.isCompact ? 'mb-3' : 'mb-6';

    return (
        <h2
            className={`${textClass} font-bold text-center text-white ${marginClass} ${className}`.trim()}
            style={{ textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)' }}
            {...props}
        >
            {children}
        </h2>
    );
}
