/**
 * ModeSelection Component
 * Main menu mode selection - Solo, Multiplayer, Leaderboard, Settings
 */
import { useResponsive } from '../hooks/usePlatform.js';
import { MenuOption } from '../ui/MenuOption.js';

const { createElement, useState } = window.React;

// Mode configuration
const MODES = [
    {
        id: 'solo',
        label: 'Solo Play',
        description: 'Practice herding at your own pace',
        color: '#10b981', // Emerald
        icon: 'play'
    },
    {
        id: 'multiplayer',
        label: 'Multiplayer',
        description: 'Compete or cooperate with others',
        color: '#3b82f6', // Blue
        icon: 'users'
    },
    {
        id: 'leaderboard',
        label: 'Leaderboard',
        description: 'View global rankings',
        color: '#f59e0b', // Amber
        icon: 'trophy'
    },
    {
        id: 'settings',
        label: 'Settings',
        description: 'Adjust game settings',
        color: '#8b5cf6', // Purple
        icon: 'cog'
    }
];

// SVG Icons (only rendered on desktop)
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
        play: createElement('svg', { ...iconProps, fill: color, stroke: 'none' },
            createElement('path', { d: 'M8 5v14l11-7z' })
        ),
        users: createElement('svg', iconProps, [
            createElement('path', { key: '1', d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }),
            createElement('circle', { key: '2', cx: '9', cy: '7', r: '4' }),
            createElement('path', { key: '3', d: 'M23 21v-2a4 4 0 0 0-3-3.87' }),
            createElement('path', { key: '4', d: 'M16 3.13a4 4 0 0 1 0 7.75' })
        ]),
        trophy: createElement('svg', iconProps, [
            createElement('path', { key: '1', d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' }),
            createElement('path', { key: '2', d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' }),
            createElement('path', { key: '3', d: 'M4 22h16' }),
            createElement('path', { key: '4', d: 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22' }),
            createElement('path', { key: '5', d: 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22' }),
            createElement('path', { key: '6', d: 'M18 2H6v7a6 6 0 0 0 12 0V2Z' })
        ]),
        cog: createElement('svg', iconProps, [
            createElement('circle', { key: '1', cx: '12', cy: '12', r: '3' }),
            createElement('path', { key: '2', d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' })
        ])
    };

    if (!icons[type]) return null;

    // Wrap icon in a styled container
    return createElement('div', {
        style: {
            padding: '8px',
            borderRadius: '10px',
            background: `${color}22`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }
    }, icons[type]);
}

export function ModeSelection({ onSelectMode }) {
    const { isCompact, isLandscapeMobile } = useResponsive();

    // Use Tailwind for layout, minimal inline for responsive values
    const gapClass = isLandscapeMobile ? 'gap-1.5' : isCompact ? 'gap-2' : 'gap-4';
    const marginClass = isLandscapeMobile ? 'mt-1' : isCompact ? 'mt-2' : 'mt-4';
    const widthClass = isCompact ? 'w-full' : 'w-[32rem]';

    return createElement('div', {
        className: `grid grid-cols-2 ${gapClass} ${widthClass} max-w-full mx-auto ${marginClass} animate-slide-up`
    },
        MODES.map((mode, index) =>
            createElement(MenuOption, {
                key: mode.id,
                label: mode.label,
                description: mode.description,
                accentColor: mode.color,
                icon: createElement(ModeIcon, { type: mode.icon, color: mode.color, size: 24 }),
                showArrow: false,
                onClick: () => onSelectMode(mode.id),
                style: {
                    animation: `slideUp 0.5s ease-out ${0.1 + index * 0.08}s both`
                }
            })
        )
    );
}
