/**
 * Panel Component
 * Glassmorphism container used for menus, dialogs, HUD elements
 *
 * Architecture: Uses Tailwind for layout, CSS class for glassmorphism
 */
import React, { createElement } from 'react';
import { useResponsive } from '../hooks/usePlatform.js';

/**
 * Panel - Glassmorphism container
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Content
 * @param {'sm'|'md'|'lg'} props.size - Padding size (default: 'md')
 * @param {boolean} props.centered - Center content with flexbox
 * @param {string} props.maxWidth - Max width Tailwind class (e.g., 'max-w-md')
 * @param {string} props.className - Additional CSS classes
 */
export function Panel({
    children,
    size = 'md',
    centered = false,
    maxWidth = '',
    className = '',
    ...props
}) {
    const { isCompact, isLandscapeMobile } = useResponsive();

    // Responsive padding using Tailwind
    const paddingClass = {
        sm: isLandscapeMobile ? 'p-1.5' : isCompact ? 'p-2' : 'p-3',
        md: isLandscapeMobile ? 'p-3' : isCompact ? 'p-4' : 'p-6',
        lg: isLandscapeMobile ? 'p-4' : isCompact ? 'p-6' : 'p-10',
    }[size];

    const centerClass = centered ? 'flex flex-col items-center' : '';

    return createElement('div', {
        className: `ui-panel w-full ${paddingClass} ${centerClass} ${maxWidth} ${className}`.trim(),
        ...props
    }, children);
}

/**
 * PanelTitle - Heading for panels
 * Uses systematic type scale: text-xl (desktop) → text-lg (compact) → text-md (landscape)
 */
export function PanelTitle({ children, className = '' }) {
    const { isCompact, isLandscapeMobile } = useResponsive();

    // Responsive typography from type scale
    const textClass = isLandscapeMobile ? 'text-md' : isCompact ? 'text-lg' : 'text-xl';
    const marginClass = isLandscapeMobile ? 'mb-2' : isCompact ? 'mb-3' : 'mb-6';

    return createElement('h2', {
        className: `${textClass} font-bold text-center text-white ${marginClass} ${className}`.trim(),
        style: { textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)' }
    }, children);
}
