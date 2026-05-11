/**
 * PracticeHint — bottom-center fade-in hint shown only in Practice mode.
 *
 * Mounts on game start, dismisses after 8s OR on first keyboard / pointer
 * input (whichever comes first). Never modal, never blocks pointer events.
 *
 * The cycle-26 plan referenced "first whistle" dismiss; the codebase has
 * no whistle mechanic (dog auto-barks near sheep), so first-input dismiss
 * is the equivalent player-initiated trigger.
 */
import React, { createElement, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';

const AUTO_DISMISS_MS = 8000;

export function PracticeHint({ active }) {
    const { t } = useTranslation();
    const { isCompact } = useResponsive();
    const [visible, setVisible] = useState(false);
    const [fadeOut, setFadeOut] = useState(false);

    useEffect(() => {
        if (!active) return;
        setVisible(true);
        setFadeOut(false);

        const dismiss = () => setFadeOut(true);
        const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
        const onInput = () => dismiss();

        window.addEventListener('keydown', onInput, { once: true });
        window.addEventListener('pointerdown', onInput, { once: true });
        window.addEventListener('touchstart', onInput, { once: true, passive: true });

        return () => {
            clearTimeout(timer);
            window.removeEventListener('keydown', onInput);
            window.removeEventListener('pointerdown', onInput);
            window.removeEventListener('touchstart', onInput);
        };
    }, [active]);

    // Unmount after fade-out completes so we don't keep an inert node in the DOM
    useEffect(() => {
        if (!fadeOut) return;
        const t = setTimeout(() => setVisible(false), 600);
        return () => clearTimeout(t);
    }, [fadeOut]);

    if (!active || !visible) return null;

    const fontSize = isCompact ? '0.85rem' : '1rem';
    const padding = isCompact ? '0.5rem 0.9rem' : '0.7rem 1.2rem';

    // Cycle 35 Phase 8: positioning moved to HudLayout's bottomSafe slot,
    // which reserves clearance above the mobile-controls joystick.
    return createElement('div', {
        className: 'practice-hint',
        style: {
            padding,
            background: 'rgba(8, 47, 73, 0.72)',
            color: '#e0f2fe',
            border: '1px solid rgba(6, 182, 212, 0.45)',
            borderRadius: '999px',
            fontSize,
            fontWeight: 500,
            letterSpacing: '0.01em',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
            opacity: fadeOut ? 0 : 1,
            transition: 'opacity 0.55s ease-out',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            maxWidth: '92vw',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
        }
    }, t('practice.hint'));
}
