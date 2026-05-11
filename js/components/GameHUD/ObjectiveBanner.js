/**
 * ObjectiveBanner — top-of-screen prompt for the multi-stage objective.
 *
 * Cycle 8 Phase B: Cycle 7 shipped the gather→drive→portal loop on Open
 * Country but the only player-facing signals were the cyan ring decal
 * and the CorralCompass arrow retargeting on stage flip. Players didn't
 * read what was being asked of them. This banner fills that gap: a
 * single line at the top of the screen that flips with stage and shows
 * gather progress while hold-counting.
 *
 * Auto-hides on scenes without an objective (Field, Rolling Hills).
 */
import React, { createElement, useEffect, useState } from 'react';
import { getGameState, subscribeGameEvent } from '../../GameBridge.js';

/**
 * Subscribe to the per-frame 'frame' event so the banner reflects
 * sheep-in-zone count + hold timer as they tick. Same cadence as the
 * other HUD chips via useGameState — keeping this local avoids
 * widening the reactive surface in useGameState for one component.
 */
function useObjective() {
    const [snapshot, setSnapshot] = useState(null);

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
    // Cycle 8: keep the 'drive' banner up for a few seconds after the
    // stage flip, then hide. The CorralCompass + portal effect carry
    // the message after that.
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

    // Cycle 35 Phase 8: positioning moved to HudLayout's topCenter slot.
    // Stacks below the score pill via the slot's flex-column gap.
    return createElement('div', {
        className: 'animate-slide-down'
    },
        createElement('div', {
            className: 'ui-panel py-2 px-4 text-center'
        }, [
            createElement('div', {
                key: 'headline',
                className: 'text-white text-md font-semibold whitespace-nowrap'
            }, headline),
            subline && createElement('div', {
                key: 'subline',
                className: meetingThreshold
                    ? 'text-cyan-300 text-sm mt-1 whitespace-nowrap'
                    : 'text-white/70 text-sm mt-1 whitespace-nowrap'
            }, subline),
            // Gather-progress mini-bar: fills as sheepInZone approaches
            // requiredSheep, then morphs into the hold-progress bar.
            isRoundup && createElement('div', {
                key: 'progress-track',
                className: 'mt-2 h-1 w-full bg-white/15 rounded-full overflow-hidden'
            },
                createElement('div', {
                    style: {
                        height: '100%',
                        width: meetingThreshold
                            ? `${holdProgress * 100}%`
                            : `${Math.min(1, obj.sheepInZone / Math.max(1, obj.required)) * 100}%`,
                        background: meetingThreshold ? '#22d3ee' : '#a5b4fc',
                        transition: 'width 0.15s ease-out, background 0.3s ease-out',
                    }
                })
            )
        ])
    );
}
