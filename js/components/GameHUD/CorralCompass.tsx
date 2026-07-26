// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * CorralCompass - the gate cue's screen-edge chevron.
 *
 * Cycle 5+ Rolling Hills: when the destination falls outside the camera
 * frustum, an arrow chip on the screen edge points toward it with the distance
 * in metres. Goes invisible once the destination is on-screen.
 *
 * Cycle 48 P1: converted to JSX .tsx. App.js re-renders the HUD at ~60fps, so
 * this reads the imperative bridge on every render rather than holding state.
 *
 * Cycle 112 Phase 3: the chip is confined to the band between the HUD's top
 * stack and the mobile-controls reserve. It used to position against the raw
 * viewport, which at 390x844 drew the distance pill through the "Follow"
 * camera chip.
 *
 * Cycle 116 Phase 5: THE CHEVRON DECIDES NOTHING. It used to resolve the
 * destination itself (round-up zone, else corral, else the scene's gate, else
 * the pen centre), project it, measure the distance and test the frustum, which
 * made the HUD a second opinion about where the sheep are supposed to go - and
 * one that had already drifted, since it read `gameState.corral` where the cue
 * reads the scene def and carried a `pen.center` fallback the cue does not. All
 * of that now happens once, in the cue (js/effects/GateColumn.js), which
 * publishes the answer for the frame; this component reads it through
 * js/GameBridge.js and draws it. The column and the chevron therefore share one
 * visibility decision because there is only one, not because two files agree to
 * call the same function.
 *
 * That also keeps the world layer out of the HUD's chunk. Importing
 * js/world/gateCue.js from here made that module reachable from two lazily
 * loaded graphs at once, so rollup hoisted it into a third shared chunk that
 * both had to import across.
 */
import { getGateCueView } from '../../GameBridge.js';
import { pastoral, alpha } from '../ui/tokens';

/** How far into the screen the arrow sits, in NDC. Keeps it inside the bezel. */
const EDGE_ENVELOPE_NDC = 0.85;

export function CorralCompass({ platform = 'desktop' }: { platform?: string }) {
    void platform; // API parity with the other HUD chips; not read in render.

    // Per-frame read of the cue's published state. No destination resolved, no
    // cue built yet, or the destination is on-screen: nothing to draw.
    const view = getGateCueView();
    if (!view?.showCompass) return null;

    // Project NDC onto the screen edge: clamp to the envelope above so the
    // arrow sits inside the bezel.
    let nx = view.ndcX;
    let ny = view.ndcY;
    if (view.behind) {
        // Camera points away - flip so the arrow says "turn around".
        nx = -nx;
        ny = -1;
    }
    const m = Math.max(Math.abs(nx), Math.abs(ny));
    if (m > 0) {
        nx = (nx / m) * EDGE_ENVELOPE_NDC;
        ny = (ny / m) * EDGE_ENVELOPE_NDC;
    }
    // NDC -> CSS percent (NDC.y is up, CSS top is down -> flip y).
    const left = `${(nx * 0.5 + 0.5) * 100}%`;
    const top = `${(-ny * 0.5 + 0.5) * 100}%`;

    // Arrow rotation: vector from screen centre toward (nx, ny) in CSS coords.
    const angleDeg = Math.atan2(-ny, nx) * (180 / Math.PI) + 90;

    return (
        // Cycle 112 Phase 3: the percentages are relative to the band left over
        // once the HUD's top stack and the mobile-controls reserve are taken
        // out, not to the raw viewport. Positioning against the viewport put the
        // distance pill straight through the "Follow" camera chip at 390x844 -
        // the +/-0.85 NDC envelope lands at y=41px there, which is inside the
        // top-center stack. Both variables are published by HudLayout from
        // measured slot heights, so this tracks the real HUD footprint instead
        // of a second set of magic offsets.
        <div
            className="fixed pointer-events-none z-20"
            style={{
                top: 'var(--sds-hud-top-reserve, 0px)',
                bottom: 'var(--sds-bottom-reserve, 0px)',
                left: 0,
                right: 0,
            }}
        >
            {/* The safe-area insets that used to be padding here now ride in
                --sds-hud-top-reserve and --sds-bottom-reserve on the band. */}
            <div className="absolute flex flex-col items-center gap-1" style={{ left, top, transform: 'translate(-50%, -50%)' }}>
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
                    {Math.round(view.distance)}m
                </div>
            </div>
        </div>
    );
}
