export function getWindowSearch() {
    if (typeof window === 'undefined') return '';
    return window.location?.search ?? '';
}

export function isKonveyorProductionWebGpuActive() {
    if (typeof window === 'undefined') return false;
    return window.__sdsRendererMode?.effective === 'webgpu-production'
        && window.__sdsG?.productionWebGpu?.enabled === true;
}

export function shouldApplyKonveyorRendererFlag(search = getWindowSearch(), flagParam) {
    const params = new URLSearchParams(search);
    return (params.get('renderer') === 'webgpu' && params.get(flagParam) === '1')
        || isKonveyorProductionWebGpuActive();
}

export function shouldUseKonveyorProductionNativeInstancing(search = getWindowSearch()) {
    const params = new URLSearchParams(search);
    const explicitScoutRoute = params.get('renderer') === 'webgpu'
        && params.get('konveyorProductionBootScout') === '1'
        && params.get('konveyorProductionSceneBody') === '1'
        && params.get('konveyorNativeInstancing') === '1';
    const explicitTreeImpostorRoute = params.get('renderer') === 'webgpu'
        && params.has('konveyorNativeTreeImpostors');
    return explicitScoutRoute || explicitTreeImpostorRoute || isKonveyorProductionWebGpuActive();
}
