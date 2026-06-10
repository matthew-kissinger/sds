// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P1-TUTORIAL: the in-run tutorial prompt layer.
 *
 * One pastoral pill, bottom-center (above the PracticeHint slot), showing the
 * current step's contextual prompt, plus an always-visible Skip control. Never
 * modal: pointer events pass through everywhere except the skip button. The
 * step logic lives in ./tutorialMachine.js; this component just renders its
 * snapshot. Mounted in its own React root by ./index.js so it needs no App.js
 * or GameHUD slot.
 */
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { Z } from '../../ui/zIndex.js';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '../hooks/usePlatform.js';
import { pastoral, alpha } from '../ui/tokens';

interface MachineLike {
    subscribe: (l: () => void) => () => void;
    getSnapshot: () => {
        status: 'idle' | 'active' | 'finished';
        step: string | null;
        penned: number;
        goal: number;
        completed: boolean;
    };
    skip: () => void;
}

/** Per-step locale key, with a touch variant where the control differs. */
function stepKey(step: string, isTouch: boolean): string {
    if (isTouch && (step === 'move' || step === 'sprint' || step === 'camera')) {
        return `tutorial.step.${step}Touch`;
    }
    return `tutorial.step.${step}`;
}

export function TutorialOverlay({ machine }: { machine: MachineLike }) {
    const { t } = useTranslation();
    const platform = usePlatform();
    const snap = useSyncExternalStore(machine.subscribe, machine.getSnapshot, machine.getSnapshot);
    const [paused, setPaused] = useState(false);

    // Hide behind the pause menu; InputHandler dispatches this on toggle.
    useEffect(() => {
        const onPause = (e: Event) => setPaused(!!(e as CustomEvent).detail?.isPaused);
        window.addEventListener('game-pause-change', onPause);
        return () => window.removeEventListener('game-pause-change', onPause);
    }, []);

    if (snap.status !== 'active' || !snap.step || paused) return null;

    const isTouch = platform === 'mobile';
    const isDone = snap.step === 'done';
    const prompt = t(stepKey(snap.step, isTouch));
    const progress = snap.step === 'herd'
        ? t('tutorial.herdProgress', { penned: Math.min(snap.penned, snap.goal), goal: snap.goal })
        : null;

    const wrap: CSSProperties = {
        position: 'fixed',
        left: 0,
        right: 0,
        // Cycle 87 Phase 6: derive the bottom offset from the HUD's published
        // reserve (HudLayout sets --sds-bottom-reserve to the real clearance
        // over the mobile controls) instead of the old hardcoded 84px that
        // could land the pill on the joystick. Fallback mirrors the desktop
        // reserve when no HUD is mounted.
        bottom: 'calc(var(--sds-bottom-reserve, calc(env(safe-area-inset-bottom, 0px) + 16px)) + 8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        zIndex: Z.tutorial,
        pointerEvents: 'none',
        fontFamily: 'system-ui, -apple-system, sans-serif',
    };

    const pill: CSSProperties = {
        maxWidth: '92vw',
        padding: isTouch ? '8px 16px' : '10px 20px',
        borderRadius: 999,
        background: alpha(pastoral.cream, 88),
        border: `1px solid ${pastoral.glassWarmBorder}`,
        boxShadow: '0 8px 26px rgba(43,38,32,0.28)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        color: pastoral.ink,
        fontSize: isTouch ? 13 : 15,
        fontWeight: 500,
        textAlign: 'center',
        lineHeight: 1.35,
    };

    return (
        <div style={wrap} data-testid="tutorial-overlay">
            <div style={pill}>
                <span>{isDone ? t('tutorial.step.done') : prompt}</span>
                {progress && (
                    <span style={{ marginLeft: 10, color: pastoral.inkSoft, fontWeight: 600 }}>
                        {progress}
                    </span>
                )}
            </div>
            {!isDone && (
                <button
                    onClick={() => machine.skip()}
                    style={{
                        pointerEvents: 'auto',
                        background: alpha(pastoral.ink, 30),
                        border: `1px solid ${alpha(pastoral.cream, 25)}`,
                        borderRadius: 999,
                        padding: '4px 14px',
                        // 44px touch-target minimum on coarse pointers
                        // (visual size stays compact via the padding).
                        minHeight: isTouch ? 44 : undefined,
                        color: pastoral.cream,
                        fontSize: 12,
                        cursor: 'pointer',
                    }}
                >
                    {t('tutorial.skip')}
                </button>
            )}
        </div>
    );
}
