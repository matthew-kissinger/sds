/**
 * CameraModeIndicator
 * Persistent HUD chip showing the current camera mode and how to cycle it.
 * Tappable on every platform — desktop also exposes the `C` key. Cycles
 * Follow → Free → Classic → Follow via the camera controller (Cycle 23
 * Phase A2 — Classic demoted to third option).
 */
import React, { createElement, useEffect, useState } from 'react';
import { getGameState, getSceneManager, subscribeGameEvent } from '../../GameBridge.js';
import { useResponsive } from '../hooks/usePlatform.js';

const MODE_LABEL = {
    classic: 'Classic',
    follow: 'Follow',
    free: 'Free'
};

export function CameraModeIndicator({ mode, platform = 'desktop' }) {
    const label = MODE_LABEL[mode] ?? 'Camera';
    const isMobile = platform === 'mobile';

    // Cycle 23 Phase C: subscribe to objective state so the indicator drops
    // below the ObjectiveBanner on Open Country (where the banner takes
    // top-center). Cheap — same per-frame subscription pattern as the
    // banner; we only re-render when the boolean flips.
    const [hasObjective, setHasObjective] = useState(false);
    useEffect(() => {
        const read = () => {
            const gs = getGameState();
            setHasObjective(!!gs?.objective);
        };
        read();
        return subscribeGameEvent('frame', read);
    }, []);

    const handleCycle = () => {
        getSceneManager()?.getCameraController()?.cycleMode?.();
    };

    // Desktop: top-center (slot is free; SheepCounter sits top-left, GameTimer top-right).
    // Cycle 23 Phase C: when an ObjectiveBanner is mounted (OC), drop the
    // chip below it (~80px) so they vertical-stack instead of overlap.
    // Mobile landscape: top-left at top-2 (clear of MobileHUD chip which is top-center;
    // landscape is wide enough that left + center don't collide).
    // Mobile portrait: dropped to top-left BELOW MobileHUD (Cycle 17 Phase 4 — gallery
    // review reported overlap on iPhone SE 375x667 where the centered MobileHUD's
    // ~240px footprint clipped into the top-left chip). top: 60px clears the chip.
    const { isPortrait } = useResponsive();
    const portraitMobile = isMobile && isPortrait;

    const positionClass = isMobile
        ? 'fixed left-2 z-20 animate-slide-down pointer-events-auto'
        : 'fixed left-1/2 -translate-x-1/2 z-20 animate-slide-down pointer-events-auto';

    const desktopTop = hasObjective
        ? 'calc(env(safe-area-inset-top, 0px) + 88px)'  // below ObjectiveBanner (~70px) + 18px gap
        : 'calc(env(safe-area-inset-top, 0px) + 24px)'; // matches Tailwind top-6

    const inlineTop = portraitMobile
        ? 'max(env(safe-area-inset-top, 0px), 60px)'
        : isMobile
            ? 'max(env(safe-area-inset-top, 8px), 8px)'
            : desktopTop;

    return createElement('div', {
        className: positionClass,
        style: {
            paddingTop: 'max(env(safe-area-inset-top, 0px), 0px)',
            ...(inlineTop ? { top: inlineTop } : {}),
        }
    },
        createElement('button', {
            type: 'button',
            onClick: handleCycle,
            className: 'ui-panel py-1.5 px-3 flex items-center gap-2 cursor-pointer hover:bg-white/5 active:scale-95 transition-transform',
            style: { WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' },
            'aria-label': `Camera mode: ${label}. Tap to cycle.`
        }, [
            createElement('span', {
                key: 'label',
                className: 'text-white/90 text-sm font-medium'
            }, label),
            createElement('span', {
                key: 'sep',
                className: 'text-white/30 text-xs'
            }, '·'),
            isMobile
                ? createElement('span', {
                    key: 'hint',
                    className: 'text-white/60 text-xs'
                }, 'Tap')
                : [
                    createElement('span', {
                        key: 'hint',
                        className: 'text-white/60 text-xs'
                    }, 'Press'),
                    createElement('kbd', {
                        key: 'key',
                        className: 'inline-block px-1.5 py-0.5 rounded bg-white/15 border border-white/25 text-white/90 text-xs font-mono leading-none'
                    }, 'C')
                ]
        ])
    );
}
