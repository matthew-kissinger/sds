// SPDX-License-Identifier: AGPL-3.0-or-later
// Browser-init diagnostic. Records normal WebGL2 calls without issuing queries.
export function installShaderCompletionTrace({ disableParallel = false } = {}) {
  const trace = { programs: [], shaders: [], disableParallel };
  globalThis.__shaderCompletion = trace;
  const prototype = globalThis.WebGL2RenderingContext?.prototype;
  if (!prototype) return;
  const programs = new WeakMap(); const shaders = new WeakMap();
  const enums = new WeakMap();
  const wrap = (name, callback) => {
    const original = prototype[name];
    prototype[name] = function (...args) { return callback(this, original, args); };
  };
  wrap('getExtension', (gl, original, args) => {
    if (disableParallel && args[0] === 'KHR_parallel_shader_compile') return null;
    const result = original.apply(gl, args);
    if (args[0] === 'KHR_parallel_shader_compile' && result) enums.set(gl, result.COMPLETION_STATUS_KHR);
    return result;
  });
  wrap('shaderSource', (gl, original, args) => {
    const result = original.apply(gl, args);
    const item = { id: trace.shaders.length, length: args[1].length,
      name: args[1].match(/#define SHADER_NAME ([^\n]+)/)?.[1] ?? null };
    shaders.set(args[0], item); trace.shaders.push(item);
    return result;
  });
  wrap('compileShader', (gl, original, args) => {
    const at = performance.now(); const result = original.apply(gl, args);
    const item = shaders.get(args[0]);
    if (item) Object.assign(item, { compileAt: at, compileCallMs: performance.now() - at });
    return result;
  });
  wrap('attachShader', (gl, original, args) => {
    const result = original.apply(gl, args);
    let item = programs.get(args[0]);
    if (!item) {
      item = { id: trace.programs.length, shaders: [], polls: [] };
      programs.set(args[0], item); trace.programs.push(item);
    }
    item.shaders.push(shaders.get(args[1])?.id ?? null);
    return result;
  });
  wrap('linkProgram', (gl, original, args) => {
    const at = performance.now(); const result = original.apply(gl, args);
    const item = programs.get(args[0]);
    if (item) Object.assign(item, { linkAt: at, linkCallMs: performance.now() - at });
    return result;
  });
  wrap('getProgramParameter', (gl, original, args) => {
    const at = performance.now(); const result = original.apply(gl, args);
    if (args[1] === enums.get(gl)) {
      programs.get(args[0])?.polls.push({ at, complete: result, callMs: performance.now() - at });
    }
    if (args[1] === gl.LINK_STATUS) {
      const item = programs.get(args[0]);
      if (item) item.linkStatus = { at, result, callMs: performance.now() - at };
    }
    return result;
  });
}
