/**
 * App.js - Main React Application Component
 *
 * This is the main orchestrator that composes all UI components.
 * It handles the transition between StartScreen and GameHUD based on game state.
 *
 * Component Structure:
 * - hooks/       - Custom React hooks (usePlatform, useGameState)
 * - shared/      - Shared utilities (playerIdentity, settings)
 * - StartScreen/ - Start screen components (ModeSelection, DogSelection, etc.)
 * - GameHUD/     - In-game HUD components (GameTimer, SheepCounter, MobileHUD)
 * - Multiplayer/ - Multiplayer UI (Lobby, Leaderboard, Scoreboard)
 */
import React, { createElement, useState, useEffect, Fragment, Component } from 'react';
import { createRoot } from 'react-dom/client';
import {
    getGameInstance,
    getNetworkManager,
    getStartScreen,
    getGameState,
    selectDog,
    getSelectedDog,
    startSoloGame,
    startSandboxGame,
    startMultiplayerGame
} from '../GameBridge.js';

// Initialize React UI with dynamic imports
export async function initReactUI() {

    console.log('[UI] Loading React components...');

    try {
        // Load all modules in parallel
        const [
            { usePlatform },
            { useGameState },
            { getPlayerIdentity, savePlayerIdentity, generatePersistentId },
            { loadSettings, saveSettings, applySettingsToGame },
            { ModeSelection },
            { DogSelection },
            { PlayerIdentitySetup },
            { SinglePlayerModes },
            { SettingsPanel },
            { SandboxSetup },
            { FenceEditor },
            { ShapeEditor },
            { GameTimer },
            { SheepCounter },
            { MobileHUD },
            { MobileControls },
            { CompletionScreen },
            { MultiplayerOptions },
            { RoomCreation },
            { RoomJoining },
            { Lobby },
            { MultiplayerScoreboard },
            { GlobalLeaderboard },
            { Button },
            { SandboxConfig }
        ] = await Promise.all([
            import('./hooks/usePlatform.js'),
            import('./hooks/useGameState.js'),
            import('./shared/playerIdentity.js'),
            import('./shared/settings.js'),
            import('./StartScreen/ModeSelection.js'),
            import('./StartScreen/DogSelection.js'),
            import('./StartScreen/PlayerIdentitySetup.js'),
            import('./StartScreen/SinglePlayerModes.js'),
            import('./StartScreen/SettingsPanel.js'),
            import('./StartScreen/SandboxSetup.js'),
            import('./StartScreen/FenceEditor.js'),
            import('./StartScreen/ShapeEditor.js'),
            import('./GameHUD/GameTimer.js'),
            import('./GameHUD/SheepCounter.js'),
            import('./GameHUD/MobileHUD.js'),
            import('./GameHUD/MobileControls.js'),
            import('./GameHUD/CompletionScreen.js'),
            import('./Multiplayer/MultiplayerOptions.js'),
            import('./Multiplayer/RoomCreation.js'),
            import('./Multiplayer/RoomJoining.js'),
            import('./Multiplayer/Lobby.js'),
            import('./Multiplayer/MultiplayerScoreboard.js'),
            import('./Multiplayer/GlobalLeaderboard.js'),
            import('./ui/Button.js'),
            import('../SandboxConfig.js')
        ]);

        // Expose CompletionScreen globally for main.js to use
        window.CompletionScreen = CompletionScreen;

        console.log('[UI] All components loaded successfully');

        // ==================== ERROR BOUNDARY ====================
        class ErrorBoundary extends Component {
            constructor(props) {
                super(props);
                this.state = { hasError: false, error: null };
            }

            static getDerivedStateFromError(error) {
                return { hasError: true, error };
            }

            componentDidCatch(error, errorInfo) {
                console.error('[UI] React error boundary caught error:', error);
                console.error('[UI] Error info:', errorInfo);
            }

            render() {
                if (this.state.hasError) {
                    return createElement('div', {
                        style: {
                            position: 'fixed',
                            inset: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(0, 0, 0, 0.9)',
                            color: 'white',
                            fontFamily: 'system-ui, sans-serif',
                            padding: '2rem',
                            textAlign: 'center',
                            zIndex: 9999
                        }
                    }, [
                        createElement('h1', {
                            key: 'title',
                            style: { fontSize: '1.5rem', marginBottom: '1rem', color: '#ff6b6b' }
                        }, 'Something went wrong'),
                        createElement('p', {
                            key: 'message',
                            style: { fontSize: '1rem', marginBottom: '1.5rem', opacity: 0.8 }
                        }, 'The game UI encountered an error. Try refreshing the page.'),
                        createElement('button', {
                            key: 'reload',
                            onClick: () => window.location.reload(),
                            style: {
                                padding: '0.75rem 2rem',
                                fontSize: '1rem',
                                background: 'rgba(255, 255, 255, 0.1)',
                                border: '1px solid rgba(255, 255, 255, 0.3)',
                                borderRadius: '0.5rem',
                                color: 'white',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            },
                            onMouseOver: (e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)',
                            onMouseOut: (e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'
                        }, 'Reload Page'),
                        createElement('details', {
                            key: 'details',
                            style: { marginTop: '2rem', fontSize: '0.75rem', opacity: 0.5 }
                        }, [
                            createElement('summary', { key: 'summary', style: { cursor: 'pointer' } }, 'Error details'),
                            createElement('pre', {
                                key: 'error',
                                style: { marginTop: '0.5rem', textAlign: 'left', whiteSpace: 'pre-wrap' }
                            }, this.state.error?.toString() || 'Unknown error')
                        ])
                    ]);
                }

                return this.props.children;
            }
        }

        // ==================== START SCREEN ====================
        function StartScreen() {
            const [screen, setScreen] = useState('playerSetup');
            const [selectedDog, setSelectedDog] = useState('jep');
            const [selectedMode, setSelectedMode] = useState(null);
            const [roomSettings, setRoomSettings] = useState(null);
            const [lobbyData, setLobbyData] = useState(null);
            const [playerIdentity, setPlayerIdentity] = useState(null);
            const [gameSettings, setGameSettings] = useState(loadSettings());
            const [sandboxConfig, setSandboxConfig] = useState(() => SandboxConfig.createDefault());
            const platform = usePlatform();

            useEffect(() => {
                const existingIdentity = getPlayerIdentity();
                if (existingIdentity) {
                    setPlayerIdentity(existingIdentity);
                    setScreen('main');
                }
            }, []);

            const handlePlayerSetupComplete = (identity) => {
                setPlayerIdentity(identity);
                setScreen('main');
            };

            const handleModeSelect = (mode) => {
                if (mode === 'leaderboard') setScreen('leaderboard');
                else if (mode === 'settings') setScreen('settings');
                else {
                    setSelectedMode(mode);
                    setScreen('dogSelection');
                }
            };

            const handleDogConfirm = async () => {
                if (selectedMode === 'solo') {
                    setScreen('singlePlayerModes');
                } else if (selectedMode === 'sandbox') {
                    setScreen('sandboxSetup');
                } else {
                    const nm = getNetworkManager();
                    if (nm && !nm.connected && !nm.connecting) {
                        try {
                            await nm.connect();
                        } catch (error) {
                            console.error('[UI] Failed to connect:', error);
                            alert('Unable to connect to multiplayer server.');
                            return;
                        }
                    }
                    setScreen('multiplayer');
                }
            };

            const handleStartSolo = (mode = 'classic') => {
                console.log('[UI] Starting solo game:', selectedDog, mode);
                if (!getGameInstance()) return;

                selectDog(selectedDog);
                const dog = getSelectedDog() || selectedDog;
                startSoloGame(dog, mode);
            };

            const handleStartSandbox = () => {
                console.log('[UI] Starting sandbox game:', selectedDog, sandboxConfig);
                if (!getGameInstance()) return;

                selectDog(selectedDog);
                const dog = getSelectedDog() || selectedDog;
                startSandboxGame(dog, sandboxConfig);
            };

            const handleSandboxConfigChange = (newConfig) => {
                // Create a new SandboxConfig instance with updated values
                const updated = new SandboxConfig(newConfig);
                setSandboxConfig(updated);
            };

            const handleCreateRoom = async (settings) => {
                setRoomSettings(settings);
                try {
                    const nm = getNetworkManager();
                    if (!nm) {
                        alert('Game not fully loaded.');
                        setScreen('main');
                        return;
                    }
                    if (!nm.connected && !nm.connecting) await nm.connect();

                    await nm.createRoom("Player", {
                        maxPlayers: settings.maxPlayers,
                        isPublic: true,
                        gameMode: settings.gameMode
                    }, selectedDog);

                    monitorLobbyState();
                } catch (error) {
                    console.error('[UI] Failed to create room:', error);
                    alert('Failed to create room.');
                    setScreen('multiplayer');
                }
            };

            const monitorLobbyState = () => {
                window.currentLobbyInterval = setInterval(() => {
                    const nm = getNetworkManager();
                    if (!nm?.currentRoom) {
                        clearInterval(window.currentLobbyInterval);
                        setScreen('main');
                        return;
                    }

                    const room = nm.currentRoom;
                    const players = [];

                    if (room.players) {
                        const playerList = Array.isArray(room.players) ? room.players : Object.entries(room.players);
                        playerList.forEach((p, i) => {
                            const player = Array.isArray(p) ? p[1] : p;
                            const id = Array.isArray(p) ? p[0] : (player.id || i.toString());
                            players.push({
                                name: player.name || player.playerName || `Player ${i + 1}`,
                                dogType: player.dogType || player.dog || 'jep',
                                isHost: player.isHost || (room.hostId === id),
                                id
                            });
                        });
                    }

                    setLobbyData({
                        roomCode: room.code || room.roomCode || '',
                        players,
                        maxPlayers: room.maxPlayers || 4,
                        isHost: nm.isHost || (room.hostId === nm.playerId)
                    });

                    if (screen !== 'lobby') setScreen('lobby');

                    if (document.querySelector('canvas') && document.getElementById('start-screen')?.style.display === 'none') {
                        clearInterval(window.currentLobbyInterval);
                    }
                }, 500);
            };

            const handleJoinRoom = async (code) => {
                try {
                    const nm = getNetworkManager();
                    if (!nm) {
                        alert('Game not fully loaded.');
                        setScreen('main');
                        return;
                    }
                    if (!nm.connected && !nm.connecting) await nm.connect();
                    await nm.joinRoom(code, "Player", selectedDog);
                    monitorLobbyState();
                } catch (error) {
                    console.error('[UI] Failed to join room:', error);
                    alert(error.message || 'Failed to join room');
                    setScreen('joinRoom');
                }
            };

            const handleQuickMatch = async () => {
                try {
                    const nm = getNetworkManager();
                    if (!nm) {
                        alert('Game not fully loaded.');
                        setScreen('main');
                        return;
                    }
                    if (!nm.connected && !nm.connecting) await nm.connect();
                    await nm.quickMatch("Player", selectedDog);
                    monitorLobbyState();
                } catch (error) {
                    console.error('[UI] Failed to quick match:', error);
                    alert(error.message || 'No available rooms');
                    setScreen('multiplayer');
                }
            };

            const renderContent = () => {
                switch (screen) {
                    case 'playerSetup':
                        return createElement(PlayerIdentitySetup, { onComplete: handlePlayerSetupComplete });

                    case 'main':
                        // Return array directly - .start-screen-content handles centering
                        // Whimsical zen-inspired title styling
                        const titleStyle = platform.isMobile ? {
                            // Mobile: cleaner, more compact
                            fontSize: 'clamp(1.8rem, 10vw, 3rem)',
                            fontWeight: 700,
                            marginBottom: '0.25rem',
                            fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                            background: 'linear-gradient(135deg, #7dd3a8 0%, #4ade80 50%, #22c55e 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            letterSpacing: '1px',
                            animation: 'fadeIn 0.5s ease-out',
                            textShadow: '0 2px 10px rgba(74, 222, 128, 0.3)'
                        } : {
                            // Desktop: larger with subtle animation
                            fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
                            fontWeight: 800,
                            marginBottom: '0.5rem',
                            fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                            background: 'linear-gradient(135deg, #7dd3a8 0%, #4ade80 50%, #22c55e 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            letterSpacing: '2px',
                            animation: 'fadeIn 0.5s ease-out, titleFloat 4s ease-in-out infinite 1s',
                            textShadow: '0 4px 20px rgba(74, 222, 128, 0.4)'
                        };
                        const subtitleStyle = platform.isMobile ? {
                            // Mobile: subtle and clean
                            fontSize: 'clamp(0.9rem, 4vw, 1.2rem)',
                            fontWeight: 500,
                            marginBottom: '1.5rem',
                            fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                            color: 'rgba(255, 255, 255, 0.7)',
                            letterSpacing: '3px',
                            textTransform: 'uppercase',
                            animation: 'fadeIn 0.5s ease-out 0.1s both'
                        } : {
                            // Desktop: elegant spacing
                            fontSize: 'clamp(1rem, 2vw, 1.5rem)',
                            fontWeight: 500,
                            marginBottom: '2rem',
                            fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
                            color: 'rgba(255, 255, 255, 0.6)',
                            letterSpacing: '6px',
                            textTransform: 'uppercase',
                            animation: 'fadeIn 0.5s ease-out 0.2s both'
                        };
                        return [
                            createElement('h1', {
                                key: 'title',
                                style: titleStyle
                            }, 'Sheepdog'),
                            createElement('h2', {
                                key: 'subtitle',
                                style: subtitleStyle
                            }, 'Simulator'),
                            playerIdentity && createElement('p', {
                                key: 'greeting',
                                style: {
                                    color: 'rgba(255, 255, 255, 0.8)',
                                    marginBottom: '2rem',
                                    fontSize: '1.125rem',
                                    animation: 'fadeIn 0.6s ease-out 0.3s both'
                                }
                            }, `Welcome back, ${playerIdentity.displayName}!`),
                            createElement(ModeSelection, { key: 'modes', onSelectMode: handleModeSelect })
                        ];

                    case 'dogSelection':
                        return createElement('div', {
                            style: {
                                width: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center'
                            }
                        }, [
                            createElement(DogSelection, { key: 'selection', selectedDog, onSelect: setSelectedDog }),
                            createElement('div', {
                                key: 'buttons',
                                style: {
                                    display: 'flex',
                                    gap: '1rem',
                                    justifyContent: 'center',
                                    marginTop: '2rem',
                                    animation: 'slideUp 0.8s ease-out 0.2s both'
                                }
                            }, [
                                createElement(Button, {
                                    key: 'back',
                                    variant: 'secondary',
                                    onClick: () => setScreen('main'),
                                    style: { padding: '1rem 2rem', fontSize: '1.125rem' }
                                }, '\u2190 Back'),
                                createElement(Button, {
                                    key: 'confirm',
                                    variant: 'primary',
                                    onClick: handleDogConfirm,
                                    style: { padding: '1rem 2rem', fontSize: '1.125rem' }
                                }, 'Confirm Selection')
                            ])
                        ]);

                    case 'singlePlayerModes':
                        return createElement(SinglePlayerModes, {
                            onSelectMode: handleStartSolo,
                            onBack: () => setScreen('dogSelection')
                        });

                    case 'sandboxSetup':
                        return createElement(SandboxSetup, {
                            config: sandboxConfig,
                            onConfigChange: handleSandboxConfigChange,
                            onStartGame: handleStartSandbox,
                            onEditFences: (options) => {
                                if (options?.mode === 'shape') {
                                    setScreen('shapeEditor');
                                } else {
                                    setScreen('fenceEditor');
                                }
                            },
                            onBack: () => setScreen('dogSelection')
                        });

                    case 'fenceEditor':
                        return createElement(FenceEditor, {
                            config: sandboxConfig,
                            onConfigChange: handleSandboxConfigChange,
                            onDone: () => setScreen('sandboxSetup'),
                            onBack: () => setScreen('sandboxSetup')
                        });

                    case 'shapeEditor':
                        return createElement(ShapeEditor, {
                            config: sandboxConfig,
                            onConfigChange: handleSandboxConfigChange,
                            onDone: () => setScreen('sandboxSetup'),
                            onBack: () => setScreen('sandboxSetup')
                        });

                    case 'multiplayer':
                        return createElement(MultiplayerOptions, {
                            onBack: () => setScreen('dogSelection'),
                            onSelectOption: (opt) => {
                                if (opt === 'create') setScreen('createRoom');
                                else if (opt === 'join') setScreen('joinRoom');
                                else if (opt === 'quick') handleQuickMatch();
                            }
                        });

                    case 'createRoom':
                        return createElement(RoomCreation, {
                            onBack: () => setScreen('multiplayer'),
                            onCreate: handleCreateRoom
                        });

                    case 'joinRoom':
                        return createElement(RoomJoining, {
                            onBack: () => setScreen('multiplayer'),
                            onJoin: handleJoinRoom
                        });

                    case 'lobby':
                        return createElement(Lobby, {
                            ...lobbyData,
                            onStart: () => {
                                const startScreen = getStartScreen();
                                if (startScreen) {
                                    startScreen.selectedDog = selectedDog;
                                }
                                startMultiplayerGame();
                            },
                            onLeave: () => setScreen('dogSelection')
                        });

                    case 'leaderboard':
                        return createElement(GlobalLeaderboard, {
                            onBack: () => setScreen('main'),
                            playerIdentity
                        });

                    case 'settings':
                        return createElement(SettingsPanel, {
                            settings: gameSettings,
                            onSettingsChange: setGameSettings,
                            onBack: () => setScreen('main')
                        });

                    default:
                        return null;
                }
            };

            // Container handles: positioning, centering, overlay background, padding
            // Content handles: max-width
            return createElement('div', {
                className: 'start-screen-container',
                style: {
                    background: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    animation: 'fadeIn 0.4s ease-out'
                }
            }, createElement('div', {
                className: 'start-screen-content'
            }, renderContent()));
        }

        // ==================== GAME HUD ====================
        function GameHUD() {
            const gameData = useGameState();
            const platform = usePlatform();
            const isMultiplayer = gameData.gameMode !== 'solo' && gameData.players?.length > 0;
            const staminaPercentage = gameData.staminaPercentage || Math.round((gameData.stamina / (gameData.maxStamina || 100)) * 100);

            return createElement('div', { className: 'game-hud fixed inset-0 pointer-events-none' }, [
                platform === 'desktop' && [
                    createElement(GameTimer, { key: 'timer', gameTime: gameData.gameTime, timeLimit: gameData.timeLimit }),
                    !isMultiplayer && createElement(SheepCounter, {
                        key: 'counter',
                        sheepCount: gameData.sheepCount,
                        totalSheep: gameData.totalSheep,
                        stamina: staminaPercentage
                    }),
                    isMultiplayer && createElement(MultiplayerScoreboard, {
                        key: 'scoreboard',
                        players: gameData.players,
                        scores: gameData.scores,
                        myPlayerId: gameData.myPlayerId,
                        gameMode: gameData.gameMode,
                        sheepCount: gameData.sheepCount,
                        totalSheep: gameData.totalSheep,
                        stamina: staminaPercentage
                    })
                ],
                platform === 'mobile' && [
                    createElement(MobileHUD, { key: 'mobile-hud', gameData, stamina: staminaPercentage }),
                    createElement(MobileControls, { key: 'mobile-controls' }),
                    isMultiplayer && createElement(MultiplayerScoreboard, {
                        key: 'scoreboard',
                        players: gameData.players,
                        scores: gameData.scores,
                        myPlayerId: gameData.myPlayerId,
                        gameMode: gameData.gameMode,
                        sheepCount: gameData.sheepCount,
                        totalSheep: gameData.totalSheep,
                        stamina: staminaPercentage
                    })
                ]
            ]);
        }

        // ==================== MAIN APP ====================
        function App() {
            const [gameStarted, setGameStarted] = useState(false);

            useEffect(() => {
                const check = setInterval(() => {
                    const canvas = document.querySelector('canvas');
                    const startScreenEl = document.getElementById('start-screen');
                    const gameState = getGameState();
                    const active = gameState?.isGameActive?.();

                    if ((canvas && startScreenEl?.style.display === 'none') || active) {
                        console.log('[UI] Game started');
                        setGameStarted(true);
                        clearInterval(check);
                        document.getElementById('react-overlay')?.style.setProperty('display', '');
                    }
                }, 100);
                return () => clearInterval(check);
            }, []);

            return createElement(Fragment, null, [
                !gameStarted && createElement(StartScreen, { key: 'start' }),
                gameStarted && createElement(GameHUD, { key: 'hud' })
            ]);
        }

        // ==================== MOUNT ====================
        const container = document.getElementById('react-overlay');
        if (!container) {
            console.error('[UI] React overlay container not found!');
            return;
        }

        console.log('[UI] Mounting React app...');
        container.style.display = '';

        const root = createRoot(container);
        root.render(createElement(ErrorBoundary, null, createElement(App)));

        console.log('[UI] React UI initialized successfully');

    } catch (error) {
        console.error('[UI] Failed to load components:', error);
    }
}
