import { shouldApplyKonveyorRendererFlag } from './rendering/konveyorRuntimeMode.js';

const FLAG_PARAM = 'konveyorSheep';

function getWindowSearch() {
    if (typeof window === 'undefined') return '';
    return window.location?.search ?? '';
}

function getWindowFactories() {
    if (typeof window === 'undefined') return null;
    return window.__sdsKonveyorSheepMaterialFactories ?? null;
}

function exposeSummary(summary) {
    if (typeof window !== 'undefined') {
        window.__sdsKonveyorSheepMaterialAdapter = summary;
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

export function shouldApplyKonveyorSheep(search = getWindowSearch()) {
    return shouldApplyKonveyorRendererFlag(search, FLAG_PARAM);
}

export function createKonveyorSheepMaterial(kind, factoryName, {
    createDefaultMaterial,
    search = getWindowSearch(),
    factories = getWindowFactories(),
    context = {},
} = {}) {
    if (!shouldApplyKonveyorSheep(search)) {
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

    const controls = result?.controls ?? null;
    const summary = {
        kind,
        applied: true,
        reason: null,
        hasControls: !!controls,
    };
    exposeSummary(summary);
    return { material, controls, summary };
}
