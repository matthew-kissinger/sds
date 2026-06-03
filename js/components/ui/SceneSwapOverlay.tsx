// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * SceneSwapOverlay Component
 * Covers the in-process scene swap window so the player doesn't see a
 * half-built scene.
 *
 * Cycle 48 P4: converted from the element-factory .js to token-driven .tsx.
 * The shimmer-skeleton CSS and the spin keyframe moved out of the render-time
 * injected <style> (was dangerouslySetInnerHTML) into the shared css/main.css
 * sheet, matching the Cycle 47 scene-picker and Cycle 48 P2 pointer-tour
 * precedents; the trailing spinner's ring color is the new swap-spinner token
 * (the one deepskyblue value that lacked a token). The Cycle 46 crossfade-skip
 * contract (window.__sdsAttractCrossfadeActive) and the full state machine are
 * unchanged. Behavior is identical to the previous SceneSwapOverlay.js.
 */
import { useEffect, useState, useRef, type CSSProperties } from 'react';
import { subscribeGameEvent } from '../../GameBridge.js';
import { color } from './tokens';

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
        zIndex: 10000,
        background: 'rgba(8, 14, 24, 0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        opacity,
        transition: `opacity ${FADE_MS}ms ease-out`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        pointerEvents: 'auto',
    };

    return (
        <div style={overlayStyle}>
            <div style={{ textAlign: 'center', maxWidth: '420px', padding: '0 1.5rem', width: '100%' }}>
                {/* Cycle 25 Phase F (additive): shimmer skeleton card replaces the
                    single-spinner pattern. Reads as a designed loading state — a
                    tall hero panel + three thinner content rows shimmering on a
                    diagonal sweep — instead of "the scene is broken, here's a
                    spinner." Spinner kept as the trailing element for users who
                    prefer the affordance. The .sds-skel chrome lives in main.css. */}
                <div
                    className="sds-skel sds-skel-hero"
                    style={{ width: '100%', height: '160px', borderRadius: '12px', marginBottom: '1rem' }}
                />
                <div
                    className="sds-skel sds-skel-row"
                    style={{ width: '78%', height: '14px', borderRadius: '6px', margin: '0 auto 0.6rem' }}
                />
                <div
                    className="sds-skel sds-skel-row"
                    style={{ width: '60%', height: '14px', borderRadius: '6px', margin: '0 auto 0.6rem' }}
                />
                <div
                    className="sds-skel sds-skel-row"
                    style={{ width: '70%', height: '14px', borderRadius: '6px', margin: '0 auto 1.4rem' }}
                />
                <div
                    style={{
                        width: '24px',
                        height: '24px',
                        margin: '0 auto 0.6rem',
                        border: '2px solid rgba(255, 255, 255, 0.15)',
                        borderTopColor: color.swapSpinner,
                        borderRadius: '50%',
                        animation: 'sds-swap-spin 0.9s linear infinite',
                    }}
                />
                <div style={{ fontSize: '0.85rem', opacity: 0.7, letterSpacing: '0.02em' }}>
                    {error ? 'Reloading…' : 'Loading scene…'}
                </div>
            </div>
        </div>
    );
}
