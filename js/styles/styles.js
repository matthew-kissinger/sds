/**
 * Style Builders - Reusable Style Factories
 *
 * These functions generate style objects using design tokens.
 * Import and use instead of defining inline styles in components.
 */

import { colors, spacing, typography, borders, effects } from './tokens.js';

// =============================================================================
// GLASSMORPHISM BASE
// =============================================================================

/**
 * Core glassmorphism effect - the foundation of our UI
 * @param {Object} options - Override defaults
 * @returns {Object} Style object with glass effect
 */
export function glass(options = {}) {
    const {
        blur = effects.blur.xl,
        bg = colors.glass.bg,
        border = colors.glass.border,
        shadow = effects.shadow.glass,
    } = options;

    return {
        background: bg,
        backdropFilter: `blur(${blur})`,
        WebkitBackdropFilter: `blur(${blur})`,
        border: `1px solid ${border}`,
        boxShadow: shadow,
    };
}

/**
 * Lighter glass for buttons and interactive elements
 */
export function glassLight(isHovered = false) {
    return {
        background: isHovered ? colors.glass.bgHover : colors.glass.bg,
        backdropFilter: `blur(${effects.blur.lg})`,
        WebkitBackdropFilter: `blur(${effects.blur.lg})`,
        border: `1px solid ${isHovered ? colors.glass.borderHover : colors.glass.border}`,
        boxShadow: isHovered ? effects.shadow.mdHover : effects.shadow.md,
    };
}

/**
 * Subtle glass for secondary elements
 */
export function glassSubtle(isHovered = false) {
    return {
        background: isHovered ? colors.glass.bg : colors.glass.bgSubtle,
        backdropFilter: `blur(${effects.blur.lg})`,
        WebkitBackdropFilter: `blur(${effects.blur.lg})`,
        border: `1px solid ${isHovered ? colors.glass.borderSubtle : colors.glass.borderSubtle}`,
        boxShadow: isHovered ? effects.shadow.smHover : effects.shadow.sm,
    };
}

// =============================================================================
// RESPONSIVE VALUE HELPER
// =============================================================================

/**
 * Pick value based on responsive state
 * @param {Object} responsive - { isCompact, isLandscapeMobile } from useResponsive()
 * @param {Object} values - { default, compact?, landscape? }
 * @returns {*} The appropriate value
 */
export function responsiveValue(responsive, values) {
    const { isCompact, isLandscapeMobile } = responsive;

    if (isLandscapeMobile && values.landscape !== undefined) {
        return values.landscape;
    }
    if (isCompact && values.compact !== undefined) {
        return values.compact;
    }
    return values.default;
}

/**
 * Get responsive padding from spacing tokens
 * Supports nested keys like 'panel.md' or simple keys like 'button'
 */
export function getResponsivePadding(responsive, preset) {
    // Handle nested keys like 'panel.md'
    const keys = preset.split('.');
    let paddings = spacing.padding;
    for (const key of keys) {
        paddings = paddings?.[key];
        if (!paddings) return spacing.lg;
    }
    return responsiveValue(responsive, paddings);
}

/**
 * Get responsive font size from typography tokens
 */
export function getResponsiveFontSize(responsive, preset) {
    const sizes = typography[preset];
    if (!sizes) return typography.size.md;
    return responsiveValue(responsive, sizes);
}

/**
 * Get responsive border radius from borders tokens
 */
export function getResponsiveRadius(responsive, preset) {
    const radii = borders[preset];
    if (!radii) return borders.radius.md;
    return responsiveValue(responsive, radii);
}

/**
 * Get responsive gap from spacing tokens
 */
export function getResponsiveGap(responsive) {
    return responsiveValue(responsive, spacing.gap);
}

// =============================================================================
// BUTTON STYLES
// =============================================================================

/**
 * Base button styles (shared by all buttons)
 */
export const buttonBase = {
    cursor: 'pointer',
    outline: 'none',
    transition: effects.transition.normal,
    fontWeight: typography.weight.semibold,
    fontFamily: typography.family,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    color: colors.text.primary,
};

/**
 * Complete button style
 * @param {Object} options
 * @param {'primary'|'secondary'} options.variant
 * @param {Object} options.responsive - from useResponsive()
 * @param {boolean} options.isHovered
 * @param {boolean} options.fullWidth
 * @param {boolean} options.disabled
 */
export function buttonStyle({ variant = 'primary', responsive, isHovered = false, fullWidth = false, disabled = false }) {
    const isPrimary = variant === 'primary';
    const glassStyle = isPrimary ? glassLight(isHovered) : glassSubtle(isHovered);

    return {
        ...buttonBase,
        ...glassStyle,
        padding: getResponsivePadding(responsive, 'button'),
        fontSize: getResponsiveFontSize(responsive, 'button'),
        borderRadius: getResponsiveRadius(responsive, 'button'),
        transform: isHovered ? effects.transform.hover : effects.transform.active,
        width: fullWidth ? '100%' : 'auto',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
    };
}

// =============================================================================
// PANEL STYLES
// =============================================================================

/**
 * Complete panel style
 * @param {Object} options
 * @param {'sm'|'md'|'lg'} options.size - Padding size
 * @param {Object} options.responsive - from useResponsive()
 * @param {boolean} options.centered
 * @param {string} options.maxWidth
 */
export function panelStyle({ size = 'md', responsive, centered = false, maxWidth }) {
    const { isCompact } = responsive;

    return {
        ...glass(),
        padding: getResponsivePadding(responsive, `panel.${size}`),
        borderRadius: getResponsiveRadius(responsive, 'panel'),
        width: '100%',
        maxWidth: maxWidth || (isCompact ? 'calc(100vw - 1rem)' : 'none'),
        ...(centered && {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
        }),
    };
}

/**
 * Panel title style
 */
export function panelTitleStyle(responsive) {
    return {
        fontSize: getResponsiveFontSize(responsive, 'title'),
        fontWeight: typography.weight.bold,
        textAlign: 'center',
        color: colors.text.primary,
        marginBottom: responsiveValue(responsive, {
            default: spacing.xl,
            compact: spacing.md,
            landscape: spacing.sm,
        }),
        textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
    };
}

// =============================================================================
// MENU OPTION STYLES
// =============================================================================

/**
 * Menu option button style
 * @param {Object} options
 * @param {Object} options.responsive
 * @param {boolean} options.isHovered
 * @param {string} options.accentColor
 */
export function menuOptionStyle({ responsive, isHovered = false, accentColor = colors.accent }) {
    const { isCompact } = responsive;

    return {
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        transition: effects.transition.normal,
        background: isHovered
            ? `linear-gradient(135deg, ${accentColor}22, ${accentColor}11)`
            : colors.glass.bgSubtle,
        backdropFilter: `blur(${effects.blur.lg})`,
        WebkitBackdropFilter: `blur(${effects.blur.lg})`,
        borderRadius: isCompact ? borders.radius.md : borders.radius.lg,
        border: isHovered
            ? `1px solid ${accentColor}44`
            : `1px solid ${colors.glass.borderSubtle}`,
        boxShadow: isHovered
            ? `0 4px 16px ${accentColor}22`
            : effects.shadow.sm,
        padding: getResponsivePadding(responsive, 'menuOption'),
        transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
        outline: 'none',
    };
}

/**
 * Menu option label text style
 */
export function menuOptionLabelStyle(responsive, isHovered, accentColor = colors.accent) {
    return {
        fontWeight: typography.weight.semibold,
        color: isHovered ? accentColor : colors.text.primary,
        fontSize: getResponsiveFontSize(responsive, 'label'),
        transition: 'color 0.3s ease',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    };
}

/**
 * Menu option description text style
 */
export function menuOptionDescStyle(responsive) {
    return {
        fontSize: getResponsiveFontSize(responsive, 'description'),
        color: colors.text.secondary,
        marginTop: '0.125rem',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    };
}

/**
 * Menu option content container style
 */
export function menuOptionContentStyle() {
    return {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
    };
}

/**
 * Menu option left section (icon + text)
 */
export function menuOptionLeftStyle(responsive) {
    const { isCompact } = responsive;
    return {
        display: 'flex',
        alignItems: 'center',
        gap: isCompact ? spacing.sm : spacing.md,
        minWidth: 0,
        flex: 1,
    };
}

/**
 * Menu option indicator dot (mobile replacement for icon)
 */
export function menuOptionIndicatorStyle(responsive, accentColor = colors.accent) {
    const { isCompact } = responsive;
    const size = isCompact ? '6px' : '8px';

    return {
        width: size,
        height: size,
        borderRadius: borders.radius.full,
        background: accentColor,
        flexShrink: 0,
        boxShadow: `0 0 8px ${accentColor}66`,
    };
}

/**
 * Menu option arrow style
 */
export function menuOptionArrowStyle(responsive) {
    const { isCompact } = responsive;
    return {
        color: colors.text.muted,
        flexShrink: 0,
        fontSize: isCompact ? typography.size.base : typography.size.md,
    };
}

/**
 * Menu option grid container
 */
export function menuOptionGridStyle(responsive) {
    return {
        display: 'flex',
        flexDirection: 'column',
        gap: getResponsiveGap(responsive),
        width: '100%',
    };
}

// =============================================================================
// LAYOUT HELPERS
// =============================================================================

/**
 * Flexbox column layout
 */
export function flexColumn(options = {}) {
    const { gap = spacing.md, align = 'stretch', justify = 'flex-start' } = options;
    return {
        display: 'flex',
        flexDirection: 'column',
        gap,
        alignItems: align,
        justifyContent: justify,
    };
}

/**
 * Flexbox row layout
 */
export function flexRow(options = {}) {
    const { gap = spacing.md, align = 'center', justify = 'flex-start', wrap = false } = options;
    return {
        display: 'flex',
        flexDirection: 'row',
        gap,
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? 'wrap' : 'nowrap',
    };
}

/**
 * Center content both ways
 */
export const flexCenter = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

// =============================================================================
// TEXT HELPERS
// =============================================================================

/**
 * Truncate text with ellipsis
 */
export const textTruncate = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
};

/**
 * Standard text shadow for legibility
 */
export const textShadow = {
    textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
};
