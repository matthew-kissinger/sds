// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { test, expect, type Page } from '@playwright/test';

/**
 * Cycle 9 Phase 3 — WebGL feature probe.
 *
 * Three runs: Chromium, Firefox, WebKit (per playwright.config.ts projects).
 * Each loads the start screen, grabs the canvas's GL context, and asserts
 * the minimum extension set the renderer needs. Catches the case where a
 * Three.js bump or browser update silently drops a needed extension and we
 * fall back to a degraded path without noticing.
 *
 * The expected list is derived from what TerrainBuilder and Atmosphere
 * currently rely on. Update conservatively when the shader stack changes.
 */

const REQUIRED_WEBGL2_EXTENSIONS: readonly string[] = [
  // OES_texture_float_linear comes bundled in WebGL2 on current targets, but
  // several scenes sample float textures without a fallback.
  'OES_texture_float_linear',
];

async function getGlSnapshot(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) return null;
    const gl: WebGL2RenderingContext | WebGLRenderingContext | null =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return null;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      isWebGL2: typeof (window as unknown as { WebGL2RenderingContext?: unknown }).WebGL2RenderingContext !== 'undefined'
        && gl instanceof (window as unknown as { WebGL2RenderingContext: typeof WebGL2RenderingContext }).WebGL2RenderingContext,
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
      extensions: gl.getSupportedExtensions() ?? [],
      maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };
  });
}

test('WebGL context exposes the required extension set', async ({ page }, testInfo) => {
  await page.goto('/');
  // Wait for any canvas. The start screen has a background 3D canvas so
  // this resolves before the gameplay state ever starts.
  await page.waitForSelector('canvas', { timeout: 30_000 });
  // Give the renderer a beat to initialize so getExtension returns the
  // registered set, not a partial early snapshot.
  await page.waitForTimeout(2_000);

  const snapshot = await getGlSnapshot(page);
  expect(snapshot, 'canvas should expose a WebGL context').not.toBeNull();
  if (!snapshot) return;

  await testInfo.attach('gl-snapshot.json', {
    body: JSON.stringify(snapshot, null, 2),
    contentType: 'application/json',
  });

  expect(snapshot.isWebGL2, 'WebGL2 context required').toBe(true);

  for (const ext of REQUIRED_WEBGL2_EXTENSIONS) {
    expect(snapshot.extensions, `${ext} must be present (browser=${testInfo.project.name})`)
      .toContain(ext);
  }
});
