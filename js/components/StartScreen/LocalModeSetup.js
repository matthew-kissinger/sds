// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * LocalModeSetup Component
 * Setup screen for local 2-player mode
 * Allows selecting game mode (Co-op, 1v1, Endless) and dogs for both players
 */
import React, { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { PanelTitle } from '../ui/Panel.js';

// Local game modes with translation keys. Cycle 61 P2: warm pastoral mode hues
// (were the emerald/red/amber tech palette).
const LOCAL_MODES = [
    {
        id: 'coop',
        nameKey: 'localMode.coop',
        descKey: 'localMode.coopDesc',
        color: '#5e9e6e', // Meadow green
        icon: 'handshake'
    },
    {
        id: 'versus',
        nameKey: 'localMode.versus',
        descKey: 'localMode.versusDesc',
        color: '#e0a458', // Low-sun gold
        icon: 'trophy'
    },
    {
        id: 'timed',
        nameKey: 'localMode.timed',
        descKey: 'localMode.timedDesc',
        color: '#d99a8f', // Dusty rose
        icon: 'clock'
    }
];

// Dog data with translation keys. Cycle 61 P2: warm pastoral per-dog hues, a
// distinguishable golden-hour set (were the cool brand tech palette).
const DOGS = [
    { id: 'jep', translationKey: 'jep', color: '#5e9e6e' },
    { id: 'pip', translationKey: 'pip', color: '#e0a458' },
    { id: 'sally', translationKey: 'sally', color: '#d99a8f' },
    { id: 'shiloh', translationKey: 'shiloh', color: '#8aa66a' },
    { id: 'george_washington', translationKey: 'georgeWashington', color: '#b9a6c4' }
];

// Dog avatar icon
const DogAvatar = ({ color = '#5e9e6e', size = 32 }) => createElement('div', {
    style: {
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `${color}22`,
        borderRadius: '8px',
        padding: '4px'
    }
}, createElement('svg', {
    width: size - 8,
    height: size - 8,
    viewBox: '0 0 512 512',
    fill: color
}, createElement('path', {
    d: 'm231.6 16.18 16.7 120.02 73.8 20.5c37.3-11.2 78.5-18.2 102.3-43.6 9.7-10.3 17.2-24.78 9.1-37.92l-75.3 2.22-14.6-31.79h-74.7c-7.7-11.71-22.8-20.46-37.3-29.43zm5.7 145.22c-46.9 19.8-110.1 146.3-111.8 276.5-34.02-58.1-24.9-122.6-2.9-202.6C55.31 287 4.732 448.4 133.1 486.9H346s-6.3-21.5-14.1-28.9c-12.7-12-48.2-20.2-48.2-20.2 27.8-39.2 33.5-71.7 38.6-103.9 4.5 59.8 40.7 126.8 57.4 153h76.5s4.6-15.9.2-21.5c-10.9-13.8-51.3-11.9-51.3-11.9-31.1-107.2-46.3-260.2-90-273.2-21.7-6.5-54.3-14.1-77.8-18.9z'
})));

// Mode icon SVG
function ModeIcon({ type, color, size = 24 }) {
    const iconProps = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: color,
        strokeWidth: '2',
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
    };

    const icons = {
        handshake: createElement('svg', iconProps, [
            createElement('path', { key: '1', d: 'M11 17a4 4 0 0 0 8 0' }),
            createElement('path', { key: '2', d: 'M5 17a4 4 0 0 0 8 0' }),
            createElement('path', { key: '3', d: 'M7 7h10' }),
            createElement('path', { key: '4', d: 'M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5' }),
            createElement('path', { key: '5', d: 'M3 7v5a2 2 0 0 0 2 2' })
        ]),
        trophy: createElement('svg', iconProps, [
            createElement('path', { key: '1', d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' }),
            createElement('path', { key: '2', d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' }),
            createElement('path', { key: '3', d: 'M4 22h16' }),
            createElement('path', { key: '4', d: 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22' }),
            createElement('path', { key: '5', d: 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22' }),
            createElement('path', { key: '6', d: 'M18 2H6v7a6 6 0 0 0 12 0V2Z' })
        ]),
        clock: createElement('svg', iconProps, [
            createElement('circle', { key: '1', cx: '12', cy: '12', r: '10' }),
            createElement('polyline', { key: '2', points: '12 6 12 12 16 14' })
        ])
    };

    return icons[type] || null;
}

// Player dog selector
function PlayerDogSelector({ player, playerNumber, selectedDog, onSelect, playerColor, t }) {
    const { isCompact } = useResponsive();

    return createElement('div', {
        className: `p-3 rounded-xl backdrop-blur-xl`,
        style: {
            background: 'rgba(247, 241, 230, 0.08)',
            border: `2px solid ${playerColor}44`
        }
    }, [
        // Player header
        createElement('div', {
            key: 'header',
            className: 'flex items-center gap-2 mb-2'
        }, [
            createElement('div', {
                key: 'badge',
                className: 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-[#f7f1e6]',
                style: { background: playerColor }
            }, playerNumber),
            createElement('span', {
                key: 'label',
                className: 'text-[#f7f1e6] font-semibold text-sm'
            }, `${t('localMode.player')} ${playerNumber}`),
            createElement('span', {
                key: 'controls',
                className: 'text-[#f7f1e6]/50 text-xs ml-auto'
            }, playerNumber === 1 ? t('localMode.controls1') : t('localMode.controls2'))
        ]),

        // Dog grid
        createElement('div', {
            key: 'dogs',
            className: 'grid grid-cols-5 gap-1'
        }, DOGS.map(dog => {
            const isSelected = selectedDog === dog.id;
            return createElement('button', {
                key: dog.id,
                onClick: () => onSelect(dog.id),
                className: `p-1.5 rounded-lg transition-all duration-200 flex flex-col items-center`,
                style: {
                    background: isSelected ? `${dog.color}33` : 'rgba(247,241,230,0.05)',
                    border: isSelected ? `2px solid ${dog.color}` : '1px solid rgba(247,241,230,0.1)',
                    transform: isSelected ? 'scale(1.05)' : 'scale(1)'
                }
            }, [
                createElement(DogAvatar, { key: 'avatar', color: dog.color, size: isCompact ? 28 : 32 }),
                createElement('span', {
                    key: 'name',
                    className: 'text-xs text-[#f7f1e6]/80 mt-1 truncate w-full text-center',
                    style: { color: isSelected ? dog.color : undefined }
                }, t(`dogs.${dog.translationKey}.name`))
            ]);
        }))
    ]);
}

export function LocalModeSetup({ onStart, onBack }) {
    const { t } = useTranslation();
    const { isCompact, isLandscapeMobile } = useResponsive();

    const [selectedMode, setSelectedMode] = useState('coop');
    const [player1Dog, setPlayer1Dog] = useState('jep');
    const [player2Dog, setPlayer2Dog] = useState('pip');

    const handleStart = () => {
        onStart({
            mode: selectedMode,
            player1Dog,
            player2Dog
        });
    };

    // Layout classes
    const maxWidthClass = isCompact ? 'max-w-full px-4' : 'max-w-2xl';
    const gapClass = isCompact ? 'gap-3' : 'gap-4';

    return createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%'
        }
    }, createElement('div', {
        className: `w-full mx-auto ${maxWidthClass} animate-slide-up`
    }, [
        // Title with back button
        createElement('div', {
            key: 'header',
            className: 'flex items-center gap-3 mb-4'
        }, [
            createElement('button', {
                key: 'back',
                onClick: onBack,
                className: 'p-2 rounded-lg bg-[#f7f1e6]/10 hover:bg-[#f7f1e6]/20 transition-colors'
            }, createElement('svg', {
                width: 20,
                height: 20,
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: '#f7f1e6',
                strokeWidth: 2
            }, createElement('path', { d: 'M19 12H5m0 0l7 7m-7-7l7-7' }))),
            createElement(PanelTitle, { key: 'title' }, t('localMode.title'))
        ]),

        // Game mode selection
        createElement('div', {
            key: 'modes',
            className: `grid grid-cols-3 ${gapClass} mb-4`
        }, LOCAL_MODES.map(mode => {
            const isSelected = selectedMode === mode.id;
            return createElement('button', {
                key: mode.id,
                onClick: () => setSelectedMode(mode.id),
                className: `p-3 rounded-xl text-center transition-all duration-200`,
                style: {
                    background: isSelected ? `${mode.color}22` : 'rgba(247,241,230,0.08)',
                    border: isSelected ? `2px solid ${mode.color}` : '1px solid rgba(247,241,230,0.12)',
                    transform: isSelected ? 'scale(1.02)' : 'scale(1)'
                }
            }, [
                createElement('div', {
                    key: 'icon',
                    className: 'flex justify-center mb-2'
                }, createElement('div', {
                    style: {
                        padding: '8px',
                        borderRadius: '10px',
                        background: `${mode.color}22`
                    }
                }, createElement(ModeIcon, { type: mode.icon, color: mode.color, size: isCompact ? 20 : 24 }))),
                createElement('h3', {
                    key: 'name',
                    className: `font-bold text-sm mb-1`,
                    style: { color: isSelected ? mode.color : '#f7f1e6' }
                }, t(mode.nameKey)),
                !isCompact && createElement('p', {
                    key: 'desc',
                    className: 'text-[#f7f1e6]/60 text-xs'
                }, t(mode.descKey))
            ]);
        })),

        // Player dog selection - side by side
        createElement('div', {
            key: 'players',
            className: `grid grid-cols-2 ${gapClass} mb-4`
        }, [
            createElement(PlayerDogSelector, {
                key: 'p1',
                player: 'player1',
                playerNumber: 1,
                selectedDog: player1Dog,
                onSelect: setPlayer1Dog,
                playerColor: '#e0a458',
                t
            }),
            createElement(PlayerDogSelector, {
                key: 'p2',
                player: 'player2',
                playerNumber: 2,
                selectedDog: player2Dog,
                onSelect: setPlayer2Dog,
                playerColor: '#d99a8f',
                t
            })
        ]),

        // Start button
        createElement('button', {
            key: 'start',
            onClick: handleStart,
            className: `w-full py-3 rounded-xl font-bold text-[#f7f1e6] text-lg transition-all duration-200 hover:scale-[1.02]`,
            style: {
                background: 'linear-gradient(135deg, #5e9e6e, #4d8159)',
                boxShadow: '0 4px 20px rgba(94, 158, 110, 0.4)'
            }
        }, t('localMode.startGame')),

        // Info note
        createElement('p', {
            key: 'note',
            className: 'text-center text-[#f7f1e6]/40 text-xs mt-3'
        }, t('localMode.noLeaderboards'))
    ]));
}
