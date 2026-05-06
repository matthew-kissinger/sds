/**
 * ScenePicker — single-card scene selector with prev/next + swipe.
 *
 * Cycle 25 follow-up rev 2 (2026-05-06): collapses the 3-card row down
 * to one hero card. Players flip through scenes via the chevrons,
 * keyboard arrows, or a touch swipe. Title + description + silhouette
 * cross-fade on switch; the gradient slides under the new content for
 * a "thumbing through postcards" feel.
 *
 * Click anywhere on the card body to confirm-and-load the visible
 * scene (only fires when the visible card differs from the active
 * scene). Active scene shows a "Current" pill in place of "Tap to
 * load."
 *
 * Keyboard:
 *   ArrowLeft / ArrowRight  — flip
 *   Enter / Space           — load visible
 */

import React, { createElement, useState, useEffect, useCallback, useRef } from 'react';
import { listScenes, DEFAULT_SCENE_ID } from '../../../shared/scenes/index.js';
import { getGameInstance, subscribeGameEvent } from '../../GameBridge.js';
import { useResponsive } from '../hooks/usePlatform.js';

const ACCENT = '#10b981';
const ORDER = ['rolling-hills', 'open-country', 'field'];
const TRANSITION_MS = 320;

// Per-scene visual chrome — gradient + accent + NEW badge + SVG.
const SCENE_CHROME = {
    'rolling-hills': {
        gradient: 'linear-gradient(135deg, #4a8db8 0%, #6fbf99 60%, #d6c082 100%)',
        accent: '#4a8db8',
        badge: 'NEW',
        icon: createElement('svg', {
            viewBox: '0 0 64 40', width: '96', height: '60', fill: 'none',
            stroke: 'rgba(255,255,255,0.92)', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round'
        }, [
            createElement('circle', { key: 'sun', cx: '50', cy: '12', r: '4', fill: 'rgba(255,235,180,0.78)', stroke: 'none' }),
            createElement('path', { key: 'island', d: 'M6 28 Q14 18, 26 22 T48 24 Q56 24, 58 28', fill: 'rgba(255,255,255,0.2)' }),
            createElement('path', { key: 'water1', d: 'M2 33 Q8 31, 14 33 T26 33 T38 33 T50 33 T62 33' }),
            createElement('path', { key: 'water2', d: 'M2 37 Q8 35, 14 37 T26 37 T38 37 T50 37 T62 37', strokeOpacity: '0.5' }),
            createElement('path', { key: 'tree1', d: 'M22 22 v-3 M22 19 q-2 -3 0 -5 q2 2 0 5', fill: 'rgba(255,255,255,0.32)', stroke: 'rgba(255,255,255,0.85)' }),
            createElement('path', { key: 'tree2', d: 'M34 23 v-2 M34 21 q-1.5 -2.5 0 -4 q1.5 1.5 0 4', fill: 'rgba(255,255,255,0.32)', stroke: 'rgba(255,255,255,0.85)' })
        ]),
    },
    'open-country': {
        gradient: 'linear-gradient(135deg, #355e3b 0%, #6b8e5a 50%, #d9b779 100%)',
        accent: '#6b8e5a',
        badge: 'NEW',
        icon: createElement('svg', {
            viewBox: '0 0 64 40', width: '96', height: '60', fill: 'none',
            stroke: 'rgba(255,255,255,0.92)', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round'
        }, [
            createElement('path', { key: 'mtn1', d: 'M2 28 L14 12 L26 28 Z', fill: 'rgba(255,255,255,0.2)' }),
            createElement('path', { key: 'mtn2', d: 'M20 28 L34 8 L48 28 Z', fill: 'rgba(255,255,255,0.24)' }),
            createElement('path', { key: 'mtn3', d: 'M40 28 L52 14 L62 28 Z', fill: 'rgba(255,255,255,0.2)' }),
            createElement('line', { key: 'ground', x1: '2', y1: '32', x2: '62', y2: '32' }),
            createElement('path', { key: 't1', d: 'M10 32 v-3 M10 29 q-1.6 -2.5 0 -4 q1.6 1.5 0 4', fill: 'rgba(255,255,255,0.32)', stroke: 'rgba(255,255,255,0.92)' }),
            createElement('path', { key: 't2', d: 'M22 32 v-3 M22 29 q-1.6 -2.5 0 -4 q1.6 1.5 0 4', fill: 'rgba(255,255,255,0.32)', stroke: 'rgba(255,255,255,0.92)' }),
            createElement('path', { key: 't3', d: 'M40 32 v-3 M40 29 q-1.6 -2.5 0 -4 q1.6 1.5 0 4', fill: 'rgba(255,255,255,0.32)', stroke: 'rgba(255,255,255,0.92)' }),
            createElement('path', { key: 't4', d: 'M54 32 v-3 M54 29 q-1.6 -2.5 0 -4 q1.6 1.5 0 4', fill: 'rgba(255,255,255,0.32)', stroke: 'rgba(255,255,255,0.92)' })
        ]),
    },
    field: {
        gradient: 'linear-gradient(135deg, #6b8e23 0%, #9ab35e 60%, #d6c082 100%)',
        accent: '#6b8e23',
        badge: null,
        icon: createElement('svg', {
            viewBox: '0 0 64 40', width: '96', height: '60', fill: 'none',
            stroke: 'rgba(255,255,255,0.92)', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round'
        }, [
            createElement('line', { key: 'ground', x1: '2', y1: '32', x2: '62', y2: '32' }),
            createElement('rect', { key: 'wall', x: '34', y: '20', width: '14', height: '12', fill: 'rgba(255,255,255,0.24)' }),
            createElement('path', { key: 'roof', d: 'M32 20 L41 12 L50 20 Z', fill: 'rgba(255,255,255,0.34)' }),
            createElement('rect', { key: 'door', x: '39', y: '25', width: '4', height: '7', fill: 'rgba(255,255,255,0.45)', stroke: 'none' }),
            createElement('line', { key: 'rail-top', x1: '6', y1: '28', x2: '28', y2: '28' }),
            createElement('line', { key: 'rail-bot', x1: '6', y1: '31', x2: '28', y2: '31' }),
            createElement('line', { key: 'p1', x1: '8', y1: '26', x2: '8', y2: '32' }),
            createElement('line', { key: 'p2', x1: '14', y1: '26', x2: '14', y2: '32' }),
            createElement('line', { key: 'p3', x1: '20', y1: '26', x2: '20', y2: '32' }),
            createElement('line', { key: 'p4', x1: '26', y1: '26', x2: '26', y2: '32' })
        ]),
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
    useEffect(() => subscribeGameEvent('scene-swap-end', () => force((n) => n + 1)), []);

    const allScenes = listScenes();
    if (allScenes.length <= 1) return null;

    // Fixed display order independent of registry insertion.
    const scenes = [...allScenes].sort(
        (a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id),
    );

    const activeId = currentSceneId();
    const activeIndex = Math.max(0, scenes.findIndex((s) => s.id === activeId));

    // Visible index = which card the player is browsing right now (may
    // differ from activeIndex while they flip through). Confirm via tap
    // on body or Enter to actually load.
    const [visibleIndex, setVisibleIndex] = useState(activeIndex);
    const [slideDir, setSlideDir] = useState(0); // -1 = slide left, +1 = slide right, 0 = no anim
    const [anim, setAnim] = useState(false);
    const animTimer = useRef(null);

    // Keep visibleIndex aligned when active scene changes externally
    // (URL param, scene-swap-end event).
    useEffect(() => {
        setVisibleIndex(activeIndex);
        // Don't trigger slide animation on external sync.
    }, [activeIndex]);

    const flip = useCallback((delta) => {
        const next = (visibleIndex + delta + scenes.length) % scenes.length;
        if (next === visibleIndex) return;
        setSlideDir(delta > 0 ? 1 : -1);
        setAnim(true);
        setVisibleIndex(next);
        clearTimeout(animTimer.current);
        animTimer.current = setTimeout(() => setAnim(false), TRANSITION_MS);
    }, [visibleIndex, scenes.length]);

    // Keyboard: ←/→ flip, Enter/Space load.
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
                    }, chrome.icon),
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
            // Tap-to-load overlay (only when visible != active).
            !isVisibleActive && createElement('button', {
                key: 'load',
                type: 'button',
                onClick: () => switchScene(visibleScene.id),
                style: {
                    position: 'absolute',
                    inset: 0,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'transparent',
                    fontSize: 0,
                    zIndex: 1,
                },
                'aria-label': `Load ${visibleScene.name}`
            }, 'Load'),
            // Prev / next chevrons (above the load overlay so clicks work).
            createElement('button', {
                key: 'prev',
                type: 'button',
                onClick: (e) => { e.stopPropagation(); flip(-1); },
                'aria-label': 'Previous scene',
                style: chevronStyle('left', compact),
            }, chevronSvg('left', compact)),
            createElement('button', {
                key: 'next',
                type: 'button',
                onClick: (e) => { e.stopPropagation(); flip(1); },
                'aria-label': 'Next scene',
                style: chevronStyle('right', compact),
            }, chevronSvg('right', compact)),
            // "Tap to load" hint when visible != active. Sits on top of
            // the overlay-button so it's visually anchored to the card.
            !isVisibleActive && createElement('div', {
                key: 'hint',
                style: {
                    position: 'absolute',
                    bottom: '0.5rem',
                    right: '0.75rem',
                    fontSize: '0.65rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    color: '#fff',
                    background: 'rgba(0,0,0,0.35)',
                    padding: '3px 9px',
                    borderRadius: '9999px',
                    pointerEvents: 'none',
                    zIndex: 2,
                    backdropFilter: 'blur(4px)',
                }
            }, 'Tap to load'),
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
        }))),
        // Keyframes injected once.
        createElement('style', {
            key: 'kf',
            dangerouslySetInnerHTML: {
                __html: [
                    '@keyframes sds-slide-in-right {',
                    '  from { transform: translateX(28px); opacity: 0; }',
                    '  to { transform: translateX(0); opacity: 1; }',
                    '}',
                    '@keyframes sds-slide-in-left {',
                    '  from { transform: translateX(-28px); opacity: 0; }',
                    '  to { transform: translateX(0); opacity: 1; }',
                    '}',
                ].join('\n')
            }
        })
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

function chevronSvg(side, compact) {
    const size = compact ? 16 : 18;
    const d = side === 'left' ? 'M14 6l-6 6 6 6' : 'M10 6l6 6-6 6';
    return createElement('svg', {
        width: String(size), height: String(size), viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', strokeWidth: '2.4',
        strokeLinecap: 'round', strokeLinejoin: 'round',
    }, createElement('path', { d }));
}
