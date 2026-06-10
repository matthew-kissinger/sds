// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Overlay z-index registry (Cycle 87 Phase 5).
 *
 * Single source of truth for every player-visible overlay layer. Before this
 * registry each component picked its own number (5..99999), which produced
 * real ordering bugs: the pause menu (1000) rendered UNDER the minimap and
 * day/night chip (1200), and the tutorial pill (600) floated over panels.
 *
 * Bands, lowest to highest:
 *   scene      in-world DOM surfaces (attract overlays, canvas chrome)
 *   hudMeta    passive page chrome (source notice)
 *   hud        HudLayout corner slots
 *   hudBottom  HudLayout bottom-center slot (hints)
 *   chips      vanilla main-loop chips (minimap, day/night, skip-to-dusk)
 *   controls   mobile touch controls (must sit over chips for thumb reach)
 *   toast      the shared top rail (js/ui/overlayRail.js) + its toasts
 *   tutorial   tutorial pill (above toasts, below panels)
 *   panel      side panels and entrance surfaces (tuning, playtest tab)
 *   modal      blocking surfaces (pause menu, summaries, perf warning)
 *   critical   full-screen takeovers (completion, scene swap, error, reload)
 *   debug      developer-only surfaces (stats, harnesses) - always on top
 *
 * Plain JS so vanilla boot files (swUpdateToast, completionOverlay,
 * webglContextRecovery) and React components import the same object.
 * tests/ui/zIndex.spec.ts enforces band ordering and bans new numeric
 * z-index literals in the overlay directories.
 */

export const Z = Object.freeze({
    scene: 5,
    hudMeta: 12,
    hud: 20,
    hudBottom: 30,
    chips: 40,
    controls: 50,
    toast: 60,
    tutorial: 70,
    panel: 80,
    modal: 100,
    critical: 200,
    debug: 1000,
});

/** Ordered band names, lowest first (test surface). */
export const Z_ORDER = Object.freeze([
    'scene', 'hudMeta', 'hud', 'hudBottom', 'chips', 'controls',
    'toast', 'tutorial', 'panel', 'modal', 'critical', 'debug',
]);
