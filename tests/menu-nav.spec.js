// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 60 Phase 2 - pure menu-navigation traversal.
 */
import { describe, it, expect } from 'vitest';
import { stepIndex, navAction } from '../js/input/menuNav.js';

describe('stepIndex (Cycle 60 P2)', () => {
    it('wraps forward past the end', () => {
        expect(stepIndex(2, 3, 1)).toBe(0);
    });
    it('wraps backward past the start', () => {
        expect(stepIndex(0, 3, -1)).toBe(2);
    });
    it('steps within bounds', () => {
        expect(stepIndex(0, 3, 1)).toBe(1);
        expect(stepIndex(2, 3, -1)).toBe(1);
    });
    it('seeds the first item when nothing is focused and moving forward', () => {
        expect(stepIndex(-1, 4, 1)).toBe(0);
    });
    it('seeds the last item when nothing is focused and moving back', () => {
        expect(stepIndex(-1, 4, -1)).toBe(3);
    });
    it('seeds a preferred item when nothing is focused', () => {
        expect(stepIndex(-1, 4, 1, 2)).toBe(2);
        expect(stepIndex(-1, 4, -1, 2)).toBe(2);
    });
    it('returns -1 when there is nothing to focus', () => {
        expect(stepIndex(0, 0, 1)).toBe(-1);
    });
});

describe('navAction (Cycle 60 P2)', () => {
    it('maps up/left to a backward move', () => {
        expect(navAction('up')).toEqual({ move: -1 });
        expect(navAction('left')).toEqual({ move: -1 });
    });
    it('maps down/right to a forward move', () => {
        expect(navAction('down')).toEqual({ move: 1 });
        expect(navAction('right')).toEqual({ move: 1 });
    });
    it('passes activate and back through', () => {
        expect(navAction('activate')).toEqual({ activate: true });
        expect(navAction('back')).toEqual({ back: true });
    });
    it('returns an empty intent for unknown types', () => {
        expect(navAction('nope')).toEqual({});
    });
});
