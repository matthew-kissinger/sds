// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Platform & Responsive Detection Hooks
 *
 * SINGLE SOURCE OF TRUTH for all responsive behavior.
 * Import these hooks instead of creating local detection logic.
 */
import { useState, useEffect, useMemo } from 'react';

// Breakpoints - adjust these to tune responsive behavior globally
const BREAKPOINTS = {
    mobile: 768,           // Max width for mobile
    landscapeHeight: 500,  // Max height to consider "landscape mobile"
    compactHeight: 400,    // Very cramped - hide non-essential UI
    tabletLandscape: 926   // Tablet in landscape
};

/**
 * Core hook that tracks all responsive state
 * Use this if you need multiple values, or use the individual hooks below
 */
export function useResponsive() {
    const [state, setState] = useState(() => calculateState());

    useEffect(() => {
        const update = () => setState(calculateState());

        window.addEventListener('resize', update);
        window.addEventListener('orientationchange', update);

        // Also update after a short delay on orientation change (some browsers need this)
        const handleOrientation = () => setTimeout(update, 100);
        window.addEventListener('orientationchange', handleOrientation);

        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('orientationchange', update);
            window.removeEventListener('orientationchange', handleOrientation);
        };
    }, []);

    return state;
}

function calculateState() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isLandscape = width > height;

    // Device detection
    const userAgent = navigator.userAgent;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    // Responsive states
    const isSmallWidth = width <= BREAKPOINTS.mobile;
    const isSmallHeight = height <= BREAKPOINTS.landscapeHeight;
    const isVeryCompact = height <= BREAKPOINTS.compactHeight;
    const isLandscapeMobile = isLandscape && isSmallHeight;

    // Platform: 'mobile' or 'desktop'
    // Consider mobile if: mobile UA, small width, OR touch device with small height (landscape phone)
    const isMobile = isMobileUA || isSmallWidth || (isTouchDevice && isSmallHeight);
    const platform = isMobile ? 'mobile' : 'desktop';

    // Compact mode: should UI be condensed?
    const isCompact = isSmallWidth || isLandscapeMobile;

    return {
        // Core
        platform,
        orientation: isLandscape ? 'landscape' : 'portrait',

        // Booleans for easy checks
        isMobile,
        isDesktop: !isMobile,
        isLandscape,
        isPortrait: !isLandscape,
        isCompact,
        isVeryCompact,
        isLandscapeMobile,
        isTouchDevice,

        // Raw dimensions (use sparingly - prefer the booleans)
        width,
        height
    };
}

/**
 * Simple hook - just returns 'mobile' or 'desktop'
 * Use this when you only need platform detection
 */
export function usePlatform() {
    const { platform } = useResponsive();
    return platform;
}

/**
 * Returns 'landscape' or 'portrait'
 */
export function useOrientation() {
    const { orientation } = useResponsive();
    return orientation;
}

/**
 * Returns true if UI should be compact (mobile or landscape mobile)
 * This is the most commonly needed check for responsive styling
 */
export function useIsCompact() {
    const { isCompact } = useResponsive();
    return isCompact;
}

/**
 * Returns true if in landscape on a mobile device
 * Use for landscape-specific adjustments (e.g., horizontal zoom controls)
 */
export function useIsLandscapeMobile() {
    const { isLandscapeMobile } = useResponsive();
    return isLandscapeMobile;
}

/**
 * Returns true if screen is very cramped (hide non-essential elements)
 */
export function useIsVeryCompact() {
    const { isVeryCompact } = useResponsive();
    return isVeryCompact;
}

/**
 * Hook that returns responsive values based on platform
 *
 * Usage:
 *   const padding = useResponsiveValue({ mobile: '0.75rem', desktop: '1.5rem' });
 *   const fontSize = useResponsiveValue({ compact: '0.8rem', default: '1rem' });
 */
export function useResponsiveValue(values) {
    const { isMobile, isCompact, isLandscapeMobile, isVeryCompact } = useResponsive();

    return useMemo(() => {
        // Check from most specific to least specific
        if (isVeryCompact && values.veryCompact !== undefined) return values.veryCompact;
        if (isLandscapeMobile && values.landscape !== undefined) return values.landscape;
        if (isCompact && values.compact !== undefined) return values.compact;
        if (isMobile && values.mobile !== undefined) return values.mobile;
        if (!isMobile && values.desktop !== undefined) return values.desktop;
        return values.default;
    }, [isMobile, isCompact, isLandscapeMobile, isVeryCompact, values]);
}

/**
 * Returns responsive style object
 * Merges base styles with platform-specific overrides
 *
 * Usage:
 *   const style = useResponsiveStyle(
 *     { padding: '1.5rem', fontSize: '1rem' },           // base
 *     { padding: '0.75rem', fontSize: '0.85rem' },       // compact override
 *     { padding: '0.5rem' }                               // landscape override
 *   );
 */
export function useResponsiveStyle(baseStyle, compactStyle = {}, landscapeStyle = {}) {
    const { isCompact, isLandscapeMobile } = useResponsive();

    return useMemo(() => {
        let style = { ...baseStyle };
        if (isCompact) style = { ...style, ...compactStyle };
        if (isLandscapeMobile) style = { ...style, ...landscapeStyle };
        return style;
    }, [baseStyle, compactStyle, landscapeStyle, isCompact, isLandscapeMobile]);
}
