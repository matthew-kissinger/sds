// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

/**
 * Measure central screenshot variation without trusting canvas dimensions.
 * The crop excludes the corner HUD and mobile bark control, while retaining
 * the field, sky, animals, and scenery that must be visible during play.
 */
export async function analyzeScreenshot(page, png) {
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  return page.evaluate(async (url) => {
    const response = await fetch(url);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('2D screenshot analysis context unavailable.');
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const x0 = Math.floor(canvas.width * 0.15);
    const y0 = Math.floor(canvas.height * 0.2);
    const width = Math.max(1, Math.floor(canvas.width * 0.7));
    const height = Math.max(1, Math.floor(canvas.height * 0.55));
    const pixels = context.getImageData(x0, y0, width, height).data;
    const strideX = Math.max(1, Math.floor(width / 128));
    const strideY = Math.max(1, Math.floor(height / 96));
    const buckets = new Set();
    let minR = 255;
    let maxR = 0;
    let minG = 255;
    let maxG = 0;
    let minB = 255;
    let maxB = 0;
    let samples = 0;
    for (let y = 0; y < height; y += strideY) {
      for (let x = 0; x < width; x += strideX) {
        const at = (y * width + x) * 4;
        const r = pixels[at];
        const g = pixels[at + 1];
        const b = pixels[at + 2];
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minG = Math.min(minG, g);
        maxG = Math.max(maxG, g);
        minB = Math.min(minB, b);
        maxB = Math.max(maxB, b);
        buckets.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
        samples += 1;
      }
    }
    const channelRange = Math.max(maxR - minR, maxG - minG, maxB - minB);
    return {
      samples,
      quantizedColorBuckets: buckets.size,
      channelRange,
      nonblank: buckets.size >= 12 && channelRange >= 24,
      crop: { x: x0, y: y0, width, height },
    };
  }, dataUrl);
}
