// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Clipboard helper [P1-SHARE].
 *
 * One shared copy path for every "copy this string" affordance (lobby room
 * code, lobby invite link, completion share fallback). Prefers the async
 * Clipboard API; falls back to a hidden textarea + `document.execCommand`
 * for insecure contexts, denied permissions, and older WebViews.
 */

/**
 * Copy text to the clipboard.
 *
 * @param {string} text
 * @returns {Promise<boolean>} true if the copy succeeded by either path.
 */
export async function copyTextToClipboard(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Permission denied or insecure context; try the legacy path.
        }
    }
    return legacyCopy(text);
}

/**
 * Legacy textarea + execCommand('copy') fallback.
 *
 * @param {string} text
 * @returns {boolean}
 */
function legacyCopy(text) {
    if (typeof document === 'undefined' || !document.body) return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // Keep it out of view without display:none (which blocks selection).
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } catch {
        ok = false;
    }
    ta.remove();
    return ok;
}
