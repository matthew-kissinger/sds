// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * [P1-SHARE] shared clipboard helper (lobby room code, lobby invite link,
 * completion share fallback).
 *
 * Proves the two-path contract: prefer navigator.clipboard.writeText, fall
 * back to the hidden-textarea execCommand('copy') path when the async API is
 * missing or rejects, and report failure (false) when both paths are out.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyTextToClipboard } from '../../js/components/shared/clipboard.js';

function setClipboard(value: unknown) {
    Object.defineProperty(window.navigator, 'clipboard', {
        value,
        configurable: true,
    });
}

declare global {
    interface Document {
        execCommand: (commandId: string) => boolean;
    }
}

beforeEach(() => {
    // jsdom has neither navigator.clipboard nor document.execCommand; each
    // test installs exactly the surface it wants.
    setClipboard(undefined);
    document.execCommand = vi.fn(() => true);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('copyTextToClipboard [P1-SHARE]', () => {
    it('uses navigator.clipboard.writeText when available', async () => {
        const writeText = vi.fn(async () => {});
        setClipboard({ writeText });

        await expect(copyTextToClipboard('BAA123')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('BAA123');
        expect(document.execCommand).not.toHaveBeenCalled();
    });

    it('falls back to execCommand when writeText rejects', async () => {
        const writeText = vi.fn(async () => {
            throw new DOMException('denied', 'NotAllowedError');
        });
        setClipboard({ writeText });

        await expect(copyTextToClipboard('https://sheepdogsim.com#/r/BAA123')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledTimes(1);
        expect(document.execCommand).toHaveBeenCalledWith('copy');
        // The hidden textarea is cleaned up after the copy.
        expect(document.querySelector('textarea')).toBeNull();
    });

    it('falls back to execCommand when the Clipboard API is missing entirely', async () => {
        await expect(copyTextToClipboard('hello')).resolves.toBe(true);
        expect(document.execCommand).toHaveBeenCalledWith('copy');
        expect(document.querySelector('textarea')).toBeNull();
    });

    it('returns false when execCommand reports failure', async () => {
        document.execCommand = vi.fn(() => false);
        await expect(copyTextToClipboard('hello')).resolves.toBe(false);
        expect(document.querySelector('textarea')).toBeNull();
    });

    it('returns false when execCommand throws', async () => {
        document.execCommand = vi.fn(() => {
            throw new Error('not implemented');
        });
        await expect(copyTextToClipboard('hello')).resolves.toBe(false);
        expect(document.querySelector('textarea')).toBeNull();
    });
});
