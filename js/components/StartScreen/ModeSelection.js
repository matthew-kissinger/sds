/**
 * ModeSelection Component
 * Main menu mode selection buttons (Solo, Multiplayer, Leaderboard, Settings)
 */
const { createElement } = window.React;

export function ModeSelection({ onSelectMode }) {
    const modes = [
        { id: 'solo', label: 'Solo Play', icon: 'play', description: 'Practice herding at your own pace' },
        { id: 'multiplayer', label: 'Multiplayer', icon: 'users', description: 'Compete or cooperate with others' },
        { id: 'leaderboard', label: 'Leaderboard', icon: 'trophy', description: 'View global rankings' },
        { id: 'settings', label: 'Settings', icon: 'cog', description: 'Adjust game settings' }
    ];

    const renderIcon = (iconType) => {
        const iconPaths = {
            play: 'M8 5v14l11-7z',
            users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
            trophy: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z',
            cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'
        };

        return createElement('svg', {
            width: '24',
            height: '24',
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: '2',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            style: { opacity: 0.9 }
        },
            createElement('path', { d: iconPaths[iconType] })
        );
    };

    return createElement('div', {
        className: 'grid grid-cols-2 gap-4 mt-6',
        style: { animation: 'slideUp 0.8s ease-out 0.3s both' }
    }, modes.map(mode =>
        createElement('button', {
            key: mode.id,
            onClick: () => onSelectMode(mode.id),
            className: 'text-left transition-all duration-300',
            style: {
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderRadius: '1rem',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
                padding: '1.5rem'
            },
            onMouseEnter: (e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'translateY(-2px)';
            },
            onMouseLeave: (e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.transform = 'translateY(0)';
            }
        }, [
            createElement('div', {
                key: 'icon',
                className: 'text-white mb-2'
            }, renderIcon(mode.icon)),
            createElement('div', {
                key: 'label',
                className: 'text-white font-semibold mb-1'
            }, mode.label),
            createElement('div', {
                key: 'desc',
                className: 'text-white text-opacity-60 text-sm'
            }, mode.description)
        ])
    ));
}
