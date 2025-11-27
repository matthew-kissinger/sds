/**
 * MultiplayerOptions Component
 * Multiplayer menu options (Create, Join, Quick Match)
 */
const { createElement } = window.React;

export function MultiplayerOptions({ onBack, onSelectOption }) {
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

    const buttonStyle = {
        background: 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '1rem',
        padding: '1.5rem',
        boxShadow: '0 3px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
        color: 'white'
    };

    const options = [
        { id: 'create', label: 'Create Room', icon: '+', description: 'Host a new game room' },
        { id: 'join', label: 'Join Room', icon: '', description: 'Enter a room code' },
        { id: 'quick', label: 'Quick Match', icon: '', description: 'Find an available game' }
    ];

    return createElement('div', {
        className: 'max-w-lg w-full',
        style: panelStyle
    }, [
        createElement('h2', {
            key: 'title',
            className: 'text-2xl font-bold text-center text-white mb-8',
            style: { textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)' }
        }, 'Multiplayer'),

        createElement('div', {
            key: 'options',
            className: 'space-y-4'
        }, options.map(option =>
            createElement('button', {
                key: option.id,
                className: 'w-full cursor-pointer transition-all duration-300 text-white',
                style: buttonStyle,
                onMouseEnter: (e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                },
                onMouseLeave: (e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                },
                onClick: () => onSelectOption(option.id)
            },
                createElement('div', {
                    className: 'flex items-center justify-between'
                }, [
                    createElement('div', {
                        key: 'left',
                        className: 'flex items-center gap-3'
                    }, [
                        createElement('span', { key: 'icon', className: 'text-2xl' }, option.icon),
                        createElement('div', { key: 'text', className: 'text-left' }, [
                            createElement('div', { key: 'title', className: 'font-semibold text-white' }, option.label),
                            createElement('div', { key: 'desc', className: 'text-sm text-white text-opacity-70' }, option.description)
                        ])
                    ]),
                    createElement('span', { key: 'arrow', className: 'text-white text-opacity-60' }, String.fromCharCode(8594))
                ])
            )
        )),

        createElement('button', {
            key: 'back',
            className: 'btn-secondary w-full mt-6',
            onClick: onBack
        }, String.fromCharCode(8592) + ' Back')
    ]);
}
