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
