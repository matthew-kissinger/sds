/**
 * ObjectiveBanner — top-of-screen prompt for the multi-stage objective.
 *
 * Cycle 8 Phase B: a single line at the top of the screen that flips with the
 * objective stage and shows gather progress while hold-counting. Auto-hides on
 * scenes without an objective (Field, Rolling Hills).
 *
 * Cycle 48 P1: converted to JSX .tsx. The panel chrome is the shared HudPanel;
 * the progress-fill colors are the --color-objective-* tokens instead of raw hex.
 */
import { useEffect, useState } from 'react';
import { getGameState, subscribeGameEvent } from '../../GameBridge.js';
import { color, pastoral, alpha } from '../ui/tokens';
import { HudPanel } from './HudPanel';

interface ObjectiveSnapshot {
    stage: string;
    sheepInZone: number;
    required: number;
    holdTimer: number;
    holdRequired: number;
}

/**
 * Subscribe to the per-frame 'frame' event so the banner reflects the
 * sheep-in-zone count + hold timer as they tick. Same cadence as the other HUD
 * chips; keeping it local avoids widening useGameState for one component.
 */
function useObjective(): ObjectiveSnapshot | null {
    const [snapshot, setSnapshot] = useState<ObjectiveSnapshot | null>(null);

    useEffect(() => {
        function read() {
            const gs = getGameState();
            const obj = gs?.objective;
            if (!obj) {
                setSnapshot(null);
                return;
            }
            setSnapshot({
                stage: obj.stage,
                sheepInZone: obj.sheepInZone | 0,
                required: obj.requiredSheep | 0,
                holdTimer: obj.holdTimer || 0,
                holdRequired: obj.holdRequired || 0,
            });
        }
        read();
        return subscribeGameEvent('frame', read);
    }, []);

    return snapshot;
}

export function ObjectiveBanner() {
    const obj = useObjective();
    // Cycle 8: keep the 'drive' banner up for a few seconds after the stage
    // flip, then hide. The CorralCompass + portal effect carry the message after.
    const [driveBannerHiddenAt, setDriveBannerHiddenAt] = useState(0);

    useEffect(() => {
        if (obj?.stage === 'drive' && driveBannerHiddenAt === 0) {
            const t = setTimeout(() => setDriveBannerHiddenAt(Date.now()), 5000);
            return () => clearTimeout(t);
        }
    }, [obj?.stage, driveBannerHiddenAt]);

    if (!obj) return null;
    if (obj.stage === 'drive' && driveBannerHiddenAt > 0) return null;

    const isRoundup = obj.stage === 'roundup';
    const meetingThreshold = obj.sheepInZone >= obj.required;
    const holdProgress = obj.holdRequired > 0
        ? Math.min(1, obj.holdTimer / obj.holdRequired)
        : 0;

    const headline = isRoundup
        ? `Gather ${obj.required} sheep into the ring`
        : 'Drive your flock to the portal';

    const subline = isRoundup
        ? (meetingThreshold
            ? `Holding ${obj.holdTimer.toFixed(1)} / ${obj.holdRequired.toFixed(1)}s`
            : `${obj.sheepInZone} / ${obj.required} in the ring`)
        : null;

    return (
        <HudPanel className="py-2 px-4 text-center">
            <div className="text-md font-semibold whitespace-nowrap" style={{ color: pastoral.cream }}>{headline}</div>
            {subline && (
                <div
                    className="text-sm mt-1 whitespace-nowrap"
                    style={{ color: meetingThreshold ? pastoral.accentGold : alpha(pastoral.cream, 70) }}
                >
                    {subline}
                </div>
            )}
            {/* Gather-progress mini-bar: fills as sheepInZone approaches
                requiredSheep, then morphs into the hold-progress bar. */}
            {isRoundup && (
                <div className="mt-2 h-1 w-full rounded-full overflow-hidden" style={{ background: alpha(pastoral.cream, 15) }}>
                    <div
                        style={{
                            height: '100%',
                            width: meetingThreshold
                                ? `${holdProgress * 100}%`
                                : `${Math.min(1, obj.sheepInZone / Math.max(1, obj.required)) * 100}%`,
                            background: meetingThreshold ? color.objectiveHold : color.objectiveGather,
                            transition: 'width 0.15s ease-out, background 0.3s ease-out',
                        }}
                    />
                </div>
            )}
        </HudPanel>
    );
}
