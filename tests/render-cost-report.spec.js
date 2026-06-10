// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';

import {
    buildRenderCostReport,
    inferRendererMode,
    isWebGpuRenderer,
    sumSystemTriangles,
} from '../js/perf/RenderCostReport.js';
import { QualityGovernor, classifyDeviceTier } from '../js/perf/QualityGovernor.js';

describe('WebGPU mobile render cost reporting', () => {
    it('uses custom system estimates for WebGPU triangle cost', () => {
        const renderer = {
            isWebGPURenderer: true,
            info: {
                render: { calls: 123, triangles: 0 },
            },
        };
        const breakdown = [
            { name: 'Terrain', count: 131072 },
            { name: 'Trees', count: 580000 },
            { name: 'Grass', count: 240000 },
        ];
        const report = buildRenderCostReport({
            renderer,
            deviceTier: 'high',
            sceneId: 'rolling-hills',
            cameraPose: 'tree-occluded',
            frameTimes: [16, 17, 18, 22, 24],
            drawCalls: renderer.info.render.calls,
            systemBreakdown: breakdown,
            visibleCountsBySystem: { Trees: 179 },
            qualityState: { renderScale: 1 },
        });

        expect(inferRendererMode(renderer)).toBe('webgpu-production');
        expect(isWebGpuRenderer(renderer)).toBe(true);
        expect(sumSystemTriangles(breakdown)).toBe(951072);
        expect(report).toMatchObject({
            renderer: 'webgpu-production',
            deviceTier: 'high',
            sceneId: 'rolling-hills',
            cameraPose: 'tree-occluded',
            frameP95: 24,
            frameP99: 24,
            drawCalls: 123,
            estimatedTrianglesBySystem: {
                Terrain: 131072,
                Trees: 580000,
                Grass: 240000,
            },
            visibleCountsBySystem: { Trees: 179 },
            qualityState: { renderScale: 1 },
        });
    });

    it('classifies mobile WebGPU capability from adapter limits when no tier is forced', () => {
        expect(classifyDeviceTier({
            isMobile: true,
            tier: 'low',
            adapterLimits: { maxTextureDimension2D: 8192 },
            hardwareConcurrency: 8,
            deviceMemory: 8,
            viewport: { width: 384, height: 698, dpr: 2.8125 },
        })).toBe('high');
        expect(classifyDeviceTier({
            isMobile: true,
            adapterLimits: { maxTextureDimension2D: 4096 },
            hardwareConcurrency: 4,
        })).toBe('mid');
    });

    it('degrades quality after repeated over-budget WebGPU windows', () => {
        const renderer = { setPixelRatioCalls: [], setPixelRatio(value) { this.setPixelRatioCalls.push(value); } };
        const perf = { setQualityStateCalls: [], setQualityState(state) { this.setQualityStateCalls.push(state); } };
        const qualityChanges = [];
        const governor = new QualityGovernor({
            performanceMonitor: perf,
            isMobile: true,
            tier: 'high',
            sampleWindowMs: 1,
            warmupMs: 0,
            onQualityStateChange: (state) => qualityChanges.push(state),
        });
        governor.windowStartedAt = performance.now() - 2;
        governor.samples = [30, 31, 32, 33, 34];
        governor.sample({ frameTime: 34, renderer, rendererMode: 'webgpu-production', sceneId: 'field' });
        governor.windowStartedAt = performance.now() - 2;
        governor.samples = [30, 31, 32, 33, 34];
        const state = governor.sample({ frameTime: 34, renderer, rendererMode: 'webgpu-production', sceneId: 'field' });

        expect(state.qualityIndex).toBe(1);
        expect(state.renderScale).toBe(0.9);
        expect(renderer.setPixelRatioCalls.at(-1)).toBeCloseTo(0.9);
        expect(perf.setQualityStateCalls.length).toBeGreaterThan(0);
        expect(qualityChanges.at(-1)).toMatchObject({
            grassDistanceScale: 0.85,
            treeLodBias: 0.15,
            waterSparkleScale: 0.75,
            sheepAnimationRate: 1.0,
        });
    });

    it('does not degrade quality from a single over-budget frame inside the window', () => {
        const renderer = { setPixelRatioCalls: [], setPixelRatio(value) { this.setPixelRatioCalls.push(value); } };
        const governor = new QualityGovernor({
            isMobile: true,
            tier: 'high',
            sampleWindowMs: 7000,
            warmupMs: 0,
        });
        const state = governor.sample({ frameTime: 60, renderer, rendererMode: 'webgpu-production', sceneId: 'field' });
        expect(state.qualityIndex).toBe(0);
        expect(state.renderScale).toBe(1);
        expect(renderer.setPixelRatioCalls.length).toBe(0);
    });

    it('recovers quality after sustained stable windows', () => {
        const renderer = { setPixelRatioCalls: [], setPixelRatio(value) { this.setPixelRatioCalls.push(value); } };
        const governor = new QualityGovernor({
            isMobile: true,
            tier: 'high',
            sampleWindowMs: 1,
            warmupMs: 0,
        });
        for (let i = 0; i < 2; i++) {
            governor.windowStartedAt = performance.now() - 2;
            governor.samples = [30, 31, 32, 33, 34];
            governor.sample({ frameTime: 34, renderer, rendererMode: 'webgpu-production', sceneId: 'field' });
        }
        expect(governor.getState().qualityIndex).toBe(1);

        for (let i = 0; i < 3; i++) {
            governor.windowStartedAt = performance.now() - 2;
            governor.samples = [14, 15, 15, 16, 16];
            governor.sample({ frameTime: 16, renderer, rendererMode: 'webgpu-production', sceneId: 'field' });
        }
        const recovered = governor.getState();
        expect(recovered.qualityIndex).toBe(0);
        expect(recovered.renderScale).toBe(1);
        expect(renderer.setPixelRatioCalls.at(-1)).toBeCloseTo(1);
    });

    it('never demotes the renderer at the floor: no sticky record, one floor telemetry event', () => {
        // Cycle 87 Phase 1: frame-budget misses step quality only. The old
        // mobile 24h 'sds-renderer-fallback' record is gone; what remains is a
        // single webgpu_frame_budget_floor telemetry event per session.
        const renderer = { setPixelRatio() {} };
        const emitted = [];
        try { localStorage.removeItem('sds-renderer-fallback'); } catch {}
        const governor = new QualityGovernor({
            isMobile: true,
            tier: 'high',
            sampleWindowMs: 1,
            warmupMs: 0,
            emitTelemetry: (name, props) => emitted.push({ name, props }),
        });
        const pushOverBudget = () => {
            governor.windowStartedAt = performance.now() - 2;
            governor.samples = [30, 31, 32, 33, 34];
            return governor.sample({ frameTime: 34, renderer, rendererMode: 'webgpu-production', sceneId: 'newsheepdogland' });
        };
        for (let i = 0; i < 6; i++) pushOverBudget();
        expect(governor.getState().qualityIndex).toBe(3);
        expect(governor.getState().fallbackReason).toBeNull();
        expect(emitted.length).toBe(0);
        for (let i = 0; i < 8; i++) pushOverBudget();
        expect(governor.getState().fallbackReason).toBeNull();
        const sticky = (() => {
            try { return localStorage.getItem('sds-renderer-fallback'); } catch { return null; }
        })();
        expect(sticky).toBeNull();
        expect(emitted.length).toBe(1);
        expect(emitted[0].name).toBe('webgpu_frame_budget_floor');
        expect(emitted[0].props).toMatchObject({
            deviceTier: 'high',
            isMobile: true,
            sceneId: 'newsheepdogland',
            qualityIndex: 3,
        });
        expect(emitted[0].props.frameP95).toBeGreaterThan(0);
    });

    it('treats non-webgpu rendererMode as ineligible for the floor telemetry event', () => {
        const renderer = { setPixelRatio() {} };
        const emitted = [];
        const governor = new QualityGovernor({
            isMobile: true,
            tier: 'high',
            sampleWindowMs: 1,
            warmupMs: 0,
            emitTelemetry: (name, props) => emitted.push({ name, props }),
        });
        const pushOverBudget = () => {
            governor.windowStartedAt = performance.now() - 2;
            governor.samples = [60, 60, 60, 60, 60];
            return governor.sample({ frameTime: 60, renderer, rendererMode: 'webgl', sceneId: 'field' });
        };
        for (let i = 0; i < 12; i++) pushOverBudget();
        expect(governor.getState().fallbackReason).toBeNull();
        expect(emitted.length).toBe(0);
    });
});

describe('Desktop WebGPU quality governance (Cycle 82)', () => {
    it('does not demote the desktop renderer or set a sticky fallback at the quality floor', () => {
        // The "WebGPU/WebGL split": desktop at the quality floor must stay
        // WebGPU. Since Cycle 87 Phase 1 the same holds on mobile.
        const renderer = { setPixelRatio() {} };
        try { localStorage.removeItem('sds-renderer-fallback'); } catch {}
        const governor = new QualityGovernor({
            isMobile: false,
            tier: 'high',
            sampleWindowMs: 1,
            warmupMs: 0,
            emitTelemetry: () => {},
        });
        const pushOverBudget = () => {
            governor.windowStartedAt = performance.now() - 2;
            governor.samples = [30, 31, 32, 33, 34]; // p95 34 > the 28ms desktop budget
            return governor.sample({ frameTime: 34, renderer, rendererMode: 'webgpu-production', sceneId: 'newsheepdogland' });
        };
        for (let i = 0; i < 20; i++) pushOverBudget();
        const state = governor.getState();
        expect(state.qualityIndex).toBe(3);       // quality floors as a soft cap
        expect(state.fallbackReason).toBeNull();  // but the renderer is NOT demoted
    });

    it('judges desktop at the discrete-GPU budget, not the mobile-high bar', () => {
        // 22ms p95 (a 2-vsync hitch on a 144Hz panel) is over the mobile-high
        // 18.5ms budget but under the 28ms desktop budget: desktop must not step.
        const renderer = { setPixelRatioCalls: [], setPixelRatio(v) { this.setPixelRatioCalls.push(v); } };
        const governor = new QualityGovernor({ isMobile: false, tier: 'high', sampleWindowMs: 1, warmupMs: 0 });
        for (let i = 0; i < 6; i++) {
            governor.windowStartedAt = performance.now() - 2;
            governor.samples = [18, 19, 20, 21, 22];
            governor.sample({ frameTime: 22, renderer, rendererMode: 'webgpu-production', sceneId: 'newsheepdogland' });
        }
        expect(governor.getState().qualityIndex).toBe(0);
        expect(renderer.setPixelRatioCalls.length).toBe(0);
    });

    it('skips frames during the cold-load warmup grace', () => {
        const renderer = { setPixelRatioCalls: [], setPixelRatio(v) { this.setPixelRatioCalls.push(v); } };
        const governor = new QualityGovernor({ isMobile: false, tier: 'high', sampleWindowMs: 1, warmupMs: 60_000 });
        for (let i = 0; i < 10; i++) {
            governor.windowStartedAt = performance.now() - 2;
            governor.samples = [40, 41, 42, 43, 44]; // well over budget
            governor.sample({ frameTime: 44, renderer, rendererMode: 'webgpu-production', sceneId: 'newsheepdogland' });
        }
        // Still inside the warmup grace: nothing is sampled, no step-down.
        expect(governor.getState().qualityIndex).toBe(0);
        expect(renderer.setPixelRatioCalls.length).toBe(0);
    });

    it('drops single-frame outliers instead of folding them into the window', () => {
        const governor = new QualityGovernor({ isMobile: false, tier: 'high', sampleWindowMs: 7000, warmupMs: 0 });
        governor.sample({ frameTime: 5000, rendererMode: 'webgpu-production', sceneId: 'newsheepdogland' });
        governor.sample({ frameTime: 4000, rendererMode: 'webgpu-production', sceneId: 'newsheepdogland' });
        // Outliers (> maxFrameTimeMs) are dropped before reaching the percentile buffer.
        expect(governor.samples.length).toBe(0);
        expect(governor.getState().qualityIndex).toBe(0);
    });
});
