import { shouldApplyKonveyorRendererFlag } from '../rendering/konveyorRuntimeMode.js';

const FLAG_PARAM = 'konveyorGrass';

function getWindowSearch() {
    if (typeof window === 'undefined') return '';
    return window.location?.search ?? '';
}

function getWindowFactories() {
    if (typeof window === 'undefined') return null;
    return window.__sdsKonveyorGrassMaterialFactories ?? null;
}

function defaultResult(kind, reason, createDefaultMaterial) {
    const material = createDefaultMaterial();
    return {
        material,
        controls: null,
        summary: {
            kind,
            applied: false,
            reason,
        },
    };
}

export function shouldApplyKonveyorGrass(search = getWindowSearch()) {
    return shouldApplyKonveyorRendererFlag(search, FLAG_PARAM);
}

export function createKonveyorGrassMaterial(kind, factoryName, {
    createDefaultMaterial,
    search = getWindowSearch(),
    factories = getWindowFactories(),
    context = {},
} = {}) {
    if (!shouldApplyKonveyorGrass(search)) {
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
    return {
        material,
        controls,
        summary: {
            kind,
            applied: true,
            reason: null,
            hasControls: !!controls,
        },
    };
}
