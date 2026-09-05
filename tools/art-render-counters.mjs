// SPDX-License-Identifier: AGPL-3.0-or-later
/** Installed only inside a disposable probe browser, never imported by app/.
 * Counts API submissions per browser animation frame, not GPU execution time.
 * Unknown indirect/bundled topology invalidates triangles rather than guessing.
 */
export function installArtRenderCounters() {
  let calls = 0;
  let triangles = 0;
  let unknown = false;
  let windowCalls = 0;
  let windowTriangles = 0;
  let windowUnknown = false;
  let lastPublish = 0;
  const pipelineTopology = new WeakMap();
  const passTopology = new WeakMap();
  const wrap = (prototype, method, observe) => {
    if (!prototype || typeof prototype[method] !== 'function') return;
    const original = prototype[method];
    prototype[method] = function (...args) {
      const result = Reflect.apply(original, this, args);
      observe(this, args, result);
      return result;
    };
  };
  const add = (topology, count, instances = 1) => {
    calls += 1;
    if (topology === 'triangle-list' || topology === 4) triangles += Math.floor(count / 3) * instances;
    else if (topology === 'triangle-strip' || topology === 5 || topology === 6) triangles += Math.max(0, count - 2) * instances;
    else if (!['point-list', 'line-list', 'line-strip', 0, 1, 2, 3].includes(topology)) unknown = true;
  };
  const gl = globalThis.WebGL2RenderingContext?.prototype;
  wrap(gl, 'drawArrays', (_, args) => add(args[0], args[2]));
  wrap(gl, 'drawElements', (_, args) => add(args[0], args[1]));
  wrap(gl, 'drawArraysInstanced', (_, args) => add(args[0], args[2], args[3]));
  wrap(gl, 'drawElementsInstanced', (_, args) => add(args[0], args[1], args[4]));
  const device = globalThis.GPUDevice?.prototype;
  wrap(device, 'createRenderPipeline', (_, args, result) => {
    pipelineTopology.set(result, args[0].primitive?.topology ?? 'triangle-list');
  });
  wrap(device, 'createRenderPipelineAsync', (_, args, result) => {
    result.then((pipeline) => pipelineTopology.set(pipeline, args[0].primitive?.topology ?? 'triangle-list'), () => {});
  });
  const pass = globalThis.GPURenderPassEncoder?.prototype;
  wrap(pass, 'setPipeline', (encoder, args) => passTopology.set(encoder, pipelineTopology.get(args[0])));
  wrap(pass, 'draw', (encoder, args) => add(passTopology.get(encoder), args[0], args[1] ?? 1));
  wrap(pass, 'drawIndexed', (encoder, args) => add(passTopology.get(encoder), args[0], args[1] ?? 1));
  for (const method of ['drawIndirect', 'drawIndexedIndirect', 'executeBundles']) {
    wrap(pass, method, () => { calls += 1; unknown = true; });
  }
  // Dataset is a tool-owned output node, not a new application bridge/global.
  const frame = (now) => {
    windowCalls = Math.max(windowCalls, calls);
    windowTriangles = Math.max(windowTriangles, triangles);
    windowUnknown ||= unknown;
    calls = 0;
    triangles = 0;
    unknown = false;
    if (document.body && now - lastPublish >= 250) {
      let node = document.querySelector('[data-testid="render-readout"]');
      if (!node) {
        node = document.createElement('output');
        node.hidden = true;
        node.dataset.testid = 'render-readout';
        document.body.append(node);
      }
      node.dataset.drawCalls = windowUnknown ? '-1' : String(windowCalls);
      node.dataset.triangles = windowUnknown ? '-1' : String(windowTriangles);
      node.dataset.counterSource = 'browser-api-submissions-250ms-peak';
      lastPublish = now;
      windowCalls = 0;
      windowTriangles = 0;
      windowUnknown = false;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
