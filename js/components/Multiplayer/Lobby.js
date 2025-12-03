/**
 * Lobby Component
 * Waiting room before game starts
 */
import React, { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button } from '../ui/Button.js';

// Dog type to display icon mapping
const DOG_ICONS = {
    jep: 'JEP',
    pip: 'PIP',
    sally: 'SAL',
    shiloh: 'SHI',
    george_washington: 'GW'
};

export function Lobby({ roomCode, players, maxPlayers, isHost, onStart, onLeave }) {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const { isCompact } = useResponsive();

    const copyRoomCode = () => {
        navigator.clipboard.writeText(roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
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
            maxWidth: '40rem',
            style: { animation: 'slideUp 0.5s ease-out' }
        }, [
            createElement(PanelTitle, { key: 'title' }, t('lobby.title')),

            // Room code display
            createElement('div', {
                key: 'room-info',
                style: {
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '1rem',
                    padding: isCompact ? '1rem' : '1.5rem',
                    marginBottom: isCompact ? '1rem' : '1.5rem',
                    textAlign: 'center'
                }
            }, [
                createElement('p', {
                    key: 'label',
                    style: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        marginBottom: '0.5rem',
                        fontSize: isCompact ? '0.8rem' : '0.875rem'
                    }
                }, t('lobby.roomCode')),
                createElement('div', {
                    key: 'code',
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.75rem'
                    }
                }, [
                    createElement('span', {
                        key: 'text',
                        style: {
                            fontSize: isCompact ? '1.5rem' : '2rem',
                            fontFamily: 'monospace',
                            fontWeight: 'bold',
                            color: '#60a5fa',
                            letterSpacing: '0.1em'
                        }
                    }, roomCode),
                    createElement(Button, {
                        key: 'copy',
                        variant: 'secondary',
                        onClick: copyRoomCode,
                        style: { padding: '0.5rem 1rem' }
                    }, copied ? t('common.copied') : t('common.copy'))
                ])
            ]),

            // Players list
            createElement('div', {
                key: 'players',
                style: { marginBottom: isCompact ? '1rem' : '1.5rem' }
            }, [
                createElement('h3', {
                    key: 'title',
                    style: {
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '0.75rem',
                        fontSize: isCompact ? '0.9rem' : '1rem'
                    }
                }, t('lobby.playersCount', { current: players.length, max: maxPlayers })),
                createElement('div', {
                    key: 'list',
                    style: {
                        display: 'grid',
                        gridTemplateColumns: isCompact ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
                        gap: isCompact ? '0.5rem' : '1rem'
                    }
                }, Array.from({ length: maxPlayers }, (_, i) => {
                    const player = players[i];
                    return createElement('div', {
                        key: i,
                        style: {
                            textAlign: 'center',
                            background: player ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                            border: player ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                            borderRadius: '0.75rem',
                            padding: isCompact ? '0.75rem' : '1rem'
                        }
                    }, player ? [
                        createElement('div', {
                            key: 'dog-icon',
                            style: {
                                fontSize: isCompact ? '1.25rem' : '1.5rem',
                                marginBottom: '0.25rem',
                                fontWeight: 'bold',
                                color: '#60a5fa'
                            }
                        }, DOG_ICONS[player.dogType] || 'DOG'),
                        createElement('p', {
                            key: 'name',
                            style: {
                                color: 'white',
                                fontWeight: 600,
                                fontSize: isCompact ? '0.8rem' : '0.875rem',
                                marginBottom: '0.25rem'
                            }
                        }, player.name),
                        player.isHost && createElement('span', {
                            key: 'host',
                            style: {
                                fontSize: '0.7rem',
                                color: '#fbbf24'
                            }
                        }, t('common.host'))
                    ] : createElement('p', {
                        style: {
                            color: 'rgba(255, 255, 255, 0.3)',
                            fontSize: isCompact ? '0.8rem' : '0.875rem'
                        }
                    }, t('common.waiting')));
                }))
            ]),

            // Action buttons
            createElement('div', {
                key: 'buttons',
                style: {
                    display: 'flex',
                    gap: '0.75rem'
                }
            }, [
                createElement(Button, {
                    key: 'leave',
                    variant: 'secondary',
                    onClick: onLeave,
                    style: { flex: 1 }
                }, t('multiplayer.leaveRoom')),
                isHost && createElement(Button, {
                    key: 'start',
                    variant: 'primary',
                    onClick: onStart,
                    disabled: players.length < 2,
                    style: { flex: 1 }
                }, players.length < 2 ? t('multiplayer.waitingForPlayers') : t('multiplayer.startGame'))
            ])
        ])
    );
}
