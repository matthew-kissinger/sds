// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * [P3-WEBGPU] Single definition of the webgpu (WebGPU node material)
 * adapter boilerplate that was previously repeated across the per-domain
 * webgpu*MaterialAdapter.js files (sheep, terrain, grass, water,
 * atmosphere, effects, impostors, tree/rock).
 *
 * Each domain adapter is now a thin call into createWebGpuMaterialAdapter
 * with its per-material config: the URL flag param, the
 * window.__sdsWebGpu*MaterialFactories global to read factories from, the
 * window.__sdsWebGpu*MaterialAdapter global to expose the last summary on
 * (kept for the existing debug surface), and the material.userData keys that
 * may carry factory controls.
 *
 * Degradation surfacing: when the webgpu flag is active but a factory is
 * missing or returns nothing, the fallback to the default material used to
 * be recorded only on the window globals (and folded into
 * window.__sdsG.productionWebGpu checks). It now also console.warns once per
 * material name and emits a `webgpu_material_degraded` telemetry event.
 * The `flag-disabled` reason is the normal WebGL path and is never reported.
 *
 * No functional change to material construction: same factories, same args,
 * same call order, same fallback materials as the pre-consolidation adapters.
 */
import { getWindowSearch, shouldApplyWebGpuRendererFlag } from '../rendering/webgpuRuntimeMode.js';
import { emitEvent } from '../telemetry.js';

const DEGRADATION_REASONS = new Set(['missing-factories', 'invalid-factory-result']);
const warnedMaterialNames = new Set();

/**
 * Surface a webgpu material degradation: console.warn once per material
 * name and emit a telemetry event. `flag-disabled` (the normal WebGL path)
 * and repeat reports for the same material name are no-ops.
 *
 * @param {string} kind - material name, e.g. 'sheep-wool', 'terrain-ground'
 * @param {string} reason - 'missing-factories' | 'invalid-factory-result'
 */
export function reportWebGpuMaterialDegradation(kind, reason) {
    if (!DEGRADATION_REASONS.has(reason)) return;
    if (warnedMaterialNames.has(kind)) return;
    warnedMaterialNames.add(kind);
    console.warn(
        `[webgpu] WebGPU material factory degraded for "${kind}" (${reason}); using the default material.`
    );
    emitEvent('webgpu_material_degraded', { kind, reason });
}

/** Test-only: clear the warn-once set so specs can assert the first report. */
export function resetWebGpuMaterialDegradationReportsForTests() {
    warnedMaterialNames.clear();
}

/**
 * Build a webgpu material adapter for one domain.
 *
 * @param {object} config
 * @param {string} config.flagParam - URL param gating this domain, e.g. 'webgpuSheep'
 * @param {string} config.factoriesGlobal - window global holding the factory map,
 *   e.g. '__sdsWebGpuSheepMaterialFactories'
 * @param {string|null} [config.summaryGlobal] - window global to expose the last
 *   summary on (null to skip, matching the grass adapter's historical behavior)
 * @param {string[]} [config.controlsUserDataKeys] - material.userData keys checked
 *   for factory controls when the factory result carries none
 * @returns {{
 *   shouldApply: (search?: string) => boolean,
 *   createMaterial: (kind: string, factoryName: string, options?: object) => {
 *     material: object, controls: object|null, summary: object
 *   },
 *   getWindowFactories: () => object|null,
 *   exposeSummary: (summary: object) => object,
 * }}
 */
export function createWebGpuMaterialAdapter({
    flagParam,
    factoriesGlobal,
    summaryGlobal = null,
    controlsUserDataKeys = [],
}) {
    function getWindowFactories() {
        if (typeof window === 'undefined') return null;
        return window[factoriesGlobal] ?? null;
    }

    function exposeSummary(summary) {
        if (summaryGlobal && typeof window !== 'undefined') {
            window[summaryGlobal] = summary;
        }
        return summary;
    }

    function shouldApply(search = getWindowSearch()) {
        return shouldApplyWebGpuRendererFlag(search, flagParam);
    }

    function defaultResult(kind, reason, createDefaultMaterial) {
        reportWebGpuMaterialDegradation(kind, reason);
        const material = createDefaultMaterial();
        const summary = exposeSummary({
            kind,
            applied: false,
            reason,
        });
        return { material, controls: null, summary };
    }

    function resolveControls(result, material) {
        if (result?.controls) return result.controls;
        for (const key of controlsUserDataKeys) {
            const controls = material.userData?.[key];
            if (controls) return controls;
        }
        return null;
    }

    function createMaterial(kind, factoryName, {
        createDefaultMaterial,
        search = getWindowSearch(),
        factories = getWindowFactories(),
        context = {},
    } = {}) {
        if (!shouldApply(search)) {
            return defaultResult(kind, 'flag-disabled', createDefaultMaterial);
        }

        const factory = factories?.[factoryName];
        if (typeof factory !== 'function') {
            return defaultResult(kind, 'missing-factories', createDefaultMaterial);
        }

        const result = factory(context);
        const material = result?.material ?? result;
        if (!material) {
            return defaultResult(kind, 'invalid-factory-result', createDefaultMaterial);
        }

        const controls = resolveControls(result, material);
        const summary = exposeSummary({
            kind,
            applied: true,
            reason: null,
            hasControls: !!controls,
        });
        return { material, controls, summary };
    }

    return { shouldApply, createMaterial, getWindowFactories, exposeSummary };
}
