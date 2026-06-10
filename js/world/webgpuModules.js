// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Bridge for the lazily-loaded three.webgpu namespace. The WebGPU production boot
// loads three.webgpu.min.js dynamically (so js/ keeps no static three/tsl import and
// the WebGL bundle stays clean) and stashes the namespace here; GrassSystem and
// TreePlacement read it to build the compute-cull render path (Cycle 81). Mirrored
// on window so the validation probe can reach the same reference.

let cached = null;

export function setWebGpuModules(modules) {
    cached = modules ?? null;
    if (typeof window !== 'undefined') window.__sdsWebGpuModules = cached;
}

export function getWebGpuModules() {
    if (cached) return cached;
    if (typeof window !== 'undefined' && window.__sdsWebGpuModules) {
        cached = window.__sdsWebGpuModules;
    }
    return cached;
}
