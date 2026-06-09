// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * [P1-SETTINGS-A11Y] Medal/rank color palettes.
 *
 * The default palette is the universal gold/silver/bronze rank convention
 * (moved here from CompletionScreen.tsx). The colorblind palette swaps the
 * gold and bronze stops for Okabe-Ito hues (orange #E69F00 and sky blue
 * #56B4E9) so first vs third place stays distinguishable under deutan/protan
 * vision; silver stays neutral grey, which is already safe. Rank badges also
 * always render the rank number, so color is never the only signal.
 *
 * useColorblindMode() is the React side: it reads the persisted setting and
 * tracks the 'settings-changed' event the Settings panel dispatches.
 */
import { useEffect, useState } from 'react';
import { loadSettings } from './settings.js';

export interface MedalColor {
    bg: string;
    text: string;
    glow: string;
}

export const DEFAULT_MEDAL_COLORS: Record<number, MedalColor> = {
    1: { bg: 'linear-gradient(135deg, #FFD700, #FFA500)', text: '#000', glow: 'rgba(255, 215, 0, 0.4)' },
    2: { bg: 'linear-gradient(135deg, #E8E8E8, #B8B8B8)', text: '#000', glow: 'rgba(192, 192, 192, 0.4)' },
    3: { bg: 'linear-gradient(135deg, #CD7F32, #8B4513)', text: '#fff', glow: 'rgba(205, 127, 50, 0.4)' }
};

export const COLORBLIND_MEDAL_COLORS: Record<number, MedalColor> = {
    1: { bg: 'linear-gradient(135deg, #E69F00, #C07F00)', text: '#000', glow: 'rgba(230, 159, 0, 0.4)' },
    2: { bg: 'linear-gradient(135deg, #E8E8E8, #B8B8B8)', text: '#000', glow: 'rgba(192, 192, 192, 0.4)' },
    3: { bg: 'linear-gradient(135deg, #56B4E9, #2E7BB8)', text: '#000', glow: 'rgba(86, 180, 233, 0.4)' }
};

/** Pick the medal palette for the given accessibility mode. */
export function getMedalColors(colorblind: boolean): Record<number, MedalColor> {
    return colorblind ? COLORBLIND_MEDAL_COLORS : DEFAULT_MEDAL_COLORS;
}

function readColorblindSetting(): boolean {
    try {
        return loadSettings().colorblindMode === true;
    } catch {
        return false;
    }
}

/**
 * React hook: true while the colorblind-mode setting is enabled. Subscribes
 * to the 'settings-changed' CustomEvent so a toggle in the Settings panel
 * reaches already-mounted screens without a remount.
 */
export function useColorblindMode(): boolean {
    const [enabled, setEnabled] = useState(readColorblindSetting);

    useEffect(() => {
        const onSettingsChanged = (e: Event) => {
            const detail = (e as CustomEvent).detail as { colorblindMode?: boolean } | undefined;
            setEnabled(detail ? detail.colorblindMode === true : readColorblindSetting());
        };
        window.addEventListener('settings-changed', onSettingsChanged);
        return () => window.removeEventListener('settings-changed', onSettingsChanged);
    }, []);

    return enabled;
}
