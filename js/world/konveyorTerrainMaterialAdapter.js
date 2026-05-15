const FLAG_PARAM = 'konveyorTerrain';
const RENDERER_PARAM = 'renderer';

function getWindowSearch() {
    if (typeof window === 'undefined') return '';
    return window.location?.search ?? '';
}

function getWindowFactories() {
    if (typeof window === 'undefined') return null;
    return window.__sdsKonveyorTerrainMaterialFactories ?? null;
}

function exposeSummary(summary) {
    if (typeof window !== 'undefined') {
        window.__sdsKonveyorTerrainMaterialAdapter = summary;
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

export function shouldApplyKonveyorTerrain(search = getWindowSearch()) {
    const params = new URLSearchParams(search);
    return params.get(RENDERER_PARAM) === 'webgpu' && params.get(FLAG_PARAM) === '1';
}

export function createKonveyorTerrainMaterial(kind, factoryName, {
    createDefaultMaterial,
    search = getWindowSearch(),
    factories = getWindowFactories(),
    context = {},
} = {}) {
    if (!shouldApplyKonveyorTerrain(search)) {
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
