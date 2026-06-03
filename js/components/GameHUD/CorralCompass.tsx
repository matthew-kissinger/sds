/**
 * CorralCompass — off-screen indicator for the corral destination.
 *
 * Cycle 5+ Rolling Hills: when the corral falls outside the camera frustum, an
 * arrow chip on the screen edge points toward it with the distance in metres.
 * Goes invisible once the corral is on-screen. Position is computed each frame
 * from the dog position and corral world position projected through the camera.
 *
 * Cycle 48 P1: converted to JSX .tsx. The old dependency-less `useMemo` (which
 * recomputed on every render anyway, by design) is now a plain per-render call
 * to computeCompassView(); App.js re-renders the HUD at ~60fps. No hex (rgba
 * arrow + the .ui-panel label surface).
 */
import * as THREE from 'three';
import { getSceneManager, getGameState } from '../../GameBridge.js';
import { pastoral, alpha } from '../ui/tokens';

const _projectVec = new THREE.Vector3();

interface NdcProjection {
    x: number;
    y: number;
    behind: boolean;
}

interface CompassView {
    proj: NdcProjection;
    distance: number;
    onScreen: boolean;
}

/**
 * Project a world {x, z} target onto NDC. Returns x/y in [-1, 1] and behind=true
 * when the camera points away from the target. 4m up so the indicator tracks
 * above ground. Generic target (corral or round-up zone) since Cycle 7 P3.
 */
function projectTargetToNdc(target: { x: number; z: number } | null, camera: THREE.Camera | null): NdcProjection | null {
    if (!target || !camera) return null;
    _projectVec.set(target.x, 4, target.z);
    _projectVec.project(camera);
    return {
        x: _projectVec.x,
        y: _projectVec.y,
        behind: _projectVec.z > 1,
    };
}

function computeCompassView(): CompassView | null {
    const gameState = getGameState();
    const sceneManager = getSceneManager();
    if (!gameState || !sceneManager) return null;
    const camera = sceneManager.getCamera();
    const dog = gameState.sheepdog;
    if (!camera || !dog) return null;

    // Cycle 7 P3: target is the round-up zone while the objective is in
    // 'roundup' stage, otherwise the corral. Falls back to nothing when neither
    // is set (e.g. gate-based scenes).
    let target: { x: number; z: number } | null = null;
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
}

export function CorralCompass({ platform = 'desktop' }: { platform?: string }) {
    void platform; // API parity with the other HUD chips; not read in render.

    // Per-frame compute: read the imperative bridges each render.
    const view = computeCompassView();
    if (!view) return null;
    if (view.onScreen) return null; // hidden when the corral is visible

    // Project NDC onto the screen edge: clamp to a +/-0.85 envelope so the arrow
    // sits inside the bezel.
    let nx = view.proj.x;
    let ny = view.proj.y;
    if (view.proj.behind) {
        // Camera points away - flip so the arrow says "turn around".
        nx = -nx;
        ny = -1;
    }
    const m = Math.max(Math.abs(nx), Math.abs(ny));
    if (m > 0) {
        nx = (nx / m) * 0.85;
        ny = (ny / m) * 0.85;
    }
    // NDC -> CSS percent (NDC.y is up, CSS top is down -> flip y).
    const left = `${(nx * 0.5 + 0.5) * 100}%`;
    const top = `${(-ny * 0.5 + 0.5) * 100}%`;

    // Arrow rotation: vector from screen centre toward (nx, ny) in CSS coords.
    const angleDeg = Math.atan2(-ny, nx) * (180 / Math.PI) + 90;

    return (
        <div
            className="fixed pointer-events-none z-20"
            style={{
                left,
                top,
                transform: 'translate(-50%, -50%)',
                paddingTop: 'env(safe-area-inset-top, 0px)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
        >
            <div className="flex flex-col items-center gap-1">
                <div
                    style={{
                        width: 0,
                        height: 0,
                        borderLeft: '10px solid transparent',
                        borderRight: '10px solid transparent',
                        borderBottom: `18px solid ${pastoral.cream}`,
                        transform: `rotate(${angleDeg}deg)`,
                        filter: 'drop-shadow(0 1px 2px rgba(43,38,32,0.55))',
                    }}
                />
                <div className="ui-panel py-0.5 px-2 text-xs font-medium" style={{ whiteSpace: 'nowrap', color: alpha(pastoral.cream, 92) }}>
                    {view.distance}m
                </div>
            </div>
        </div>
    );
}
