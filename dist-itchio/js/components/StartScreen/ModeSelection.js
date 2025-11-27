/**
 * ModeSelection Component
 * Main menu mode selection buttons with accent colors and larger icons
 */
const { createElement, useState } = window.React;

// Mode data with accent colors
const MODES = [
    {
        id: 'solo',
        label: 'Solo Play',
        icon: 'play',
        description: 'Practice herding at your own pace',
        color: '#10b981' // Emerald
    },
    {
        id: 'multiplayer',
        label: 'Multiplayer',
        icon: 'users',
        description: 'Compete or cooperate with others',
        color: '#3b82f6' // Blue
    },
    {
        id: 'leaderboard',
        label: 'Leaderboard',
        icon: 'trophy',
        description: 'View global rankings',
        color: '#f59e0b' // Amber
    },
    {
        id: 'settings',
        label: 'Settings',
        icon: 'cog',
        description: 'Adjust game settings',
        color: '#8b5cf6' // Purple
    }
];

// Icon components with larger size
const renderIcon = (iconType, color, size = 32) => {
    const icons = {
        play: createElement('svg', {
            width: size,
            height: size,
            viewBox: '0 0 24 24',
            fill: color,
            stroke: 'none'
        }, createElement('path', { d: 'M8 5v14l11-7z' })),

        users: createElement('svg', {
            width: size,
            height: size,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: color,
            strokeWidth: '2',
            strokeLinecap: 'round',
            strokeLinejoin: 'round'
        }, [
            createElement('path', { key: 'p1', d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }),
            createElement('circle', { key: 'c1', cx: '9', cy: '7', r: '4' }),
            createElement('path', { key: 'p2', d: 'M23 21v-2a4 4 0 0 0-3-3.87' }),
            createElement('path', { key: 'p3', d: 'M16 3.13a4 4 0 0 1 0 7.75' })
        ]),

        trophy: createElement('svg', {
            width: size,
            height: size,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: color,
            strokeWidth: '2',
            strokeLinecap: 'round',
            strokeLinejoin: 'round'
        }, [
            createElement('path', { key: 'cup1', d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' }),
            createElement('path', { key: 'cup2', d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' }),
            createElement('path', { key: 'base', d: 'M4 22h16' }),
            createElement('path', { key: 'stem1', d: 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22' }),
            createElement('path', { key: 'stem2', d: 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22' }),
            createElement('path', { key: 'bowl', d: 'M18 2H6v7a6 6 0 0 0 12 0V2Z' })
        ]),

        cog: createElement('svg', {
            width: size,
            height: size,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: color,
            strokeWidth: '2',
            strokeLinecap: 'round',
            strokeLinejoin: 'round'
        }, [
            createElement('circle', { key: 'center', cx: '12', cy: '12', r: '3' }),
            createElement('path', { key: 'gear', d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' })
        ])
    };

    return icons[iconType];
};

export function ModeSelection({ onSelectMode }) {
    const [hoveredMode, setHoveredMode] = useState(null);

    return createElement('div', {
        className: 'grid grid-cols-2 gap-4 mt-6',
        style: { animation: 'slideUp 0.8s ease-out 0.3s both' }
    }, MODES.map((mode, index) => {
        const isHovered = hoveredMode === mode.id;

        return createElement('button', {
            key: mode.id,
            onClick: () => onSelectMode(mode.id),
            className: 'text-left transition-all duration-300 relative overflow-hidden',
            style: {
                background: isHovered
                    ? `linear-gradient(135deg, ${mode.color}22, ${mode.color}11)`
                    : 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderRadius: '1rem',
                border: isHovered
                    ? `1px solid ${mode.color}66`
                    : '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: isHovered
                    ? `0 8px 24px ${mode.color}33, inset 0 1px 0 0 rgba(255, 255, 255, 0.1)`
                    : '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
                padding: '1.25rem',
                transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                animation: `slideUp 0.5s ease-out ${0.1 + index * 0.1}s both`
            },
            onMouseEnter: () => setHoveredMode(mode.id),
            onMouseLeave: () => setHoveredMode(null)
        }, [
            // Icon container with glow effect
            createElement('div', {
                key: 'icon-container',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '8px'
                }
            }, [
                createElement('div', {
                    key: 'icon',
                    style: {
                        padding: '8px',
                        borderRadius: '10px',
                        background: `${mode.color}22`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.3s ease',
                        boxShadow: isHovered ? `0 0 16px ${mode.color}44` : 'none'
                    }
                }, renderIcon(mode.icon, mode.color, 28)),
                createElement('div', {
                    key: 'label',
                    className: 'text-white font-semibold text-lg',
                    style: {
                        color: isHovered ? mode.color : '#fff',
                        transition: 'color 0.3s ease'
                    }
                }, mode.label)
            ]),
            createElement('div', {
                key: 'desc',
                className: 'text-white text-opacity-60 text-sm',
                style: { marginLeft: '52px' }
            }, mode.description)
        ]);
    }));
}
