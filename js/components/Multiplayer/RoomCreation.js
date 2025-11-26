/**
 * RoomCreation Component
 * Create a new multiplayer room with settings
 */
const { createElement, useState } = window.React;

const gameModeDescriptions = {
    cooperative: 'Work together to herd all sheep into the pen',
    competitive: 'Race to collect the most sheep before opponents',
    timed: 'Score as many points as possible in 3 minutes'
};

export function RoomCreation({ onBack, onCreate }) {
    const [settings, setSettings] = useState({
        maxPlayers: 4,
        gameMode: 'cooperative'
    });

    const panelStyle = {
        animation: 'slideUp 0.5s ease-out',
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderRadius: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        padding: '2.5rem'
    };

    const selectStyle = {
        background: 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '0.75rem',
        padding: '0.75rem 1rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06), inset 0 1px 0 0 rgba(255, 255, 255, 0.03)'
    };

    return createElement('div', {
        className: 'max-w-lg w-full',
        style: panelStyle
    }, [
        createElement('h2', {
            key: 'title',
            className: 'text-2xl font-bold text-center text-white mb-8',
            style: { textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)' }
        }, 'Create Room'),

        createElement('div', {
            key: 'settings',
            className: 'space-y-6'
        }, [
            // Max Players
            createElement('div', { key: 'max-players' }, [
                createElement('label', {
                    key: 'label',
                    className: 'block text-white text-opacity-80 mb-2'
                }, 'Max Players'),
                createElement('select', {
                    key: 'select',
                    className: 'w-full text-white',
                    style: selectStyle,
                    value: settings.maxPlayers,
                    onChange: (e) => setSettings({ ...settings, maxPlayers: parseInt(e.target.value) })
                }, [2, 3, 4, 5, 6].map(n =>
                    createElement('option', { key: n, value: n }, `${n} Players`)
                ))
            ]),

            // Game Mode
            createElement('div', { key: 'game-mode' }, [
                createElement('label', {
                    key: 'label',
                    className: 'block text-white text-opacity-80 mb-2'
                }, 'Game Mode'),
                createElement('select', {
                    key: 'select',
                    className: 'w-full text-white',
                    style: selectStyle,
                    value: settings.gameMode,
                    onChange: (e) => setSettings({ ...settings, gameMode: e.target.value })
                }, [
                    createElement('option', { key: 'cooperative', value: 'cooperative' }, 'Cooperative'),
                    createElement('option', { key: 'competitive', value: 'competitive' }, 'Competitive'),
                    createElement('option', { key: 'timed', value: 'timed' }, 'Timed (3 min)')
                ])
            ]),

            // Mode description
            createElement('div', {
                key: 'mode-desc',
                style: {
                    background: 'rgba(255, 255, 255, 0.06)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '0.75rem',
                    padding: '0.75rem 1rem',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06), inset 0 1px 0 0 rgba(255, 255, 255, 0.03)'
                }
            },
                createElement('p', {
                    className: 'text-sm text-white text-opacity-80 text-center'
                }, gameModeDescriptions[settings.gameMode])
            )
        ]),

        createElement('div', {
            key: 'buttons',
            className: 'flex gap-3 mt-6'
        }, [
            createElement('button', {
                key: 'back',
                className: 'btn-secondary flex-1',
                onClick: onBack
            }, String.fromCharCode(8592) + ' Back'),
            createElement('button', {
                key: 'create',
                className: 'btn-primary flex-1',
                onClick: () => onCreate(settings)
            }, createElement('span', null, 'Create Room'))
        ])
    ]);
}
