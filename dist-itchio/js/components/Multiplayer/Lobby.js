/**
 * Lobby Component
 * Waiting room before game starts
 */
const { createElement, useState } = window.React;

// Dog type to display icon mapping
const DOG_ICONS = {
    jep: 'JEP',
    pip: 'PIP',
    sally: 'SAL',
    shiloh: 'SHI',
    george_washington: 'GW'
};

export function Lobby({ roomCode, players, maxPlayers, isHost, onStart, onLeave }) {
    const [copied, setCopied] = useState(false);

    const copyRoomCode = () => {
        navigator.clipboard.writeText(roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

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

    return createElement('div', {
        className: 'max-w-2xl w-full',
        style: panelStyle
    }, [
        createElement('h2', {
            key: 'title',
            className: 'text-3xl font-bold text-center text-white mb-8',
            style: { textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)' }
        }, 'Game Lobby'),

        // Room code display
        createElement('div', {
            key: 'room-info',
            className: 'mb-6 text-center',
            style: {
                background: 'rgba(255, 255, 255, 0.06)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '1rem',
                padding: '1.5rem',
                boxShadow: '0 3px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)'
            }
        }, [
            createElement('p', {
                key: 'label',
                className: 'text-white text-opacity-60 mb-2'
            }, 'Room Code'),
            createElement('div', {
                key: 'code',
                className: 'flex items-center justify-center gap-3'
            }, [
                createElement('span', {
                    key: 'text',
                    className: 'text-3xl font-mono font-bold text-blue-400 tracking-wider'
                }, roomCode),
                createElement('button', {
                    key: 'copy',
                    className: 'btn-secondary py-2 px-4 text-sm',
                    onClick: copyRoomCode
                }, copied ? 'Copied!' : 'Copy')
            ])
        ]),

        // Players list
        createElement('div', {
            key: 'players',
            className: 'mb-6'
        }, [
            createElement('h3', {
                key: 'title',
                className: 'text-white text-opacity-80 mb-3'
            }, `Players (${players.length}/${maxPlayers})`),
            createElement('div', {
                key: 'list',
                className: 'grid grid-cols-2 md:grid-cols-3 gap-4'
            }, Array.from({ length: maxPlayers }, (_, i) => {
                const player = players[i];
                return createElement('div', {
                    key: i,
                    className: 'text-center',
                    style: {
                        background: player ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        border: player ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '0.75rem',
                        padding: '1rem',
                        boxShadow: player
                            ? '0 3px 12px rgba(34, 197, 94, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)'
                            : '0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 0 rgba(255, 255, 255, 0.02)'
                    }
                }, player ? [
                    createElement('div', {
                        key: 'dog-icon',
                        className: 'text-2xl mb-1 text-center font-bold text-blue-400'
                    }, DOG_ICONS[player.dogType] || 'DOG'),
                    createElement('p', { key: 'name', className: 'text-white font-semibold' }, player.name),
                    player.isHost && createElement('span', {
                        key: 'host',
                        className: 'text-xs text-yellow-400'
                    }, 'Host')
                ] : createElement('p', {
                    className: 'text-white text-opacity-30'
                }, 'Waiting...'));
            }))
        ]),

        // Action buttons
        createElement('div', {
            key: 'buttons',
            className: 'flex gap-3'
        }, [
            createElement('button', {
                key: 'leave',
                className: 'btn-secondary flex-1',
                onClick: onLeave
            }, 'Leave Room'),
            isHost && createElement('button', {
                key: 'start',
                className: 'btn-primary flex-1',
                onClick: onStart,
                disabled: players.length < 2
            }, createElement('span', null, players.length < 2 ? 'Waiting for players...' : 'Start Game'))
        ])
    ]);
}
