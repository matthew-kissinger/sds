/**
 * CorralCompass — off-screen indicator for the corral destination.
 *
 * Cycle 5+ Rolling Hills: when the corral falls outside the camera frustum,
 * an arrow chip on the screen edge points toward it with the distance in
 * metres. Goes invisible once the corral is on-screen.
 *
 * Implemented in pure DOM (React) consistent with the other HUD chips.
 * Position computed each frame from the dog position and corral world
 * position projected through the camera; falls back to a fixed position
 * if the projection isn't available.
 */
import React, { useMemo, createElement } from 'react';
import { getSceneManager, getGameState } from '../../GameBridge.js';
import * as THREE from 'three';

const _projectVec = new THREE.Vector3();

/**
 * Project a world {x, z} target onto NDC. Returns:
 *   { x, y, behind }
 *   x, y: NDC space [-1, 1]; behind=true if camera points away from target.
 *
 * Cycle 7 Phase 3: refactored from corral-only to a generic target so the
 * compass can also point at the round-up zone during the gather stage.
 */
function projectTargetToNdc(target, camera) {
    if (!target || !camera) return null;
    _projectVec.set(target.x, 4, target.z); // 4m up so the indicator tracks above ground
    _projectVec.project(camera);
    return {
        x: _projectVec.x,
        y: _projectVec.y,
        behind: _projectVec.z > 1,
    };
}

export function CorralCompass({ platform = 'desktop' }) {
    const isMobile = platform === 'mobile';

    // Per-frame compute via inline state — read from imperative bridges each render.
    // Re-rendered by App.js at the same cadence as the rest of the HUD (~60fps).
    const view = useMemo(() => {
        const gameState = getGameState();
        const sceneManager = getSceneManager();
        if (!gameState || !sceneManager) return null;
        const camera = sceneManager.getCamera();
        const dog = gameState.sheepdog;
        if (!camera || !dog) return null;

        // Cycle 7 Phase 3: target is the round-up zone while objective is in
        // 'roundup' stage, otherwise the corral. Falls back to nothing when
        // neither is set (e.g., gate-based scenes).
        let target = null;
        const objective = gameState.objective;
        if (objective && objective.stage === 'roundup') {
            target = { x: objective.roundupZone.x, z: objective.roundupZone.z };
        } else if (gameState.corral) {
            target = { x: gameState.corral.center.x, z: gameState.corral.center.z };
        }
        if (!target) return null;

        const proj = projectTargetToNdc(target, camera);
        if (!proj) return null;

        const dx = target.x - dog.position.x;
        const dz = target.z - dog.position.z;
        const distance = Math.round(Math.sqrt(dx * dx + dz * dz));

        const onScreen = !proj.behind && proj.x >= -0.95 && proj.x <= 0.95 && proj.y >= -0.95 && proj.y <= 0.95;
        return { proj, distance, onScreen };
    });

    if (!view) return null;
    if (view.onScreen) return null;  // hidden when corral is visible

    // Project NDC onto screen-edge: clamp to ±0.85 envelope so arrow sits inside the bezel.
    let nx = view.proj.x;
    let ny = view.proj.y;
    if (view.proj.behind) {
        // Camera is pointing away — flip so the arrow indicates we should turn around.
        nx = -nx;
        ny = -1;
    }
    // Clamp to unit ring along the larger axis
    const m = Math.max(Math.abs(nx), Math.abs(ny));
    if (m > 0) {
        nx = (nx / m) * 0.85;
        ny = (ny / m) * 0.85;
    }
    // Convert NDC → CSS percent (NDC.y is up, CSS top is down → flip y)
    const left = `${(nx * 0.5 + 0.5) * 100}%`;
    const top = `${(-ny * 0.5 + 0.5) * 100}%`;

    // Arrow rotation: vector from screen centre toward (nx, ny) in CSS coords (y inverted)
    const angleDeg = Math.atan2(-ny, nx) * (180 / Math.PI) + 90;

    return createElement('div', {
        className: 'fixed pointer-events-none z-20',
        style: {
            left,
            top,
            transform: 'translate(-50%, -50%)',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }
    }, [
        createElement('div', {
            key: 'wrap',
            className: 'flex flex-col items-center gap-1',
        }, [
            createElement('div', {
                key: 'arrow',
                style: {
                    width: 0,
                    height: 0,
                    borderLeft: '10px solid transparent',
                    borderRight: '10px solid transparent',
                    borderBottom: '18px solid rgba(234, 246, 255, 0.95)',
                    transform: `rotate(${angleDeg}deg)`,
                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
                }
            }),
            createElement('div', {
                key: 'label',
                className: 'ui-panel py-0.5 px-2 text-white/90 text-xs font-medium',
                style: { whiteSpace: 'nowrap' }
            }, `${view.distance}m`)
        ])
    ]);
}
