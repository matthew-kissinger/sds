// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * RoomCreation Component
 * Create a new multiplayer room with settings
 */
import { createElement, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button } from '../ui/Button.js';
import { listScenes, loadScene, DEFAULT_SCENE_ID } from '../../../shared/scenes/index.js';

const gameModeDescriptions = {
    cooperative: 'multiplayer.cooperativeDesc',
    competitive: 'multiplayer.competitiveDesc',
    timed: 'multiplayer.timedDesc',
    // Cycle 67 P4: co-op survival on Newsheepdogland.
    survival: 'multiplayer.survivalDesc'
};

// Cycle 34 Phase 5: scene picker for the host. Mode dropdown filters by
// the selected scene's `allowedModes` so the host can't trip the worker's
// 400 mode_not_allowed_on_scene guard from Phase 4. Scene order matches
// the solo ScenePicker (RH first, OC second, Field last).
// Cycle 67 P4: Newsheepdogland leads the list (the co-op survival scene).
const SCENE_ORDER = ['newsheepdogland', 'rolling-hills', 'open-country', 'field'];
const ALL_MODES = ['cooperative', 'competitive', 'timed'];

// Cycle 8 Phase 5: room-level sheep count picker.
// Cycle 23 Phase E (Q5): extended to include Insane (3000) + Chaos (5000)
// matching the solo-mode roster. Labels reflect the canonical mode
// nomenclature so hosts pick "Classic" / "Extreme" / "Insane" / "Chaos"
// rather than guess what 1000 means; mid-counts (250/500) keep neutral
// labels because they don't have canonical solo modes.
//
// Mobile guests are rejected by the worker on rooms with sheepCount > 1000;
// host UI shows a "all guests must be on desktop" notice when picking
// Insane/Chaos so the host knows before friends try to join.
const SHEEP_COUNT_OPTIONS = [
    { value: 200,  label: '200 — Classic' },
    { value: 250,  label: '250' },
    { value: 500,  label: '500' },
    { value: 1000, label: '1000 — Extreme' },
    { value: 3000, label: '3000 — Insane (desktop guests only)' },
    { value: 5000, label: '5000 — Chaos (desktop guests only)' }
];
const DESKTOP_ONLY_THRESHOLD = 1000;

export function RoomCreation({ onBack, onCreate }) {
    const { t } = useTranslation();
    const [settings, setSettings] = useState({
        maxPlayers: 4,
        gameMode: 'cooperative',
        sheepCount: 200,
        sceneId: DEFAULT_SCENE_ID
    });
    const { isCompact } = useResponsive();

    // Resolve the selected scene's display name + allowed modes for the
    // mode dropdown filter. listScenes() is small (3 entries today) and
    // the cost is negligible per render.
    const sceneOptions = useMemo(() => {
        const all = listScenes();
        return SCENE_ORDER
            .map(id => all.find(s => s.id === id))
            .filter(Boolean);
    }, []);
    const selectedScene = useMemo(
        () => loadScene(settings.sceneId),
        [settings.sceneId]
    );
    const availableModes = selectedScene.allowedModes && selectedScene.allowedModes.length > 0
        ? selectedScene.allowedModes
        : ALL_MODES;

    // If the currently-selected mode is no longer valid for the scene,
    // snap to the scene's defaultMode (or the first allowed mode).
    if (!availableModes.includes(settings.gameMode)) {
        const fallback = selectedScene.defaultMode && availableModes.includes(selectedScene.defaultMode)
            ? selectedScene.defaultMode
            : availableModes[0];
        // Defer the state update to avoid a setState-during-render warning.
        Promise.resolve().then(() => {
            setSettings(prev => ({ ...prev, gameMode: fallback }));
        });
    }

    const selectStyle = {
        width: '100%',
        background: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '0.75rem',
        padding: '0.75rem 1rem',
        color: 'white',
        fontSize: '1rem',
        cursor: 'pointer',
        outline: 'none'
    };

    const labelStyle = {
        display: 'block',
        color: 'rgba(255, 255, 255, 0.8)',
        marginBottom: '0.5rem',
        fontSize: isCompact ? '0.85rem' : '1rem'
    };

    return createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%'
        }
    },
        createElement(Panel, {
            size: 'md',
            maxWidth: '28rem',
            style: { animation: 'slideUp 0.5s ease-out' }
        }, [
            createElement(PanelTitle, { key: 'title' }, t('multiplayer.createRoom')),

            createElement('div', {
                key: 'settings',
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isCompact ? '1rem' : '1.5rem'
                }
            }, [
                // Max Players
                createElement('div', { key: 'max-players' }, [
                    createElement('label', { key: 'label', style: labelStyle }, t('multiplayer.maxPlayers')),
                    createElement('select', {
                        key: 'select',
                        style: selectStyle,
                        value: settings.maxPlayers,
                        onChange: (e) => setSettings({ ...settings, maxPlayers: parseInt(e.target.value) })
                    }, [2, 3, 4].map(n =>
                        createElement('option', { key: n, value: n }, t('multiplayer.playersCount', { count: n }))
                    ))
                ]),

                // Cycle 34 Phase 5: Scene picker. Drives the mode-dropdown
                // filter below.
                createElement('div', { key: 'scene' }, [
                    createElement('label', { key: 'label', style: labelStyle }, 'Scene'),
                    createElement('select', {
                        key: 'select',
                        style: selectStyle,
                        value: settings.sceneId,
                        onChange: (e) => setSettings({ ...settings, sceneId: e.target.value })
                    }, sceneOptions.map(sc =>
                        createElement('option', { key: sc.id, value: sc.id }, sc.name)
                    ))
                ]),

                // Game Mode (filtered by selected scene's allowedModes)
                createElement('div', { key: 'game-mode' }, [
                    createElement('label', { key: 'label', style: labelStyle }, t('multiplayer.gameMode')),
                    createElement('select', {
                        key: 'select',
                        style: selectStyle,
                        value: settings.gameMode,
                        onChange: (e) => setSettings({ ...settings, gameMode: e.target.value })
                    }, availableModes.map(mode =>
                        createElement('option', { key: mode, value: mode }, t(`multiplayer.${mode}`))
                    ))
                ]),

                // Sheep count (Cycle 8 Phase 5; Cycle 23 Phase E added Insane/Chaos).
                // Cycle 67 P4: hidden for survival - it has no count selector (the
                // run is a fixed pool sized to the scene's maxFlock).
                settings.gameMode !== 'survival' && createElement('div', { key: 'sheep-count' }, [
                    createElement('label', { key: 'label', style: labelStyle }, 'Sheep count'),
                    createElement('select', {
                        key: 'select',
                        style: selectStyle,
                        value: settings.sheepCount,
                        onChange: (e) => setSettings({ ...settings, sheepCount: parseInt(e.target.value) })
                    }, SHEEP_COUNT_OPTIONS.map(opt =>
                        createElement('option', { key: opt.value, value: opt.value }, opt.label)
                    )),
                    // Cycle 23 Phase E: warn host that mobile guests will be
                    // rejected when picking Insane/Chaos. Worker also
                    // enforces this on the WS upgrade.
                    settings.sheepCount > DESKTOP_ONLY_THRESHOLD && createElement('p', {
                        key: 'desktop-warning',
                        style: {
                            color: 'rgba(251, 191, 36, 0.9)',
                            fontSize: isCompact ? '0.75rem' : '0.8rem',
                            marginTop: '0.4rem',
                            margin: '0.4rem 0 0 0'
                        }
                    }, 'Mobile players will be unable to join this room. All guests must be on desktop.')
                ]),

                // Mode description
                createElement('div', {
                    key: 'mode-desc',
                    style: {
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '0.75rem',
                        padding: '0.75rem 1rem'
                    }
                },
                    createElement('p', {
                        style: {
                            fontSize: isCompact ? '0.8rem' : '0.875rem',
                            color: 'rgba(255, 255, 255, 0.8)',
                            textAlign: 'center',
                            margin: 0
                        }
                    }, t(gameModeDescriptions[settings.gameMode]))
                )
            ]),

            createElement('div', {
                key: 'buttons',
                style: {
                    display: 'flex',
                    gap: '0.75rem',
                    marginTop: isCompact ? '1rem' : '1.5rem'
                }
            }, [
                createElement(Button, {
                    key: 'back',
                    variant: 'secondary',
                    onClick: onBack,
                    style: { flex: 1 }
                }, `← ${t('common.back')}`),
                createElement(Button, {
                    key: 'create',
                    variant: 'primary',
                    onClick: () => onCreate(settings),
                    style: { flex: 1 }
                }, `${t('multiplayer.createRoom')} →`)
            ])
        ])
    );
}
