// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Test-only debug surfaces installed on `window` for Playwright specs and
 * DevTools-driven exploration. Extracted from `main.js` in Cycle 28 Stream
 * B1 — these run once at boot and never participate in the per-frame loop.
 *
 * Each function is idempotent — re-installing is a no-op. The probes live
 * under `window.__sdsXxx` so production code never accidentally takes a
 * dependency on them.
 */

/**
 * Cycle 11 Phase 1 acceptance A8: stress test harness for in-process
 * scene swap. Snapshots renderer.info baseline and post-1-swap, then
 * runs N×A→B→C→A loops, reports drift. Acceptance: drift < 5% on
 * geometries, textures, programs.
 *
 * Usage from DevTools:
 *   await window.__sdsStressTestSwaps(5)
 *
 * Cycle 18 Phase 2: also installs `__sdsSwapTo` + `__sdsSwapProbe` which
 * drive a swap to the named scene + expose per-prop terrain delta + sheep-
 * in-bounds counters so the e2e regression gate can assert clean state
 * post-swap without DOM scraping.
 *
 * @param {object} game SheepDogSimulation instance.
 */
export function installStressTestHarness(game) {
    if (typeof window === 'undefined' || window.__sdsStressTestSwaps) return;
    window.__sdsSwapTo = async (id) => {
        await game.swapScene(id);
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        return id;
    };
    window.__sdsSwapProbe = () => {
        const tb = game.terrainBuilder;
        const hf = game.heightfield;
        const scene = game.currentScene?.id ?? null;
        const out = {
            scene,
            hasHeightfield: !!hf,
            grassHeightfieldMatches: tb?.grassSystem ? tb.grassSystem.heightfield === hf : true,
            sheep: { count: 0, outOfBounds: 0, maxDistanceFromCenter: 0, samples: [] },
            objectiveVisual: null,
        };
        if (game.currentScene?.objective || game._portalEffect || game._roundupZoneDecal) {
            const sceneRef = game.sceneManager?.getScene?.();
            const portal = game._portalEffect ?? null;
            const decal = game._roundupZoneDecal ?? null;
            out.objectiveVisual = {
                stage: game.gameState?.objective?.stage ?? null,
                portal: portal ? {
                    present: true,
                    intensity: portal.intensity,
                    targetIntensity: portal.targetIntensity,
                    ringInScene: sceneRef?.children?.includes?.(portal.ring) === true,
                    padInScene: sceneRef?.children?.includes?.(portal.pad) === true,
                    particlesInScene: sceneRef?.children?.includes?.(portal.particles) === true,
                } : null,
                roundupZoneDecal: decal ? {
                    present: true,
                    visible: decal.visible,
                    inScene: sceneRef?.children?.includes?.(decal) === true,
                } : null,
            };
        }
        // Sheep in-bounds vs scene boundary. Q3 fix gate: post-swap mode
        // start should respawn within the new scene's playArea, not
        // leftover positions from the prior mode/scene.
        const sys = game.gameState?.optimizedSheepSystem;
        const boundary = game.currentScene?.boundary;
        if (sys?.sheep) {
            for (const s of sys.sheep) {
                out.sheep.count += 1;
                if (!boundary) continue;
                const x = s?.position?.x;
                const z = s?.position?.z;
                if (typeof x !== 'number' || typeof z !== 'number') continue;
                if (out.sheep.samples.length < 5) {
                    out.sheep.samples.push({ x, z });
                }
                if (boundary.kind === 'island') {
                    const dx = x - (boundary.center?.x ?? 0);
                    const dz = z - (boundary.center?.z ?? 0);
                    out.sheep.maxDistanceFromCenter = Math.max(
                        out.sheep.maxDistanceFromCenter,
                        Math.sqrt(dx * dx + dz * dz)
                    );
                    const r = boundary.radius - (boundary.falloff ?? 0);
                    if (dx * dx + dz * dz > r * r) out.sheep.outOfBounds += 1;
                } else if (boundary.minX != null) {
                    if (x < boundary.minX || x > boundary.maxX || z < boundary.minZ || z > boundary.maxZ) {
                        out.sheep.outOfBounds += 1;
                    }
                }
            }
        }
        return out;
    };
    window.__sdsStressTestSwaps = async (n = 5) => {
        const renderer = game.sceneManager?.getRenderer?.();
        if (!renderer) {
            console.warn('[STRESS] no renderer; skipping');
            return null;
        }
        const snap = () => ({
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
            programs: renderer.info.programs?.length ?? 0,
        });
        const baseline = snap();
        console.log('[STRESS] baseline:', baseline);

        const scenes = ['field', 'rolling-hills', 'open-country'];
        let postFirst = null;
        for (let i = 0; i < n; i++) {
            for (const s of scenes) {
                if (game.currentScene?.id === s) continue;
                await game.swapScene(s);
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                if (postFirst === null) {
                    postFirst = snap();
                    console.log('[STRESS] post-1-swap:', postFirst);
                }
            }
        }

        const final = snap();
        const pct = (a, b) => b === 0 ? '0%' : ((a - b) / b * 100).toFixed(2) + '%';
        const drift = {
            geometries: pct(final.geometries, postFirst.geometries),
            textures: pct(final.textures, postFirst.textures),
            programs: pct(final.programs, postFirst.programs),
        };
        console.log('[STRESS] final:', final, 'drift:', drift);
        return { baseline, postFirst, final, drift };
    };
}

/**
 * Cycle 24 Phase 1+3: multiplayer state + reconnect-grace probe surface.
 * Specs assert on the returned shape and use `__sdsMpDrop` /
 * `__sdsMpReconnect` to test the grace-window without leaving React state.
 * No-op in production; gated on `?mpProbe=1` / `?perfMode=1`.
 *
 * @param {object} game SheepDogSimulation instance.
 */
export function installMpProbe(game) {
    if (typeof window === 'undefined' || window.__sdsMpProbe) return;
    window.__sdsMpDrop = () => {
        const nm = game.networkManager;
        if (nm?.ws) {
            try { nm.ws.close(4000, 'mpProbe drop'); } catch {}
        }
    };
    window.__sdsMpReconnect = async () => {
        const nm = game.networkManager;
        if (!nm?.currentRoom?.roomCode || !nm?.playerId) {
            throw new Error('mpReconnect: no currentRoom/playerId');
        }
        await nm._openRoomSocket(nm.currentRoom.roomCode, nm.playerId);
        nm.connected = true;
    };
    window.__sdsMpProbe = () => {
        const nm = game.networkManager;
        const room = nm?.currentRoom ?? null;
        const playerId = nm?.playerId ?? null;
        const peers = Array.isArray(room?.players)
            ? room.players.map(p => ({
                id: p.id,
                name: p.name,
                dogType: p.dogType,
                isHost: !!p.isHost,
                isMine: p.id === playerId,
            }))
            : [];
        // Prefer authoritative room state for isHost (peers[me].isHost) over
        // the locally-cached nm.isHost. The worker broadcasts a generic
        // hostChanged frame with isHost:false meant for per-recipient
        // interpretation; the current NetworkManager handler swallows that
        // literal, leaving nm.isHost=false even on the new host. Probe falls
        // back to nm.isHost only if room.players is empty.
        const myPeer = peers.find(p => p.isMine);
        const isHost = myPeer ? !!myPeer.isHost : !!nm?.isHost;
        return {
            playerId,
            peers,
            playerCount: peers.length,
            roomCode: room?.roomCode ?? room?.code ?? null,
            roomState: room?.state ?? null,
            sheepCount: room?.sheepCount ?? null,
            gameMode: room?.gameMode ?? null,
            sceneId: room?.sceneId ?? null,
            isHost,
            connected: !!nm?.connected,
            connecting: !!nm?.connecting,
        };
    };
    console.log('[MP-PROBE] window.__sdsMpProbe installed');
}
