// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * SceneSwapOverlay Component
 * Covers the in-process scene swap window so the player doesn't see a
 * half-built scene.
 *
 * Cycle 48 P4: converted from the element-factory .js to token-driven .tsx.
 *
 * Cycle 61 P1: retired the Cycle 25 dark shimmer-skeleton. The boot path and
 * the attract crossfade already skip this cover (the pastoral LoadingScreen
 * owns those), but every other in-session swap (biome change, scene picker,
 * some Play Again paths) fell through to the old dark shimmer. This cover now
 * wears the same pastoral glass as js/components/entrance/LoadingScreen.tsx: a
 * warm scrim, a cream glass card, and a meadow-accent spinner. The Cycle 46
 * crossfade-skip contract (window.__sdsAttractCrossfadeActive), the Cycle 51 P6
 * boot-skip (window.__sdsBootLoading), the full state machine, and the loading
 * / error copy are unchanged. Behavior is identical to before; only the chrome
 * is pastoral.
 */
import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { Z } from '../../ui/zIndex.js';
import { subscribeGameEvent } from '../../GameBridge.js';
import { pastoral, alpha } from './tokens';

const FADE_MS = 200;
const MIN_VISIBLE_MS = 200;

type SwapPhase = 'idle' | 'fading-in' | 'visible' | 'fading-out';

/**
 * State machine:
 *   idle -> fading-in (200ms) -> visible (>=200ms) -> fading-out (200ms) -> idle
 *
 * Subscribes to GameBridge events:
 *   'scene-swap-start' — main.swapScene() before disposeScene
 *   'scene-swap-end'   — after rebuildScene resolves and replaceState
 *   'scene-swap-error' — fallback path; overlay holds while location.href fires
 */
export function SceneSwapOverlay() {
    const [phase, setPhase] = useState<SwapPhase>('idle');
    const [error, setError] = useState(false);
    const visibleSinceRef = useRef(0);
    const pendingEndRef = useRef(false);

    useEffect(() => {
        const handleEnd = () => {
            const dt = performance.now() - visibleSinceRef.current;
            const wait = Math.max(0, MIN_VISIBLE_MS - dt);
            setTimeout(() => {
                setPhase('fading-out');
                setTimeout(() => {
                    setPhase('idle');
                    visibleSinceRef.current = 0;
                    setError(false);
                }, FADE_MS);
            }, wait);
            pendingEndRef.current = false;
        };

        const unsubStart = subscribeGameEvent('scene-swap-start', () => {
            // Cycle 46 Phase 2: a pick out of the zen attract field crossfades
            // in-engine (the darts dissolve over the streaming scene). Skip the
            // DOM cover for that path so the in-engine hand-off is visible — no
            // DOM flash. Normal scene-to-scene swaps still get the overlay.
            if (typeof window !== 'undefined' && (window as { __sdsAttractCrossfadeActive?: boolean }).__sdsAttractCrossfadeActive === true) {
                return;
            }
            // Cycle 51 P6: while the world-first Play is building the armed scene,
            // the pastoral LoadingScreen owns the cover (one real bar, not the
            // shimmer). Skip the DOM overlay so the two don't stack.
            if (typeof window !== 'undefined' && (window as { __sdsBootLoading?: boolean }).__sdsBootLoading === true) {
                return;
            }
            setError(false);
            visibleSinceRef.current = 0;
            pendingEndRef.current = false;
            setPhase('fading-in');
            setTimeout(() => {
                setPhase('visible');
                visibleSinceRef.current = performance.now();
                if (pendingEndRef.current) handleEnd();
            }, FADE_MS);
        });

        const unsubEnd = subscribeGameEvent('scene-swap-end', () => {
            // If end fires before fade-in finishes, defer until visibleSinceRef is set.
            if (visibleSinceRef.current === 0) {
                pendingEndRef.current = true;
                return;
            }
            handleEnd();
        });

        const unsubError = subscribeGameEvent('scene-swap-error', () => {
            setError(true);
            // Keep overlay visible — page is about to reload via location.href.
        });

        return () => { unsubStart(); unsubEnd(); unsubError(); };
    }, []);

    if (phase === 'idle') return null;

    const opacity = phase === 'fading-out' ? 0 : 1;

    const overlayStyle: CSSProperties = {
        position: 'fixed',
        inset: 0,
        zIndex: Z.critical,
        background: alpha(pastoral.ink, 55),
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        opacity,
        transition: `opacity ${FADE_MS}ms ease-out`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: pastoral.ink,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        pointerEvents: 'auto',
    };

    // Cycle 61 P1: the pastoral glass card (matches LoadingScreen.tsx's `glass`):
    // a warm cream panel with a warm hairline, espresso ink text, and a calm
    // meadow-accent spinner. Replaces the Cycle 25 dark shimmer skeleton.
    const cardStyle: CSSProperties = {
        background: alpha(pastoral.cream, 82),
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${pastoral.glassWarmBorder}`,
        borderRadius: 22,
        boxShadow: '0 10px 34px rgba(43, 38, 32, 0.22)',
        color: pastoral.ink,
        textAlign: 'center',
        padding: '30px 28px',
        width: 'min(440px, 92%)',
    };

    return (
        <div style={overlayStyle}>
            <div style={cardStyle}>
                <div
                    style={{
                        width: '28px',
                        height: '28px',
                        margin: '0 auto 16px',
                        border: `2px solid ${pastoral.glassWarmBorder}`,
                        borderTopColor: pastoral.accentMeadow,
                        borderRadius: '50%',
                        animation: 'sds-swap-spin 0.9s linear infinite',
                    }}
                />
                <div style={{ fontSize: 14, letterSpacing: '0.02em', color: pastoral.inkSoft }}>
                    {error ? 'Reloading…' : 'Loading scene…'}
                </div>
            </div>
        </div>
    );
}
