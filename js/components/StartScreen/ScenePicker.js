/**
 * ScenePicker — modernised scene-selection card row.
 *
 * Cycle 25 follow-up (2026-05-06): the old 3-button strip clashed with
 * the surrounding ModeSelection grid (same visual language, different
 * intent). This rewrite renders each scene as a hero "postcard" with
 * scene-specific colour, custom SVG silhouette, NEW badges for
 * Sheep Dog Island + Open Country, and a layout that flows row-of-3 on
 * desktop and full-width-stacked on mobile.
 *
 * Active scene gets a green selection ring (matches the existing accent
 * used by Confirm Selection / Start Game). Active state is visual only
 * — no "(current)" text — because the selection ring is unambiguous.
 *
 * Clicking a tile navigates to `?scene=<id>` which main.js reads on boot
 * via loadScene + threads into TerrainBuilder + the scene's sim config.
 * MP rooms inherit the URL's scene per createRoom payload.
 */

import React, { createElement, useState, useEffect } from 'react';
import { listScenes, DEFAULT_SCENE_ID } from '../../../shared/scenes/index.js';
import { getGameInstance, subscribeGameEvent } from '../../GameBridge.js';
import { useResponsive } from '../hooks/usePlatform.js';

const ACCENT = '#10b981'; // matches Confirm Selection green

// Per-scene visual metadata — paired with scene id (not name) so a future
// rename here doesn't break the lookup.
const SCENE_CHROME = {
    'rolling-hills': {
        gradient: 'linear-gradient(135deg, #4a8db8 0%, #6fbf99 60%, #d6c082 100%)',
        accent: '#4a8db8',
        badge: 'NEW',
        // Island silhouette: water → land lump → sun.
        icon: createElement('svg', {
            viewBox: '0 0 64 40', width: '64', height: '40', fill: 'none',
            stroke: 'rgba(255,255,255,0.85)', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round'
        }, [
            createElement('circle', { key: 'sun', cx: '50', cy: '12', r: '4', fill: 'rgba(255,235,180,0.7)', stroke: 'none' }),
            createElement('path', { key: 'island', d: 'M6 28 Q14 18, 26 22 T48 24 Q56 24, 58 28', fill: 'rgba(255,255,255,0.18)' }),
            createElement('path', { key: 'water1', d: 'M2 33 Q8 31, 14 33 T26 33 T38 33 T50 33 T62 33' }),
            createElement('path', { key: 'water2', d: 'M2 37 Q8 35, 14 37 T26 37 T38 37 T50 37 T62 37', strokeOpacity: '0.5' }),
            createElement('path', { key: 'tree1', d: 'M22 22 v-3 M22 19 q-2 -3 0 -5 q2 2 0 5', fill: 'rgba(255,255,255,0.3)', stroke: 'rgba(255,255,255,0.8)' }),
            createElement('path', { key: 'tree2', d: 'M34 23 v-2 M34 21 q-1.5 -2.5 0 -4 q1.5 1.5 0 4', fill: 'rgba(255,255,255,0.3)', stroke: 'rgba(255,255,255,0.8)' })
        ]),
    },
    'open-country': {
        gradient: 'linear-gradient(135deg, #355e3b 0%, #6b8e5a 50%, #d9b779 100%)',
        accent: '#6b8e5a',
        badge: 'NEW',
        // Mountain ring + tree row.
        icon: createElement('svg', {
            viewBox: '0 0 64 40', width: '64', height: '40', fill: 'none',
            stroke: 'rgba(255,255,255,0.85)', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round'
        }, [
            createElement('path', { key: 'mtn1', d: 'M2 28 L14 12 L26 28 Z', fill: 'rgba(255,255,255,0.18)' }),
            createElement('path', { key: 'mtn2', d: 'M20 28 L34 8 L48 28 Z', fill: 'rgba(255,255,255,0.22)' }),
            createElement('path', { key: 'mtn3', d: 'M40 28 L52 14 L62 28 Z', fill: 'rgba(255,255,255,0.18)' }),
            createElement('line', { key: 'ground', x1: '2', y1: '32', x2: '62', y2: '32' }),
            createElement('path', { key: 't1', d: 'M10 32 v-3 M10 29 q-1.6 -2.5 0 -4 q1.6 1.5 0 4', fill: 'rgba(255,255,255,0.3)', stroke: 'rgba(255,255,255,0.85)' }),
            createElement('path', { key: 't2', d: 'M22 32 v-3 M22 29 q-1.6 -2.5 0 -4 q1.6 1.5 0 4', fill: 'rgba(255,255,255,0.3)', stroke: 'rgba(255,255,255,0.85)' }),
            createElement('path', { key: 't3', d: 'M40 32 v-3 M40 29 q-1.6 -2.5 0 -4 q1.6 1.5 0 4', fill: 'rgba(255,255,255,0.3)', stroke: 'rgba(255,255,255,0.85)' }),
            createElement('path', { key: 't4', d: 'M54 32 v-3 M54 29 q-1.6 -2.5 0 -4 q1.6 1.5 0 4', fill: 'rgba(255,255,255,0.3)', stroke: 'rgba(255,255,255,0.85)' })
        ]),
    },
    field: {
        gradient: 'linear-gradient(135deg, #6b8e23 0%, #9ab35e 60%, #d6c082 100%)',
        accent: '#6b8e23',
        badge: null,
        // Farmhouse + fence silhouette.
        icon: createElement('svg', {
            viewBox: '0 0 64 40', width: '64', height: '40', fill: 'none',
            stroke: 'rgba(255,255,255,0.85)', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round'
        }, [
            createElement('line', { key: 'ground', x1: '2', y1: '32', x2: '62', y2: '32' }),
            // House: square + triangle roof + door
            createElement('rect', { key: 'wall', x: '34', y: '20', width: '14', height: '12', fill: 'rgba(255,255,255,0.22)' }),
            createElement('path', { key: 'roof', d: 'M32 20 L41 12 L50 20 Z', fill: 'rgba(255,255,255,0.32)' }),
            createElement('rect', { key: 'door', x: '39', y: '25', width: '4', height: '7', fill: 'rgba(255,255,255,0.42)', stroke: 'none' }),
            // Fence rail
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
    if (sceneId === DEFAULT_SCENE_ID) {
        url.searchParams.delete('scene');
    } else {
        url.searchParams.set('scene', sceneId);
    }
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

function SceneCard({ scene, isActive, onClick, isCompact }) {
    const [isHovered, setIsHovered] = useState(false);
    const chrome = SCENE_CHROME[scene.id] || SCENE_CHROME.field;

    // Thumb slab — coloured panel with the scene icon centred.
    const thumbHeight = isCompact ? '64px' : '88px';
    const titleSize = isCompact ? '0.95rem' : '1.05rem';
    const descSize = isCompact ? '0.72rem' : '0.78rem';

    const wrapperStyle = {
        position: 'relative',
        background: 'rgba(255, 255, 255, 0.05)',
        border: isActive
            ? `2px solid ${ACCENT}`
            : isHovered
                ? `1px solid ${chrome.accent}88`
                : '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: isCompact ? '14px' : '18px',
        padding: 0,
        overflow: 'hidden',
        cursor: isActive ? 'default' : 'pointer',
        textAlign: 'left',
        transition: 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease, border-color 180ms ease',
        transform: isHovered && !isActive ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: isActive
            ? `0 8px 28px ${ACCENT}33, 0 0 0 4px ${ACCENT}22`
            : isHovered
                ? `0 8px 22px ${chrome.accent}33`
                : '0 3px 12px rgba(0, 0, 0, 0.18)',
        fontFamily: 'inherit',
        color: 'rgba(255, 255, 255, 0.95)',
        width: '100%',
        display: 'block',
        outline: 'none',
    };

    return createElement('button', {
        type: 'button',
        onClick: isActive ? undefined : onClick,
        disabled: isActive,
        style: wrapperStyle,
        'aria-label': `Switch to ${scene.name}${isActive ? ' (current)' : ''}`,
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
    }, [
        // Thumb panel — gradient + icon + (badge).
        createElement('div', {
            key: 'thumb',
            style: {
                position: 'relative',
                width: '100%',
                height: thumbHeight,
                background: chrome.gradient,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
            }
        }, [
            // Subtle radial vignette for depth.
            createElement('div', {
                key: 'vignette',
                style: {
                    position: 'absolute',
                    inset: 0,
                    background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.18) 100%)',
                    pointerEvents: 'none',
                }
            }),
            chrome.icon,
            chrome.badge && createElement('span', {
                key: 'badge',
                style: {
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    padding: '2px 8px',
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
            isActive && createElement('span', {
                key: 'active-pill',
                style: {
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    padding: '2px 8px',
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
        // Body — title + description.
        createElement('div', {
            key: 'body',
            style: {
                padding: isCompact ? '0.6rem 0.75rem 0.7rem' : '0.75rem 1rem 0.9rem',
            }
        }, [
            createElement('div', {
                key: 'title',
                style: {
                    fontSize: titleSize,
                    fontWeight: 600,
                    marginBottom: '0.2rem',
                    color: 'rgba(255, 255, 255, 0.97)',
                }
            }, scene.name),
            createElement('div', {
                key: 'desc',
                style: {
                    fontSize: descSize,
                    lineHeight: 1.35,
                    color: 'rgba(255, 255, 255, 0.65)',
                }
            }, scene.description),
        ]),
    ]);
}

export function ScenePicker() {
    const scenes = listScenes();
    if (scenes.length <= 1) return null;

    // Force re-render on scene-swap so the active card reflects the
    // post-swap state (history.replaceState doesn't trigger React).
    const [, force] = useState(0);
    useEffect(() => subscribeGameEvent('scene-swap-end', () => force((n) => n + 1)), []);

    const { isCompact, isVeryCompact } = useResponsive();
    const activeId = currentSceneId();

    // Order: Sheep Dog Island first (default + featured), then Open Country
    // (NEW), then Home Field (classic). Stable client-side sort independent
    // of the SCENES registry order.
    const ORDER = ['rolling-hills', 'open-country', 'field'];
    const ordered = [...scenes].sort(
        (a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id),
    );

    const containerStyle = {
        width: '100%',
        maxWidth: '52rem',
        margin: '0 auto 1rem',
        padding: '0.25rem 0',
    };

    const labelStyle = {
        fontSize: '0.7rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        opacity: 0.6,
        marginBottom: '0.6rem',
        paddingLeft: '0.25rem',
        fontWeight: 600,
    };

    const gridStyle = isCompact
        ? {
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '0.6rem',
        }
        : {
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.85rem',
        };

    return createElement('div', { style: containerStyle }, [
        createElement('div', { key: 'label', style: labelStyle }, 'Choose your home'),
        createElement('div', { key: 'grid', style: gridStyle },
            ordered.map((s) =>
                createElement(SceneCard, {
                    key: s.id,
                    scene: s,
                    isActive: s.id === activeId,
                    onClick: () => switchScene(s.id),
                    isCompact: isCompact || isVeryCompact,
                })
            )
        ),
    ]);
}
