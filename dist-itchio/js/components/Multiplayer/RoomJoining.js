/**
 * RoomJoining Component
 * Join an existing room with a code
 */
const { createElement, useState } = window.React;

export function RoomJoining({ onBack, onJoin }) {
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState('');

    const handleJoin = () => {
        if (roomCode.length !== 6) {
            setError('Room code must be 6 characters');
            return;
        }
        onJoin(roomCode.toUpperCase());
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
        className: 'max-w-lg w-full',
        style: panelStyle
    }, [
        createElement('h2', {
            key: 'title',
            className: 'text-2xl font-bold text-center text-white mb-8',
            style: { textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)' }
        }, 'Join Room'),

        createElement('div', {
            key: 'input-group',
            className: 'space-y-6'
        }, [
            createElement('input', {
                key: 'input',
                type: 'text',
                className: 'modern-input w-full text-center text-2xl tracking-wider uppercase',
                placeholder: 'ROOM CODE',
                maxLength: 6,
                value: roomCode,
                onChange: (e) => {
                    setRoomCode(e.target.value.toUpperCase());
                    setError('');
                },
                onKeyPress: (e) => {
                    if (e.key === 'Enter') handleJoin();
                }
            }),

            error && createElement('p', {
                key: 'error',
                className: 'text-red-400 text-sm text-center'
            }, error)
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
                key: 'join',
                className: 'btn-primary flex-1',
                onClick: handleJoin,
                disabled: roomCode.length === 0
            }, createElement('span', null, 'Join Room'))
        ])
    ]);
}
