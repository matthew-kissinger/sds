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
});
