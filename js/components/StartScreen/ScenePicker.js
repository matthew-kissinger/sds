/**
 * ScenePicker — single-card scene selector with prev/next + swipe.
 *
 * Auto-load model (cycle 26): picking a scene IS loading it. After the
 * user's last interaction (chevron, swipe, dot, arrow-key) settles for
 * COMMIT_DEBOUNCE_MS, the visible scene swaps in. Rapid flicks reset
 * the timer so only the final pick fires — no wasted disposes/rebuilds
 * on slow devices.
 *
 * Latest-wins coalescing: if the debounce fires while a swap is already
 * running, the new target stashes in pendingTargetRef. On scene-swap-end
 * we check it — if it differs from the now-active scene, we kick the
 * next swap immediately. If the user flipped and came back to the
 * just-loaded scene, the pending entry drops.
 *
 * Keyboard:
 *   ArrowLeft / ArrowRight  — flip (debounced auto-load)
 */

import React, { createElement, useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { listScenes, DEFAULT_SCENE_ID } from '../../../shared/scenes/index.js';
import { getGameInstance, subscribeGameEvent } from '../../GameBridge.js';
import { useResponsive } from '../hooks/usePlatform.js';
import { SceneGlyph } from './SceneGlyph';

const ACCENT = '#10b981';
const ORDER = ['rolling-hills', 'open-country', 'field'];
const TRANSITION_MS = 320;
// Idle time after the last flip before the visible scene actually loads.
// Long enough to coalesce rapid flicks; short enough to feel instant on
// a single tap.
const COMMIT_DEBOUNCE_MS = 300;

// Per-scene visual chrome: gradient, accent, NEW badge. The scene
// illustration lives in SceneGlyph (Cycle 47 P3).
const SCENE_CHROME = {
    'rolling-hills': {
        gradient: 'linear-gradient(135deg, #4a8db8 0%, #6fbf99 60%, #d6c082 100%)',
        accent: '#4a8db8',
        badge: 'NEW',
    },
    'open-country': {
        gradient: 'linear-gradient(135deg, #355e3b 0%, #6b8e5a 50%, #d9b779 100%)',
        accent: '#6b8e5a',
        badge: 'NEW',
    },
    field: {
        gradient: 'linear-gradient(135deg, #6b8e23 0%, #9ab35e 60%, #d6c082 100%)',
        accent: '#6b8e23',
        badge: null,
    },
};

function currentSceneId() {
    const fromUrl = new URLSearchParams(location.search).get('scene');
    const ids = listScenes().map((s) => s.id);
    return fromUrl && ids.includes(fromUrl) ? fromUrl : DEFAULT_SCENE_ID;
}

function legacySwitchSceneFallback(sceneId) {
    const url = new URL(location.href);
    if (sceneId === DEFAULT_SCENE_ID) url.searchParams.delete('scene');
    else url.searchParams.set('scene', sceneId);
    location.href = url.toString();
}

function switchScene(sceneId) {
    const game = getGameInstance();
    if (game?.swapScene) {
        game.swapScene(sceneId).catch((err) => {
            console.warn('[SCENE] swapScene failed; hard-reload fallback', err);
            legacySwitchSceneFallback(sceneId);
        });
        return;
    }
    legacySwitchSceneFallback(sceneId);
}

export function ScenePicker() {
    const [, force] = useState(0);

    // Swap-flow refs (don't need to trigger renders — they coordinate
    // async work).
    const swapInFlightRef = useRef(false);
    const pendingTargetRef = useRef(null);
    const commitTimer = useRef(null);
    // Set true when we dispatch a queued swap from the swap-end handler;
    // the next activeIndex sync useEffect skips one tick so it doesn't
    // yank visibleIndex back to the just-loaded (now stale) scene.
    const skipNextActiveSync = useRef(false);

    useEffect(() => {
        const unsubStart = subscribeGameEvent('scene-swap-start', () => {
            swapInFlightRef.current = true;
        });
        const unsubEnd = subscribeGameEvent('scene-swap-end', () => {
            swapInFlightRef.current = false;
            const target = pendingTargetRef.current;
            pendingTargetRef.current = null;
            if (target && target !== currentSceneId()) {
                skipNextActiveSync.current = true;
                switchScene(target);
            }
            force((n) => n + 1);
        });
        const unsubError = subscribeGameEvent('scene-swap-error', () => {
            swapInFlightRef.current = false;
            pendingTargetRef.current = null;
            force((n) => n + 1);
        });
        return () => { unsubStart?.(); unsubEnd?.(); unsubError?.(); };
    }, []);

    // Cleanup the debounce timer on unmount so no orphan swap fires.
    useEffect(() => () => clearTimeout(commitTimer.current), []);

    const allScenes = listScenes();
    if (allScenes.length <= 1) return null;

    // Fixed display order independent of registry insertion.
    const scenes = [...allScenes].sort(
        (a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id),
    );

    const activeId = currentSceneId();
    const activeIndex = Math.max(0, scenes.findIndex((s) => s.id === activeId));

    // Visible index = which card the player is browsing right now (may
    // differ from activeIndex briefly while a swap is mid-flight).
    const [visibleIndex, setVisibleIndex] = useState(activeIndex);
    const [slideDir, setSlideDir] = useState(0); // -1 = slide left, +1 = slide right, 0 = no anim
    const [anim, setAnim] = useState(false);
    const animTimer = useRef(null);

    // Keep visibleIndex aligned when active scene changes externally
    // (URL param, programmatic). Skipped after a coalesced queued-swap
    // dispatch so the user's latest pick stays visible during the
    // chained second swap.
    useEffect(() => {
        if (skipNextActiveSync.current) {
            skipNextActiveSync.current = false;
            return;
        }
        setVisibleIndex(activeIndex);
    }, [activeIndex]);

    // Schedule a debounced commit. Called from every navigation gesture.
    const scheduleCommit = useCallback((targetId) => {
        clearTimeout(commitTimer.current);
        commitTimer.current = setTimeout(() => {
            // Cycle 46 Phase 1: while the zen attract field is up, the scene
            // def matches the picker's "current" id but nothing is built yet,
            // so a pick of the default scene must still commit (swapScene
            // builds it and leaves attract mode). The same-scene no-op only
            // applies once a real scene is on screen.
            const attractActive = typeof window !== 'undefined' && window.__sdsAttractActive === true;
            if (!targetId || (targetId === currentSceneId() && !attractActive)) return;
            if (swapInFlightRef.current) {
                // Latest-wins: don't fire a concurrent swap; queue and
                // let scene-swap-end pick it up.
                pendingTargetRef.current = targetId;
            } else {
                switchScene(targetId);
            }
        }, COMMIT_DEBOUNCE_MS);
    }, []);

    const flip = useCallback((delta) => {
        const next = (visibleIndex + delta + scenes.length) % scenes.length;
        if (next === visibleIndex) return;
        setSlideDir(delta > 0 ? 1 : -1);
        setAnim(true);
        setVisibleIndex(next);
        clearTimeout(animTimer.current);
        animTimer.current = setTimeout(() => setAnim(false), TRANSITION_MS);
        scheduleCommit(scenes[next].id);
    }, [visibleIndex, scenes, scheduleCommit]);

    // Keyboard: ←/→ flip (auto-load via debounced scheduleCommit).
    const containerRef = useRef(null);
    useEffect(() => {
        const onKey = (e) => {
            if (!containerRef.current?.contains(document.activeElement) &&
                document.activeElement !== document.body) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); flip(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); flip(1); }
        };
        // Only listen when picker is the focused area; avoid stealing
        // arrows globally. We attach to window but bail out unless the
        // active element is inside the picker (or no element is focused
        // — common on initial paint, where the user's arrow keys
        // should still flip the picker).
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [flip]);

    // Touch swipe support.
    const touchRef = useRef({ x: 0, t: 0, active: false });
    const onTouchStart = (e) => {
        const t = e.touches?.[0];
        if (!t) return;
        touchRef.current = { x: t.clientX, t: Date.now(), active: true };
    };
    const onTouchEnd = (e) => {
        if (!touchRef.current.active) return;
        touchRef.current.active = false;
        const t = e.changedTouches?.[0];
        if (!t) return;
        const dx = t.clientX - touchRef.current.x;
        const dt = Date.now() - touchRef.current.t;
        // 40px or fast flick (>0.4 px/ms) qualifies.
        if (Math.abs(dx) > 40 || Math.abs(dx) / Math.max(1, dt) > 0.4) {
            flip(dx < 0 ? 1 : -1);
        }
    };

    const { isCompact, isVeryCompact } = useResponsive();
    const compact = isCompact || isVeryCompact;

    const visibleScene = scenes[visibleIndex];
    const chrome = SCENE_CHROME[visibleScene.id] || SCENE_CHROME.field;
    const isVisibleActive = visibleScene.id === activeId;

    const cardHeight = compact ? '170px' : '210px';
    const titleSize = compact ? '1.15rem' : '1.5rem';
    const descSize = compact ? '0.78rem' : '0.88rem';

    // Slide animation: incoming card slides from -100%/+100% → 0%.
    const incomingTransform = anim
        ? (slideDir > 0 ? 'translateX(0)' : 'translateX(0)')
        : 'translateX(0)';

    const containerStyle = {
        width: '100%',
        maxWidth: '32rem',
        margin: '0 auto 1rem',
        padding: '0.25rem 0',
    };

    const headerStyle = {
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: '0.5rem',
        paddingLeft: '0.25rem',
        paddingRight: '0.25rem',
    };

    const labelStyle = {
        fontSize: '0.7rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        opacity: 0.6,
        fontWeight: 600,
    };

    const counterStyle = {
        fontSize: '0.7rem',
        opacity: 0.5,
        fontVariantNumeric: 'tabular-nums',
    };

    return createElement('div', { ref: containerRef, style: containerStyle, tabIndex: -1 }, [
        createElement('div', { key: 'hdr', style: headerStyle }, [
            createElement('span', { key: 'l', style: labelStyle }, 'Choose your home'),
            createElement('span', { key: 'c', style: counterStyle },
                `${visibleIndex + 1} / ${scenes.length}`),
        ]),
        // Card frame.
        createElement('div', {
            key: 'frame',
            style: {
                position: 'relative',
                width: '100%',
                height: cardHeight,
                borderRadius: compact ? '16px' : '20px',
                overflow: 'hidden',
                boxShadow: isVisibleActive
                    ? `0 8px 28px ${ACCENT}33, 0 0 0 4px ${ACCENT}22`
                    : `0 8px 24px ${chrome.accent}33`,
                border: isVisibleActive
                    ? `2px solid ${ACCENT}`
                    : `1px solid ${chrome.accent}66`,
                transition: 'box-shadow 240ms ease, border-color 240ms ease',
            },
            onTouchStart,
            onTouchEnd,
        }, [
            // Animated gradient layer (cross-fade between scenes).
            createElement('div', {
                key: 'gradient',
                style: {
                    position: 'absolute',
                    inset: 0,
                    background: chrome.gradient,
                    transition: `background ${TRANSITION_MS}ms ease`,
                }
            }),
            createElement('div', {
                key: 'vignette',
                style: {
                    position: 'absolute', inset: 0,
                    background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.22) 100%)',
                    pointerEvents: 'none',
                }
            }),
            // Slide content (title + desc + icon). Animated on flip.
            createElement('div', {
                key: 'content',
                style: {
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    padding: compact ? '0.85rem 3rem 0.85rem 0.95rem' : '1rem 3.5rem 1rem 1.25rem',
                    color: '#fff',
                    transform: anim
                        ? `translateX(${slideDir > 0 ? -8 : 8}px)`
                        : 'translateX(0)',
                    opacity: anim ? 0 : 1,
                    animation: anim
                        ? `sds-slide-in-${slideDir > 0 ? 'right' : 'left'} ${TRANSITION_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards`
                        : undefined,
                }
            }, [
                createElement('div', {
                    key: 'top',
                    style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%', gap: '0.5rem' }
                }, [
                    createElement('div', {
                        key: 'icon',
                        style: { flex: '0 0 auto' }
                    }, createElement(SceneGlyph, { scene: visibleScene.id })),
                    createElement('div', { key: 'badges', style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' } }, [
                        chrome.badge && createElement('span', {
                            key: 'badge',
                            style: {
                                padding: '2px 9px',
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: '#fff',
                                background: '#ef4444',
                                borderRadius: '9999px',
                                boxShadow: '0 2px 6px rgba(239,68,68,0.45)',
                            }
                        }, chrome.badge),
                        isVisibleActive && createElement('span', {
                            key: 'curr',
                            style: {
                                padding: '2px 9px',
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: '#062c1d',
                                background: ACCENT,
                                borderRadius: '9999px',
                                boxShadow: `0 2px 6px ${ACCENT}55`,
                            }
                        }, 'Current'),
                    ]),
                ]),
                createElement('div', { key: 'bottom' }, [
                    createElement('div', {
                        key: 'title',
                        style: {
                            fontSize: titleSize,
                            fontWeight: 700,
                            letterSpacing: '-0.01em',
                            marginBottom: '0.25rem',
                            textShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        }
                    }, visibleScene.name),
                    createElement('div', {
                        key: 'desc',
                        style: {
                            fontSize: descSize,
                            lineHeight: 1.4,
                            opacity: 0.92,
                            textShadow: '0 1px 4px rgba(0,0,0,0.4)',
                            maxWidth: '34ch',
                        }
                    }, visibleScene.description),
                ]),
            ]),
            // Prev / next chevrons.
            createElement('button', {
                key: 'prev',
                type: 'button',
                onClick: (e) => { e.stopPropagation(); flip(-1); },
                'aria-label': 'Previous scene',
                style: chevronStyle('left', compact),
            }, chevronIcon('left', compact)),
            createElement('button', {
                key: 'next',
                type: 'button',
                onClick: (e) => { e.stopPropagation(); flip(1); },
                'aria-label': 'Next scene',
                style: chevronStyle('right', compact),
            }, chevronIcon('right', compact)),
        ]),
        // Indicator dots.
        createElement('div', {
            key: 'dots',
            style: {
                display: 'flex',
                justifyContent: 'center',
                gap: '0.5rem',
                marginTop: '0.6rem',
            }
        }, scenes.map((s, i) => createElement('button', {
            key: s.id,
            type: 'button',
            onClick: () => {
                if (i === visibleIndex) return;
                setSlideDir(i > visibleIndex ? 1 : -1);
                setAnim(true);
                setVisibleIndex(i);
                clearTimeout(animTimer.current);
                animTimer.current = setTimeout(() => setAnim(false), TRANSITION_MS);
                scheduleCommit(s.id);
            },
            'aria-label': `Show ${s.name}`,
            style: {
                width: i === visibleIndex ? '20px' : '8px',
                height: '8px',
                borderRadius: '9999px',
                background: i === visibleIndex
                    ? (s.id === activeId ? ACCENT : '#fff')
                    : 'rgba(255,255,255,0.35)',
                border: 'none',
                padding: 0,
                cursor: i === visibleIndex ? 'default' : 'pointer',
                transition: 'width 200ms ease, background 200ms ease',
            }
        })))
        // Slide keyframes moved to css/main.css (Cycle 47 P1); the card
        // animation above references them by name.
    ]);
}

function chevronStyle(side, compact) {
    return {
        position: 'absolute',
        top: '50%',
        [side]: compact ? '0.4rem' : '0.6rem',
        transform: 'translateY(-50%)',
        width: compact ? '34px' : '40px',
        height: compact ? '34px' : '40px',
        borderRadius: '9999px',
        background: 'rgba(0,0,0,0.32)',
        border: '1px solid rgba(255,255,255,0.18)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        color: '#fff',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3,
        padding: 0,
        transition: 'background 160ms ease, transform 160ms ease',
    };
}

// Prev/next chevrons are lucide-react icons (Cycle 47 P3). Color inherits
// the button's `color: #fff` via lucide's `currentColor` default; strokeWidth
// 2.4 matches the heavier weight of the old hand-rolled paths.
function chevronIcon(side, compact) {
    const size = compact ? 16 : 18;
    const Icon = side === 'left' ? ChevronLeft : ChevronRight;
    return createElement(Icon, { size, strokeWidth: 2.4 });
}
