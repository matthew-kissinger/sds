// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
export const WEBGPU_MOBILE_BUDGETS = Object.freeze({
    high: {
        frameP95: 18.5,
        frameP99: 25,
        drawCalls: 250,
        estimatedTriangles: 1_000_000,
    },
    mid: {
        frameP95: 34,
        frameP99: 45,
        drawCalls: 250,
        estimatedTriangles: 800_000,
    },
    low: {
        frameP95: 34,
        frameP99: 50,
        drawCalls: 180,
        estimatedTriangles: 550_000,
    },
});

// Cycle 82: a desktop discrete-GPU budget, separate from the mobile tiers above.
// classifyDeviceTier collapses every desktop to tier 'high', so before this the
// QualityGovernor judged a desktop card at the mobile-high 18.5 ms (~54 fps) bar.
// On a 144 Hz desktop a single 2-vsync hitch is 20.8 ms, so transient streaming
// hitches tripped a step-down and (at the floor) the renderer fallback. The
// flagship runs the survival island at 144 fps on the Cycle 80/81 compute-cull
// WebGPU path; a discrete GPU must not be throttled at a phone's bar. p95 28 ms
// (~36 fps) / p99 44 ms still catches a genuinely struggling desktop (a weak
// integrated GPU classified 'high') sustained over a 7 s window.
export const WEBGPU_DESKTOP_BUDGET = Object.freeze({
    frameP95: 28,
    frameP99: 44,
    drawCalls: 400,
    estimatedTriangles: 4_000_000,
});

export function inferRendererMode(renderer) {
    if (typeof window !== 'undefined' && window.__sdsRendererMode?.effective) {
        return window.__sdsRendererMode.effective;
    }
    if (renderer?.isWebGPURenderer === true || renderer?.constructor?.name === 'WebGPURenderer') {
        return 'webgpu-production';
    }
    if (renderer?.getContext) return 'webgl';
    return 'unknown';
}

export function isWebGpuRenderer(renderer) {
    const mode = inferRendererMode(renderer);
    return renderer?.isWebGPURenderer === true
        || renderer?.constructor?.name === 'WebGPURenderer'
        || String(mode).startsWith('webgpu');
}

export function percentile(values, p) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    const sorted = values
        .filter(Number.isFinite)
        .slice()
        .sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[index];
}

export function systemBreakdownToObject(breakdown) {
    const result = {};
    for (const entry of breakdown ?? []) {
        if (!entry?.name || !Number.isFinite(entry.count)) continue;
        result[entry.name] = Math.round(entry.count);
    }
    return result;
}

export function sumSystemTriangles(breakdown) {
    return Object.values(systemBreakdownToObject(breakdown))
        .reduce((sum, count) => sum + count, 0);
}

export function buildRenderCostReport({
    renderer,
    rendererMode,
    deviceTier = 'unknown',
    sceneId = 'unknown',
    cameraPose = 'default',
    frameTimes = [],
    drawCalls = 0,
    systemBreakdown = [],
    visibleCountsBySystem = {},
    qualityState = {},
} = {}) {
    return {
        renderer: rendererMode ?? inferRendererMode(renderer),
        deviceTier,
        sceneId,
        cameraPose,
        frameP95: percentile(frameTimes, 95),
        frameP99: percentile(frameTimes, 99),
        drawCalls,
        estimatedTrianglesBySystem: systemBreakdownToObject(systemBreakdown),
        visibleCountsBySystem: { ...visibleCountsBySystem },
        qualityState: { ...qualityState },
    };
}
