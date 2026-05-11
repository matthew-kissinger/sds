/**
 * HudLayout - slot-based HUD orchestrator.
 *
 * Cycle 35 Phase 8: one fixed-inset container with named regions; every
 * HUD overlay renders into a slot rather than declaring its own
 * `position: fixed`. Children inside a region stack as flex columns with
 * a fixed gap, so two cards in the same region (e.g. score pill +
 * objective banner) layout without hand-tuned pixel offsets.
 *
 * Replaces the prior pattern where each component owned its own
 * top/left/transform and dodged collisions by hardcoding offsets (e.g.
 * CameraModeIndicator's `top: 88px when ObjectiveBanner is mounted`).
 * The layout is now in one place; remove a component from a slot and
 * the others reflow.
 *
 * Regions:
 *   - topLeft        : top-left corner, items-start. Camera chip on mobile,
 *                      SheepCounter / MP scoreboard on desktop.
 *   - topCenter      : top-center column. Score pill + ObjectiveBanner stack
 *                      here on mobile; banner alone on desktop.
 *   - topRight       : top-right corner, items-end. GameTimer on desktop.
 *   - edge           : self-positioning overlays (CorralCompass via NDC).
 *   - bottomSafe     : centered above the mobile-controls reserve. Hints,
 *                      transient toasts. Reserves clearance for the
 *                      joystick + zoom + sprint buttons on mobile.
 *   - mobileControls : passthrough for the multi-corner MobileControls
 *                      component (joystick + buttons).
 *
 * Mobile-controls clearance:
 *   - portrait mobile: 140px above bottom safe-area
 *   - landscape mobile: 96px above bottom safe-area
 *   - desktop: 16px
 *
 * Each slot wrapper is pointer-events:none so the WebGL canvas remains
 * interactive everywhere except where a child opts into pointer-events:auto.
 */
import React, { createElement } from 'react';
import { useResponsive } from '../hooks/usePlatform.js';

function asChildren(value) {
    if (value == null || value === false) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return [value];
}

export function HudLayout({
    topLeft = null,
    topCenter = null,
    topRight = null,
    edge = null,
    bottomSafe = null,
    mobileControls = null
}) {
    const { isMobile, isLandscapeMobile, isPortrait } = useResponsive();

    const safeTop = 'max(env(safe-area-inset-top, 8px), 8px)';
    const bottomReserve = isMobile && isPortrait
        ? 'calc(env(safe-area-inset-bottom, 0px) + 140px)'
        : isLandscapeMobile
            ? 'calc(env(safe-area-inset-bottom, 0px) + 96px)'
            : 'calc(env(safe-area-inset-bottom, 0px) + 16px)';

    const cornerGutter = '8px';
    const stackGap = '8px';

    const topLeftStyle = {
        position: 'fixed',
        top: safeTop,
        left: cornerGutter,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: stackGap,
        zIndex: 20,
        pointerEvents: 'none'
    };

    const topCenterStyle = {
        position: 'fixed',
        top: safeTop,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: stackGap,
        zIndex: 20,
        pointerEvents: 'none',
        maxWidth: '92vw'
    };

    const topRightStyle = {
        position: 'fixed',
        top: safeTop,
        right: cornerGutter,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: stackGap,
        zIndex: 20,
        pointerEvents: 'none'
    };

    const bottomSafeStyle = {
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: bottomReserve,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: stackGap,
        zIndex: 30,
        pointerEvents: 'none',
        maxWidth: '92vw'
    };

    const tl = asChildren(topLeft);
    const tc = asChildren(topCenter);
    const tr = asChildren(topRight);
    const ed = asChildren(edge);
    const bs = asChildren(bottomSafe);

    return createElement(React.Fragment, null, [
        tl.length > 0 && createElement('div', { key: 'tl', style: topLeftStyle }, tl),
        tc.length > 0 && createElement('div', { key: 'tc', style: topCenterStyle }, tc),
        tr.length > 0 && createElement('div', { key: 'tr', style: topRightStyle }, tr),
        ed.length > 0 && createElement(React.Fragment, { key: 'ed' }, ed),
        bs.length > 0 && createElement('div', { key: 'bs', style: bottomSafeStyle }, bs),
        mobileControls && createElement(React.Fragment, { key: 'mc' }, mobileControls)
    ]);
}
