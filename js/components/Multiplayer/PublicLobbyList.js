/**
 * PublicLobbyList Component
 * Shows open public rooms. Polls the server every 3s.
 */
import React, { createElement, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getNetworkManager } from '../../GameBridge.js';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button, BackButton } from '../ui/Button.js';
import { loadScene } from '../../../shared/scenes/index.js';

const MODE_LABELS = {
    cooperative: 'Cooperative',
    competitive: 'Competitive',
    timed: 'Timed'
};

// Cycle 34 Phase 5: resolve a sceneId to its human display name. loadScene
// throws on unknown ids so the wrapper falls back gracefully — defends
// against persisted rooms with stale or renamed sceneIds.
function sceneLabel(sceneId) {
    if (!sceneId) return null;
    try {
        return loadScene(sceneId).name;
    } catch {
        return sceneId;
    }
}

export function PublicLobbyList({ onBack, onJoinRoom }) {
    const { t } = useTranslation();
    const [lobbies, setLobbies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const pollRef = useRef(null);
    const { isCompact } = useResponsive();

    const fetchLobbies = async () => {
        try {
            const nm = getNetworkManager();
            if (!nm) {
                setError('Network not available.');
                setLoading(false);
                return;
            }

            if (!nm.isConnected()) {
                try {
                    await nm.connect();
                } catch (e) {
                    setError('Could not connect to server. Retrying...');
                    setLoading(false);
                    return;
                }
            }

            // Register a one-time listener before emitting
            const channel = nm.channel;
            if (!channel) {
                setError('No channel available.');
                setLoading(false);
                return;
            }

            const handler = (data) => {
                setLobbies(data && data.lobbies ? data.lobbies : []);
                setLoading(false);
                setError('');
            };

            channel.on('publicLobbies', handler);
            nm.requestPublicLobbies();

            // After a brief window, remove the handler to avoid stacking
            setTimeout(() => {
                // geckos.io does not expose removeListener; subsequent calls overwrite
                // the last registered handler automatically as the server responds.
                // This is acceptable for polling.
            }, 2000);

        } catch (err) {
            console.error('[PublicLobbyList] Error fetching lobbies:', err);
            setError('Failed to load lobbies. Retrying...');
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLobbies();

        // Poll every 3 seconds
        pollRef.current = setInterval(fetchLobbies, 3000);

        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
            }
        };
    }, []);

    const rowStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '0.75rem',
        padding: isCompact ? '0.75rem 1rem' : '1rem 1.25rem',
        marginBottom: '0.5rem',
        gap: '1rem'
    };

    const renderLobbies = () => {
        if (loading && lobbies.length === 0) {
            return createElement('p', {
                style: { color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', padding: '2rem 0' }
            }, 'Loading...');
        }

        if (error && lobbies.length === 0) {
            return createElement('p', {
                style: { color: '#f87171', textAlign: 'center', padding: '1rem 0', fontSize: '0.875rem' }
            }, error);
        }

        if (lobbies.length === 0) {
            return createElement('div', {
                style: { textAlign: 'center', padding: '2rem 0' }
            }, [
                createElement('p', {
                    key: 'empty',
                    style: { color: 'rgba(255, 255, 255, 0.5)', marginBottom: '1rem' }
                }, 'No games open. Start one.'),
                createElement(Button, {
                    key: 'create',
                    variant: 'primary',
                    onClick: onBack
                }, 'Create Room')
            ]);
        }

        return lobbies.map((lobby) =>
            createElement('div', { key: lobby.roomCode, style: rowStyle }, [
                createElement('div', { key: 'info', style: { flex: 1, minWidth: 0 } }, [
                    createElement('div', {
                        key: 'host',
                        style: {
                            fontWeight: 600,
                            color: 'white',
                            fontSize: isCompact ? '0.875rem' : '1rem',
                            marginBottom: '0.25rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                        }
                    }, lobby.hostName),
                    createElement('div', {
                        key: 'meta',
                        style: {
                            display: 'flex',
                            gap: '0.75rem',
                            alignItems: 'center',
                            flexWrap: 'wrap'
                        }
                    }, [
                        createElement('span', {
                            key: 'mode',
                            style: {
                                fontSize: '0.75rem',
                                color: '#60a5fa',
                                background: 'rgba(96, 165, 250, 0.1)',
                                border: '1px solid rgba(96, 165, 250, 0.3)',
                                borderRadius: '0.375rem',
                                padding: '0.125rem 0.5rem'
                            }
                        }, MODE_LABELS[lobby.gameMode] || lobby.gameMode),
                        // Cycle 34 Phase 5: surface the scene's display name
                        // so players can pick rooms by biome ("Sheep Dog
                        // Island", "Open Country", "Field") instead of mode
                        // alone.
                        sceneLabel(lobby.sceneId) && createElement('span', {
                            key: 'scene',
                            style: {
                                fontSize: '0.75rem',
                                color: '#a5b4fc',
                                background: 'rgba(165, 180, 252, 0.1)',
                                border: '1px solid rgba(165, 180, 252, 0.3)',
                                borderRadius: '0.375rem',
                                padding: '0.125rem 0.5rem'
                            }
                        }, sceneLabel(lobby.sceneId)),
                        createElement('span', {
                            key: 'players',
                            style: {
                                fontSize: '0.75rem',
                                color: 'rgba(255, 255, 255, 0.6)'
                            }
                        }, `${lobby.playerCount}/${lobby.maxPlayers} players`),
                        lobby.state === 'in-game' && createElement('span', {
                            key: 'state',
                            style: {
                                fontSize: '0.75rem',
                                color: '#fbbf24'
                            }
                        }, 'In game')
                    ])
                ]),
                createElement(Button, {
                    key: 'join',
                    variant: 'primary',
                    onClick: () => onJoinRoom(lobby.roomCode),
                    disabled: lobby.state === 'in-game' || lobby.playerCount >= lobby.maxPlayers,
                    style: { flexShrink: 0, padding: '0.5rem 1rem', fontSize: '0.875rem' }
                }, 'Join')
            ])
        );
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
            createElement(PanelTitle, { key: 'title' }, 'Public Lobbies'),

            createElement('div', {
                key: 'list',
                style: {
                    maxHeight: isCompact ? '50vh' : '60vh',
                    overflowY: 'auto',
                    marginBottom: '1rem'
                }
            }, renderLobbies()),

            createElement('div', {
                key: 'back',
                style: { marginTop: '0.5rem' }
            },
                createElement(BackButton, { onClick: onBack }, 'Back')
            )
        ])
    );
}
