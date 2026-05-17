import { WEBGPU_MOBILE_BUDGETS, percentile } from './RenderCostReport.js';

const QUALITY_STEPS = Object.freeze([
    { renderScale: 1.0, grassDistanceScale: 1.0, treeLodBias: 0, waterSparkleScale: 1.0, sheepAnimationRate: 1.0, terrainSegmentScale: 1.0 },
    { renderScale: 0.9, grassDistanceScale: 0.85, treeLodBias: 0.15, waterSparkleScale: 0.75, sheepAnimationRate: 1.0, terrainSegmentScale: 1.0 },
    { renderScale: 0.8, grassDistanceScale: 0.7, treeLodBias: 0.35, waterSparkleScale: 0.5, sheepAnimationRate: 1.0, terrainSegmentScale: 0.75 },
    { renderScale: 0.72, grassDistanceScale: 0.55, treeLodBias: 0.55, waterSparkleScale: 0.25, sheepAnimationRate: 1.0, terrainSegmentScale: 0.65 },
]);

export function classifyDeviceTier({
    isMobile = false,
    tier = null,
    adapterLimits = null,
    viewport = null,
    hardwareConcurrency = null,
    deviceMemory = null,
} = {}) {
    if (tier === 'high' || tier === 'med') return tier === 'med' ? 'mid' : tier;
    if (tier === 'low' && !adapterLimits) return 'low';
    if (!isMobile) return 'high';
    const maxTexture = adapterLimits?.maxTextureDimension2D ?? 0;
    const concurrency = hardwareConcurrency ?? 0;
    const memory = deviceMemory ?? 0;
    const dpr = viewport?.dpr ?? 1;
    const pixels = viewport ? viewport.width * viewport.height * dpr * dpr : 0;
    if (maxTexture >= 8192 && concurrency >= 8 && (memory === 0 || memory >= 6) && pixels >= 1_000_000) {
        return 'high';
    }
    if (maxTexture >= 4096 && concurrency >= 4) return 'mid';
    return 'low';
}

export class QualityGovernor {
    constructor({
        performanceMonitor = null,
        isMobile = false,
        tier = null,
        adapterLimits = null,
        sampleWindowMs = 7000,
        autoFallback = false,
        onQualityStateChange = null,
    } = {}) {
        this.performanceMonitor = performanceMonitor;
        this.isMobile = isMobile;
        this.sampleWindowMs = sampleWindowMs;
        this.autoFallback = autoFallback;
        this.onQualityStateChange = onQualityStateChange;
        this.samples = [];
        this.missWindows = 0;
        this.recoverWindows = 0;
        this.qualityIndex = 0;
        this.fallbackReason = null;
        this.basePixelRatio = isMobile ? 1 : Math.min(globalThis.devicePixelRatio ?? 1, 2);
        this.deviceTier = classifyDeviceTier({
            isMobile,
            tier,
            adapterLimits,
            viewport: typeof window === 'undefined'
                ? null
                : { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio ?? 1 },
            hardwareConcurrency: globalThis.navigator?.hardwareConcurrency,
            deviceMemory: globalThis.navigator?.deviceMemory,
        });
        this.state = this._makeState(null);
    }

    sample({ frameTime, renderer = null, rendererMode = null, sceneId = null } = {}) {
        if (!Number.isFinite(frameTime) || frameTime <= 0) return this.state;
        const now = performance.now();
        this.samples.push(frameTime);
        if (this.samples.length > 240) this.samples.shift();
        if (!this.windowStartedAt) this.windowStartedAt = now;
        if (now - this.windowStartedAt < this.sampleWindowMs) {
            this.state = this._makeState(null);
            return this.state;
        }

        const frameP95 = percentile(this.samples, 95);
        const frameP99 = percentile(this.samples, 99);
        const budget = WEBGPU_MOBILE_BUDGETS[this.deviceTier] ?? WEBGPU_MOBILE_BUDGETS.mid;
        const overBudget = frameP95 > budget.frameP95 || frameP99 > budget.frameP99;
        const windowSummary = {
            sceneId,
            frameP95,
            frameP99,
            budget,
            overBudget,
        };

        if (overBudget) {
            this.missWindows += 1;
            this.recoverWindows = 0;
            if (this.missWindows >= 2 && this.qualityIndex < QUALITY_STEPS.length - 1) {
                this.qualityIndex += 1;
                this._applyQualityStep(renderer);
                this.missWindows = 0;
            } else if (this.missWindows >= 3 && this.qualityIndex >= QUALITY_STEPS.length - 1) {
                this._recordFallback(rendererMode);
            }
        } else {
            this.recoverWindows += 1;
            this.missWindows = 0;
            if (this.recoverWindows >= 3 && this.qualityIndex > 0) {
                this.qualityIndex -= 1;
                this._applyQualityStep(renderer);
                this.recoverWindows = 0;
            }
        }

        this.samples = [];
        this.windowStartedAt = now;
        this.state = this._makeState(windowSummary);
        this.performanceMonitor?.setQualityState?.(this.state);
        this.onQualityStateChange?.(this.state);
        return this.state;
    }

    getState() {
        return { ...this.state };
    }

    _makeState(lastWindow) {
        return {
            deviceTier: this.deviceTier,
            qualityIndex: this.qualityIndex,
            ...QUALITY_STEPS[this.qualityIndex],
            fallbackReason: this.fallbackReason,
            lastWindow,
        };
    }

    _applyQualityStep(renderer) {
        const step = QUALITY_STEPS[this.qualityIndex];
        renderer?.setPixelRatio?.(this.basePixelRatio * step.renderScale);
    }

    _recordFallback(rendererMode) {
        if (this.fallbackReason) return;
        if (!String(rendererMode ?? '').startsWith('webgpu')) return;
        this.fallbackReason = 'webgpu-frame-budget';
        const record = { reason: this.fallbackReason, at: Date.now() };
        try {
            localStorage.setItem('sds-renderer-fallback', JSON.stringify(record));
        } catch {}
        if (typeof window !== 'undefined' && window.__sdsRendererMode) {
            window.__sdsRendererMode.fallbackReason = this.fallbackReason;
        }
        if (this.autoFallback && typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('renderer', 'webgl');
            url.searchParams.set('fallbackReason', this.fallbackReason);
            window.location.replace(url.href);
        }
    }
}
