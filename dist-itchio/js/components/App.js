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
import {
    getGameInstance,
    getNetworkManager,
    getStartScreen,
    getGameState,
    selectDog,
    getSelectedDog,
    startSoloGame,
    startMultiplayerGame
} from '../GameBridge.js';

// Initialize React UI with dynamic imports
export async function initReactUI() {
    const { createElement, useState, useEffect } = window.React;
    const { createRoot } = window.ReactDOM;

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
            { GlobalLeaderboard }
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
            import('./Multiplayer/GlobalLeaderboard.js')
        ]);

        // Expose CompletionScreen globally for main.js to use
        window.CompletionScreen = CompletionScreen;

        console.log('[UI] All components loaded successfully');

        // ==================== ERROR BOUNDARY ====================
        class ErrorBoundary extends window.React.Component {
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
                        return createElement('div', { className: 'max-w-4xl w-full text-center' }, [
                            createElement('h1', {
                                key: 'title',
                                className: 'text-6xl md:text-8xl font-black mb-4 mobile-title',
                                style: {
                                    fontFamily: '"Comic Sans MS", cursive',
                                    background: 'linear-gradient(180deg, #4FFFFF 0%, #2196F3 50%, #1976D2 100%)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    WebkitTextStroke: '3px #0A47A1',
                                    letterSpacing: '2px',
                                    animation: 'fadeIn 0.4s ease-out, titleBounce 2s ease-in-out infinite 1s',
                                    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))'
                                }
                            }, 'SHEEP DOG'),
                            createElement('h2', {
                                key: 'subtitle',
                                className: 'text-3xl md:text-4xl font-bold mb-4 mobile-subtitle',
                                style: {
                                    fontFamily: '"Comic Sans MS", cursive',
                                    color: '#FFD700',
                                    WebkitTextStroke: '2px #FF6B00',
                                    letterSpacing: '3px',
                                    animation: 'fadeIn 0.4s ease-out 0.1s both',
                                    filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.3))'
                                }
                            }, 'SIMULATOR'),
                            playerIdentity && createElement('p', {
                                key: 'greeting',
                                className: 'text-white text-opacity-80 mb-8 text-lg',
                                style: { animation: 'fadeIn 0.6s ease-out 0.3s both' }
                            }, `Welcome back, ${playerIdentity.displayName}!`),
                            createElement(ModeSelection, { key: 'modes', onSelectMode: handleModeSelect })
                        ]);

                    case 'dogSelection':
                        return createElement('div', { className: 'max-w-4xl w-full' }, [
                            createElement(DogSelection, { key: 'selection', selectedDog, onSelect: setSelectedDog }),
                            createElement('div', {
                                key: 'buttons',
                                className: 'flex gap-4 justify-center mt-8',
                                style: { animation: 'slideUp 0.8s ease-out 0.2s both' }
                            }, [
                                createElement('button', {
                                    key: 'back',
                                    className: 'btn-secondary px-8 py-4 text-lg',
                                    onClick: () => setScreen('main')
                                }, '\u2190 Back'),
                                createElement('button', {
                                    key: 'confirm',
                                    className: 'btn-primary px-8 py-4 text-lg',
                                    onClick: handleDogConfirm
                                }, 'Confirm Selection')
                            ])
                        ]);

                    case 'singlePlayerModes':
                        return createElement(SinglePlayerModes, {
                            onSelectMode: handleStartSolo,
                            onBack: () => setScreen('dogSelection')
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

            // Use start-screen-container class for proper mobile layout
            // This class makes it scrollable on mobile to prevent title cutoff
            return createElement('div', {
                className: 'start-screen-container fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4',
                style: { animation: 'fadeIn 0.4s ease-out' }
            }, createElement('div', { className: 'start-screen-content' }, renderContent()));
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

            return createElement(window.React.Fragment, null, [
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
