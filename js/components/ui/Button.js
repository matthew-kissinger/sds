/**
 * Button Components
 *
 * Glass-styled button family. Variants are visual roles (primary, secondary,
 * ghost, danger), not visual states. Sizes (`sm`, `md`, `lg`) override the
 * responsive defaults when an explicit dimension is required (e.g. inline
 * actions inside a settings row).
 *
 * Cycle 12 Phase 2: ghost + danger variants + `size` prop added so the
 * destructive reset buttons in SettingsPanel and the completion-screen
 * actions can drop their inline styles. Toggle / TabButton / PresetButton /
 * KeyBindButton remain their own components — those are specialized UI
 * primitives, not visual variants of the glass button.
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

const SIZE_OVERRIDES = {
    sm: { padding: '0.4rem 0.85rem', fontSize: '0.75rem', radius: '0.4rem' },
    md: { padding: '0.5rem 1rem',    fontSize: '0.875rem', radius: '0.5rem' },
    lg: { padding: '0.85rem 1.75rem', fontSize: '1rem',    radius: '0.85rem' },
};

const VARIANT_THEME = {
    primary: {
        background:        'rgba(255, 255, 255, 0.08)',
        backgroundHover:   'rgba(255, 255, 255, 0.12)',
        border:            'rgba(255, 255, 255, 0.12)',
        borderHover:       'rgba(255, 255, 255, 0.20)',
        color:             '#ffffff',
        colorHover:        '#ffffff',
        shadow:            '0 4px 16px rgba(0, 0, 0, 0.10)',
        shadowHover:       '0 6px 24px rgba(0, 0, 0, 0.15)',
        useBlur:           true,
    },
    secondary: {
        background:        'rgba(255, 255, 255, 0.05)',
        backgroundHover:   'rgba(255, 255, 255, 0.08)',
        border:            'rgba(255, 255, 255, 0.10)',
        borderHover:       'rgba(255, 255, 255, 0.10)',
        color:             '#ffffff',
        colorHover:        '#ffffff',
        shadow:            '0 3px 12px rgba(0, 0, 0, 0.08)',
        shadowHover:       '0 5px 20px rgba(0, 0, 0, 0.12)',
        useBlur:           true,
    },
    ghost: {
        background:        'transparent',
        backgroundHover:   'rgba(255, 255, 255, 0.06)',
        border:            'transparent',
        borderHover:       'transparent',
        color:             'rgba(255, 255, 255, 0.5)',
        colorHover:        'rgba(255, 255, 255, 0.85)',
        shadow:            'none',
        shadowHover:       'none',
        useBlur:           false,
        textDecoration:    'underline',
    },
    danger: {
        background:        'rgba(239, 68, 68, 0.10)',
        backgroundHover:   'rgba(239, 68, 68, 0.16)',
        border:            'rgba(239, 68, 68, 0.30)',
        borderHover:       'rgba(239, 68, 68, 0.45)',
        color:             '#fca5a5',
        colorHover:        '#fecaca',
        shadow:            '0 2px 8px rgba(239, 68, 68, 0.10)',
        shadowHover:       '0 4px 14px rgba(239, 68, 68, 0.20)',
        useBlur:           false,
    },
};

function pickResponsive(responsive, values) {
    if (responsive.isLandscapeMobile && values.landscape !== undefined) return values.landscape;
    if (responsive.isCompact && values.compact !== undefined) return values.compact;
    return values.default;
}

function computeButtonStyle({ variant, size, responsive, isHovered, fullWidth, disabled }) {
    const theme = VARIANT_THEME[variant] ?? VARIANT_THEME.primary;
    const sizeOverride = size ? SIZE_OVERRIDES[size] : null;

    const padding = sizeOverride?.padding ?? pickResponsive(responsive, BUTTON_PADDING);
    const fontSize = sizeOverride?.fontSize ?? pickResponsive(responsive, BUTTON_FONT_SIZE);
    const borderRadius = sizeOverride?.radius ?? pickResponsive(responsive, BUTTON_RADIUS);

    const style = {
        cursor: 'pointer',
        outline: 'none',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        fontWeight: 600,
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        background: isHovered ? theme.backgroundHover : theme.background,
        border: `1px solid ${isHovered ? theme.borderHover : theme.border}`,
        boxShadow: isHovered ? theme.shadowHover : theme.shadow,
        color: isHovered ? theme.colorHover : theme.color,
        padding,
        fontSize,
        borderRadius,
        transform: isHovered && variant !== 'ghost' ? 'translateY(-2px)' : 'translateY(0)',
        width: fullWidth ? '100%' : 'auto',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
    };

    if (theme.useBlur) {
        style.backdropFilter = 'blur(20px)';
        style.WebkitBackdropFilter = 'blur(20px)';
    }
    if (theme.textDecoration) {
        style.textDecoration = theme.textDecoration;
    }

    return style;
}

export function Button({
    children,
    variant = 'primary',
    size,
    fullWidth = false,
    onClick,
    style = {},
    disabled = false,
    ...props
}) {
    const responsive = useResponsive();
    const [isHovered, setIsHovered] = useState(false);

    const computedStyle = {
        ...computeButtonStyle({ variant, size, responsive, isHovered, fullWidth, disabled }),
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
        createElement('span', { key: 'arrow' }, '←'),
        createElement('span', { key: 'text' }, children),
    ]);
}
