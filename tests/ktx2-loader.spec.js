// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect, beforeEach } from 'vitest';
import {
    initKtx2Loader,
    getKtx2Loader,
    _resetKtx2LoaderForTest,
} from '../js/rendering/ktx2Loader.js';

// These cover the degrade-not-crash contract without touching the real
// KTX2Loader (which pulls a worker + wasm): the null-renderer and pre-init
// paths never trigger the dynamic import.
describe('ktx2Loader singleton', () => {
    beforeEach(() => _resetKtx2LoaderForTest());

    it('returns null when initialized without a renderer', () => {
        expect(initKtx2Loader(null)).toBe(null);
        expect(initKtx2Loader(undefined)).toBe(null);
    });

    it('getKtx2Loader resolves null before any init', async () => {
        await expect(getKtx2Loader()).resolves.toBe(null);
    });
});
