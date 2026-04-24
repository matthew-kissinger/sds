/**
 * Button Components
 *
 * Primary/secondary glass button with responsive sizing. Styles are inlined
 * here (the former `js/styles/` token system was retired in Cycle 3 as it had
 * only this one consumer).
 */
import { createElement, useState } from 'react';
import { useResponsive } from '../hooks/usePlatform.js';

const BUTTON_PADDING = {
    default: '0.75rem 1.5rem',
    compact: '0.5rem 1rem',
    landscape: '0.4rem 0.75rem',
};

const BUTTON_FONT_SIZE = {
    default: '1rem',
    compact: '0.875rem',
    landscape: '0.75rem',
};

const BUTTON_RADIUS = {
    default: '0.75rem',
    compact: '0.5rem',
};

function pickResponsive(responsive, values) {
    if (responsive.isLandscapeMobile && values.landscape !== undefined) return values.landscape;
    if (responsive.isCompact && values.compact !== undefined) return values.compact;
    return values.default;
}

function computeButtonStyle({ variant, responsive, isHovered, fullWidth, disabled }) {
    const isPrimary = variant === 'primary';

    const glass = isPrimary
        ? {
            background: isHovered ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.08)',
            border: `1px solid ${isHovered ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.12)'}`,
            boxShadow: isHovered
                ? '0 6px 24px rgba(0, 0, 0, 0.15)'
                : '0 4px 16px rgba(0, 0, 0, 0.1)',
        }
        : {
            background: isHovered ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: isHovered
                ? '0 5px 20px rgba(0, 0, 0, 0.12)'
                : '0 3px 12px rgba(0, 0, 0, 0.08)',
        };

    return {
        cursor: 'pointer',
        outline: 'none',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        fontWeight: 600,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        color: '#ffffff',
        ...glass,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: pickResponsive(responsive, BUTTON_PADDING),
        fontSize: pickResponsive(responsive, BUTTON_FONT_SIZE),
        borderRadius: pickResponsive(responsive, BUTTON_RADIUS),
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
        width: fullWidth ? '100%' : 'auto',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
    };
}

export function Button({
    children,
    variant = 'primary',
    fullWidth = false,
    onClick,
    style = {},
    disabled = false,
    ...props
}) {
    const responsive = useResponsive();
    const [isHovered, setIsHovered] = useState(false);

    const computedStyle = {
        ...computeButtonStyle({ variant, responsive, isHovered, fullWidth, disabled }),
        ...style,
    };

    return createElement('button', {
        style: computedStyle,
        onClick: disabled ? undefined : onClick,
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
        disabled,
        ...props,
    }, children);
}

export function BackButton({ children = 'Back', onClick, ...props }) {
    return createElement(Button, {
        variant: 'secondary',
        fullWidth: true,
        onClick,
        ...props,
    }, [
        createElement('span', { key: 'arrow' }, '\u2190'),
        createElement('span', { key: 'text' }, children),
    ]);
}
