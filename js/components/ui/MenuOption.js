/**
 * MenuOption Component
 * Clickable menu item with optional icon, label, description, and arrow
 *
 * Architecture: Tailwind for layout/typography, inline styles for dynamic colors
 *
 * Type scale usage:
 * - Label: text-md (16px) desktop, text-base (14px) compact
 * - Description: text-sm (12px) desktop, text-xs (10px) compact
 */
import { useResponsive } from '../hooks/usePlatform.js';

const { createElement, useState } = window.React;

const DEFAULT_ACCENT = '#3b82f6';

/**
 * MenuOption - Single menu item button
 */
export function MenuOption({
    label,
    description,
    icon,
    accentColor = DEFAULT_ACCENT,
    showArrow = true,
    onClick,
    style = {},
    className = '',
    ...props
}) {
    const { isCompact, isVeryCompact, isLandscapeMobile } = useResponsive();
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
    const buttonStyle = {
        background: isHovered
            ? `linear-gradient(135deg, ${accentColor}22, ${accentColor}11)`
            : 'rgba(255, 255, 255, 0.05)',
        border: isHovered
            ? `1px solid ${accentColor}44`
            : '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: isHovered
            ? `0 4px 16px ${accentColor}22`
            : '0 3px 12px rgba(0, 0, 0, 0.08)',
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
        ...style
    };

    // Indicator dot
    const indicatorDot = createElement('div', {
        key: 'indicator',
        className: `${dotSize} rounded-full flex-shrink-0`,
        style: {
            background: accentColor,
            boxShadow: `0 0 8px ${accentColor}66`
        }
    });

    return createElement('button', {
        className: `
            ${paddingClass} ${radiusClass}
            w-full text-left cursor-pointer
            backdrop-blur-lg
            transition-all duration-300
            outline-none
            ${className}
        `.trim().replace(/\s+/g, ' '),
        style: buttonStyle,
        onClick,
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
        ...props
    },
        createElement('div', {
            className: `flex items-center justify-between ${gapClass}`
        }, [
            createElement('div', {
                key: 'left',
                className: `flex items-center ${gapClass} min-w-0 flex-1`
            }, [
                // Show icon on desktop, dot on mobile
                isCompact ? indicatorDot : (icon || indicatorDot),
                createElement('div', {
                    key: 'text',
                    className: 'min-w-0 flex-1'
                }, [
                    // Label with type scale
                    createElement('div', {
                        key: 'label',
                        className: `${labelClass} font-semibold truncate transition-colors duration-300`,
                        style: { color: isHovered ? accentColor : '#fff' }
                    }, label),
                    // Description - hide on very compact
                    description && !isVeryCompact && createElement('div', {
                        key: 'desc',
                        className: `${descClass} text-white/50 truncate mt-0.5`
                    }, description)
                ])
            ]),
            showArrow && createElement('span', {
                key: 'arrow',
                className: `${arrowClass} text-white/50 flex-shrink-0`
            }, '\u2192')
        ])
    );
}

/**
 * MenuOptionGrid - Container for MenuOption items
 */
export function MenuOptionGrid({ children, className = '' }) {
    const { isCompact, isLandscapeMobile } = useResponsive();

    const gapClass = isLandscapeMobile ? 'gap-1.5' : isCompact ? 'gap-2' : 'gap-3';

    return createElement('div', {
        className: `flex flex-col ${gapClass} w-full ${className}`
    }, children);
}
