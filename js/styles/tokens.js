/**
 * Design Tokens - Single Source of Truth
 *
 * ARCHITECTURE:
 * - Tailwind CSS: Primary styling system (layout, spacing, typography)
 * - CSS classes: Glassmorphism effects (.ui-panel), animations
 * - Inline styles: Dynamic values only (colors from props, computed positions)
 *
 * TYPE SCALE (Major Third - 1.25 ratio):
 * text-xs (10px), text-sm (12px), text-base (14px), text-md (16px),
 * text-lg (20px), text-xl (24px), text-2xl (30px), text-3xl (36px),
 * text-4xl (48px), text-5xl (60px)
 *
 * These tokens provide fallback values and responsive presets.
 * Prefer Tailwind classes in components when possible.
 */

// =============================================================================
// COLORS
// =============================================================================

export const colors = {
    // Primary palette
    primary: '#667eea',      // Purple-blue gradient start
    primaryLight: '#764ba2', // Purple-blue gradient end
    accent: '#3b82f6',       // Blue accent (buttons, links)

    // Semantic colors
    success: '#10b981',      // Emerald green
    warning: '#f59e0b',      // Amber
    error: '#ef4444',        // Red
    info: '#06b6d4',         // Cyan

    // Neutrals (white-based for dark glassmorphism)
    white: '#ffffff',
    black: '#000000',

    // Glassmorphism backgrounds (rgba for transparency)
    glass: {
        bg: 'rgba(255, 255, 255, 0.08)',
        bgHover: 'rgba(255, 255, 255, 0.12)',
        bgSubtle: 'rgba(255, 255, 255, 0.05)',
        bgActive: 'rgba(255, 255, 255, 0.15)',
        border: 'rgba(255, 255, 255, 0.12)',
        borderHover: 'rgba(255, 255, 255, 0.2)',
        borderSubtle: 'rgba(255, 255, 255, 0.1)',
    },

    // Text colors
    text: {
        primary: '#ffffff',
        secondary: 'rgba(255, 255, 255, 0.7)',
        muted: 'rgba(255, 255, 255, 0.5)',
        disabled: 'rgba(255, 255, 255, 0.3)',
    },

    // Shadows (dark for depth)
    shadow: {
        sm: 'rgba(0, 0, 0, 0.08)',
        md: 'rgba(0, 0, 0, 0.1)',
        lg: 'rgba(0, 0, 0, 0.12)',
        xl: 'rgba(0, 0, 0, 0.15)',
    }
};

// =============================================================================
// SPACING
// =============================================================================

export const spacing = {
    // Base scale (rem units)
    xs: '0.25rem',   // 4px
    sm: '0.5rem',    // 8px
    md: '0.75rem',   // 12px
    lg: '1rem',      // 16px
    xl: '1.5rem',    // 24px
    '2xl': '2rem',   // 32px
    '3xl': '2.5rem', // 40px

    // Responsive padding presets
    padding: {
        button: {
            default: '0.75rem 1.5rem',
            compact: '0.5rem 1rem',
            landscape: '0.4rem 0.75rem',
        },
        panel: {
            sm: { default: '0.75rem', compact: '0.5rem', landscape: '0.375rem' },
            md: { default: '1.5rem', compact: '1rem', landscape: '0.75rem' },
            lg: { default: '2.5rem', compact: '1.5rem', landscape: '1rem' },
        },
        menuOption: {
            default: '1.25rem',
            compact: '0.75rem',
            landscape: '0.5rem 0.75rem',
        }
    },

    // Gap presets
    gap: {
        default: '0.75rem',
        compact: '0.5rem',
        landscape: '0.375rem',
    }
};

// =============================================================================
// TYPOGRAPHY
// =============================================================================

/**
 * Type Scale (Major Third - 1.25 ratio)
 * Aligned with Tailwind config in index.html
 *
 * Scale: 10px, 12px, 14px, 16px, 20px, 24px, 30px, 36px, 48px, 60px
 *
 * Tailwind class mapping:
 * - text-xs   → 10px (micro labels, stat values)
 * - text-sm   → 12px (captions, meta info, descriptions)
 * - text-base → 14px (body small, compact mode)
 * - text-md   → 16px (body default)
 * - text-lg   → 20px (body large, button text)
 * - text-xl   → 24px (h4, section titles)
 * - text-2xl  → 30px (h3, panel titles)
 * - text-3xl  → 36px (h2, screen titles)
 * - text-4xl  → 48px (h1, hero text)
 * - text-5xl  → 60px (display, game title)
 */
export const typography = {
    // Font sizes (aligned with Tailwind)
    size: {
        xs: '0.625rem',   // 10px - micro labels
        sm: '0.75rem',    // 12px - captions, meta
        base: '0.875rem', // 14px - body small
        md: '1rem',       // 16px - body default
        lg: '1.25rem',    // 20px - body large
        xl: '1.5rem',     // 24px - h4
        '2xl': '1.875rem',// 30px - h3
        '3xl': '2.25rem', // 36px - h2
        '4xl': '3rem',    // 48px - h1
        '5xl': '3.75rem', // 60px - display
    },

    // Responsive font sizes (use Tailwind classes when possible)
    button: {
        default: '1rem',      // text-md
        compact: '0.875rem',  // text-base
        landscape: '0.75rem', // text-sm
    },
    label: {
        default: '1rem',      // text-md
        compact: '0.875rem',  // text-base
        landscape: '0.75rem', // text-sm
    },
    description: {
        default: '0.75rem',   // text-sm
        compact: '0.625rem',  // text-xs
        landscape: '0.625rem',// text-xs
    },
    title: {
        default: '1.5rem',    // text-xl
        compact: '1.25rem',   // text-lg
        landscape: '1rem',    // text-md
    },

    // Font weights
    weight: {
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
    },

    // Font family
    family: "'Inter', system-ui, -apple-system, sans-serif",
};

// =============================================================================
// BORDERS & RADII
// =============================================================================

export const borders = {
    radius: {
        sm: '0.5rem',    // 8px - compact elements
        md: '0.75rem',   // 12px - buttons, inputs
        lg: '1rem',      // 16px - cards, panels
        xl: '1.5rem',    // 24px - large panels
        full: '9999px',  // Pill/circle
    },

    // Responsive border radius
    button: {
        default: '0.75rem',
        compact: '0.5rem',
    },
    panel: {
        default: '1.5rem',
        compact: '1rem',
        landscape: '0.75rem',
    },
    menuOption: {
        default: '1rem',
        compact: '0.75rem',
    }
};

// =============================================================================
// EFFECTS
// =============================================================================

export const effects = {
    // Backdrop blur
    blur: {
        sm: '8px',
        md: '16px',
        lg: '20px',
        xl: '28px',
    },

    // Box shadows
    shadow: {
        sm: '0 3px 12px rgba(0, 0, 0, 0.08)',
        md: '0 4px 16px rgba(0, 0, 0, 0.1)',
        lg: '0 6px 24px rgba(0, 0, 0, 0.12)',
        xl: '0 8px 32px rgba(0, 0, 0, 0.15)',
        // With inset highlight
        glass: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        // Hover states
        smHover: '0 5px 20px rgba(0, 0, 0, 0.12)',
        mdHover: '0 6px 24px rgba(0, 0, 0, 0.15)',
    },

    // Transitions
    transition: {
        fast: 'all 0.15s ease',
        normal: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        slow: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
    },

    // Transforms
    transform: {
        hover: 'translateY(-2px)',
        active: 'translateY(0)',
        pressed: 'scale(0.95)',
    }
};

// =============================================================================
// BREAKPOINTS (for reference - actual detection in usePlatform.js)
// =============================================================================

export const breakpoints = {
    mobile: 768,          // Max width for mobile
    landscapeHeight: 500, // Max height for landscape mobile
    compactHeight: 400,   // Very compact (hide non-essential)
    tabletLandscape: 926, // Tablet in landscape treated as desktop
};

// =============================================================================
// Z-INDEX LAYERS
// =============================================================================

export const zIndex = {
    base: 1,
    controls: 100,
    hud: 500,
    overlay: 1000,
    modal: 2000,
    tooltip: 3000,
};
