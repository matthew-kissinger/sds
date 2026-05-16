import { shouldApplyKonveyorRendererFlag } from '../rendering/konveyorRuntimeMode.js';

const FLAG_PARAM = 'konveyorWater';

function getWindowSearch() {
    if (typeof window === 'undefined') return '';
    return window.location?.search ?? '';
}

function getWindowFactories() {
    if (typeof window === 'undefined') return null;
    return window.__sdsKonveyorWaterMaterialFactories ?? null;
}

function exposeSummary(summary) {
    if (typeof window !== 'undefined') {
        window.__sdsKonveyorWaterMaterialAdapter = summary;
    }
}

function defaultResult(kind, reason, createDefaultMaterial) {
    const material = createDefaultMaterial();
    const summary = {
        kind,
        applied: false,
        reason,
    };
    exposeSummary(summary);
    return { material, controls: null, summary };
}

export function shouldApplyKonveyorWater(search = getWindowSearch()) {
    return shouldApplyKonveyorRendererFlag(search, FLAG_PARAM);
}

export function createKonveyorWaterMaterial(kind, factoryName, {
    createDefaultMaterial,
    search = getWindowSearch(),
    factories = getWindowFactories(),
    context = {},
} = {}) {
    if (!shouldApplyKonveyorWater(search)) {
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

    const controls = result?.controls ?? material.userData?.konveyorWaterMaterialControls ?? null;
    const summary = {
        kind,
        applied: true,
        reason: null,
        hasControls: !!controls,
    };
    exposeSummary(summary);
    return { material, controls, summary };
}
