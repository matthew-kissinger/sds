// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Share-text builder for the completion screen [P1-SHARE].
 *
 * Pure function: takes the completion mode + run data + a translate function
 * and returns the Web Share payload (title, text, url) plus the one-string
 * clipboard fallback. No DOM, no navigator, no React, so it unit-tests
 * directly. The actual strings live in js/locales under completion.share.*
 * (concrete numbers, no hype, per the prose-and-voice rule).
 */

export const SHARE_URL = 'https://sheepdogsim.com';

/** Minimal i18next-shaped translate signature. */
export type ShareTranslate = (key: string, options?: Record<string, unknown>) => string;

/** The subset of CompletionData the share text reads. */
export interface ShareRunData {
    totalSheep?: number;
    finalTime?: number;
    isWinner?: boolean;
    myScore?: number;
    sheepCount?: number;
    counted?: number;
    round?: number;
}

export interface SharePayload {
    title: string;
    text: string;
    url: string;
    /** text + url in one string, for the clipboard fallback. */
    clipboardText: string;
}

/** mm:ss, same shape as the completion screen's own time stat. */
function formatShareTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Build the share payload for a completed run.
 *
 * @param mode 'single' | 'racing' | 'timed' | 'cooperative' | 'counting' | other
 */
export function buildShareText(mode: string, data: ShareRunData, t: ShareTranslate): SharePayload {
    let text: string;

    if (mode === 'single') {
        text = t('completion.share.single', {
            count: data.totalSheep || 0,
            time: formatShareTime(data.finalTime || 0),
        });
    } else if (mode === 'counting') {
        text = t('completion.share.counting', {
            count: data.counted || 0,
            round: data.round || 0,
        });
    } else if (mode === 'racing' || mode === 'timed') {
        const key = data.isWinner === true ? 'completion.share.mpWin' : 'completion.share.mpScore';
        text = t(key, { count: data.myScore || 0 });
    } else if (mode === 'cooperative') {
        text = t('completion.share.cooperative', {
            count: data.totalSheep || data.sheepCount || 0,
        });
    } else {
        text = t('completion.share.generic');
    }

    return {
        title: t('completion.share.title'),
        text,
        url: SHARE_URL,
        clipboardText: `${text} ${SHARE_URL}`,
    };
}
