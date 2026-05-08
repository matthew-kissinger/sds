/**
 * SinglePlayerModes Component
 * Mode selection for single player difficulties:
 * Practice (30 sheep, no leaderboard), Classic (200), Extreme (1000),
 * Insane (3000), Chaos (5000).
 */
import React, { createElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { MenuOption, MenuOptionGrid } from '../ui/MenuOption.js';
import { BackButton } from '../ui/Button.js';

const MODES = [
    {
        // Cycle 26 v2.1.0: no-pressure entry mode. Position 0 so first-time
        // visitors see it first; pulses on first visit (see hasPlayed check
        // below).
        id: 'practice',
        labelKey: 'modes.practice',
        descKey: 'modes.practiceDesc',
        color: '#06b6d4' // Cyan-500 — distinct from emerald (Classic)
    },
    {
        id: 'classic',
        labelKey: 'modes.classic',
        descKey: 'modes.classicDesc',
        color: '#10b981' // Emerald
    },
    {
        id: 'extreme',
        labelKey: 'modes.extreme',
        descKey: 'modes.extremeDesc',
        color: '#ef4444' // Red
    },
    {
        id: 'insane',
        labelKey: 'modes.insane',
        descKey: 'modes.insaneDesc',
        color: '#a855f7' // Purple
    },
    {
        id: 'chaos',
        labelKey: 'modes.chaos',
        descKey: 'modes.chaosDesc',
        color: '#f59e0b' // Amber/Orange
    }
];

// First-visit detection: pulses the Practice tile until the player starts
// any solo mode (GameState.startGame sets the flag). Read via try/catch so
// SSR / privacy-mode browsers without localStorage don't hard-error.
function hasPlayed() {
    try { return localStorage.getItem('sds.has-played') === '1'; } catch { return false; }
}

export function SinglePlayerModes({ onSelectMode, onBack }) {
    const { t } = useTranslation();
    const { isLandscapeMobile } = useResponsive();
    const showPracticeNudge = !hasPlayed();

    return createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%'
        }
    }, createElement(Panel, {
        size: 'md',
        maxWidth: '28rem',
        style: { animation: 'slideUp 0.5s ease-out' }
    }, [
        createElement(PanelTitle, { key: 'title' }, t('modes.title')),

        createElement(MenuOptionGrid, { key: 'modes' },
            MODES.map(mode => {
                const tile = createElement(MenuOption, {
                    key: mode.id,
                    label: t(mode.labelKey),
                    description: t(mode.descKey),
                    accentColor: mode.color,
                    onClick: () => onSelectMode(mode.id)
                });
                if (mode.id === 'practice' && showPracticeNudge) {
                    return createElement('div', {
                        key: 'practice-wrap',
                        className: 'practice-pulse-wrapper'
                    }, tile);
                }
                return tile;
            })
        ),

        createElement('div', {
            key: 'back',
            style: { marginTop: isLandscapeMobile ? '0.5rem' : '1rem' }
        },
            createElement(BackButton, { onClick: onBack }, t('common.back'))
        )
    ]));
}
