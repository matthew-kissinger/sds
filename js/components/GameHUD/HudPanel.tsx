// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * HudPanel — shared HUD chrome.
 *
 * The `animate-slide-down` wrapper around the frosted `.ui-panel` surface that
 * GameTimer, SheepCounter, and ObjectiveBanner all render. Cycle 48 P1 pulled
 * the two-div pairing into one place. The inner panel deliberately keeps the
 * `.ui-panel` class (blur 28px + drop shadow) rather than the Surface primitive
 * (blur 20px, no shadow), so the converted HUD reads byte-identically to the
 * pre-conversion look.
 */
import type { CSSProperties, ReactNode } from 'react';

interface HudPanelProps {
    children: ReactNode;
    /** Utility classes appended after the base `ui-panel` class. */
    className?: string;
    style?: CSSProperties;
    /** Stable hook for layout tests (rendered as data-sds-hud-panel). */
    testId?: string;
}

export function HudPanel({ children, className, style, testId }: HudPanelProps) {
    const panelClass = className ? `ui-panel ${className}` : 'ui-panel';
    return (
        <div className="animate-slide-down" data-sds-hud-panel={testId}>
            <div className={panelClass} style={style}>
                {children}
            </div>
        </div>
    );
}
