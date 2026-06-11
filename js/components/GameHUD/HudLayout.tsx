// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * HudLayout - slot-based HUD orchestrator.
 *
 * Cycle 35 Phase 8: one fixed-inset container with named regions; every HUD
 * overlay renders into a slot rather than declaring its own `position: fixed`.
 * Children inside a region stack as flex columns with a fixed gap, so two cards
 * in the same region (e.g. score pill + objective banner) lay out without
 * hand-tuned pixel offsets.
 *
 * Regions:
 *   - topLeft        : top-left corner, items-start.
 *   - topCenter      : top-center column. Score pill + ObjectiveBanner stack.
 *   - topRight       : top-right corner, items-end. GameTimer on desktop.
 *   - edge           : self-positioning overlays (CorralCompass via NDC).
 *   - bottomSafe     : centered above the mobile-controls reserve. Hints, toasts.
 *   - mobileControls : passthrough for the multi-corner MobileControls.
 *
 * Mobile-controls clearance: portrait 140px, landscape 96px, desktop 16px above
 * the bottom safe-area. Each slot wrapper is pointer-events:none so the WebGL
 * canvas stays interactive except where a child opts into pointer-events:auto.
 *
 * Cycle 48 P1: converted to JSX .tsx. No hex; behavior-identical.
 */
import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Z } from '../../ui/zIndex.js';
import { useResponsive } from '../hooks/usePlatform.js';

function asChildren(value: ReactNode): ReactNode[] {
    if (value == null || value === false) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return [value];
}

interface HudLayoutProps {
    topLeft?: ReactNode;
    topCenter?: ReactNode;
    topRight?: ReactNode;
    edge?: ReactNode;
    bottomSafe?: ReactNode;
    mobileControls?: ReactNode;
}

export function HudLayout({
    topLeft = null,
    topCenter = null,
    topRight = null,
    edge = null,
    bottomSafe = null,
    mobileControls = null,
}: HudLayoutProps) {
    const { isMobile, isLandscapeMobile, isPortrait } = useResponsive();

    const safeTop = 'max(env(safe-area-inset-top, 8px), 8px)';
    const bottomReserve = isMobile && isPortrait
        ? 'calc(env(safe-area-inset-bottom, 0px) + 140px)'
        : isLandscapeMobile
            ? 'calc(env(safe-area-inset-bottom, 0px) + 96px)'
            : 'calc(env(safe-area-inset-bottom, 0px) + 16px)';

    // Cycle 87 Phase 6: publish layout reserves as CSS variables on the
    // document element. Overlays that live OUTSIDE this React root by design
    // (the tutorial pill in its own root, the vanilla DayNightChip, the
    // shared toast rail) read them instead of hardcoding magic offsets that
    // drift from the real HUD footprint:
    //   --sds-bottom-reserve   bottom clearance over the mobile controls
    //   --sds-toast-top-offset extra top clearance below the topCenter stack
    //   --sds-topleft-reserve  height the topLeft stack occupies
    //   --sds-topright-reserve height the topRight stack occupies (Cycle 91:
    //                          the NSL minimap pins to the same corner the
    //                          GameTimer renders in and was drawing under it)
    const topRightCount = asChildren(topRight).length;
    useEffect(() => {
        const rootStyle = document.documentElement.style;
        rootStyle.setProperty('--sds-bottom-reserve', bottomReserve);
        rootStyle.setProperty('--sds-toast-top-offset', isMobile ? '112px' : '64px');
        rootStyle.setProperty('--sds-topleft-reserve', '140px');
        rootStyle.setProperty('--sds-topright-reserve', topRightCount > 0 ? '72px' : '0px');
        return () => {
            rootStyle.removeProperty('--sds-bottom-reserve');
            rootStyle.removeProperty('--sds-toast-top-offset');
            rootStyle.removeProperty('--sds-topleft-reserve');
            rootStyle.removeProperty('--sds-topright-reserve');
        };
    }, [bottomReserve, isMobile, topRightCount]);

    const cornerGutter = '8px';
    const stackGap = '8px';

    const topLeftStyle: CSSProperties = {
        position: 'fixed',
        top: safeTop,
        left: cornerGutter,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: stackGap,
        zIndex: Z.hud,
        pointerEvents: 'none',
    };

    const topCenterStyle: CSSProperties = {
        position: 'fixed',
        top: safeTop,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: stackGap,
        zIndex: Z.hud,
        pointerEvents: 'none',
        maxWidth: '92vw',
    };

    const topRightStyle: CSSProperties = {
        position: 'fixed',
        top: safeTop,
        right: cornerGutter,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: stackGap,
        zIndex: Z.hud,
        pointerEvents: 'none',
    };

    const bottomSafeStyle: CSSProperties = {
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: bottomReserve,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: stackGap,
        zIndex: Z.hudBottom,
        pointerEvents: 'none',
        maxWidth: '92vw',
    };

    const tl = asChildren(topLeft);
    const tc = asChildren(topCenter);
    const tr = asChildren(topRight);
    const ed = asChildren(edge);
    const bs = asChildren(bottomSafe);

    return (
        <>
            {tl.length > 0 && <div style={topLeftStyle}>{tl}</div>}
            {tc.length > 0 && <div style={topCenterStyle}>{tc}</div>}
            {tr.length > 0 && <div style={topRightStyle}>{tr}</div>}
            {ed.length > 0 && <>{ed}</>}
            {bs.length > 0 && <div style={bottomSafeStyle}>{bs}</div>}
            {mobileControls && <>{mobileControls}</>}
        </>
    );
}
