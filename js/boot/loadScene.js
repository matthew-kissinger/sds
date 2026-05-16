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
    if (driftLog) baseSnap = step('effects', baseSnap);

    // 3. Sheep + sheepdog. Sheep before sheepdog so removeDistanceIndicator
    //    has a valid scene during sheepdog teardown.
    try {
        if (game.gameState?.optimizedSheepSystem) {
            game.gameState.optimizedSheepSystem.dispose();
            game.gameState.optimizedSheepSystem = null;
        }
        if (game.gameState) game.gameState.sheep = [];
    } catch (err) { console.warn('[SWAP] sheep dispose:', err); }
    if (driftLog) baseSnap = step('sheep', baseSnap);

    try {
        if (game.sheepdog?.removeDistanceIndicator) game.sheepdog.removeDistanceIndicator();
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

    // 4. Other-player dogs (MP — solo path is no-op, harmless).
    if (game.otherPlayers?.size) {
        for (const [, dog] of game.otherPlayers) {
            try {
                dog.removeDistanceIndicator?.();
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
    if (driftLog) baseSnap = step('sunBillboard', baseSnap);

    // 10. GameState scene-coupled fields. Don't call gameState.reset() —
    //     that resets gameMode/competitiveGates which restartToMenu wants
    //     preserved.
    try {
        if (game.gameState) {
            game.gameState.boundary = null;
            game.gameState.corral = null;
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
