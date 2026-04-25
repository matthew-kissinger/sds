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
import React, { createElement, useState, useEffect, useCallback, Fragment, Component } from 'react';
import { createRoot } from 'react-dom/client';

// Initialize i18n before any components load
import '../i18n.js';

import {
    getGameInstance,
    getNetworkManager,
    getMenuController,

    getGameState,
    getInputHandler,
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
            { ScenePicker },
            { DogSelection },
            { PlayerIdentitySetup },
            { SinglePlayerModes },
            { SettingsPanel },
            { SandboxSetup },
            { FenceEditor },
            { ShapeEditor },
            { LocalModeSetup },
            { GameTimer },
            { SheepCounter },
            { CameraModeIndicator },
            { CorralCompass },
            { MobileHUD },
            { MobileControls },
            { ExtremeTuningPanel },
            { PauseMenu },
            { CompletionScreen },
            { MultiplayerOptions },
            { RoomCreation },
            { RoomJoining },
            { Lobby },
            { PublicLobbyList },
            { MultiplayerScoreboard },
            { GlobalLeaderboard },
            { Button },
            { LanguageSelector },
            { SandboxConfig }
        ] = await Promise.all([
            import('./hooks/usePlatform.js'),
            import('./hooks/useGameState.js'),
            import('./shared/playerIdentity.js'),
            import('./shared/settings.js'),
            import('./StartScreen/ModeSelection.js'),
            import('./StartScreen/ScenePicker.js'),
            import('./StartScreen/DogSelection.js'),
            import('./StartScreen/PlayerIdentitySetup.js'),
            import('./StartScreen/SinglePlayerModes.js'),
            import('./StartScreen/SettingsPanel.js'),
            import('./StartScreen/SandboxSetup.js'),
            import('./StartScreen/FenceEditor.js'),
            import('./StartScreen/ShapeEditor.js'),
            import('./StartScreen/LocalModeSetup.js'),
            import('./GameHUD/GameTimer.js'),
            import('./GameHUD/SheepCounter.js'),
            import('./GameHUD/CameraModeIndicator.js'),
            import('./GameHUD/CorralCompass.js'),
            import('./GameHUD/MobileHUD.js'),
            import('./GameHUD/MobileControls.js'),
            import('./GameHUD/ExtremeTuningPanel.js'),
            import('./GameHUD/PauseMenu.js'),
            import('./GameHUD/CompletionScreen.js'),
            import('./Multiplayer/MultiplayerOptions.js'),
            import('./Multiplayer/RoomCreation.js'),
            import('./Multiplayer/RoomJoining.js'),
            import('./Multiplayer/Lobby.js'),
            import('./Multiplayer/PublicLobbyList.js'),
            import('./Multiplayer/MultiplayerScoreboard.js'),
            import('./Multiplayer/GlobalLeaderboard.js'),
            import('./ui/Button.js'),
            import('./ui/LanguageSelector.js'),
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
            const [pendingInviteCode, setPendingInviteCode] = useState(null);
            const platform = usePlatform();

            useEffect(() => {
                // Check for sandbox share URL (#s/...) or invite URL (#/r/ROOMCODE)
                const hash = location.hash;
                let pendingSandboxConfig = null;
                let inviteCode = null;

                if (hash.startsWith('#s/')) {
                    const encoded = hash.slice(3);
                    const loaded = SandboxConfig.deserialize(encoded);
                    if (loaded) {
                        pendingSandboxConfig = loaded;
                        setSandboxConfig(loaded);
                    } else {
                        console.error('[APP] Failed to load sandbox config from URL hash');
                    }
                    history.replaceState(null, '', location.pathname);
                } else if (hash.startsWith('#/r/')) {
                    const code = hash.slice(4).toUpperCase();
                    if (/^[A-Z0-9]{4,8}$/.test(code)) {
                        inviteCode = code;
                        setPendingInviteCode(code);
                    }
                    history.replaceState(null, '', location.pathname);
                }

                const existingIdentity = getPlayerIdentity();
                if (existingIdentity) {
                    setPlayerIdentity(existingIdentity);
                    if (pendingSandboxConfig) {
                        setScreen('sandboxSetup');
                    } else if (inviteCode) {
                        // Navigate directly to join room with code pre-filled
                        setScreen('joinRoom');
                    } else {
                        setScreen('main');
                    }
                }
            }, []);

            const handlePlayerSetupComplete = (identity) => {
                setPlayerIdentity(identity);
                setScreen('main');
            };

            const handleModeSelect = (mode) => {
                if (mode === 'leaderboard') setScreen('leaderboard');
                else if (mode === 'settings') setScreen('settings');
                else if (mode === 'local') setScreen('localModeSetup');
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

            const handleStartLocal = (localConfig) => {
                console.log('[UI] Starting local 2-player game:', localConfig);
                if (!getGameInstance()) return;

                const menuController =getMenuController();
                if (menuController) {
                    menuController.selectLocal(localConfig);
                }
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

                    if (getGameState()?.isGameActive?.()) {
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
                        // Language selector positioned in top-right corner
                        const languageSelectorStyle = {
                            position: 'fixed',
                            top: platform.isMobile ? 'max(env(safe-area-inset-top, 12px), 12px)' : '20px',
                            right: platform.isMobile ? 'max(env(safe-area-inset-right, 12px), 12px)' : '20px',
                            zIndex: 100
                        };

                        // 3D Extruded Title Styles - Fully responsive
                        const titleContainerStyle = {
                            textAlign: 'center',
                            marginBottom: 'clamp(0.5rem, 2vw, 1rem)',
                            maxWidth: '100%',
                            padding: '0 1rem'
                        };

                        // Main title "Sheepdog" - scales with viewport
                        const mainTitleStyle = {
                            display: 'block',
                            fontFamily: '"Fredoka", system-ui, sans-serif',
                            fontWeight: 700,
                            // Fluid scaling: min 2rem, preferred 10vw, max 5.5rem
                            fontSize: 'clamp(2rem, 10vw, 5.5rem)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                            lineHeight: 1,
                            margin: 0,
                            padding: 0,
                            color: '#86efac',
                            // Responsive shadow - uses em units to scale with font
                            textShadow: `
                                0.04em 0.04em 0 #166534,
                                0.08em 0.08em 0 #14532d,
                                0.12em 0.12em 0 #0f3d22,
                                0.16em 0.16em 0.3em rgba(0,0,0,0.4)
                            `.replace(/\s+/g, ' ').trim(),
                            animation: 'titleBounce 2.5s ease-in-out infinite'
                        };

                        // Subtitle "Simulator" - scales proportionally
                        const subtitleStyle = {
                            display: 'block',
                            fontFamily: '"Fredoka", system-ui, sans-serif',
                            fontWeight: 600,
                            // Fluid scaling: min 0.65rem, preferred 3vw, max 1.6rem
                            fontSize: 'clamp(0.65rem, 3vw, 1.6rem)',
                            color: '#fef3c7',
                            letterSpacing: 'clamp(0.2em, 1vw, 0.4em)',
                            textTransform: 'uppercase',
                            textShadow: `
                                0.05em 0.05em 0 #92400e,
                                0.1em 0.1em 0.15em rgba(0,0,0,0.3)
                            `.replace(/\s+/g, ' ').trim(),
                            marginTop: 'clamp(0.15rem, 1vw, 0.4rem)',
                            animation: 'subtitleBounce 2.5s ease-in-out infinite 0.15s'
                        };

                        // Wrap everything in a centering container for the main menu
                        return createElement('div', {
                            key: 'main-menu-wrapper',
                            style: {
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%',
                                height: '100%',
                                gap: '0.5rem'
                            }
                        }, [
                            // Language selector in top-right corner (positioned fixed, so outside flow)
                            createElement('div', {
                                key: 'lang-selector',
                                style: languageSelectorStyle
                            }, createElement(LanguageSelector, { variant: 'icon' })),
                            // 3D Title
                            createElement('div', {
                                key: 'title-container',
                                style: titleContainerStyle
                            }, [
                                createElement('span', { key: 'main', style: mainTitleStyle }, 'Sheepdog'),
                                createElement('span', { key: 'sub', style: subtitleStyle }, 'Simulator')
                            ]),
                            playerIdentity && createElement('p', {
                                key: 'greeting',
                                style: {
                                    color: 'rgba(255, 255, 255, 0.8)',
                                    marginBottom: '1rem',
                                    fontSize: platform.isMobile ? '0.9rem' : '1.125rem',
                                    animation: 'fadeIn 0.6s ease-out 0.3s both'
                                }
                            }, `Welcome back, ${playerIdentity.displayName}!`),
                            createElement(ScenePicker, { key: 'scenes' }),
                            createElement(ModeSelection, { key: 'modes', onSelectMode: handleModeSelect }),
                            // Credits footer - fixed at bottom
                            createElement('div', {
                                key: 'credits',
                                style: {
                                    position: 'fixed',
                                    bottom: platform.isMobile ? 'max(env(safe-area-inset-bottom, 8px), 8px)' : '12px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    color: 'rgba(255, 255, 255, 0.4)',
                                    fontSize: '0.7rem',
                                    textAlign: 'center',
                                    pointerEvents: 'auto'
                                }
                            }, [
                                'Made by ',
                                createElement('a', {
                                    key: 'name',
                                    href: '/about.html',
                                    target: '_blank',
                                    rel: 'noopener',
                                    style: {
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        textDecoration: 'none'
                                    }
                                }, 'Matthew Kissinger'),
                                ' · ',
                                createElement('a', {
                                    key: 'about',
                                    href: '/about.html',
                                    target: '_blank',
                                    rel: 'noopener',
                                    style: {
                                        color: 'rgba(255, 255, 255, 0.5)',
                                        textDecoration: 'none'
                                    }
                                }, 'About / GitHub')
                            ])
                        ]);

                    case 'dogSelection':
                        return createElement('div', {
                            style: {
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center'
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

                    case 'localModeSetup':
                        return createElement(LocalModeSetup, {
                            onStart: handleStartLocal,
                            onBack: () => setScreen('main')
                        });

                    case 'multiplayer':
                        return createElement(MultiplayerOptions, {
                            onBack: () => setScreen('dogSelection'),
                            onSelectOption: (opt) => {
                                if (opt === 'create') setScreen('createRoom');
                                else if (opt === 'join') setScreen('joinRoom');
                                else if (opt === 'quick') handleQuickMatch();
                                else if (opt === 'publicLobbies') setScreen('publicLobbyList');
                            }
                        });

                    case 'createRoom':
                        return createElement(RoomCreation, {
                            onBack: () => setScreen('multiplayer'),
                            onCreate: handleCreateRoom
                        });

                    case 'joinRoom':
                        return createElement(RoomJoining, {
                            onBack: () => {
                                setPendingInviteCode(null);
                                setScreen('multiplayer');
                            },
                            onJoin: (code) => {
                                setPendingInviteCode(null);
                                handleJoinRoom(code);
                            },
                            initialCode: pendingInviteCode || ''
                        });

                    case 'lobby': {
                        const _nm = getNetworkManager();
                        const _room = _nm ? _nm.currentRoom : null;
                        return createElement(Lobby, {
                            ...lobbyData,
                            gameMode: _room ? _room.gameMode : (lobbyData && lobbyData.gameMode),
                            modeLocked: _room ? !!_room.modeLocked : false,
                            onStart: () => {
                                const menuController =getMenuController();
                                if (menuController) {
                                    menuController.selectedDog = selectedDog;
                                }
                                startMultiplayerGame();
                            },
                            onLeave: () => {
                                const leaveNm = getNetworkManager();
                                if (leaveNm) leaveNm.leaveRoom();
                                setScreen('dogSelection');
                            },
                            onSetModeLock: (locked) => {
                                const lockNm = getNetworkManager();
                                if (lockNm) lockNm.setModeLock(locked);
                            }
                        });
                    }

                    case 'publicLobbyList':
                        return createElement(PublicLobbyList, {
                            onBack: () => setScreen('multiplayer'),
                            onJoinRoom: async (roomCode) => {
                                try {
                                    const nm = getNetworkManager();
                                    if (!nm) {
                                        alert('Game not fully loaded.');
                                        return;
                                    }
                                    if (!nm.connected && !nm.connecting) await nm.connect();
                                    await nm.joinRoomByInvite(roomCode, 'Player', selectedDog);
                                    monitorLobbyState();
                                } catch (error) {
                                    console.error('[UI] Failed to join room from public lobby:', error);
                                    alert(error.message || 'Failed to join room');
                                }
                            }
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
	        function GameHUD({ onReturnToMenu }) {
	            const gameData = useGameState();
	            const platform = usePlatform();
	            const [isPaused, setIsPaused] = useState(false);
	            const [isFullscreen, setIsFullscreen] = useState(false);
	            const [showTuningPanel, setShowTuningPanel] = useState(false);
	            const isMultiplayer = gameData.gameMode !== 'solo' && gameData.players?.length > 0;
	            const staminaPercentage = gameData.staminaPercentage || Math.round((gameData.stamina / (gameData.maxStamina || 100)) * 100);
	            const isSoloExtremeOrInsane = gameData.gameMode === 'solo' &&
	                (gameData.singlePlayerMode === 'extreme' || gameData.singlePlayerMode === 'insane');

            // Check fullscreen state
            useEffect(() => {
                const checkFullscreen = () => {
                    setIsFullscreen(!!(
                        document.fullscreenElement ||
                        document.webkitFullscreenElement ||
                        document.mozFullScreenElement ||
                        document.msFullscreenElement
                    ));
                };

                document.addEventListener('fullscreenchange', checkFullscreen);
                document.addEventListener('webkitfullscreenchange', checkFullscreen);
                checkFullscreen();

                return () => {
                    document.removeEventListener('fullscreenchange', checkFullscreen);
                    document.removeEventListener('webkitfullscreenchange', checkFullscreen);
                };
            }, []);

            // Listen for pause state changes from InputHandler
	            useEffect(() => {
	                const handlePauseChange = (event) => {
	                    setIsPaused(event.detail.isPaused);

                    // Remove old DOM pause indicator if it exists (legacy cleanup)
                    const oldIndicator = document.getElementById('pause-indicator');
                    if (oldIndicator) {
                        oldIndicator.remove();
                    }
                };

	                window.addEventListener('game-pause-change', handlePauseChange);
	                return () => window.removeEventListener('game-pause-change', handlePauseChange);
	            }, []);

	            // Hide tuning UI when not in extreme/insane
	            useEffect(() => {
	                if (!isSoloExtremeOrInsane) setShowTuningPanel(false);
	            }, [isSoloExtremeOrInsane]);

            // Toggle pause - supports both regular and local multiplayer input handlers
            const handlePause = useCallback(() => {
                const gameInstance = getGameInstance();
                // Check for local multiplayer input handler first
                if (gameInstance?.localInputHandler) {
                    gameInstance.localInputHandler.togglePause();
                } else {
                    const inputHandler = getInputHandler();
                    if (inputHandler) {
                        inputHandler.togglePause();
                    }
                }
            }, []);

            // Resume game
            const handleResume = useCallback(() => {
                console.log('[GameHUD] handleResume called');
                const gameInstance = getGameInstance();
                // Check for local multiplayer input handler first
                if (gameInstance?.localInputHandler && gameInstance.localInputHandler.isPaused) {
                    console.log('[GameHUD] Resuming via localInputHandler');
                    gameInstance.localInputHandler.togglePause();
                } else {
                    const inputHandler = getInputHandler();
                    console.log('[GameHUD] inputHandler:', inputHandler, 'isPaused:', inputHandler?.isPaused);
                    if (inputHandler && inputHandler.isPaused) {
                        inputHandler.togglePause();
                    }
                }
            }, []);

            // Restart game
            const handleRestart = useCallback(() => {
                console.log('[GameHUD] handleRestart called');
                // First unpause
                handleResume();

                // Then restart the game
                const gameInstance = getGameInstance();
                const gameState = getGameState();

                if (gameInstance && gameState) {
                    // Get current mode info
                    const mode = gameState.gameMode;
                    const singlePlayerMode = gameState.singlePlayerMode;

                    if (mode === 'sandbox') {
                        // Restart sandbox with current config
                        gameState.startSandboxGame(gameInstance.currentSandboxConfig || {});
                    } else {
                        // Restart solo difficulties (classic/extreme/insane)
                        gameState.startGame('solo', null, singlePlayerMode || 'classic');
                    }

                    // Reset timer
                    if (gameInstance.gameTimer) {
                        gameInstance.gameTimer.reset();
                        gameInstance.gameTimer.start();
                    }
                }
            }, [handleResume]);

            // Return to main menu
            const handleMainMenu = useCallback(() => {
                console.log('[GameHUD] handleMainMenu called');
                // Unpause first
                handleResume();

                // Reset game state
                const gameInstance = getGameInstance();
                const gameState = getGameState();

                if (gameState) {
                    gameState.gameActive = false;
                    gameState.gameCompleted = false;
                }

                // Show start screen
                const menuController =getMenuController();
                if (menuController) {
                    menuController.reset();
                }

                // Trigger return to menu
                if (onReturnToMenu) {
                    onReturnToMenu();
                }

                // Reload the page for a clean state (simplest approach)
                window.location.reload();
            }, [handleResume, onReturnToMenu]);

            // Toggle fullscreen
            const handleToggleFullscreen = useCallback(() => {
                if (isFullscreen) {
                    if (document.exitFullscreen) {
                        document.exitFullscreen();
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    }
                } else {
                    const elem = document.documentElement;
                    if (elem.requestFullscreen) {
                        elem.requestFullscreen();
                    } else if (elem.webkitRequestFullscreen) {
                        elem.webkitRequestFullscreen();
                    }
                }
            }, [isFullscreen]);

            // Show fullscreen option on mobile (except iOS)
            const showFullscreenOption = platform === 'mobile' && !(/iPad|iPhone|iPod/.test(navigator.userAgent));

            return createElement('div', { className: 'game-hud fixed inset-0 pointer-events-none' }, [
                // CorralCompass renders on both platforms; auto-hides when corral is on-screen
                createElement(CorralCompass, { key: 'corral-compass', platform }),
                platform === 'desktop' && [
                    createElement(GameTimer, { key: 'timer', gameTime: gameData.gameTime, timeLimit: gameData.timeLimit }),
                    createElement(CameraModeIndicator, { key: 'camera-mode', mode: gameData.cameraMode, platform }),
                    !isMultiplayer && createElement(SheepCounter, {
                        key: 'counter',
                        sheepCount: gameData.sheepCount,
                        totalSheep: gameData.totalSheep,
                        stamina: staminaPercentage,
                        onPause: handlePause
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
	                    createElement(MobileHUD, {
	                        key: 'mobile-hud',
	                        gameData,
	                        stamina: staminaPercentage,
                        onPause: handlePause
                    }),
                    createElement(CameraModeIndicator, { key: 'camera-mode', mode: gameData.cameraMode, platform }),
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
	                ],
	                // Tuning toggle removed for release
	                // Pause menu (shown on all platforms when paused)
	                createElement(PauseMenu, {
	                    key: 'pause-menu',
	                    isVisible: isPaused,
                    onResume: handleResume,
                    onRestart: handleRestart,
                    onMainMenu: handleMainMenu,
                    onToggleFullscreen: handleToggleFullscreen,
                    isFullscreen,
                    showFullscreenOption,
                    gameMode: gameData.gameMode
                })
            ]);
        }

        // ==================== MAIN APP ====================
        function App() {
            const [gameStarted, setGameStarted] = useState(false);

            useEffect(() => {
                const check = setInterval(() => {
                    if (getGameState()?.isGameActive?.()) {
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
