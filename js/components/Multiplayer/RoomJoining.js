/**
 * RoomJoining Component
 * Join an existing room with a code
 */
import React, { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button } from '../ui/Button.js';

export function RoomJoining({ onBack, onJoin, initialCode = '' }) {
    const { t } = useTranslation();
    const [roomCode, setRoomCode] = useState(initialCode);
    const [error, setError] = useState('');
    const { isCompact } = useResponsive();

    const handleJoin = () => {
        if (roomCode.length !== 6) {
            setError(t('errors.roomCodeLength'));
            return;
        }
        onJoin(roomCode.toUpperCase());
    };

    const inputStyle = {
        width: '100%',
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '0.75rem',
        padding: '1rem',
        color: 'white',
        fontSize: '1.5rem',
        textAlign: 'center',
        letterSpacing: '0.25em',
        textTransform: 'uppercase',
        outline: 'none',
        transition: 'all 0.3s'
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
            createElement(PanelTitle, { key: 'title' }, t('multiplayer.joinRoom')),

            createElement('div', {
                key: 'input-group',
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                }
            }, [
                createElement('input', {
                    key: 'input',
                    type: 'text',
                    style: inputStyle,
                    placeholder: t('multiplayer.roomCode').toUpperCase(),
                    maxLength: 6,
                    value: roomCode,
                    onChange: (e) => {
                        setRoomCode(e.target.value.toUpperCase());
                        setError('');
                    },
                    onKeyPress: (e) => {
                        if (e.key === 'Enter') handleJoin();
                    },
                    onFocus: (e) => {
                        e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                        e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                    },
                    onBlur: (e) => {
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        e.target.style.boxShadow = 'none';
                    }
                }),

                error && createElement('p', {
                    key: 'error',
                    style: {
                        color: '#f87171',
                        fontSize: '0.875rem',
                        textAlign: 'center',
                        margin: 0
                    }
                }, error)
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
                    key: 'join',
                    variant: 'primary',
                    onClick: handleJoin,
                    disabled: roomCode.length === 0,
                    style: { flex: 1 }
                }, `${t('multiplayer.joinRoom')} →`)
            ])
        ])
    );
}
