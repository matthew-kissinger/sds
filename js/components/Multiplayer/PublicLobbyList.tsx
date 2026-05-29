/**
 * PublicLobbyList Component
 * Shows open public rooms. Polls the server every 3s.
 *
 * Cycle 48 P3: converted from the element-factory .js to token-driven .tsx.
 * The four badge/text hexes map to existing value-exact tokens: the error-text
 * red-400 -> dangerSoft, the mode-badge blue-400 -> info, the in-game amber ->
 * warn, and the scene-badge indigo-300 reuses objectiveGather (the one token
 * holding that exact value). The badge-fill rgba() triples stay raw literals (a
 * token round-trip would risk a sub-pixel shift). The poll/connect path is
 * unchanged presentational behavior. Identical to the previous PublicLobbyList.js.
 */
import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getNetworkManager } from '../../GameBridge.js';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button, BackButton } from '../ui/Button.js';
import { loadScene } from '../../../shared/scenes/index.js';
import { color } from '../ui/tokens';

const MODE_LABELS: Record<string, string> = {
    cooperative: 'Cooperative',
    competitive: 'Competitive',
    timed: 'Timed',
};

interface Lobby {
    roomCode: string;
    hostName?: string;
    gameMode?: string;
    sceneId?: string;
    playerCount?: number;
    maxPlayers?: number;
    state?: string;
}

interface PublicLobbyListProps {
    onBack: () => void;
    onJoinRoom: (roomCode: string) => void;
}

// Cycle 34 Phase 5: resolve a sceneId to its human display name. loadScene
// throws on unknown ids so the wrapper falls back gracefully — defends
// against persisted rooms with stale or renamed sceneIds.
function sceneLabel(sceneId?: string): string | null {
    if (!sceneId) return null;
    try {
        return loadScene(sceneId).name;
    } catch {
        return sceneId;
    }
}

export function PublicLobbyList({ onBack, onJoinRoom }: PublicLobbyListProps) {
    useTranslation();
    const [lobbies, setLobbies] = useState<Lobby[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
                } catch {
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

            const handler = (data: { lobbies?: Lobby[] }) => {
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const rowStyle: CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '0.75rem',
        padding: isCompact ? '0.75rem 1rem' : '1rem 1.25rem',
        marginBottom: '0.5rem',
        gap: '1rem',
    };

    const renderLobbies = (): ReactNode => {
        if (loading && lobbies.length === 0) {
            return (
                <p style={{ color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', padding: '2rem 0' }}>
                    Loading...
                </p>
            );
        }

        if (error && lobbies.length === 0) {
            return (
                <p style={{ color: color.dangerSoft, textAlign: 'center', padding: '1rem 0', fontSize: '0.875rem' }}>
                    {error}
                </p>
            );
        }

        if (lobbies.length === 0) {
            return (
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                    <p style={{ color: 'rgba(255, 255, 255, 0.5)', marginBottom: '1rem' }}>
                        No games open. Start one.
                    </p>
                    <Button variant="primary" onClick={onBack}>
                        Create Room
                    </Button>
                </div>
            );
        }

        return lobbies.map((lobby) => (
            <div key={lobby.roomCode} style={rowStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        style={{
                            fontWeight: 600,
                            color: 'white',
                            fontSize: isCompact ? '0.875rem' : '1rem',
                            marginBottom: '0.25rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {lobby.hostName}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span
                            style={{
                                fontSize: '0.75rem',
                                color: color.info,
                                background: 'rgba(96, 165, 250, 0.1)',
                                border: '1px solid rgba(96, 165, 250, 0.3)',
                                borderRadius: '0.375rem',
                                padding: '0.125rem 0.5rem',
                            }}
                        >
                            {MODE_LABELS[lobby.gameMode as string] || lobby.gameMode}
                        </span>
                        {/* Cycle 34 Phase 5: surface the scene's display name
                            so players can pick rooms by biome ("Sheep Dog
                            Island", "Open Country", "Field") instead of mode
                            alone. */}
                        {sceneLabel(lobby.sceneId) && (
                            <span
                                style={{
                                    fontSize: '0.75rem',
                                    color: color.objectiveGather,
                                    background: 'rgba(165, 180, 252, 0.1)',
                                    border: '1px solid rgba(165, 180, 252, 0.3)',
                                    borderRadius: '0.375rem',
                                    padding: '0.125rem 0.5rem',
                                }}
                            >
                                {sceneLabel(lobby.sceneId)}
                            </span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                            {`${lobby.playerCount}/${lobby.maxPlayers} players`}
                        </span>
                        {lobby.state === 'in-game' && (
                            <span style={{ fontSize: '0.75rem', color: color.warn }}>In game</span>
                        )}
                    </div>
                </div>
                <Button
                    variant="primary"
                    onClick={() => onJoinRoom(lobby.roomCode)}
                    disabled={
                        lobby.state === 'in-game' ||
                        (lobby.playerCount as number) >= (lobby.maxPlayers as number)
                    }
                    style={{ flexShrink: 0, padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                >
                    Join
                </Button>
            </div>
        ));
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                height: '100%',
            }}
        >
            <Panel size="md" maxWidth="40rem" style={{ animation: 'slideUp 0.5s ease-out' }}>
                <PanelTitle>Public Lobbies</PanelTitle>

                <div style={{ maxHeight: isCompact ? '50vh' : '60vh', overflowY: 'auto', marginBottom: '1rem' }}>
                    {renderLobbies()}
                </div>

                <div style={{ marginTop: '0.5rem' }}>
                    <BackButton onClick={onBack}>Back</BackButton>
                </div>
            </Panel>
        </div>
    );
}
