// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Scene-swap helpers extracted from `main.js` in Cycle 28 Stream B1.
 *
 * `disposeScene(game)` drains scene-coupled GPU + listener state in the
 * Cycle 11 Phase 1 ordering: events -> effects -> actors -> structures ->
 * water before atmosphere -> terrain ->
 * atmosphere → sun billboard → state drain → renderer cache. Each
 * disposer wraps in try/catch with warn logs so a single subsystem
 * failure doesn't abort the rest of the teardown.
 *
 * Behavior is unchanged from the original inline `disposeScene` method.
 */

/**
 * @param {object} game SheepDogSimulation instance.
 */
export async function disposeScene(game) {
    console.log('[SWAP] disposeScene() — full teardown');
    game._sceneRebuilding = true;

    // Cycle 65: tear down the homestead day loop + its HUD chip (no-op on
    // non-day-loop scenes). Cleared before the rest so the main loop's
    // _tickDayLoop stops touching a half-disposed scene mid-teardown.
    game._tickDayLoop = null;
    game.dayLoop = null;
    game._cutsceneActive = false;
    try { game._skipToDusk?.dispose?.(); } catch (err) { console.warn('[SWAP] skipToDusk dispose:', err); }
    game._skipToDusk = null;
    try { game._unmountDayNightChip?.(); } catch (err) { console.warn('[SWAP] dayNightChip unmount:', err); }
    game._unmountDayNightChip = null;

    // Cycle 66: tear down the survival predator layer + minimap and clear the
    // pen/run refs so the main loop never touches a half-disposed scene's flock.
    // No-op on non-survival scenes (these are null there).
    try { game._wolfPack?.dispose?.(); } catch (err) { console.warn('[SWAP] wolfPack dispose:', err); }
    game._wolfPack = null;
    game._survivalRun = null;
    game._penBarrier = null;
    // Cycle 67 P6: tear down the co-op survival renderer (DO-driven wolves).
    try { game._coopWolfRenderer?.dispose?.(); } catch (err) { console.warn('[SWAP] coop wolf renderer dispose:', err); }
    game._coopWolfRenderer = null;
    game._coopWolfRendererPending = false;
    game._coopSurvivalTs = 0;
    try { game._unmountMinimap?.(); } catch (err) { console.warn('[SWAP] minimap unmount:', err); }
    game._unmountMinimap = null;

    // Cycle 46 / Cycle 52 P1: tear down an in-engine reveal layer if present.
    // Only set while a reveal is armed; a no-op on every normal scene-to-scene
    // swap.
    //
    // Exception: a reveal that dissolves over the streaming scene keeps the
    // layer alive through teardown. main.js clears `_keepRevealLayer` right
    // after this returns and disposes the layer when the dissolve completes
    // (`_endReveal`).
    if (game._revealLayer && !game._keepRevealLayer) {
        try { game._revealLayer.dispose(); } catch (err) { console.warn('[SWAP] revealLayer dispose:', err); }
        game._revealLayer = null;
    }

    // Cycle 12 Phase 1 A8: optional per-subsystem renderer.info snapshot
    // for diagnosing texture/program drift. Enable from DevTools with
    // `window.__sdsSwapDriftLog = true`. Off in production swaps to keep
    // disposeScene allocation-free.
    const driftLog = (typeof window !== 'undefined' && window.__sdsSwapDriftLog === true);
    const renderer = driftLog ? game.sceneManager?.getRenderer?.() : null;
    const snap = renderer
        ? () => ({
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
            programs: renderer.info.programs?.length ?? 0,
        })
        : null;
    const step = driftLog
        ? (label, before) => {
            const after = snap();
            const dGeo = after.geometries - before.geometries;
            const dTex = after.textures - before.textures;
            const dPrg = after.programs - before.programs;
            console.log(`[SWAP][drift] ${label}: Δgeo=${dGeo} Δtex=${dTex} Δprog=${dPrg} → ${after.geometries}/${after.textures}/${after.programs}`);
            return after;
        }
        : () => null;
    let baseSnap = snap?.();

    // 1. Stop event-driven systems first — listeners can fire mid-teardown.
    try { game._sceneAbort?.abort(); } catch (err) { console.warn('[SWAP] sceneAbort.abort threw:', err); }
    game._sceneAbort = new AbortController();
    if (driftLog) baseSnap = step('sceneAbort', baseSnap);

    // 2. Effects (PortalEffect, CorralZapPool, roundupZoneDecal).
    if (game._portalEffect) {
        try { game._portalEffect.dispose(); } catch (err) { console.warn('[SWAP] portalEffect.dispose:', err); }
        game._portalEffect = null;
    }
    if (game._corralZapPool) {
        try { game._corralZapPool.dispose(); } catch (err) { console.warn('[SWAP] corralZapPool.dispose:', err); }
        game._corralZapPool = null;
    }
    if (game._roundupZoneDecal) {
        try {
            const mesh = game._roundupZoneDecal;
            if (mesh.parent) mesh.parent.remove(mesh);
            mesh.geometry?.dispose();
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(m => m?.dispose?.());
            } else {
                mesh.material?.dispose();
            }
        } catch (err) { console.warn('[SWAP] roundupZoneDecal teardown:', err); }
        game._roundupZoneDecal = null;
    }
    // Cycle 116 Phase 2: THE gate cue dispose entry. The cue is scene-graph
    // geometry at the previous scene's destination, so leaving it standing
    // draws a column in the sea after a swap to an island. Phases 3-B and 4
    // extend the controller's own dispose rather than adding a sibling here.
    try { game._gateCue?.dispose(); } catch (err) { console.warn('[SWAP] gateCue:', err); }
    game._gateCue = null;
    if (driftLog) baseSnap = step('effects', baseSnap);

    // 3. Sheep + sheepdog, in that order: the sheep system holds the flock's
    //    InstancedMesh and the dog teardown below only detaches meshes, so
    //    releasing the heavier GPU state first keeps peak memory down on a swap.
    try {
        if (game.gameState?.optimizedSheepSystem) {
            game.gameState.optimizedSheepSystem.dispose();
            game.gameState.optimizedSheepSystem = null;
        }
        if (game.gameState) game.gameState.sheep = [];
    } catch (err) { console.warn('[SWAP] sheep dispose:', err); }
    if (driftLog) baseSnap = step('sheep', baseSnap);

    try {
        if (game.sheepdog?.removePlayerIcon) game.sheepdog.removePlayerIcon();
        if (game.sheepdogMesh) {
            // Sheepdog mesh is a SkeletonUtils.clone of the cached GLB —
            // its geometries + materials are SHARED with the original.
            // Disposing would invalidate the GLB cache and force re-upload
            // on the next clone, which doubled texture count under stress
            // (Phase 1 A8 finding). Remove from scene only; let the cloned
            // skeleton + material refs be garbage-collected.
            if (game.sheepdogMesh.parent) game.sheepdogMesh.parent.remove(game.sheepdogMesh);
        }
        game.sheepdog = null;
        game.sheepdogMesh = null;
    } catch (err) { console.warn('[SWAP] sheepdog dispose:', err); }
    if (driftLog) baseSnap = step('sheepdog', baseSnap);

    // 3b. [P3-LISTENER-AUDIT] Local 2-player session teardown. A local game
    //     never survives a dispose (both dogs and the flock are torn down
    //     above), but the session state used to: LocalInputHandler leaked a
    //     window keydown/keyup/blur set per local game (its Escape handler
    //     kept firing pause toggles from the menu), and player 2's dog mesh
    //     stayed in the scene. No-op on solo/MP paths (all fields null/false).
    try {
        game.localInputHandler?.destroy?.();
    } catch (err) { console.warn('[SWAP] localInputHandler destroy:', err); }
    game.localInputHandler = null;
    game.localMultiplayerManager = null;
    game.twoPlayerCamera = null;
    game.isLocalMultiplayer = false;
    try {
        game.sheepdog2?.removePlayerIcon?.();
        if (game.sheepdogMesh2?.parent) {
            // Same rule as the player-1 dog above: the mesh is a
            // SkeletonUtils.clone sharing the cached GLB's geometry +
            // materials. Remove from scene only; never dispose.
            game.sheepdogMesh2.parent.remove(game.sheepdogMesh2);
        }
        game.sheepdog2 = null;
        game.sheepdogMesh2 = null;
    } catch (err) { console.warn('[SWAP] sheepdog2 dispose:', err); }

    // 4. Other-player dogs (MP — solo path is no-op, harmless).
    if (game.otherPlayers?.size) {
        for (const [, dog] of game.otherPlayers) {
            try {
                dog.removePlayerIcon?.();
            } catch {}
        }
        game.otherPlayers.clear();
    }

    // 5. Structures (StructureBuilder.clearAllStructures handles dispose).
    try { game.structureBuilder?.clearAllStructures?.(); } catch (err) { console.warn('[SWAP] structures:', err); }
    if (driftLog) baseSnap = step('structures', baseSnap);

    // 6. Water — BEFORE atmosphere. Depth pre-pass holds a depth-stencil
    //    target tied to the renderer; freeing it before atmosphere avoids
    //    the Mac/Safari WebGL crash class flagged in cycle-11-plan.md.
    try { game.sceneManager?.disposeWater?.(); } catch (err) { console.warn('[SWAP] water:', err); }
    game._animeWater = null;
    game._waterClock = 0;
    if (driftLog) baseSnap = step('water', baseSnap);

    // 7. Terrain (composes grass + trees + rocks + mountains + buildings + mesh).
    //    Keep the instance alive — its GLB models cache is reused across
    //    swaps. dispose() drops scene-coupled state but preserves models.
    try { game.terrainBuilder?.dispose?.(); } catch (err) { console.warn('[SWAP] terrain:', err); }
    if (driftLog) baseSnap = step('terrain', baseSnap);

    // 8. Atmosphere (sky dome + sun + cloud layer + scene.fog).
    try { game.atmosphere?.dispose?.(); } catch (err) { console.warn('[SWAP] atmosphere:', err); }
    game.atmosphere = null;
    if (driftLog) baseSnap = step('atmosphere', baseSnap);

    // 9. Sun billboard.
    try { game._sunBillboard?.dispose?.(); } catch (err) { console.warn('[SWAP] sunBillboard:', err); }
    game._sunBillboard = null;
    if (driftLog) step('sunBillboard', baseSnap);

    // 10. GameState scene-coupled fields. Don't call gameState.reset() —
    //     that resets gameMode/competitiveGates which restartToMenu wants
    //     preserved.
    try {
        if (game.gameState) {
            game.gameState.boundary = null;
            game.gameState.corral = null;
            game.gameState.pen = null;
            game.gameState.objective = null;
            game.gameState.sceneSpawnDef = null;
            game.gameState._objectiveDef = null;
            game.gameState.flockingOverride = null;
            game.gameState.heightfield = null;
        }
    } catch (err) { console.warn('[SWAP] gameState drain:', err); }

    game.heightfield = null;

    // 11. Renderer cache — reduces ghost-frame risk before rebuild's
    //     first render.
    try { game.sceneManager?.getRenderer?.()?.renderLists?.dispose?.(); } catch {}
}
