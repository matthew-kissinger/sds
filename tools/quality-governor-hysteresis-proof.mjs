// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 38 Phase 4 — quality-governor hysteresis proof artifact.
 *
 * Drives the QualityGovernor through a scripted synthetic frame trace
 * covering: degradation under sustained over-budget, recovery under
 * sustained stable budgets, and floor-fallback after the floor still
 * misses budget for repeated windows. The output JSON records the
 * qualityIndex curve so a reviewer can confirm hysteresis (no single
 * over-budget frame oscillates the state) without rebuilding the test.
 *
 * Writes: cycle38-validation/runtime/quality-governor-hysteresis-proof.json
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { QualityGovernor } from '../js/perf/QualityGovernor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'cycle38-validation', 'runtime');
const OUT_PATH = resolve(OUT_DIR, 'quality-governor-hysteresis-proof.json');

function pushWindow(governor, frameTimes, opts = {}) {
    governor.windowStartedAt = performance.now() - 2;
    governor.samples = frameTimes.slice();
    return governor.sample({
        frameTime: frameTimes[frameTimes.length - 1],
        renderer: opts.renderer ?? null,
        rendererMode: opts.rendererMode ?? 'webgpu-production',
        sceneId: opts.sceneId ?? 'rolling-hills',
    });
}

function recordStep(label, state) {
    return {
        label,
        qualityIndex: state.qualityIndex,
        renderScale: state.renderScale,
        grassDistanceScale: state.grassDistanceScale,
        treeLodBias: state.treeLodBias,
        waterSparkleScale: state.waterSparkleScale,
        sheepAnimationRate: state.sheepAnimationRate,
        terrainSegmentScale: state.terrainSegmentScale,
        fallbackReason: state.fallbackReason,
        windowP95: state.lastWindow?.frameP95 ?? null,
        windowP99: state.lastWindow?.frameP99 ?? null,
        overBudget: state.lastWindow?.overBudget ?? null,
    };
}

const OVER_BUDGET = [30, 31, 32, 33, 34];
const STABLE = [14, 15, 15, 16, 16];

const renderer = { setPixelRatioCalls: [], setPixelRatio(v) { this.setPixelRatioCalls.push(v); } };
const governor = new QualityGovernor({
    isMobile: true,
    tier: 'high',
    sampleWindowMs: 1,
});

const trace = [recordStep('initial', governor.getState())];

trace.push(recordStep('over-budget #1 (sub-step)', pushWindow(governor, OVER_BUDGET, { renderer })));
trace.push(recordStep('over-budget #2 (step → 1)', pushWindow(governor, OVER_BUDGET, { renderer })));
trace.push(recordStep('over-budget #3 (sub-step)', pushWindow(governor, OVER_BUDGET, { renderer })));
trace.push(recordStep('over-budget #4 (step → 2)', pushWindow(governor, OVER_BUDGET, { renderer })));
trace.push(recordStep('over-budget #5 (sub-step)', pushWindow(governor, OVER_BUDGET, { renderer })));
trace.push(recordStep('over-budget #6 (step → 3 floor)', pushWindow(governor, OVER_BUDGET, { renderer })));
trace.push(recordStep('over-budget #7 at floor (no fallback yet)', pushWindow(governor, OVER_BUDGET, { renderer })));
trace.push(recordStep('over-budget #8 at floor (no fallback yet)', pushWindow(governor, OVER_BUDGET, { renderer })));
trace.push(recordStep('over-budget #9 at floor (fallback recorded)', pushWindow(governor, OVER_BUDGET, { renderer })));

const renderer2 = { setPixelRatioCalls: [], setPixelRatio(v) { this.setPixelRatioCalls.push(v); } };
const governor2 = new QualityGovernor({
    isMobile: true,
    tier: 'high',
    sampleWindowMs: 1,
});
pushWindow(governor2, OVER_BUDGET, { renderer: renderer2 });
pushWindow(governor2, OVER_BUDGET, { renderer: renderer2 });

const recoveryTrace = [recordStep('degraded to qualityIndex=1', governor2.getState())];
recoveryTrace.push(recordStep('stable #1 (sub-step)', pushWindow(governor2, STABLE, { renderer: renderer2 })));
recoveryTrace.push(recordStep('stable #2 (sub-step)', pushWindow(governor2, STABLE, { renderer: renderer2 })));
recoveryTrace.push(recordStep('stable #3 (recover → 0)', pushWindow(governor2, STABLE, { renderer: renderer2 })));

const singleFrameRenderer = { setPixelRatioCalls: [], setPixelRatio(v) { this.setPixelRatioCalls.push(v); } };
const governor3 = new QualityGovernor({
    isMobile: true,
    tier: 'high',
    sampleWindowMs: 7000,
});
const singleFrameState = governor3.sample({
    frameTime: 60,
    renderer: singleFrameRenderer,
    rendererMode: 'webgpu-production',
    sceneId: 'rolling-hills',
});

const oscillationGuard = {
    label: 'single 60ms frame inside 7s window → no degrade',
    qualityIndex: singleFrameState.qualityIndex,
    renderScale: singleFrameState.renderScale,
    setPixelRatioCalls: singleFrameRenderer.setPixelRatioCalls.length,
};

const artifact = {
    ok: true,
    cycle: 38,
    phase: 4,
    purpose: 'Phase 4 hysteresis proof: sustained over-budget degrades stepwise, single frame inside window does not oscillate, sustained stable budgets recover stepwise, floor-fallback only after repeated over-budget at floor.',
    capturedAt: new Date().toISOString(),
    budgets: 'WEBGPU_MOBILE_BUDGETS.high (p95=18.5ms, p99=25ms)',
    quality_steps: [
        { index: 0, renderScale: 1.0, grassDistanceScale: 1.0, treeLodBias: 0, waterSparkleScale: 1.0, sheepAnimationRate: 1.0, terrainSegmentScale: 1.0 },
        { index: 1, renderScale: 0.9, grassDistanceScale: 0.85, treeLodBias: 0.15, waterSparkleScale: 0.75, sheepAnimationRate: 1.0, terrainSegmentScale: 1.0 },
        { index: 2, renderScale: 0.8, grassDistanceScale: 0.7, treeLodBias: 0.35, waterSparkleScale: 0.5, sheepAnimationRate: 1.0, terrainSegmentScale: 0.75 },
        { index: 3, renderScale: 0.72, grassDistanceScale: 0.55, treeLodBias: 0.55, waterSparkleScale: 0.25, sheepAnimationRate: 1.0, terrainSegmentScale: 0.65 },
    ],
    hysteresis_rules: {
        degradeAfterWindows: 2,
        recoverAfterWindows: 3,
        fallbackFloorWindows: 3,
        sampleWindowMsDefault: 7000,
        notes: 'Default 7s sample window means a 14s sustained over-budget window degrades by one step. Single 60ms frame inside the window does not change state. Floor fallback requires an additional 3 over-budget windows after reaching the lowest quality step.',
    },
    degradation_trace: trace,
    recovery_trace: recoveryTrace,
    oscillation_guard: oscillationGuard,
    setPixelRatioCalls_degradation: renderer.setPixelRatioCalls,
    setPixelRatioCalls_recovery: renderer2.setPixelRatioCalls,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(artifact, null, 2), 'utf8');
console.log(`[hysteresis-proof] wrote ${OUT_PATH}`);
console.log(`  qualityIndex curve: ${trace.map(t => t.qualityIndex).join(' → ')}`);
console.log(`  recovery curve:     ${recoveryTrace.map(t => t.qualityIndex).join(' → ')}`);
console.log(`  fallbackReason:     ${trace.at(-1).fallbackReason}`);
