// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * MenuOption Component
 * Clickable menu item with optional icon, label, description, and arrow.
 *
 * Architecture: Tailwind for layout/typography, inline styles for dynamic
 * (per-tile accent) colors.
 *
 * Cycle 48 P2: converted from the element-factory .js to token-driven .tsx.
 * The accent alpha tints that were hex-suffix concatenations (`${accent}22`)
 * are now color-mix() blends, so the accent can be a design token (a
 * `var(--color-...)` string) instead of a raw hex literal. The byte-to-percent
 * map preserves the prior look: 0x22 -> 13%, 0x11 -> 7%, 0x44 -> 27%,
 * 0x66 -> 40%. The default accent reads the info-strong token directly (the
 * old named constant held the same value as a raw hex). Behavior is identical
 * to the previous MenuOption.js.
 *
 * Type scale usage:
 * - Label: text-md (16px) desktop, text-base (14px) compact
 * - Description: text-sm (12px) desktop, text-xs (10px) compact
 */
import { useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { useResponsive } from '../hooks/usePlatform.js';
import { alpha, color } from './tokens';

// useResponsive() comes from untyped JS; the shape we read is stable.
type ResponsiveInfo = { isCompact?: boolean; isVeryCompact?: boolean; isLandscapeMobile?: boolean };

export interface MenuOptionProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
    label: ReactNode;
    description?: ReactNode;
    icon?: ReactNode;
    accentColor?: string;
    showArrow?: boolean;
    style?: CSSProperties;
    className?: string;
}

export function MenuOption({
    label,
    description,
    icon,
    accentColor = color.infoStrong,
    showArrow = true,
    onClick,
    style = {},
    className = '',
    ...props
}: MenuOptionProps) {
    const { isCompact, isVeryCompact, isLandscapeMobile } = useResponsive() as ResponsiveInfo;
    const [isHovered, setIsHovered] = useState(false);

    // Responsive classes
    const paddingClass = isLandscapeMobile ? 'py-2 px-3' : isCompact ? 'p-3' : 'p-5';
    const radiusClass = isCompact ? 'rounded-xl' : 'rounded-2xl';
    const gapClass = isCompact ? 'gap-2' : 'gap-3';

    // Type scale classes
    const labelClass = isLandscapeMobile ? 'text-sm' : isCompact ? 'text-base' : 'text-md';
    const descClass = isLandscapeMobile ? 'text-xs' : isCompact ? 'text-xs' : 'text-sm';
    const arrowClass = isCompact ? 'text-base' : 'text-md';

    // Indicator dot size
    const dotSize = isCompact ? 'w-1.5 h-1.5' : 'w-2 h-2';

    // Dynamic styles (colors that change based on props)
    const buttonStyle: CSSProperties = {
        background: isHovered
            ? `linear-gradient(135deg, ${alpha(accentColor, 13)}, ${alpha(accentColor, 7)})`
            : 'rgba(255, 255, 255, 0.05)',
        border: isHovered
            ? `1px solid ${alpha(accentColor, 27)}`
            : '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: isHovered
            ? `0 4px 16px ${alpha(accentColor, 13)}`
            : '0 3px 12px rgba(0, 0, 0, 0.08)',
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
        ...style,
    };

    // Indicator dot
    const indicatorDot = (
        <div
            className={`${dotSize} rounded-full flex-shrink-0`}
            style={{ background: accentColor, boxShadow: `0 0 8px ${alpha(accentColor, 40)}` }}
        />
    );

    return (
        <button
            className={`
                ${paddingClass} ${radiusClass}
                w-full text-left cursor-pointer
                backdrop-blur-lg
                transition-all duration-300
                outline-none
                ${className}
            `.trim().replace(/\s+/g, ' ')}
            style={buttonStyle}
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            {...props}
        >
            <div className={`flex items-center justify-between ${gapClass}`}>
                <div className={`flex items-center ${gapClass} min-w-0 flex-1`}>
                    {/* Show icon on desktop, dot on mobile */}
                    {isCompact ? indicatorDot : <span>{icon || indicatorDot}</span>}
                    <div className="min-w-0 flex-1">
                        <div
                            className={`${labelClass} font-semibold truncate transition-colors duration-300`}
                            style={{ color: isHovered ? accentColor : color.text }}
                        >
                            {label}
                        </div>
                        {description && !isVeryCompact && (
                            <div className={`${descClass} text-white/50 truncate mt-0.5`}>{description}</div>
                        )}
                    </div>
                </div>
                {showArrow && (
                    <span className={`${arrowClass} text-white/50 flex-shrink-0`}>{'→'}</span>
                )}
            </div>
        </button>
    );
}

export interface MenuOptionGridProps {
    children?: ReactNode;
    className?: string;
}

export function MenuOptionGrid({ children, className = '' }: MenuOptionGridProps) {
    const { isCompact, isLandscapeMobile } = useResponsive() as ResponsiveInfo;

    const gapClass = isLandscapeMobile ? 'gap-1.5' : isCompact ? 'gap-2' : 'gap-3';

    return <div className={`flex flex-col ${gapClass} w-full ${className}`}>{children}</div>;
}
