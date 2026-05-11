/**
 * CameraModeIndicator
 * Persistent HUD chip showing the current camera mode and how to cycle it.
 * Tappable on every platform — desktop also exposes the `C` key. Cycles
 * Follow → Free → Classic → Follow via the camera controller (Cycle 23
 * Phase A2 — Classic demoted to third option).
 */
import React, { createElement } from 'react';
import { getSceneManager } from '../../GameBridge.js';

const MODE_LABEL = {
    classic: 'Classic',
    follow: 'Follow',
    free: 'Free'
};

export function CameraModeIndicator({ mode, platform = 'desktop' }) {
    const label = MODE_LABEL[mode] ?? 'Camera';
    const isMobile = platform === 'mobile';

    const handleCycle = () => {
        getSceneManager()?.getCameraController()?.cycleMode?.();
    };

    // Cycle 35 Phase 8: positioning moved to HudLayout (topLeft on mobile,
    // topCenter stack on desktop). The previous hardcoded 88px ObjectiveBanner
    // dodge and the portrait/landscape branching are no longer needed — the
    // layout container's flex-column gap handles stacking.
    return createElement('div', {
        className: 'animate-slide-down',
        style: { pointerEvents: 'auto' }
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
