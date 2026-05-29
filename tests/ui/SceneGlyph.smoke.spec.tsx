/** @vitest-environment jsdom */
/**
 * Cycle 47 P3: render smoke harness for the extracted SceneGlyph art.
 * Pins that each scene id renders an <svg> vignette (and unknown ids fall
 * back to the field glyph) before Phase 5 consumes it from ScenePicker.tsx.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SceneGlyph } from '../../js/components/StartScreen/SceneGlyph';

afterEach(cleanup);

describe('SceneGlyph (smoke)', () => {
    it('renders an <svg> for each known scene id', () => {
        for (const scene of ['rolling-hills', 'open-country', 'field'] as const) {
            const { container } = render(<SceneGlyph scene={scene} />);
            const svg = container.querySelector('svg');
            expect(svg).toBeTruthy();
            expect(svg?.getAttribute('viewBox')).toBe('0 0 64 40');
            cleanup();
        }
    });

    it('falls back to a glyph for an unknown scene id', () => {
        const { container } = render(<SceneGlyph scene="does-not-exist" />);
        expect(container.querySelector('svg')).toBeTruthy();
    });
});
