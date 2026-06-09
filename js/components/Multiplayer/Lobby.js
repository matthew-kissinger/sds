// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Lobby Component
 * Waiting room before game starts
 */
import { createElement, useState } from 'react';
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

const MODE_LABELS = {
    cooperative: 'Cooperative',
    competitive: 'Competitive',
    timed: 'Timed'
};

export function Lobby({ roomCode, players, maxPlayers, isHost, gameMode, modeLocked, onStart, onLeave, onSetModeLock }) {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const { isCompact } = useResponsive();

    const copyRoomCode = () => {
        navigator.clipboard.writeText(roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const copyInviteLink = () => {
        // Use the current origin so links work in local dev (localhost:3001),
        // preview deploys, and production (sheepdogsim.com) without rewriting.
        const url = `${location.origin}#/r/${roomCode}`;
        navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    };

    const handleModeLockChange = (e) => {
        if (onSetModeLock) {
            onSetModeLock(e.target.checked);
        }
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

            // Room code + invite link
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
                        gap: '0.75rem',
                        flexWrap: 'wrap'
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
                    }, copied ? t('common.copied') : t('common.copy')),
                    createElement(Button, {
                        key: 'invite',
                        variant: 'secondary',
                        onClick: copyInviteLink,
                        style: { padding: '0.5rem 1rem' }
                    }, linkCopied ? 'Link copied!' : 'Copy invite link')
                ]),

                // Game mode badge
                gameMode && createElement('div', {
                    key: 'mode-badge',
                    style: {
                        marginTop: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        flexWrap: 'wrap'
                    }
                }, [
                    createElement('span', {
                        key: 'mode-label',
                        style: {
                            fontSize: '0.8rem',
                            color: 'rgba(255, 255, 255, 0.6)'
                        }
                    }, 'Mode:'),
                    createElement('span', {
                        key: 'mode-value',
                        style: {
                            fontSize: '0.8rem',
                            color: '#60a5fa',
                            fontWeight: 600,
                            background: 'rgba(96, 165, 250, 0.1)',
                            border: '1px solid rgba(96, 165, 250, 0.3)',
                            borderRadius: '0.375rem',
                            padding: '0.125rem 0.5rem'
                        }
                    }, MODE_LABELS[gameMode] || gameMode),
                    !modeLocked && createElement('span', {
                        key: 'cycling',
                        style: {
                            fontSize: '0.7rem',
                            color: 'rgba(255, 255, 255, 0.4)',
                            fontStyle: 'italic'
                        }
                    }, '(cycling)')
                ]),

                // Host-only: mode lock checkbox
                isHost && gameMode && createElement('label', {
                    key: 'mode-lock',
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        marginTop: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                }, [
                    createElement('input', {
                        key: 'checkbox',
                        type: 'checkbox',
                        checked: !!modeLocked,
                        onChange: handleModeLockChange,
                        style: { cursor: 'pointer', accentColor: '#60a5fa' }
                    }),
                    'Lock mode (stop cycling after game ends)'
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
                    flexDirection: 'column',
                    gap: '0.5rem'
                }
            }, [
                // Non-host waiting label
                !isHost && createElement('p', {
                    key: 'waiting-label',
                    style: {
                        textAlign: 'center',
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontSize: isCompact ? '0.85rem' : '0.9rem',
                        padding: '0.5rem 0'
                    }
                }, 'Waiting for host to start...'),

                createElement('div', {
                    key: 'action-row',
                    style: { display: 'flex', gap: '0.75rem' }
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
        ])
    );
}
