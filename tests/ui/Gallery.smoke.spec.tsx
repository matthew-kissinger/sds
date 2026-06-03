// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * Cycle 49 P3: gallery render smoke. Mounts <Gallery/> and asserts the palette
 * and primitives sections render. The gallery is the program's headless review
 * surface, so this pins that it composites without the WebGPU game. P4 extends
 * this with the pastoral-primitive section; P5 with the entrance/loading mocks.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { Gallery } from '../../js/gallery/Gallery';

afterEach(cleanup);

describe('UI Gallery (smoke)', () => {
  it('mounts and renders the palette + primitives sections', () => {
    const { container } = render(<Gallery />);
    expect(container.querySelector('[data-testid="gallery-palette"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gallery-primitives"]')).toBeTruthy();
  });

  it('renders a swatch for every pastoral token', () => {
    const { container } = render(<Gallery />);
    const swatches = container.querySelectorAll('[data-testid="gallery-swatch"]');
    // 14 pastoral color tokens in tokens.pastoral.
    expect(swatches.length).toBe(14);
  });

  it('renders the six primitives under the pastoral palette (P4)', () => {
    const { container } = render(<Gallery />);
    const section = container.querySelector('[data-testid="gallery-pastoral-primitives"]');
    expect(section).toBeTruthy();
    // The pastoral wrapper renders the same PrimitivesDemo (the four Button
    // variants plus the IconButton are present as <button> elements).
    expect(section?.querySelectorAll('button').length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('renders the entrance and loading mockups (P5)', () => {
    const { container } = render(<Gallery />);
    expect(container.querySelector('[data-testid="gallery-entrance-mock"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="gallery-loading-mock"]')).toBeTruthy();
  });
});
