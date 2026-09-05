// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../tools/art-render-counters.mjs', import.meta.url), 'utf8').replace('export function', 'function');
function harness() {
  return runInNewContext(`${source}
    class GPUDevice { createRenderPipeline() { return {}; } }
    class GPURenderPassEncoder { setPipeline() {} draw() { return 17; } drawIndexed() {} executeBundles() {} }
    class WebGL2RenderingContext { drawArraysInstanced() {} }
    let callback;
    const node = { dataset: {} };
    const document = { body: {}, querySelector: () => node };
    const requestAnimationFrame = (next) => { callback = next; };
    Object.assign(globalThis, { GPUDevice, GPURenderPassEncoder, WebGL2RenderingContext });
    installArtRenderCounters();
    ({ node, device: new GPUDevice(), pass: new GPURenderPassEncoder(), gl: new WebGL2RenderingContext(), frame: (time) => callback(time) });
  `);
}
describe('tools-only render counters', () => {
  it('counts indexed GPU triangles and instanced WebGL triangles while preserving return values', () => {
    const h = harness();
    h.pass.setPipeline(h.device.createRenderPipeline({ primitive: { topology: 'triangle-list' } }));
    expect(h.pass.draw(6, 2)).toBe(17);
    h.pass.drawIndexed(9, 3);
    h.gl.drawArraysInstanced(4, 0, 6, 2);
    h.frame(250);
    expect(h.node.dataset.drawCalls).toBe('3');
    expect(h.node.dataset.triangles).toBe('17');
  });
  it('invalidates bundle statistics instead of counting a bundle as one known draw', () => {
    const h = harness();
    h.pass.executeBundles([]);
    h.frame(250);
    expect(h.node.dataset.drawCalls).toBe('-1');
    expect(h.node.dataset.triangles).toBe('-1');
  });
});
