// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  drawHeritagePlaque,
  PLAQUE_CANVAS_WIDTH,
  PLAQUE_CANVAS_HEIGHT,
  PLAQUE_ASPECT,
} from '@app/scene/ui/plaqueDrawing';

describe('Heritage Show Plaque drawing routines', () => {
  // Mock 2D canvas context for deterministic unit test verification
  function createMockContext() {
    return {
      clearRect: () => {},
      beginPath: () => {},
      roundRect: () => {},
      fill: () => {},
      fillRect: () => {},
      stroke: () => {},
      arc: () => {},
      clip: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      save: () => {},
      restore: () => {},
      createLinearGradient: () => ({
        addColorStop: () => {},
      }),
      measureText: (text: string) => ({
        width: text.length * 10,
      }),
      fillText: () => {},
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      textAlign: '',
      textBaseline: '',
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetY: 0,
    } as unknown as CanvasRenderingContext2D;
  }

  it('computes well-formed plaque dimensions for sheep', () => {
    const ctx = createMockContext();
    const dims = drawHeritagePlaque(ctx, {
      name: 'Daisy',
      isDog: false,
    });

    expect(dims.width).toBeGreaterThan(200);
    expect(dims.width).toBeLessThanOrEqual(PLAQUE_CANVAS_WIDTH - 48);
    expect(dims.height).toBe(150);
    expect(dims.height).toBeLessThanOrEqual(PLAQUE_CANVAS_HEIGHT);
    expect(dims.aspect).toBe(PLAQUE_ASPECT);
    expect(dims.aspect).toBeGreaterThan(2.0);
  });

  it('computes distinct plaque dimensions with rosette spacing for Pip', () => {
    const ctx = createMockContext();
    const sheepDims = drawHeritagePlaque(ctx, {
      name: 'Pip',
      isDog: false,
    });
    const dogDims = drawHeritagePlaque(ctx, {
      name: 'Pip',
      isDog: true,
      gleamProgress: 0.5,
    });

    expect(dogDims.width).toBeGreaterThan(sheepDims.width);
    expect(dogDims.height).toBe(150);
    expect(dogDims.aspect).toBe(PLAQUE_ASPECT);
  });

  it('widens automatically for longer names while clamping to canvas maximum', () => {
    const ctx = createMockContext();
    const shortDims = drawHeritagePlaque(ctx, {
      name: 'Bo',
    });

    const longDims = drawHeritagePlaque(ctx, {
      name: 'Bartholomew Montgomery the Third',
    });

    expect(longDims.width).toBeGreaterThan(shortDims.width);
    expect(longDims.width).toBeLessThanOrEqual(PLAQUE_CANVAS_WIDTH - 48);
  });
});
