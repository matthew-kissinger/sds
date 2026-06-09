// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { WEBGPU_MOBILE_BUDGETS, WEBGPU_DESKTOP_BUDGET, percentile } from './RenderCostReport.js';

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
        warmupMs = 6000,
        maxFrameTimeMs = 200,
        gapResetMs = 1500,
        autoFallback = false,
        onQualityStateChange = null,
    } = {}) {
        this.performanceMonitor = performanceMonitor;
        this.isMobile = isMobile;
        this.sampleWindowMs = sampleWindowMs;
        this.warmupMs = warmupMs;
        this.maxFrameTimeMs = maxFrameTimeMs;
        this.gapResetMs = gapResetMs;
        this.warmupUntil = null;
        this.lastSampleAt = null;
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
        // A backgrounded tab throttles rAF to ~1 fps; those frames are ~100x
        // steady-state and would instantly (and falsely) trip overBudget. Never
        // sample while hidden.
        if (typeof document !== 'undefined' && document.hidden) return this.state;
        const now = performance.now();
        // Cold-load warmup grace: the first seconds after first-interactive carry
        // the one-time pipeline-compile + texture-upload spike. Skip them so a
        // boot cost is never read as a sustained miss that floors quality (and,
        // at the floor, demotes the renderer).
        if (this.warmupUntil === null) this.warmupUntil = now + this.warmupMs;
        if (now < this.warmupUntil) {
            this.lastSampleAt = now;
            return this.state;
        }
        // Discontinuity guard: a long gap since the previous sample (un-hide, a
        // modal, a debugger pause) yields one giant catch-up frame. Discard the
        // stale window instead of folding the spike into the percentile.
        if (this.lastSampleAt !== null && now - this.lastSampleAt > this.gapResetMs) {
            this.samples = [];
            this.windowStartedAt = now;
            this.lastSampleAt = now;
            return this.state;
        }
        this.lastSampleAt = now;
        // Drop single-frame outliers (GC pause, a one-off hitch): they do not
        // represent steady render cost and would dominate p99 in a short window.
        if (frameTime > this.maxFrameTimeMs) return this.state;
        this.samples.push(frameTime);
        if (this.samples.length > 240) this.samples.shift();
        if (!this.windowStartedAt) this.windowStartedAt = now;
        if (now - this.windowStartedAt < this.sampleWindowMs) {
            this.state = this._makeState(null);
            return this.state;
        }

        const frameP95 = percentile(this.samples, 95);
        const frameP99 = percentile(this.samples, 99);
        const budget = this._budget();
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
            if (this.recoverWindows >= 2 && this.qualityIndex > 0) {
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

    _budget() {
        // Desktop is always classified 'high'; give it its own discrete-GPU
        // budget instead of the mobile-high bar. Mobile keeps the per-tier
        // thresholds from WEBGPU_MOBILE_BUDGETS.
        if (!this.isMobile) return WEBGPU_DESKTOP_BUDGET;
        return WEBGPU_MOBILE_BUDGETS[this.deviceTier] ?? WEBGPU_MOBILE_BUDGETS.mid;
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
        // Cycle 82/84: desktop never demotes the renderer on a frame-budget miss.
        // The lowest QUALITY_STEPS rung is the floor. This is the ONLY writer of
        // the 24h sticky 'sds-renderer-fallback' flag. Writing it from a transient
        // desktop step-down un-ships the WebGPU flagship and flips the next load to
        // WebGL for 24h (the "WebGPU/WebGL split"). Mobile WebGPU still gets this
        // protective fallback after repeated misses at the floor.
        if (!this.isMobile) return;
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
