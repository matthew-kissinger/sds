// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { createElement, useCallback, useEffect, useState } from 'react';

/**
 * Cycle 95 (Bug F): first-run Survival onboarding for Newsheepdogland.
 *
 * The guided tutorial only covers Home Field basics (move / sprint / camera /
 * pen three). Survival has its own loop a first-time player got no explanation
 * of: herd the flock into the homestead pen before nightfall, wolves hunt
 * strays after dark, survive the night and the flock grows, the run ends if a
 * night thins it too far, and the score is the peak flock. This is the
 * dismissible explainer for that loop.
 *
 * Modeled on BarkHint: localStorage-gated to the first run, deferred until the
 * game surface is up, dismissed on the button or a generous timeout. The copy
 * is inline English in Matt's voice, matching the survival HUD family
 * (DayNightChip, showSurvivalSummary) rather than the locale - those siblings
 * keep their strings inline too, and this copy is reviewed in the cycle's
 * paired pass. The card is pointer-events:none so it never eats game input;
 * only the dismiss button opts back in. It uses the survival amber/cream
 * palette so it reads as part of the same homestead HUD language.
 */

const STORAGE_KEY = 'sds-survival-intro-seen';
const AUTO_DISMISS_MS = 22000;

const CREAM = '#f3ead3';
const AMBER = '#f2c14e';

// Player-facing copy (prose-and-voice rule: no em-dashes, no exclamation, Matt's
// voice, correct Newsheepdogland framing). Reviewed in the cycle's paired pass.
const TITLE = 'Survival';
const BODY = 'Herd the flock into the homestead pen before nightfall. After dark the wolves hunt any sheep left in the open. Survive the night and the flock grows by morning. Lose too many in one night and the run ends. Your score is the largest flock you reach.';
const DISMISS = 'Got it';

function isGameSurfaceReady() {
    const canvas = document.querySelector('#canvas-container canvas');
    const loading = document.querySelector('[data-sds-loading-screen="true"]');
    return !loading && canvas && canvas.width > 100 && canvas.height > 100;
}

function hasSeenIntro() {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

function rememberSeen() {
    try {
        localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
}

export function SurvivalIntro({ active = false, deferUntilGameSurface = true }) {
    const [surfaceReady, setSurfaceReady] = useState(() => !deferUntilGameSurface);
    const [dismissed, setDismissed] = useState(hasSeenIntro);

    useEffect(() => {
        if (!active || hasSeenIntro()) {
            setSurfaceReady(false);
            setDismissed(hasSeenIntro());
            return;
        }

        if (!deferUntilGameSurface) {
            setSurfaceReady(true);
            return;
        }

        setSurfaceReady(false);
        let frame = 0;
        const checkSurface = () => {
            if (isGameSurfaceReady()) {
                setSurfaceReady(true);
                return;
            }
            frame = requestAnimationFrame(checkSurface);
        };
        frame = requestAnimationFrame(checkSurface);
        return () => cancelAnimationFrame(frame);
    }, [active, deferUntilGameSurface]);

    const visible = active && surfaceReady && !dismissed;

    const dismiss = useCallback(() => {
        rememberSeen();
        setDismissed(true);
    }, []);

    useEffect(() => {
        if (!visible) return undefined;
        // Generous timeout so the loop has time to read; the button is the
        // primary path. No Escape key: it would also toggle the pause menu.
        const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
        return () => clearTimeout(timer);
    }, [visible, dismiss]);

    if (!visible) return null;

    const cardStyle = {
        maxWidth: 'min(360px, 92vw)',
        padding: '14px 18px 16px',
        borderRadius: '14px',
        background: 'rgba(38,30,22,0.92)',
        color: CREAM,
        border: '1px solid rgba(243,234,211,0.2)',
        boxShadow: '0 10px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        // The card is passthrough; only the button re-enables pointer events,
        // so the explainer never blocks herding underneath it.
        pointerEvents: 'none',
        textAlign: 'left',
        font: '500 0.9rem/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    };
    const titleStyle = {
        color: AMBER,
        fontWeight: 800,
        fontSize: '0.82rem',
        letterSpacing: '1.4px',
        textTransform: 'uppercase',
        marginBottom: '6px',
    };
    const bodyStyle = {
        opacity: 0.92,
        margin: 0,
    };
    const buttonStyle = {
        marginTop: '12px',
        padding: '8px 18px',
        cursor: 'pointer',
        font: '700 0.78rem/1 ui-sans-serif,system-ui,sans-serif',
        letterSpacing: '1px',
        textTransform: 'uppercase',
        color: '#241e16',
        background: AMBER,
        border: 'none',
        borderRadius: '9px',
        pointerEvents: 'auto',
    };

    return createElement('div', {
        className: 'survival-intro',
        style: cardStyle,
        'data-sds-survival-intro': 'true',
        role: 'status',
    }, [
        createElement('div', { key: 'title', style: titleStyle }, TITLE),
        createElement('p', { key: 'body', style: bodyStyle }, BODY),
        createElement('button', {
            key: 'dismiss',
            type: 'button',
            style: buttonStyle,
            onClick: dismiss,
        }, DISMISS),
    ]);
}
