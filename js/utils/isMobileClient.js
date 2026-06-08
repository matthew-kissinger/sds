// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
//
// Single source of truth for the synchronous "is this a mobile client?" check used by
// the renderer tier-gate (Cycle 81): the WebGL pin on the flagship survival island is
// honored on mobile and lifted to WebGPU on desktop, decided at boot (before React
// mounts) and on every in-app scene swap. SceneManager.detectMobileDevice delegates
// here so the signal that gates the renderer is byte-identical to the `isMobile` that
// GrassSystem / TreePlacement receive - a mismatch would load the flagship on WebGPU
// without the compute-cull consolidation and refreeze the tab.

export function isMobileClient() {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
    const userAgent = navigator.userAgent || '';
    const isMobileUA = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768 || window.innerHeight <= 768;
    return isMobileUA || (hasTouch && isSmallScreen);
}
