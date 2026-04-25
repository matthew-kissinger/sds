/**
 * CameraModeIndicator
 * Persistent HUD chip showing the current camera mode and how to cycle it.
 * Tappable on every platform — desktop also exposes the `C` key. Cycles
 * Classic → Follow → Free → Classic via the camera controller.
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

    return createElement('div', {
        className: 'fixed top-6 left-1/2 -translate-x-1/2 z-20 animate-slide-down pointer-events-auto',
        style: { paddingTop: 'max(env(safe-area-inset-top, 0px), 0px)' }
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
