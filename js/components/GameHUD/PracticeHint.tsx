// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * PracticeHint — bottom-center fade-in hint shown only in Practice mode.
 *
 * Mounts on game start, dismisses after 8s OR on first keyboard / pointer input
 * (whichever comes first). Never modal, never blocks pointer events.
 *
 * Cycle 48 P1: converted to JSX .tsx. The bespoke cyan glass keeps its look via
 * the --color-hint-* tokens (surface bg, cyan border, sky text) instead of raw
 * literals. Positioning lives in HudLayout's bottomSafe slot (Cycle 35 P8).
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { color } from '../ui/tokens';
// P1-TUTORIAL: the tutorial runs Just Play under the hood and shows its own
// move/sprint prompts in the same bottom-center band, so this hint stands down
// while a tutorial session is live.
import { isTutorialSessionActive } from '../Tutorial/index.js';

const AUTO_DISMISS_MS = 8000;

export function PracticeHint({ active }: { active: boolean }) {
    const { t } = useTranslation();
    const { isCompact } = useResponsive();
    const [visible, setVisible] = useState(false);
    const [fadeOut, setFadeOut] = useState(false);

    useEffect(() => {
        if (!active || isTutorialSessionActive()) return;
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

    // Unmount after fade-out completes so we don't keep an inert node in the DOM.
    useEffect(() => {
        if (!fadeOut) return;
        const timer = setTimeout(() => setVisible(false), 600);
        return () => clearTimeout(timer);
    }, [fadeOut]);

    if (!active || !visible) return null;

    const fontSize = isCompact ? '0.85rem' : '1rem';
    const padding = isCompact ? '0.5rem 0.9rem' : '0.7rem 1.2rem';

    const style: CSSProperties = {
        padding,
        background: color.hintSurface,
        color: color.hintText,
        border: `1px solid ${color.hintBorder}`,
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
        textOverflow: 'ellipsis',
    };

    return (
        <div className="practice-hint" style={style}>
            {t('practice.hint')}
        </div>
    );
}
