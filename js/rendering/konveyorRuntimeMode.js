// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
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
    const explicitTreeImpostorRoute = params.get('renderer') === 'webgpu'
        && params.has('konveyorNativeTreeImpostors');
    return explicitTreeImpostorRoute || isKonveyorProductionWebGpuActive();
}
