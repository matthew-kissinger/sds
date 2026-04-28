/**
 * ScenePicker — minimal scene-discovery strip, rendered above ModeSelection.
 *
 * Clicking a tile navigates to `?scene=<id>` which main.js reads on boot
 * (via loadScene) and threads into TerrainBuilder + the scene's sim config.
 * MP room creation with scene selection is Track 2 follow-up; today the
 * Worker always defaults to the `field` scene on its side.
 */

import React, { createElement } from 'react';
import { listScenes, DEFAULT_SCENE_ID } from '../../../shared/scenes/index.js';
import { getGameInstance } from '../../GameBridge.js';

function currentSceneId() {
    const fromUrl = new URLSearchParams(location.search).get('scene');
    const ids = listScenes().map(s => s.id);
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
    // Cycle 10 Phase 1: route through SheepDogSimulation.swapScene so future
    // steps can flip cross-scene transitions to in-process without touching
    // ScenePicker. Step 1's swapScene still hard-reloads, so behaviour is
    // unchanged. Fall back to the inline reload if the game instance is
    // unavailable or the swap throws.
    const game = getGameInstance();
    if (game?.swapScene) {
        game.swapScene(sceneId).catch(err => {
            console.warn('[SCENE] swapScene failed; hard-reload fallback', err);
            legacySwitchSceneFallback(sceneId);
        });
        return;
    }
    legacySwitchSceneFallback(sceneId);
}

function SceneTile({ scene, isActive, onClick }) {
    const baseStyle = {
        flex: '1 1 12rem',
        minWidth: '10rem',
        padding: '0.75rem 1rem',
        borderRadius: '0.75rem',
        border: isActive ? '2px solid rgba(16,185,129,0.9)' : '1px solid rgba(255,255,255,0.15)',
        background: isActive ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
        color: 'rgba(255,255,255,0.9)',
        cursor: isActive ? 'default' : 'pointer',
        textAlign: 'left',
        transition: 'background 120ms ease, transform 120ms ease',
        fontFamily: 'inherit'
    };

    return createElement('button', {
        type: 'button',
        onClick: isActive ? undefined : onClick,
        disabled: isActive,
        style: baseStyle,
        onMouseEnter: (e) => {
            if (!isActive) e.currentTarget.style.transform = 'translateY(-1px)';
        },
        onMouseLeave: (e) => {
            if (!isActive) e.currentTarget.style.transform = 'translateY(0)';
        }
    }, [
        createElement('div', {
            key: 'name',
            style: { fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.2rem' }
        }, isActive ? `${scene.name} (current)` : scene.name),
        createElement('div', {
            key: 'desc',
            style: { fontSize: '0.75rem', opacity: 0.75, lineHeight: 1.3 }
        }, scene.description)
    ]);
}

export function ScenePicker() {
    const scenes = listScenes();
    if (scenes.length <= 1) return null; // Hide strip when there's nothing to pick.

    const activeId = currentSceneId();

    return createElement('div', {
        style: {
            width: '100%',
            maxWidth: '32rem',
            margin: '0 auto 1rem',
            padding: '0.5rem 0'
        }
    }, [
        createElement('div', {
            key: 'label',
            style: {
                fontSize: '0.7rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                opacity: 0.55,
                marginBottom: '0.5rem',
                paddingLeft: '0.25rem'
            }
        }, 'Scene'),
        createElement('div', {
            key: 'tiles',
            style: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }
        }, scenes.map(s =>
            createElement(SceneTile, {
                key: s.id,
                scene: s,
                isActive: s.id === activeId,
                onClick: () => switchScene(s.id)
            })
        ))
    ]);
}
