// @vitest-environment jsdom
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Cycle 57 P2 regression: the completion overlay mounts in its own <body>-level
// root outside the React app tree, so the menu-return path must explicitly tear
// it down. Before the fix, returning to the menu left a stale overlay layered at
// z-index 99999 over the StartScreen. This locks the teardown contract.
import { describe, it, expect, afterEach } from 'vitest';
import { disposeCompletionOverlay } from '../../js/boot/completionOverlay.js';

describe('disposeCompletionOverlay (Cycle 57 P2)', () => {
    afterEach(() => {
        document.getElementById('game-completion-overlay')?.remove();
    });

    it('removes the externally-rooted completion overlay node', () => {
        const node = document.createElement('div');
        node.id = 'game-completion-overlay';
        document.body.appendChild(node);
        expect(document.getElementById('game-completion-overlay')).toBeTruthy();

        disposeCompletionOverlay();

        expect(document.getElementById('game-completion-overlay')).toBeNull();
    });

    it('is a no-op (no throw) when no overlay is mounted', () => {
        expect(document.getElementById('game-completion-overlay')).toBeNull();
        expect(() => disposeCompletionOverlay()).not.toThrow();
        // Idempotent: a second call is still safe.
        expect(() => disposeCompletionOverlay()).not.toThrow();
    });
});
