import React, { useEffect, useState, useRef, createElement } from 'react';
import { subscribeGameEvent } from '../../GameBridge.js';

const FADE_MS = 200;
const MIN_VISIBLE_MS = 200;

/**
 * Cycle 11 Phase 1: covers the in-process scene swap window so the player
 * doesn't see a half-built scene. State machine:
 *   idle -> fading-in (200ms) -> visible (>=200ms) -> fading-out (200ms) -> idle
 *
 * Subscribes to GameBridge events:
 *   'scene-swap-start' — main.swapScene() before disposeScene
 *   'scene-swap-end'   — after rebuildScene resolves and replaceState
 *   'scene-swap-error' — fallback path; overlay holds while location.href fires
 */
export function SceneSwapOverlay() {
    const [phase, setPhase] = useState('idle');
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

    return createElement('div', {
        style: {
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
        }
    }, createElement('div', {
        style: { textAlign: 'center', maxWidth: '420px', padding: '0 1.5rem', width: '100%' }
    }, [
        // Cycle 25 Phase F (additive): shimmer skeleton card replaces the
        // single-spinner pattern. Reads as a designed loading state — a
        // tall hero panel + three thinner content rows shimmering on a
        // diagonal sweep — instead of "the scene is broken, here's a
        // spinner." Spinner kept as the trailing element for users who
        // prefer the affordance.
        createElement('div', {
            key: 'skel-hero',
            className: 'sds-skel sds-skel-hero',
            style: {
                width: '100%',
                height: '160px',
                borderRadius: '12px',
                marginBottom: '1rem',
            }
        }),
        createElement('div', {
            key: 'skel-row-1',
            className: 'sds-skel sds-skel-row',
            style: {
                width: '78%',
                height: '14px',
                borderRadius: '6px',
                margin: '0 auto 0.6rem',
            }
        }),
        createElement('div', {
            key: 'skel-row-2',
            className: 'sds-skel sds-skel-row',
            style: {
                width: '60%',
                height: '14px',
                borderRadius: '6px',
                margin: '0 auto 0.6rem',
            }
        }),
        createElement('div', {
            key: 'skel-row-3',
            className: 'sds-skel sds-skel-row',
            style: {
                width: '70%',
                height: '14px',
                borderRadius: '6px',
                margin: '0 auto 1.4rem',
            }
        }),
        createElement('div', {
            key: 'spinner',
            style: {
                width: '24px',
                height: '24px',
                margin: '0 auto 0.6rem',
                border: '2px solid rgba(255, 255, 255, 0.15)',
                borderTopColor: '#00BFFF',
                borderRadius: '50%',
                animation: 'sds-swap-spin 0.9s linear infinite',
            }
        }),
        createElement('div', {
            key: 'label',
            style: {
                fontSize: '0.85rem',
                opacity: 0.7,
                letterSpacing: '0.02em',
            }
        }, error ? 'Reloading…' : 'Loading scene…'),
        createElement('style', {
            key: 'kf',
            dangerouslySetInnerHTML: {
                __html: [
                    '@keyframes sds-swap-spin { to { transform: rotate(360deg); } }',
                    '@keyframes sds-shimmer {',
                    '  0%   { background-position: -200% 0; }',
                    '  100% { background-position: 200% 0; }',
                    '}',
                    '.sds-skel {',
                    '  background: linear-gradient(',
                    '    90deg,',
                    '    rgba(255,255,255,0.05) 0%,',
                    '    rgba(255,255,255,0.12) 40%,',
                    '    rgba(255,255,255,0.18) 50%,',
                    '    rgba(255,255,255,0.12) 60%,',
                    '    rgba(255,255,255,0.05) 100%',
                    '  );',
                    '  background-size: 200% 100%;',
                    '  animation: sds-shimmer 1.6s ease-in-out infinite;',
                    '  border: 1px solid rgba(255,255,255,0.06);',
                    '}',
                ].join('\n')
            }
        })
    ]));
}
