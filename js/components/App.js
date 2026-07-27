// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * App.js - Main React Application Component
 *
 * This is the main orchestrator that composes all UI components.
 * It handles the transition between StartScreen and GameHUD based on game state.
 *
 * Component Structure:
 * - hooks/       - Custom React hooks (usePlatform, useGameState)
 * - shared/      - Shared utilities (playerIdentity, settings)
 * - entrance/    - World-first entrance + pastoral loading (Cycle 51 P6)
 * - StartScreen/ - Secondary destinations (Settings, Sandbox, editors, local)
 * - GameHUD/     - In-game HUD components (GameTimer, SheepCounter, MobileHUD)
 * - Multiplayer/ - Multiplayer UI (Lobby, Leaderboard, Scoreboard)
 */
import React, { createElement, useState, useEffect, useCallback, useRef, Fragment, Component } from 'react';
import { Z } from '../ui/zIndex.js';
import { markBoot } from '../boot/loadTimeline.js';
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
    startSandboxGame,
    startMultiplayerGame,
    subscribeGameEvent,
    waitForGameInstance
} from '../GameBridge.js';
import { SceneSwapOverlay } from './ui/SceneSwapOverlay.js';
import { isHighDifficultyCount } from '../gamestate/modes.js';
import { COUNTING_GAME_MODE } from '../../shared/countingModes.js';
// Cycle 48 P4: retire the App.js inline hex (error-boundary heading red, the
// title greens, the subtitle ambers) to the shared design-token palette. App.js
// stays an element-factory .js; only the raw color literals move to tokens.
import { color } from './ui/tokens';
// P0-CRASH: crash beacon for the ErrorBoundary (fire-and-forget, never throws).
import { reportCrash } from '../telemetry.js';

// Initialize React UI with dynamic imports
export async function initReactUI() {

    console.log('[UI] Loading React components...');

    // [P3-ACHIEVE-UI] Subscribe the achievement unlock toast before any round
    // can complete. Fire-and-forget dynamic import: the toast rides the lazy
    // achievements chunk and can never block (or break) the React mount.
    import('../achievements/unlockToast.js')
        .then(({ installUnlockToast }) => installUnlockToast())
        .catch(() => {});

    try {
        // Load all modules in parallel
        const [
            { usePlatform },
            { useGameState },
            { getPlayerIdentity, savePlayerIdentity, generatePersistentId },
            { loadSettings, saveSettings, applySettingsToGame },
            { SettingsPanel },
            { AchievementsPanel },
            { SandboxSetup },
            { FenceEditor },
            { ShapeEditor },
            { LocalModeSetup },
            { GameTimer },
            { SheepCounter },
            { CountingBankButton },
            { CameraModeIndicator },
            { CorralCompass },
            { ObjectiveBanner },
            { PracticeHint },
            { BarkHint },
            { BarkMeter },
            { SurvivalIntro },
            { MobileHUD },
            { MobileControls },
            { HudLayout },
            { PauseMenu },
            { CompletionScreen },
            { PlaytestNote },
            { MultiplayerOptions },
            { RoomCreation },
            { RoomJoining },
            { Lobby },
            { PublicLobbyList },
            { MultiplayerScoreboard },
            { GlobalLeaderboard },
            { Button },
            { SandboxConfig },
            { motion, AnimatePresence },
            { useReducedMotion },
            { Entrance },
            { LoadingScreen },
            { useBootFlow }
        ] = await Promise.all([
            import('./hooks/usePlatform.js'),
            import('./hooks/useGameState.js'),
            import('./shared/playerIdentity.js'),
            import('./shared/settings.js'),
            import('./StartScreen/SettingsPanel.js'),
            import('./StartScreen/AchievementsPanel.js'),
            import('./StartScreen/SandboxSetup.js'),
            import('./StartScreen/FenceEditor.js'),
            import('./StartScreen/ShapeEditor.js'),
            import('./StartScreen/LocalModeSetup.js'),
            import('./GameHUD/GameTimer.js'),
            import('./GameHUD/SheepCounter.js'),
            import('./GameHUD/CountingBankButton.js'),
            import('./GameHUD/CameraModeIndicator.js'),
            import('./GameHUD/CorralCompass.js'),
            import('./GameHUD/ObjectiveBanner.js'),
            import('./GameHUD/PracticeHint.js'),
            import('./GameHUD/BarkHint.js'),
            import('./GameHUD/BarkMeter.js'),
            import('./GameHUD/SurvivalIntro.js'),
            import('./GameHUD/MobileHUD.js'),
            import('./GameHUD/MobileControls.js'),
            import('./GameHUD/HudLayout.js'),
            import('./GameHUD/PauseMenu.js'),
            import('./GameHUD/CompletionScreen.js'),
            import('./GameHUD/PlaytestNote.js'),
            import('./Multiplayer/MultiplayerOptions.js'),
            import('./Multiplayer/RoomCreation.js'),
            import('./Multiplayer/RoomJoining.js'),
            import('./Multiplayer/Lobby.js'),
            import('./Multiplayer/PublicLobbyList.js'),
            import('./Multiplayer/MultiplayerScoreboard.js'),
            import('./Multiplayer/GlobalLeaderboard.js'),
            import('./ui/Button.js'),
            import('../SandboxConfig.js'),
            import('motion/react'),
            import('./ui/useReducedMotion.js'),
            import('./entrance/Entrance'),
            import('./entrance/LoadingScreen'),
            import('./entrance/useBootFlow')
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
                // P0-CRASH: beacon { message, stack, build, ua } to /api/event
                // before the reload UI renders. reportCrash is defensive and
                // fire-and-forget, but belt-and-suspenders here: the boundary
                // must never throw while handling an error.
                try { reportCrash(error, errorInfo); } catch { /* never block the reload UI */ }
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
                            zIndex: Z.critical
                        }
                    }, [
                        createElement('h1', {
                            key: 'title',
                            style: { fontSize: '1.5rem', marginBottom: '1rem', color: color.dangerBright }
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
            // Cycle 51 P6: the world-first entrance is the lead screen (no
            // first-run name gate). Deep-links still route past it in the effect
            // below (sandbox -> sandboxSetup, room invite -> joinRoom).
            const [screen, setScreen] = useState('entrance');
            const reduce = useReducedMotion();
            const [selectedDog, setSelectedDog] = useState('jep');
            const [roomSettings, setRoomSettings] = useState(null);
            const [lobbyData, setLobbyData] = useState(null);
            const [playerIdentity, setPlayerIdentity] = useState(null);
            const [gameSettings, setGameSettings] = useState(loadSettings());
            const [sandboxConfig, setSandboxConfig] = useState(() => SandboxConfig.createDefault());
            const [pendingInviteCode, setPendingInviteCode] = useState(null);
            const secondaryStartInFlight = useRef(false);
            const platform = usePlatform();

            // Cycle 51 P6: world-first Play commits here. Build the armed world's
            // scene (the pastoral loading bar fills from the real per-stage marks),
            // then start the solo game on it. The armed difficulty maps 1:1 to the
            // canonical solo singlePlayerMode (js/gamestate/modes.js).
            const handleEntrancePlay = useCallback(async (world, dog, mode, gameMode) => {
                try { window.__sdsBootLoading = true; } catch {}
                setScreen('loading');
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))));
                try {
                    const game = await waitForGameInstance();
                    await game.waitForInitialization?.();
                    selectDog(dog.id);
                    const chosenDogId = getSelectedDog() || dog.id;
                    const chosenModeId = mode.id;
                    // Cycle 59 (Counting Sheep): the family's gameMode selects the
                    // start path. Counting arms a counting run (the rung id is the
                    // curve); everything else arms the solo difficulty.
                    const isCounting = gameMode === COUNTING_GAME_MODE;
                    // Build the armed world's scene on commit (the pastoral
                    // loading bar fills from its per-stage marks). swapScene
                    // early-returns if it's already the live scene; noCrossfade
                    // rides the loading surface, not the legacy pre-build path.
                    // Cycle 52 P2: revealBackdrop arms the in-engine dissolve -
                    // the same backdrop webp dissolves into the built scene when
                    // the loading surface hands off (see App's reveal hand-off).
                    await game.swapScene(world.id, { noCrossfade: true, revealBackdrop: world.render, f: true });
                    if (isCounting) {
                        await game.menuController?.selectCounting?.(chosenDogId, chosenModeId);
                    } else {
                        await game.menuController?.selectSolo?.(chosenDogId, chosenModeId);
                    }
                    // Cycle 113 Phase 4 (D4): the tutorial lives inside the
                    // first round now. A first-time player gets the prompts
                    // over whatever they chose to play; nobody is asked first,
                    // which is what removed the second primary button from the
                    // entrance. Lazily imported so the tutorial module stays
                    // off the boot path, and best-effort: a failure here must
                    // never cost the player the round they just started.
                    import('./Tutorial/index.js')
                        .then((m) => m.maybeAttachFirstRunTutorial())
                        .catch(() => {});
                } catch (err) {
                    console.error('[UI] scene build for Play failed:', err);
                    // Cycle 91 Phase 5: surface the failure instead of
                    // stranding the player on the loading screen (init()
                    // rejections now propagate through waitForInitialization).
                    try { window.__sdsBootLoading = false; } catch { /* ignore */ }
                    setScreen('entrance');
                    alert('The game failed to load. Please refresh the page to try again.');
                    throw err;
                }
            }, []);

            const bootFlow = useBootFlow({ onPlay: handleEntrancePlay });

            // Keep selectedDog (read by the MP / sandbox / lobby handlers) synced
            // to the entrance's armed dog so a swap in the entrance carries through.
            useEffect(() => { setSelectedDog(bootFlow.dog.id); }, [bootFlow.dog.id]);

            // The secondary destinations stay reachable from the entrance: settings
            // is the corner gear, leaderboard the corner trophy, and the ways to
            // play route to multiplayer / sandbox / 2-player.
            const entranceNav = {
                onLeaderboard: () => setScreen('leaderboard'),
                onAchievements: () => setScreen('achievements'),
                onSettings: () => setScreen('settings'),
                onSandbox: () => setScreen('sandboxSetup'),
                onLocal: () => {
                    void Promise.all([
                        import('../LocalMultiplayerManager.js'),
                        import('../LocalInputHandler.js'),
                        import('../TwoPlayerCamera.js'),
                    ]).catch(() => {});
                    setScreen('localModeSetup');
                },
                onMultiplayer: async () => {
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
                },
            };

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

                // Cycle 51 P6: identity is deferred — no first-run name gate.
                // Auto-create a default identity so leaderboard registration and
                // submission keep working; the player can clear it from Settings.
                // The visible name prompt is gone with the old flow.
                let identity = getPlayerIdentity();
                if (!identity) {
                    identity = { persistentId: generatePersistentId(), displayName: 'Shepherd', nameType: 'auto' };
                    savePlayerIdentity(identity);
                }
                setPlayerIdentity(identity);
                const openLeaderboard = window.__sdsOpenLeaderboardOnMenu === true;
                if (openLeaderboard) window.__sdsOpenLeaderboardOnMenu = false;
                if (pendingSandboxConfig) {
                    setScreen('sandboxSetup');
                } else if (inviteCode) {
                    // Navigate directly to join room with code pre-filled
                    setScreen('joinRoom');
                } else if (openLeaderboard) {
                    setScreen('leaderboard');
                } else {
                    setScreen('entrance');
                }
            }, []);

            const handleStartSandbox = async () => {
                if (secondaryStartInFlight.current) return;
                console.log('[UI] Starting sandbox game:', selectedDog, sandboxConfig);
                const game = getGameInstance();
                if (!game) return;
                secondaryStartInFlight.current = true;

                // If the sandbox's scene differs, swap and then continue into
                // the round in the same transaction. The encoded hash keeps the
                // shareable configuration without forcing an eager scene build.
                const desiredScene = sandboxConfig.sceneId || 'field';
                const currentSceneId = (typeof window !== 'undefined' && window.__currentSceneId) || 'field';
                selectDog(selectedDog);
                const dog = getSelectedDog() || selectedDog;
                try { window.__sdsBootLoading = true; } catch {}
                setScreen('loading');
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))));
                try {
                    if (desiredScene !== currentSceneId) {
                        const encoded = sandboxConfig.serialize();
                        await game.swapScene(desiredScene, { hash: `s/${encoded}`, noCrossfade: true });
                    }
                    await startSandboxGame(dog, sandboxConfig);
                    secondaryStartInFlight.current = false;
                } catch (error) {
                    secondaryStartInFlight.current = false;
                    console.error('[UI] Sandbox start failed:', error);
                    try { window.__sdsBootLoading = false; } catch {}
                    setScreen('sandboxSetup');
                    alert('The sandbox failed to load. Please try again.');
                }
            };

            const handleStartLocal = async (localConfig) => {
                if (secondaryStartInFlight.current) return;
                console.log('[UI] Starting local 2-player game:', localConfig);
                if (!getGameInstance()) return;

                const menuController = getMenuController();
                if (menuController) {
                    secondaryStartInFlight.current = true;
                    try { window.__sdsBootLoading = true; } catch {}
                    setScreen('loading');
                    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))));
                    try {
                        await menuController.selectLocal(localConfig);
                        secondaryStartInFlight.current = false;
                    } catch (error) {
                        secondaryStartInFlight.current = false;
                        console.error('[UI] Local 2-player start failed:', error);
                        try { window.__sdsBootLoading = false; } catch {}
                        setScreen('localModeSetup');
                        alert('The local game failed to load. Please try again.');
                    }
                }
            };

            const handleSandboxConfigChange = (newConfig) => {
                // Create a new SandboxConfig instance with updated values
                const updated = new SandboxConfig(newConfig);
                setSandboxConfig(updated);
            };

            const ensureSceneMatchesRoom = async (room, { isHost = false } = {}) => {
                if (!room?.sceneId || !room?.roomCode) return false;
                const currentSceneId = (typeof window !== 'undefined' && window.__currentSceneId) || 'field';
                if (room.sceneId === currentSceneId) return false;
                console.log(`[SCENE-SYNC] Syncing ${isHost ? 'host' : 'guest'} scene: url=${currentSceneId} -> room=${room.sceneId} (room ${room.roomCode})`);
                const hash = isHost ? undefined : `/r/${room.roomCode}`;
                await getGameInstance().swapScene(room.sceneId, hash ? { hash } : {});
                return true;
            };

            const handleCreateRoom = async (settings) => {
                setRoomSettings(settings);
                try {
                    const nm = getNetworkManager();
                    if (!nm) {
                        alert('Game not fully loaded.');
                        setScreen('entrance');
                        return;
                    }
                    if (!nm.connected && !nm.connecting) await nm.connect();

                    await nm.createRoom("Player", {
                        maxPlayers: settings.maxPlayers,
                        isPublic: true,
                        gameMode: settings.gameMode,
                        sheepCount: settings.sheepCount,
                        // Cycle 34 Phase 5: thread the host-selected scene
                        // through to the worker. Falls through to DEFAULT_SCENE_ID
                        // if undefined (legacy code paths).
                        sceneId: settings.sceneId
                    }, selectedDog);

                    // Cycle 11 Phase 5: telemetry.
                    try {
                        import('../telemetry.js').then(({ emitEvent }) => {
                            emitEvent('mp_room_created', {
                                gameMode: settings.gameMode,
                                sheepCount: settings.sheepCount,
                                maxPlayers: settings.maxPlayers,
                            });
                        });
                    } catch {}

                    await ensureSceneMatchesRoom(nm.currentRoom, { isHost: true });
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
                        setScreen('entrance');
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
                        setScreen('entrance');
                        return;
                    }
                    if (!nm.connected && !nm.connecting) await nm.connect();
                    await nm.joinRoom(code, "Player", selectedDog);
                    await ensureSceneMatchesRoom(nm.currentRoom);
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
                        setScreen('entrance');
                        return;
                    }
                    if (!nm.connected && !nm.connecting) await nm.connect();
                    await nm.quickMatch("Player", selectedDog);
                    await ensureSceneMatchesRoom(nm.currentRoom);
                    monitorLobbyState();
                } catch (error) {
                    console.error('[UI] Failed to quick match:', error);
                    alert(error.message || 'No available rooms');
                    setScreen('multiplayer');
                }
            };

            const renderContent = () => {
                switch (screen) {
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
                            onBack: () => setScreen('entrance')
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
                            onBack: () => setScreen('entrance')
                        });

                    case 'multiplayer':
                        return createElement(MultiplayerOptions, {
                            onBack: () => setScreen('entrance'),
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
                                setScreen('entrance');
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
                                    await ensureSceneMatchesRoom(nm.currentRoom);
                                    monitorLobbyState();
                                } catch (error) {
                                    console.error('[UI] Failed to join room from public lobby:', error);
                                    alert(error.message || 'Failed to join room');
                                }
                            }
                        });

                    case 'leaderboard':
                        return createElement(GlobalLeaderboard, {
                            onBack: () => setScreen('entrance'),
                            playerIdentity
                        });

                    case 'achievements':
                        return createElement(AchievementsPanel, {
                            onBack: () => setScreen('entrance')
                        });

                    case 'settings':
                        return createElement(SettingsPanel, {
                            settings: gameSettings,
                            onSettingsChange: setGameSettings,
                            onBack: () => setScreen('entrance')
                        });

                    default:
                        return null;
                }
            };

            // Cycle 51 P6: the world-first entrance and the pastoral loading
            // surface are full-bleed (their own backdrop), not centered menu
            // cards, so they render outside the start-screen-content max-width box.
            if (screen === 'entrance') {
                // Cycle 112 Phase 5: the entrance is on screen and Play is
                // pressable, which is what "first interactive" means to a
                // player. Idempotent, so returning to the menu later does not
                // overwrite the cold-load number.
                markBoot('firstInteractive');
                return createElement(Entrance, { flow: bootFlow, nav: entranceNav });
            }
            if (screen === 'loading') {
                return createElement(LoadingScreen, { flow: bootFlow });
            }

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
            }, createElement(AnimatePresence, { mode: 'wait', initial: false },
                createElement(motion.div, {
                    key: screen,
                    className: 'start-screen-content',
                    initial: reduce ? false : { opacity: 0, y: 10 },
                    animate: { opacity: 1, y: 0 },
                    exit: reduce ? { opacity: 0 } : { opacity: 0, y: -8 },
                    transition: { duration: reduce ? 0 : 0.2, ease: [0.2, 0.8, 0.2, 1] }
                }, renderContent())
            ));
        }

        // ==================== GAME HUD ====================
	        function GameHUD() {
	            const gameData = useGameState();
	            const platform = usePlatform();
	            const [isPaused, setIsPaused] = useState(false);
	            const [isFullscreen, setIsFullscreen] = useState(false);
	            const [showTuningPanel, setShowTuningPanel] = useState(false);
	            const isMultiplayer = gameData.gameMode !== 'solo' && gameData.players?.length > 0;
	            const staminaPercentage = gameData.staminaPercentage || Math.round((gameData.stamina / (gameData.maxStamina || 100)) * 100);
	            // Cycle 58: count-based (was singlePlayerMode === 'extreme'||'insane').
	            const isSoloExtremeOrInsane = gameData.gameMode === 'solo' && !gameData.roundBased &&
	                isHighDifficultyCount(gameData.totalSheep);

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
                        // Cycle 59 (Counting Sheep): restart under the counting
                        // mode (singlePlayerMode carries the curve), not 'solo'.
                        const startMode = mode === COUNTING_GAME_MODE ? COUNTING_GAME_MODE : 'solo';
                        void gameInstance.startGame(startMode, null, singlePlayerMode || 'classic')
                            .catch(err => console.error('[GameHUD] restart failed:', err));
                        return;
                    }

                    // Reset timer
                    if (gameInstance.gameTimer) {
                        gameInstance.gameTimer.reset();
                        gameInstance.gameTimer.start();
                    }
                }
            }, [handleResume]);

            // Cycle 59 (Counting Sheep): bank the run. Unpause first (so a bank
            // from the pause menu tears the pause overlay down, like restart),
            // then route to the game instance which freezes the sim, submits the
            // counted total, and shows the summary. No-op for non-counting modes.
            const handleBankCounting = useCallback(() => {
                handleResume();
                getGameInstance()?.bankCountingScore();
            }, [handleResume]);

            // Return to main menu
            const handleMainMenu = useCallback(() => {
                console.log('[GameHUD] handleMainMenu called');
                handleResume();
                getGameInstance()?.restartToMenu();
            }, [handleResume]);

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

            // Cycle 35 Phase 8: HudLayout owns positioning via named slots.
            // Each region is a flex-column stack so two cards in the same
            // slot (e.g. score pill + objective banner on mobile top-center)
            // layout without hand-tuned offsets. The prior pattern had each
            // overlay declare its own position:fixed and dodge collisions
            // with hardcoded pixel offsets (e.g. CameraModeIndicator's 88px
            // ObjectiveBanner-aware drop) — that has been removed.
            const isDesktop = platform === 'desktop';
            const isMobilePlatform = platform === 'mobile';

            // Desktop: counter top-left, score/objective/camera stack top-center, timer top-right.
            // Mobile: score-pill + objective banner + camera-chip stack top-center; no top-left needed.
            // The camera chip sits at the bottom of the top-center stack on
            // both platforms so it never collides with the score pill on
            // narrow viewports (e.g. iPhone SE portrait at 375px).
            const topLeftSlot = [
                isDesktop && !isMultiplayer && createElement(SheepCounter, {
                    key: 'counter',
                    sheepCount: gameData.sheepCount,
                    totalSheep: gameData.totalSheep,
                    stamina: staminaPercentage,
                    onPause: handlePause,
                    roundBased: gameData.roundBased,
                    round: gameData.round,
                    counted: gameData.counted
                }),
                isDesktop && isMultiplayer && createElement(MultiplayerScoreboard, {
                    key: 'scoreboard',
                    players: gameData.players,
                    scores: gameData.scores,
                    myPlayerId: gameData.myPlayerId,
                    gameMode: gameData.gameMode,
                    sheepCount: gameData.sheepCount,
                    totalSheep: gameData.totalSheep,
                    stamina: staminaPercentage
                })
            ].filter(Boolean);

            const topCenterSlot = [
                isMobilePlatform && createElement(MobileHUD, {
                    key: 'mobile-hud',
                    gameData,
                    stamina: staminaPercentage,
                    onPause: handlePause
                }),
                createElement(ObjectiveBanner, { key: 'objective-banner' }),
                createElement(CameraModeIndicator, {
                    key: 'camera-mode',
                    mode: gameData.cameraMode,
                    platform
                })
            ].filter(Boolean);

            const topRightSlot = [
                isDesktop && createElement(GameTimer, {
                    key: 'timer',
                    gameTime: gameData.gameTime,
                    timeLimit: gameData.timeLimit
                }),
                isMobilePlatform && isMultiplayer && createElement(MultiplayerScoreboard, {
                    key: 'scoreboard',
                    players: gameData.players,
                    scores: gameData.scores,
                    myPlayerId: gameData.myPlayerId,
                    gameMode: gameData.gameMode,
                    sheepCount: gameData.sheepCount,
                    totalSheep: gameData.totalSheep,
                    stamina: staminaPercentage
                }),
                // Cycle 59 (Counting Sheep): always-visible bank-and-finish
                // control. Sits under the timer on desktop, top-right on mobile
                // (solo, so the scoreboard slot is empty there).
                gameData.roundBased && createElement(CountingBankButton, {
                    key: 'bank',
                    onBank: handleBankCounting
                })
            ].filter(Boolean);

            const edgeSlot = [
                // CorralCompass self-positions via NDC projection; sits in
                // the edge slot as a passthrough so it isn't constrained by
                // the corner regions.
                createElement(CorralCompass, { key: 'corral-compass', platform })
            ];

            const bottomSafeSlot = [
                createElement(PracticeHint, {
                    key: 'practice-hint',
                    active: !isMultiplayer && gameData.singlePlayerMode === 'practice'
                }),
                // Cycle 112 Phase 3: exactly one Space prompt on screen. These
                // two both taught the bark binding and both rendered a Space
                // key chip, so solo desktop showed the pair for the hint's
                // first nine seconds. The meter is the richer of the two (it
                // carries cooldown and now names the verb when ready), so it
                // wins wherever it renders and the hint covers only the
                // multiplayer case, where there is no meter.
                createElement(BarkHint, {
                    key: 'bark-hint',
                    active: isDesktop && isMultiplayer
                }),
                createElement(BarkMeter, {
                    key: 'bark-meter',
                    active: isDesktop && !isMultiplayer
                }),
                // Cycle 95 (Bug F): first-run Survival loop explainer. Solo
                // survival on Newsheepdogland only (gameData.survival is sticky,
                // so the live sceneId pins it to NSL). Self-gates to first run
                // via localStorage; stacks with the bark chip in this flex slot.
                createElement(SurvivalIntro, {
                    key: 'survival-intro',
                    active: !isMultiplayer && gameData.survival && gameData.sceneId === 'newsheepdogland'
                })
            ];

            const mobileControlsSlot = isMobilePlatform
                ? createElement(MobileControls, { key: 'mobile-controls' })
                : null;

            return createElement('div', { className: 'game-hud fixed inset-0 pointer-events-none' }, [
                createElement(HudLayout, {
                    key: 'layout',
                    topLeft: topLeftSlot,
                    topCenter: topCenterSlot,
                    topRight: topRightSlot,
                    edge: edgeSlot,
                    bottomSafe: bottomSafeSlot,
                    mobileControls: mobileControlsSlot
                }),
                // Cycle 112 Phase 3 (D6): the copyright and AGPL line used to be
                // burned into the bottom-right of every gameplay frame. It now
                // lives in the entrance info menu next to About and Source,
                // which is where someone looking for it would go. Nothing is
                // lost: index.html, the static pages and the repo all carry it.
                // Pause menu (shown on all platforms when paused). Full-screen
                // overlay; sits outside HudLayout because it is its own modal.
                createElement(PauseMenu, {
                    key: 'pause-menu',
                    isVisible: isPaused,
                    onResume: handleResume,
                    onRestart: handleRestart,
                    onMainMenu: handleMainMenu,
                    onToggleFullscreen: handleToggleFullscreen,
                    isFullscreen,
                    showFullscreenOption,
                    gameMode: gameData.gameMode,
                    // Cycle 59 (Counting Sheep): pause-menu bank entry.
                    roundBased: gameData.roundBased,
                    onBankCounting: handleBankCounting
                }),
                // Cycle 60 P6: opt-in in-game playtest note capture (gated on
                // ?notes=1 / ?stats=1; renders null otherwise).
                createElement(PlaytestNote, { key: 'playtest-note' })
            ]);
        }

        // ==================== MAIN APP ====================
        function App() {
            const [gameStarted, setGameStarted] = useState(false);
            // Cycle 52 P2: true when the in-engine backdrop dissolve owns the
            // reveal, so the start surface unmounts instantly (the quad covers
            // the frame) instead of running the DOM opacity fade over the scene.
            const [revealHandoff, setRevealHandoff] = useState(false);
            const reduce = useReducedMotion();

            useEffect(() => {
                if (gameStarted) return undefined;
                const check = setInterval(() => {
                    if (getGameState()?.isGameActive?.()) {
                        console.log('[UI] Game started');
                        // Cycle 52 P2: hand off to the in-engine dissolve. If a
                        // backdrop layer was armed at build time, start its ramp
                        // (or skip straight to the scene under reduced motion) and
                        // unmount the start surface instantly - the quad already
                        // covers the frame, so there is no flash and the dissolve
                        // is the visible reveal. With nothing armed, the DOM
                        // opacity fade below still runs (return to menu, MP, etc.).
                        const game = getGameInstance();
                        if (typeof window !== 'undefined' && window.__sdsRevealArmed && game) {
                            const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
                            if (prefersReduced) game.skipReveal?.(); else game.beginRevealRamp?.();
                            setRevealHandoff(true);
                        }
                        setGameStarted(true);
                        // Cycle 112 Phase 5: the round is built and the player
                        // has control. Second half of the cold-load budget.
                        markBoot('roundPlayable');
                        // Cycle 51 P6: the build is done; let SceneSwapOverlay
                        // resume covering any later mid-game scene swaps.
                        try { window.__sdsBootLoading = false; } catch {}
                        clearInterval(check);
                        document.getElementById('react-overlay')?.style.setProperty('display', '');
                    }
                }, 100);

                return () => {
                    clearInterval(check);
                };
            }, [gameStarted]);

            useEffect(() => {
                // Cycle 11 Phase 1: in-process restartToMenu emits this so we
                // remount StartScreen immediately (no 100ms polling latency).
                const unsubRestart = subscribeGameEvent('scene-restart-to-menu', () => {
                    console.log('[UI] scene-restart-to-menu — remounting StartScreen');
                    setRevealHandoff(false);
                    setGameStarted(false);
                });

                return () => {
                    unsubRestart();
                };
            }, []);

            return createElement(Fragment, null, [
                // Cycle 51 P6 / Cycle 52 P2: hand the start surface off to the
                // live scene. When the in-engine backdrop dissolve owns the
                // reveal (revealHandoff), the surface unmounts instantly - the
                // BackdropReveal quad already covers the frame and dissolves to
                // the scene. Otherwise (no armed reveal) a plain opacity fade,
                // safe on every device and OS; reduced-motion makes it instant.
                createElement(AnimatePresence, { key: 'start-presence', mode: 'wait' },
                    !gameStarted && createElement(motion.div, {
                        key: 'start',
                        style: { position: 'fixed', inset: 0, zIndex: Z.scene },
                        initial: false,
                        exit: { opacity: 0 },
                        transition: { duration: (reduce || revealHandoff) ? 0 : 0.45, ease: [0.25, 0.8, 0.35, 1] }
                    }, createElement(StartScreen))
                ),
                gameStarted && createElement(GameHUD, { key: 'hud' }),
                createElement(SceneSwapOverlay, { key: 'swap-overlay' })
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
