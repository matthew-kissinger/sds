let checkInterval = setInterval(() => {
    if (window.gameInstance && window.React && window.ReactDOM) {
        clearInterval(checkInterval);
        // Game and React ready, initializing modern UI
        initializeReactUI();
    }
}, 100);

function initializeReactUI() {
    console.log('🎮 Initializing React UI...');
    
    // Smoothly transition from skeleton to React UI
    const skeletonLoader = document.getElementById('skeleton-loader');
    if (skeletonLoader) {
        skeletonLoader.classList.add('skeleton-fade-out');
        setTimeout(() => {
            skeletonLoader.remove();
        }, 300);
    }
    
    const { useState, useEffect, useRef, useCallback } = window.React;
    const { createRoot } = window.ReactDOM;
    
    // ==================== HOOKS ====================
    function usePlatform() {
        const [platform, setPlatform] = useState('desktop');
        
        useEffect(() => {
            const checkPlatform = () => {
                const hasTouch = 'ontouchstart' in window;
                const width = window.innerWidth;
                const ua = navigator.userAgent;
                
                if (/iPhone|iPad|iPod|Android/i.test(ua) || (hasTouch && width < 1024)) {
                    setPlatform('mobile');
                } else if (hasTouch && width >= 1024) {
                    setPlatform('tablet');
                } else {
                    setPlatform('desktop');
                }
            };
            
            checkPlatform();
            window.addEventListener('resize', checkPlatform);
            
            return () => window.removeEventListener('resize', checkPlatform);
        }, []);
        
        return platform;
    }
    
    // ==================== COMPONENTS ====================
    
    // Loading Component
    function LoadingScreen() {
        return React.createElement('div', {
            className: 'fixed inset-0 bg-black flex items-center justify-center'
        }, 
            React.createElement('div', {
                className: 'text-center'
            }, [
                React.createElement('div', {
                    key: 'spinner',
                    className: 'spinner mx-auto mb-4'
                }),
                React.createElement('p', {
                    key: 'text',
                    className: 'text-white text-lg'
                }, 'Loading game assets...')
            ])
        );
    }
    
    // Dog Selection Component
    function DogSelection({ selectedDog, onSelect }) {
        const dogs = [
            { 
                id: 'jep', 
                name: 'Jep', 
                breed: 'Border Collie', 
                emoji: '🐕‍🦺',
                stats: { speed: 3, stamina: 3, control: 4 },
                description: 'Well-balanced and reliable'
            },
            { 
                id: 'rauri', 
                name: 'Rauri', 
                breed: 'Australian Shepherd', 
                emoji: '🐕',
                stats: { speed: 4, stamina: 2, control: 5 },
                description: 'Excellent control, wider range'
            },
            { 
                id: 'pip', 
                name: 'Pip', 
                breed: 'Welsh Corgi', 
                emoji: '🐶',
                stats: { speed: 5, stamina: 4, control: 2 },
                description: 'Fast and agile, perfect for speed runs'
            }
        ];
        
        const StatBar = ({ value, max = 5 }) => {
            return React.createElement('div', {
                className: 'flex gap-1'
            }, Array.from({ length: max }, (_, i) => 
                React.createElement('div', {
                    key: i,
                    className: `h-1.5 w-4 rounded-full transition-all duration-300`,
                    style: {
                        background: i < value 
                            ? 'linear-gradient(90deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.6) 100%)'
                            : 'rgba(255, 255, 255, 0.15)',
                        boxShadow: i < value ? '0 1px 3px rgba(0, 0, 0, 0.2)' : 'none'
                    }
                })
            ));
        };
        
        return React.createElement('div', {
            className: 'dog-selection-container',
            style: { 
                animation: 'slideUp 0.8s ease-out 0.4s both',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderRadius: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
                padding: '2.5rem'
            }
        }, [
            React.createElement('h3', {
                key: 'title',
                className: 'text-center text-white text-2xl font-bold mb-8',
                style: {
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                }
            }, 'Choose Your Dog'),
            
            React.createElement('div', {
                key: 'grid',
                className: 'grid grid-cols-1 md:grid-cols-3 gap-6'
            }, dogs.map(dog => 
                React.createElement('div', {
                    key: dog.id,
                    className: `p-6 rounded-xl cursor-pointer transition-all duration-300 transform ${
                        selectedDog === dog.id 
                            ? 'scale-105' 
                            : 'hover:scale-102'
                    }`,
                    style: selectedDog === dog.id ? {
                        background: 'rgba(255, 255, 255, 0.15)',
                        backdropFilter: 'blur(28px)',
                        WebkitBackdropFilter: 'blur(28px)',
                        border: '1px solid rgba(255, 255, 255, 0.25)',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)'
                    } : {
                        background: 'rgba(255, 255, 255, 0.08)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)'
                    },
                    onMouseEnter: selectedDog !== dog.id ? (e) => {
                        e.target.style.background = 'rgba(255, 255, 255, 0.12)';
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.18)';
                        e.target.style.boxShadow = '0 3px 16px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)';
                    } : undefined,
                    onMouseLeave: selectedDog !== dog.id ? (e) => {
                        e.target.style.background = 'rgba(255, 255, 255, 0.08)';
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                        e.target.style.boxShadow = '0 2px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)';
                    } : undefined,
                    onClick: () => onSelect(dog.id)
                }, [
                    React.createElement('div', { 
                        key: 'emoji', 
                        className: 'text-6xl mb-3 text-center',
                        style: selectedDog === dog.id ? { animation: 'floatAnimation 3s ease-in-out infinite' } : {}
                    }, dog.emoji),
                    React.createElement('h4', { 
                        key: 'name', 
                        className: 'text-xl font-bold text-white text-center mb-1' 
                    }, dog.name),
                    React.createElement('p', { 
                        key: 'breed', 
                        className: 'text-white text-opacity-60 text-sm text-center mb-4 font-medium' 
                    }, dog.breed),
                    React.createElement('p', { 
                        key: 'desc', 
                        className: 'text-white text-opacity-70 text-sm text-center mb-6 leading-relaxed' 
                    }, dog.description),
                    React.createElement('div', {
                        key: 'stats',
                        className: 'space-y-2 mt-4 pt-4 border-t border-white border-opacity-10'
                    }, [
                        React.createElement('div', { key: 'speed', className: 'flex items-center justify-between gap-2' }, [
                            React.createElement('span', { key: 'label', className: 'text-xs text-white text-opacity-70 font-medium flex-shrink-0' }, 'Speed'),
                            React.createElement(StatBar, { key: 'bar', value: dog.stats.speed })
                        ]),
                        React.createElement('div', { key: 'stamina', className: 'flex items-center justify-between gap-2' }, [
                            React.createElement('span', { key: 'label', className: 'text-xs text-white text-opacity-70 font-medium flex-shrink-0' }, 'Stamina'),
                            React.createElement(StatBar, { key: 'bar', value: dog.stats.stamina })
                        ]),
                        React.createElement('div', { key: 'control', className: 'flex items-center justify-between gap-2' }, [
                            React.createElement('span', { key: 'label', className: 'text-xs text-white text-opacity-70 font-medium flex-shrink-0' }, 'Control'),
                            React.createElement(StatBar, { key: 'bar', value: dog.stats.control })
                        ])
                    ])
                ])
            ))
        ]);
    }
    
    // Mode Selection Component
    function ModeSelection({ onSelectMode }) {
        const [hoveredMode, setHoveredMode] = useState(null);
        
        const modes = [
            {
                id: 'solo',
                title: 'Single Player',
                icon: '🎮',
                description: 'Practice your herding skills offline',
                color: 'from-blue-500 to-purple-500'
            },
            {
                id: 'multiplayer',
                title: 'Multiplayer',
                icon: '🌐',
                description: 'Compete with players worldwide',
                color: 'from-green-500 to-teal-500'
            },
            {
                id: 'leaderboard',
                title: 'Global Leaderboard',
                icon: '🏆',
                description: 'View top players and rankings',
                color: 'from-yellow-500 to-orange-500'
            }
        ];
        
        return React.createElement('div', {
            className: 'grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl mx-auto',
            style: { animation: 'slideUp 0.8s ease-out 0.6s both' }
        }, modes.map(mode =>
            React.createElement('div', {
                key: mode.id,
                className: `flex-1 cursor-pointer transition-all duration-300 transform ${
                    hoveredMode === mode.id ? 'scale-105' : ''
                }`,
                style: {
                    background: 'rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '1.5rem',
                    padding: '2rem',
                    boxShadow: hoveredMode === mode.id 
                        ? '0 8px 32px rgba(0, 0, 0, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)'
                        : '0 4px 20px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)'
                },
                onMouseEnter: () => setHoveredMode(mode.id),
                onMouseLeave: () => setHoveredMode(null),
                onClick: () => onSelectMode(mode.id)
            }, [
                React.createElement('div', {
                    key: 'icon',
                    className: `text-5xl mb-4 text-center`,
                    style: hoveredMode === mode.id ? { animation: 'floatAnimation 2s ease-in-out infinite' } : {}
                }, mode.icon),
                React.createElement('h3', {
                    key: 'title',
                    className: 'text-xl font-bold text-center mb-3 text-white',
                    style: {
                        textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                    }
                }, mode.title),
                React.createElement('p', {
                    key: 'desc',
                    className: 'text-white text-opacity-80 text-sm text-center leading-relaxed'
                }, mode.description)
            ])
        ));
    }
    
    // Multiplayer Options Component
    function MultiplayerOptions({ onBack, onSelectOption }) {
        const options = [
            { id: 'create', title: 'Create Room', icon: '➕', description: 'Host a private game' },
            { id: 'join', title: 'Join Room', icon: '🔗', description: 'Enter a room code' },
            { id: 'quick', title: 'Quick Match', icon: '⚡', description: 'Find a game instantly' }
        ];
        
        return React.createElement('div', {
            className: 'max-w-lg w-full',
            style: { 
                animation: 'slideUp 0.5s ease-out',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderRadius: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
                padding: '2.5rem'
            }
        }, [
            React.createElement('h2', {
                key: 'title',
                className: 'text-2xl font-bold text-center text-white mb-8',
                style: {
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                }
            }, 'Multiplayer Options'),
            
            React.createElement('div', {
                key: 'options',
                className: 'space-y-4'
            }, options.map(option => 
                React.createElement('button', {
                    key: option.id,
                    className: 'w-full flex items-center justify-between cursor-pointer transition-all duration-300 text-white',
                    style: {
                        background: 'rgba(255, 255, 255, 0.06)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '1rem',
                        padding: '1.5rem',
                        boxShadow: '0 3px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
                        color: 'white'
                    },
                    onMouseEnter: (e) => {
                        e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                        e.target.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)';
                    },
                    onMouseLeave: (e) => {
                        e.target.style.background = 'rgba(255, 255, 255, 0.06)';
                        e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        e.target.style.boxShadow = '0 3px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)';
                    },
                    onClick: () => onSelectOption(option.id)
                }, [
                    React.createElement('div', {
                        key: 'left',
                        className: 'flex items-center gap-3'
                    }, [
                        React.createElement('span', { key: 'icon', className: 'text-2xl' }, option.icon),
                        React.createElement('div', { key: 'text', className: 'text-left' }, [
                            React.createElement('div', { key: 'title', className: 'font-semibold text-white' }, option.title),
                            React.createElement('div', { key: 'desc', className: 'text-sm text-white text-opacity-70' }, option.description)
                        ])
                    ]),
                    React.createElement('span', { key: 'arrow', className: 'text-white text-opacity-60' }, '→')
                ])
            )),
            
            React.createElement('button', {
                key: 'back',
                className: 'btn-secondary w-full mt-6',
                onClick: onBack
            }, React.createElement('span', null, '← Back'))
        ]);
    }
    
    // Room Creation Component
    function RoomCreation({ onBack, onCreate }) {
        const [settings, setSettings] = useState({
            maxPlayers: 4,
            gameMode: 'cooperative'
        });
        
        const gameModeDescriptions = {
            cooperative: 'Work together to herd all 200 sheep',
            competitive: '2 players: First to 101 wins | 3-4 players: Highest score wins',
            timed: '3 minute timer - highest score wins'
        };
        
        return React.createElement('div', {
            className: 'max-w-lg w-full',
            style: { 
                animation: 'slideUp 0.5s ease-out',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderRadius: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
                padding: '2.5rem'
            }
        }, [
            React.createElement('h2', {
                key: 'title',
                className: 'text-2xl font-bold text-center text-white mb-8',
                style: {
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                }
            }, 'Create Room'),
            
            React.createElement('div', {
                key: 'settings',
                className: 'space-y-6'
            }, [
                React.createElement('div', { key: 'players' }, [
                    React.createElement('label', { className: 'block text-white text-opacity-80 mb-2' }, 'Max Players'),
                    React.createElement('select', {
                        className: 'modern-input w-full',
                        value: settings.maxPlayers,
                        onChange: (e) => setSettings({...settings, maxPlayers: parseInt(e.target.value)})
                    }, [2, 3, 4].map(n => 
                        React.createElement('option', { key: n, value: n }, `${n} Players`)
                    ))
                ]),
                
                React.createElement('div', { key: 'mode' }, [
                    React.createElement('label', { className: 'block text-white text-opacity-80 mb-2' }, 'Game Mode'),
                    React.createElement('select', {
                        className: 'modern-input w-full',
                        value: settings.gameMode,
                        onChange: (e) => setSettings({...settings, gameMode: e.target.value})
                    }, [
                        React.createElement('option', { key: 'coop', value: 'cooperative' }, 'Cooperative'),
                        React.createElement('option', { key: 'racing', value: 'competitive' }, 'Racing'),
                        React.createElement('option', { key: 'timed', value: 'timed' }, 'Timed (3 min)')
                    ])
                ]),
                
                React.createElement('div', {
                    key: 'mode-desc',
                    style: {
                        background: 'rgba(255, 255, 255, 0.05)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '0.75rem',
                        padding: '1rem',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06), inset 0 1px 0 0 rgba(255, 255, 255, 0.03)'
                    }
                }, 
                    React.createElement('p', {
                        className: 'text-sm text-white text-opacity-80 text-center'
                    }, gameModeDescriptions[settings.gameMode])
                )
            ]),
            
            React.createElement('div', {
                key: 'buttons',
                className: 'flex gap-3 mt-6'
            }, [
                React.createElement('button', {
                    key: 'back',
                    className: 'btn-secondary flex-1',
                    onClick: onBack
                }, '← Back'),
                React.createElement('button', {
                    key: 'create',
                    className: 'btn-primary flex-1',
                    onClick: () => onCreate(settings)
                }, React.createElement('span', null, 'Create Room'))
            ])
        ]);
    }
    
    // Room Joining Component
    function RoomJoining({ onBack, onJoin }) {
        const [roomCode, setRoomCode] = useState('');
        const [error, setError] = useState('');
        
        const handleJoin = () => {
            if (roomCode.length !== 6) {
                setError('Room code must be 6 characters');
                return;
            }
            onJoin(roomCode.toUpperCase());
        };
        
        return React.createElement('div', {
            className: 'max-w-lg w-full',
            style: { 
                animation: 'slideUp 0.5s ease-out',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderRadius: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
                padding: '2.5rem'
            }
        }, [
            React.createElement('h2', {
                key: 'title',
                className: 'text-2xl font-bold text-center text-white mb-8',
                style: {
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                }
            }, 'Join Room'),
            
            React.createElement('div', {
                key: 'input-group',
                className: 'space-y-6'
            }, [
                React.createElement('input', {
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
                
                error && React.createElement('p', {
                    key: 'error',
                    className: 'text-red-400 text-sm text-center'
                }, error)
            ]),
            
            React.createElement('div', {
                key: 'buttons',
                className: 'flex gap-3 mt-6'
            }, [
                React.createElement('button', {
                    key: 'back',
                    className: 'btn-secondary flex-1',
                    onClick: onBack
                }, '← Back'),
                React.createElement('button', {
                    key: 'join',
                    className: 'btn-primary flex-1',
                    onClick: handleJoin,
                    disabled: roomCode.length === 0
                }, React.createElement('span', null, 'Join Room'))
            ])
        ]);
    }
    
    // Lobby Component
    function Lobby({ roomCode, players, maxPlayers, isHost, onStart, onLeave }) {
        const [copied, setCopied] = useState(false);
        
        const copyRoomCode = () => {
            navigator.clipboard.writeText(roomCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        };
        
        return React.createElement('div', {
            className: 'max-w-2xl w-full',
            style: { 
                animation: 'slideUp 0.5s ease-out',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderRadius: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
                padding: '2.5rem'
            }
        }, [
            React.createElement('h2', {
                key: 'title',
                className: 'text-3xl font-bold text-center text-white mb-8',
                style: {
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                }
            }, 'Game Lobby'),
            
            React.createElement('div', {
                key: 'room-info',
                className: 'mb-6 text-center',
                style: {
                    background: 'rgba(255, 255, 255, 0.06)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '1rem',
                    padding: '1.5rem',
                    boxShadow: '0 3px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)'
                }
            }, [
                React.createElement('p', {
                    key: 'label',
                    className: 'text-white text-opacity-60 mb-2'
                }, 'Room Code'),
                React.createElement('div', {
                    key: 'code',
                    className: 'flex items-center justify-center gap-3'
                }, [
                    React.createElement('span', {
                        key: 'text',
                        className: 'text-3xl font-mono font-bold text-blue-400 tracking-wider'
                    }, roomCode),
                    React.createElement('button', {
                        key: 'copy',
                        className: 'btn-secondary py-2 px-4 text-sm',
                        onClick: copyRoomCode
                    }, copied ? '✓ Copied!' : 'Copy')
                ])
            ]),
            
            React.createElement('div', {
                key: 'players',
                className: 'mb-6'
            }, [
                React.createElement('h3', {
                    key: 'title',
                    className: 'text-white text-opacity-80 mb-3'
                }, `Players (${players.length}/${maxPlayers})`),
                React.createElement('div', {
                    key: 'list',
                    className: 'grid grid-cols-2 md:grid-cols-3 gap-4'
                }, Array.from({ length: maxPlayers }, (_, i) => {
                    const player = players[i];
                    return React.createElement('div', {
                        key: i,
                        className: 'text-center',
                        style: {
                            background: player ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            border: player ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                            borderRadius: '0.75rem',
                            padding: '1rem',
                            boxShadow: player 
                                ? '0 3px 12px rgba(34, 197, 94, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)'
                                : '0 2px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 0 rgba(255, 255, 255, 0.02)'
                        }
                    }, player ? [
                        React.createElement('div', { key: 'emoji', className: 'text-3xl mb-1 text-center mobile-dog-icon' }, player.dogType === 'jep' ? '🐕‍🦺' : player.dogType === 'rauri' ? '🐕' : '🐶'),
                        React.createElement('p', { key: 'name', className: 'text-white font-semibold' }, player.name),
                        player.isHost && React.createElement('span', { key: 'host', className: 'text-xs text-yellow-400' }, '👑 Host')
                    ] : React.createElement('p', {
                        className: 'text-white text-opacity-30'
                    }, 'Waiting...'))
                }))
            ]),
            
            React.createElement('div', {
                key: 'buttons',
                className: 'flex gap-3'
            }, [
                React.createElement('button', {
                    key: 'leave',
                    className: 'btn-secondary flex-1',
                    onClick: onLeave
                }, 'Leave Room'),
                isHost && React.createElement('button', {
                    key: 'start',
                    className: 'btn-primary flex-1',
                    onClick: onStart,
                    disabled: players.length < 2
                }, React.createElement('span', null, players.length < 2 ? 'Waiting for players...' : 'Start Game'))
            ])
        ]);
    }
    
    // Player Identity Management
    function getPlayerIdentity() {
        try {
            const identity = localStorage.getItem('playerIdentity');
            return identity ? JSON.parse(identity) : null;
        } catch (error) {
            console.error('Error loading player identity:', error);
            return null;
        }
    }
    
    function savePlayerIdentity(identity) {
        try {
            localStorage.setItem('playerIdentity', JSON.stringify(identity));
        } catch (error) {
            console.error('Error saving player identity:', error);
        }
    }
    
    function generatePersistentId() {
        return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    // Player Identity Setup Component
    function PlayerIdentitySetup({ onComplete }) {
        const [displayName, setDisplayName] = useState('');
        const [nameType, setNameType] = useState('custom');
        const [isSubmitting, setIsSubmitting] = useState(false);
        const [error, setError] = useState('');
        
        const handleGenerateRandom = () => {
            setNameType('random');
            setDisplayName('Random Name'); // Placeholder text for display
        };
        
        const handleStayAnonymous = () => {
            setNameType('anonymous');
            setDisplayName('Player');
        };
        
        const handleCustomName = () => {
            setNameType('custom');
            setDisplayName('');
        };
        
        const handleSubmit = async () => {
            if (nameType === 'custom' && (!displayName || displayName.trim().length === 0)) {
                setError('Please enter a display name or choose another option');
                return;
            }
            
            if (nameType === 'custom' && displayName.trim().length > 20) {
                setError('Display name must be 20 characters or less');
                return;
            }
            
            setIsSubmitting(true);
            setError('');
            
            try {
                // Generate persistent ID
                const persistentId = generatePersistentId();
                // For random names, send empty string so server generates the name
                const finalDisplayName = nameType === 'custom' ? displayName.trim() : 
                                       nameType === 'random' ? '' : displayName;
                
                // Register with server if connected
                let serverResponse = null;
                if (window.gameInstance?.networkManager) {
                    try {
                        await window.gameInstance.networkManager.connect();
                        serverResponse = await window.gameInstance.networkManager.registerPlayer(
                            persistentId, 
                            finalDisplayName, 
                            nameType
                        );
                        console.log('✅ Player registered with server:', serverResponse);
                    } catch (networkError) {
                        console.warn('⚠️ Server registration failed, proceeding offline:', networkError);
                        // Continue without server registration for offline play
                    }
                }
                
                // Create player identity
                const identity = {
                    persistentId: persistentId,
                    displayName: serverResponse?.playerProfile?.displayName || serverResponse?.displayName || finalDisplayName || 'Player',
                    fullName: serverResponse?.playerProfile?.fullName || serverResponse?.fullName || finalDisplayName || 'Player#0001',
                    discriminator: serverResponse?.playerProfile?.discriminator || serverResponse?.discriminator || '0001',
                    nameType: nameType,
                    createdAt: Date.now(),
                    isRegistered: !!serverResponse
                };
                
                // Debug logging to see what we're getting from server
                console.log('🔍 Client identity creation debug:');
                console.log('  - serverResponse:', serverResponse);
                console.log('  - finalDisplayName:', finalDisplayName);
                console.log('  - nameType:', nameType);
                console.log('  - created identity:', identity);
                
                // Save to localStorage
                savePlayerIdentity(identity);
                
                console.log('🆔 Player identity created:', identity);
                onComplete(identity);
                
            } catch (error) {
                console.error('Error creating player identity:', error);
                setError('Failed to create player identity. Please try again.');
            } finally {
                setIsSubmitting(false);
            }
        };
        
        return React.createElement('div', {
            className: 'max-w-lg w-full',
            style: { 
                animation: 'slideUp 0.8s ease-out',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderRadius: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
                padding: '2.5rem'
            }
        }, [
            React.createElement('h2', {
                key: 'title',
                className: 'text-2xl font-bold text-center text-white mb-2',
                style: {
                    textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                }
            }, 'Welcome to Sheep Dog Simulator!'),
            
            React.createElement('p', {
                key: 'subtitle',
                className: 'text-white text-opacity-70 text-center mb-8 text-sm'
            }, 'Choose how you\'d like to be known:'),
            
            React.createElement('div', {
                key: 'options',
                className: 'space-y-4'
            }, [
                // Custom name option
                React.createElement('div', {
                    key: 'custom',
                    className: `p-4 rounded-xl cursor-pointer transition-all duration-300 ${
                        nameType === 'custom' ? 'bg-blue-500 bg-opacity-20 border-blue-400 border' : 'bg-white bg-opacity-5 border-white border border-opacity-10'
                    }`,
                    onClick: handleCustomName
                }, [
                    React.createElement('div', {
                        key: 'header',
                        className: 'flex items-center gap-3 mb-3'
                    }, [
                        React.createElement('span', { key: 'icon', className: 'text-xl' }, '✏️'),
                        React.createElement('span', { key: 'title', className: 'text-white font-semibold' }, 'Custom Name')
                    ]),
                    React.createElement('p', {
                        key: 'desc',
                        className: 'text-white text-opacity-70 text-sm mb-3'
                    }, 'Choose your own display name'),
                    nameType === 'custom' && React.createElement('input', {
                        key: 'input',
                        type: 'text',
                        className: 'modern-input w-full',
                        placeholder: 'Enter your name...',
                        value: displayName,
                        maxLength: 20,
                        onChange: (e) => setDisplayName(e.target.value),
                        onKeyPress: (e) => {
                            if (e.key === 'Enter') handleSubmit();
                        },
                        onFocus: () => window.isTypingInInput = true,
                        onBlur: () => window.isTypingInInput = false
                    })
                ]),
                
                // Random name option
                React.createElement('button', {
                    key: 'random',
                    className: `w-full p-4 rounded-xl cursor-pointer transition-all duration-300 text-left ${
                        nameType === 'random' ? 'bg-green-500 bg-opacity-20 border-green-400 border' : 'bg-white bg-opacity-5 border-white border border-opacity-10'
                    }`,
                    onClick: handleGenerateRandom
                }, [
                    React.createElement('div', {
                        key: 'header',
                        className: 'flex items-center gap-3 mb-2'
                    }, [
                        React.createElement('span', { key: 'icon', className: 'text-xl' }, '🎲'),
                        React.createElement('span', { key: 'title', className: 'text-white font-semibold' }, 'Random Name')
                    ]),
                    React.createElement('p', {
                        key: 'desc',
                        className: 'text-white text-opacity-70 text-sm'
                    }, 'Get a randomly generated herding-themed name')
                ]),
                
                // Anonymous option
                React.createElement('button', {
                    key: 'anonymous',
                    className: `w-full p-4 rounded-xl cursor-pointer transition-all duration-300 text-left ${
                        nameType === 'anonymous' ? 'bg-gray-500 bg-opacity-20 border-gray-400 border' : 'bg-white bg-opacity-5 border-white border border-opacity-10'
                    }`,
                    onClick: handleStayAnonymous
                }, [
                    React.createElement('div', {
                        key: 'header',
                        className: 'flex items-center gap-3 mb-2'
                    }, [
                        React.createElement('span', { key: 'icon', className: 'text-xl' }, '🕶️'),
                        React.createElement('span', { key: 'title', className: 'text-white font-semibold' }, 'Stay Anonymous')
                    ]),
                    React.createElement('p', {
                        key: 'desc',
                        className: 'text-white text-opacity-70 text-sm'
                    }, 'Play as "Player" without a custom name')
                ])
            ]),
            
            error && React.createElement('p', {
                key: 'error',
                className: 'text-red-400 text-sm text-center mt-4'
            }, error),
            
            React.createElement('button', {
                key: 'submit',
                className: 'btn-primary w-full mt-6',
                onClick: handleSubmit,
                disabled: isSubmitting
            }, React.createElement('span', null, isSubmitting ? 'Setting up...' : 'Continue'))
        ]);
    }

    // Score submission helper
    async function submitGameScore(gameMode, score, additionalData = {}) {
        const identity = getPlayerIdentity();
        if (!identity) {
            console.warn('No player identity found for score submission');
            return;
        }
        
        const networkManager = window.gameInstance?.networkManager;
        if (!networkManager) {
            console.warn('❌ NetworkManager not available for score submission');
            return;
        }
        
        console.log(`🔍 Score submission debug: NetworkManager available, connected: ${networkManager.isConnected()}`);
        console.log(`🔍 Current session ID: ${networkManager.channel?.id || 'no-session'}`);
        
        try {
            // Always ensure we have a connection for leaderboard operations
            if (!networkManager.isConnected()) {
                console.log('📡 Not connected, establishing connection for score submission...');
                await networkManager.connectForLeaderboard();
                console.log('✅ Connection established for score submission');
            } else {
                console.log('📡 Using existing connection for score submission');
            }
            
            // Always ensure player is registered in the current session
            console.log('🆔 Ensuring player registration in current session...');
            try {
                const registrationResult = await networkManager.registerPlayer(
                    identity.persistentId,
                    identity.displayName,
                    identity.nameType || 'custom'
                );
                console.log('✅ Player registered/re-registered for score submission:', registrationResult);
                
                // Update identity to mark as registered
                identity.isRegistered = true;
                savePlayerIdentity(identity);
            } catch (regError) {
                console.warn('⚠️ Player registration failed:', regError);
                // Don't continue if registration fails - this indicates a session issue
                throw new Error('Player registration failed: ' + regError.message);
            }
            
            // Now submit the score using the same session
            console.log('📤 Submitting score in current session...');
            const result = await networkManager.submitScore(gameMode, score, additionalData);
            console.log('✅ Score submitted successfully:', result);
            
            if (result.isNewRecord) {
                console.log('🏆 NEW RECORD!');
                // Could show a special UI notification here
            }
            
        } catch (error) {
            console.error('❌ Score submission failed:', error);
            console.log('⚠️ Score will not be submitted - server may be unavailable');
            
            // Could implement score queueing here for retry later
            // For now, just log the failed submission
            console.log('🗂️ Score would have been submitted:', {
                gameMode,
                score,
                playerName: identity.displayName,
                additionalData
            });
        }
    }
    
    // Expose score submission function globally for GameState integration
    window.submitGameScore = submitGameScore;
    
    // Global Leaderboard Component
    function GlobalLeaderboard({ onBack, playerIdentity }) {
        const [activeTab, setActiveTab] = useState('soloClassic');
        const [leaderboards, setLeaderboards] = useState({});
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState('');
        const [lastRefresh, setLastRefresh] = useState(null);
        
        const tabs = [
            { id: 'soloClassic', name: 'Solo Classic', icon: '🎮' },
            { id: 'soloExtreme', name: 'Solo Extreme', icon: '🔥' },
            { id: 'timed', name: 'Timed (3 min)', icon: '⏱️' },
            { id: 'competitive', name: 'Competitive', icon: '🏁' },
            { id: 'cooperative', name: 'Cooperative', icon: '🤝' }
        ];
        
        const loadLeaderboards = async () => {
            setLoading(true);
            setError('');
            
            try {
                if (!window.gameInstance?.networkManager) {
                    throw new Error('Network manager not available');
                }
                
                const nm = window.gameInstance.networkManager;
                
                // Connect if not already connected
                if (!nm.isConnected()) {
                    console.log('🔗 Attempting to connect to server for leaderboards...');
                    await nm.connect();
                }
                
                // Fetch all leaderboards
                const data = await nm.getAllLeaderboards(10);
                console.log('🔍 Raw leaderboard data received:', data);
                console.log('🔍 Data structure:', JSON.stringify(data, null, 2));
                
                setLeaderboards(data);
                setLastRefresh(new Date());
                
            } catch (error) {
                console.error('Failed to load leaderboards:', error);
                
                // Check if it's a connection error
                if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
                    setError('🚫 Server offline - Leaderboards unavailable. The server may be starting up or temporarily down.');
                } else {
                    setError('Failed to load leaderboards. Please try again.');
                }
            } finally {
                setLoading(false);
            }
        };
        
        useEffect(() => {
            loadLeaderboards();
        }, []);
        
        const handleRefresh = () => {
            loadLeaderboards();
        };
        
        const renderLeaderboardTable = (gameMode) => {
            const data = leaderboards[gameMode] || [];
            
            if (data.length === 0) {
                return React.createElement('div', {
                    className: 'text-center py-8 text-white text-opacity-60'
                }, 'No scores recorded yet. Be the first!');
            }
            
            return React.createElement('div', {
                className: 'space-y-2'
            }, data.map((entry, index) => {
                const isPlayer = playerIdentity && entry.fullName === playerIdentity.fullName;
                
                return React.createElement('div', {
                    key: index,
                    className: `flex items-center justify-between p-3 rounded-lg transition-all duration-200 ${
                        isPlayer ? 'bg-blue-500 bg-opacity-20 border border-blue-400 border-opacity-30' : 'bg-white bg-opacity-5'
                    }`
                }, [
                    React.createElement('div', {
                        key: 'left',
                        className: 'flex items-center gap-3'
                    }, [
                        React.createElement('div', {
                            key: 'rank',
                            className: `w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                entry.rank === 1 ? 'bg-yellow-500 text-black' :
                                entry.rank === 2 ? 'bg-gray-300 text-black' :
                                entry.rank === 3 ? 'bg-amber-600 text-white' :
                                'bg-white bg-opacity-10 text-white'
                            }`
                        }, entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank),
                        React.createElement('div', { key: 'info' }, [
                            React.createElement('div', {
                                key: 'name',
                                className: `font-semibold ${isPlayer ? 'text-blue-300' : 'text-white'}`
                            }, entry.displayName + (isPlayer ? ' (You)' : '')),
                            React.createElement('div', {
                                key: 'full',
                                className: 'text-xs text-white text-opacity-50'
                            }, entry.fullName)
                        ])
                    ]),
                    React.createElement('div', {
                        key: 'score',
                        className: 'text-white font-mono font-bold'
                    }, entry.formattedScore)
                ]);
            }));
        };
        
        return React.createElement('div', {
            className: 'max-w-4xl w-full',
            style: { 
                animation: 'slideUp 0.5s ease-out',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                borderRadius: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
                padding: '2rem'
            }
        }, [
            // Header
            React.createElement('div', {
                key: 'header',
                className: 'flex items-center justify-between mb-6'
            }, [
                React.createElement('h2', {
                    key: 'title',
                    className: 'text-3xl font-bold text-white',
                    style: {
                        textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                    }
                }, '🏆 Global Leaderboard'),
                React.createElement('div', {
                    key: 'controls',
                    className: 'flex items-center gap-3'
                }, [
                    lastRefresh && React.createElement('span', {
                        key: 'time',
                        className: 'text-xs text-white text-opacity-60'
                    }, `Updated ${lastRefresh.toLocaleTimeString()}`),
                    React.createElement('button', {
                        key: 'refresh',
                        className: 'btn-secondary py-2 px-4 text-sm',
                        onClick: handleRefresh,
                        disabled: loading
                    }, loading ? '⟳' : '🔄')
                ])
            ]),
            
            // Tab Navigation
            React.createElement('div', {
                key: 'tabs',
                className: 'flex flex-wrap gap-2 mb-6 overflow-x-auto'
            }, tabs.map(tab => 
                React.createElement('button', {
                    key: tab.id,
                    className: `px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                        activeTab === tab.id 
                            ? 'bg-white bg-opacity-20 text-white border border-white border-opacity-30' 
                            : 'bg-white bg-opacity-5 text-white text-opacity-70 hover:bg-opacity-10'
                    }`,
                    onClick: () => setActiveTab(tab.id)
                }, `${tab.icon} ${tab.name}`)
            )),
            
            // Content Area
            React.createElement('div', {
                key: 'content',
                className: 'min-h-[400px]'
            }, [
                loading && React.createElement('div', {
                    key: 'loading',
                    className: 'flex items-center justify-center py-20'
                }, [
                    React.createElement('div', {
                        key: 'spinner',
                        className: 'spinner mr-3'
                    }),
                    React.createElement('span', {
                        key: 'text',
                        className: 'text-white text-opacity-80'
                    }, 'Loading leaderboards...')
                ]),
                
                error && React.createElement('div', {
                    key: 'error',
                    className: 'text-center py-20'
                }, [
                    React.createElement('p', {
                        key: 'message',
                        className: 'text-red-400 mb-4'
                    }, error),
                    React.createElement('button', {
                        key: 'retry',
                        className: 'btn-primary',
                        onClick: handleRefresh
                    }, 'Try Again')
                ]),
                
                !loading && !error && renderLeaderboardTable(activeTab)
            ]),
            
            // Back Button
            React.createElement('button', {
                key: 'back',
                className: 'btn-secondary mt-6',
                onClick: onBack
            }, '← Back to Menu')
        ]);
    }

    // Main Start Screen Component
    function StartScreen() {
        const [screen, setScreen] = useState('playerSetup'); // playerSetup, main, dogSelection, singlePlayerModes, multiplayer, createRoom, joinRoom, lobby, leaderboard
        const [selectedDog, setSelectedDog] = useState('jep');
        const [selectedMode, setSelectedMode] = useState(null);
        const [roomSettings, setRoomSettings] = useState(null);
        const [lobbyData, setLobbyData] = useState(null);
        const [playerIdentity, setPlayerIdentity] = useState(null);
        const platform = usePlatform();
        
        // Check for existing player identity on mount
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
            if (mode === 'leaderboard') {
                setScreen('leaderboard');
            } else {
                setSelectedMode(mode);
                setScreen('dogSelection');
            }
        };
        
        const handleDogConfirm = async () => {
            if (selectedMode === 'solo') {
                setScreen('singlePlayerModes');
            } else {
                // Ensure network connection before showing multiplayer
                if (window.gameInstance && window.gameInstance.networkManager) {
                    const nm = window.gameInstance.networkManager;
                    if (!nm.connected && !nm.connecting) {
                        try {
                            await nm.connect();
                        } catch (error) {
                            console.error('Failed to connect to multiplayer server:', error);
                            alert('Unable to connect to multiplayer server. Please check your connection.');
                            return;
                        }
                    }
                }
                setScreen('multiplayer');
            }
        };
        
        const handleSinglePlayerModeSelect = (mode) => {
            // Pass the mode to the solo game handler
            handleStartSolo(mode);
        };
        
        const handleStartSolo = (singlePlayerMode = 'classic') => {
            console.log('🎮 Legacy React: handleStartSolo called with dog:', selectedDog, 'mode:', singlePlayerMode);
            
            // Ensure game instance is available
            if (!window.gameInstance) {
                console.error('❌ Game instance not available');
                return;
            }
            
            console.log('✅ Game instance found:', !!window.gameInstance);
            
            // Update the game's dog selection using the proper API
            if (window.gameInstance.selectDog) {
                console.log('🐕 Setting selected dog via selectDog method:', selectedDog);
                window.gameInstance.selectDog(selectedDog);
            } else if (window.gameInstance.startScreen) {
                console.log('🐕 Setting selected dog via startScreen:', selectedDog);
                window.gameInstance.startScreen.selectedDog = selectedDog;
            }
            
            // Get current selected dog to verify
            const currentDog = window.gameInstance.getSelectedDog ? window.gameInstance.getSelectedDog() : selectedDog;
            console.log('🐕 Current selected dog:', currentDog);
            
            // Start the solo game using the proper API with the selected mode
            if (window.gameInstance.startSoloGame) {
                console.log('🚀 Starting solo game via startSoloGame method with mode:', singlePlayerMode);
                window.gameInstance.startSoloGame(currentDog, singlePlayerMode);
            } else if (window.gameInstance.startScreen && window.gameInstance.startScreen.selectSolo) {
                console.log('🚀 Starting solo game via startScreen.selectSolo method with mode:', singlePlayerMode);
                window.gameInstance.startScreen.selectSolo(currentDog, singlePlayerMode);
            } else {
                console.error('❌ No startSoloGame method found on game instance');
                console.log('Available methods:', Object.keys(window.gameInstance));
                return;
            }
            
            console.log('✅ Solo game start initiated');
            
            // Don't hide the React overlay - it contains the HUD!
            // The start screen will be automatically replaced by the GameHUD component
            console.log('🎮 Transitioning from start screen to game HUD');
        };
        
        const handleCreateRoom = async (settings) => {
            setRoomSettings(settings);
            
            try {
                // Get player name (default to "Player" if not set)
                const playerName = "Player";
                
                // Ensure we have NetworkManager
                if (!window.gameInstance || !window.gameInstance.networkManager) {
                    console.error('NetworkManager not available');
                    alert('Game not fully loaded. Please try again.');
                    setScreen('main');
                    return;
                }
                
                const nm = window.gameInstance.networkManager;
                
                // Connect if not already connected
                if (!nm.connected && !nm.connecting) {
                    console.log('Connecting to multiplayer server...');
                    await nm.connect();
                }
                
                // Now create the room
                const result = await nm.createRoom(
                    playerName,
                    {
                        maxPlayers: settings.maxPlayers,
                        isPublic: true,
                        gameMode: settings.gameMode
                    },
                    selectedDog
                );
                
                console.log('Room created successfully:', result);
                
                // Room created successfully, start monitoring
                monitorLobbyState();
            } catch (error) {
                console.error('Failed to create room:', error);
                alert('Failed to create room: ' + (error.message || 'Connection error'));
                setScreen('multiplayer');
            }
        };
        
        const monitorLobbyState = () => {
            // Store the interval ID in a ref or state so we can clear it later
            window.currentLobbyInterval = setInterval(() => {
                if (!window.gameInstance || !window.gameInstance.networkManager) {
                    return;
                }
                
                const nm = window.gameInstance.networkManager;
                const currentRoom = nm.currentRoom;
                
                if (!currentRoom) {
                    clearInterval(window.currentLobbyInterval);
                    setScreen('main');
                    return;
                }
                
                // Get room data from currentRoom object
                console.log('Current room data:', currentRoom);
                const roomCode = currentRoom.code || currentRoom.roomCode || '';
                const maxPlayers = currentRoom.maxPlayers || 4;
                const players = [];
                
                // Extract player data from currentRoom.players
                if (currentRoom.players) {
                    if (Array.isArray(currentRoom.players)) {
                        // If players is an array
                        currentRoom.players.forEach((player, index) => {
                            const dogType = player.dogType || player.dog || 'jep';
                            console.log(`🐕 DEBUG: Player ${index + 1} - dogType: ${dogType}`, player);
                            players.push({
                                name: player.name || player.playerName || `Player ${index + 1}`,
                                dogType: dogType,
                                isHost: player.isHost || (index === 0),
                                id: player.id || player.playerId || index.toString()
                            });
                        });
                    } else if (typeof currentRoom.players === 'object') {
                        // If players is an object/map
                        Object.entries(currentRoom.players).forEach(([playerId, player]) => {
                            const dogType = player.dogType || player.dog || 'jep';
                            console.log(`🐕 DEBUG: Player ${playerId} - dogType: ${dogType}`, player);
                            players.push({
                                name: player.name || player.playerName || (playerId === nm.playerId ? 'You' : 'Player'),
                                dogType: dogType,
                                isHost: currentRoom.hostId === playerId || player.isHost,
                                id: playerId
                            });
                        });
                    }
                }
                
                // Update lobby state
                const newLobbyData = {
                    roomCode,
                    players,
                    maxPlayers,
                    isHost: nm.isHost || (currentRoom.hostId === nm.playerId)
                };
                console.log('Setting lobby data:', newLobbyData);
                setLobbyData(newLobbyData);
                
                // Update the UI to show the lobby
                if (screen !== 'lobby') {
                    console.log('Changing screen to lobby');
                    setScreen('lobby');
                }
                
                // Check if game started
                const canvas = document.querySelector('canvas');
                const startScreen = document.getElementById('start-screen');
                if (canvas && startScreen && startScreen.style.display === 'none') {
                    clearInterval(window.currentLobbyInterval);
                    // Don't hide the React overlay - it contains the HUD!
                }
            }, 500);
        };
        
        const handleJoinRoom = async (code) => {
            try {
                // Get player name (default to "Player" if not set)
                const playerName = "Player";
                
                // Ensure we have NetworkManager
                if (!window.gameInstance || !window.gameInstance.networkManager) {
                    console.error('NetworkManager not available');
                    alert('Game not fully loaded. Please try again.');
                    setScreen('main');
                    return;
                }
                
                const nm = window.gameInstance.networkManager;
                
                // Connect if not already connected
                if (!nm.connected && !nm.connecting) {
                    console.log('Connecting to multiplayer server...');
                    await nm.connect();
                }
                
                // Now join the room
                const result = await nm.joinRoom(
                    code,
                    playerName,
                    selectedDog
                );
                
                console.log('Room joined successfully:', result);
                
                // Room joined successfully, start monitoring
                monitorLobbyState();
            } catch (error) {
                console.error('Failed to join room:', error);
                alert(error.message || 'Failed to join room');
                setScreen('joinRoom');
            }
        };
        
        const handleQuickMatch = async () => {
            try {
                // Get player name (default to "Player" if not set)
                const playerName = "Player";
                
                // Ensure we have NetworkManager
                if (!window.gameInstance || !window.gameInstance.networkManager) {
                    console.error('NetworkManager not available');
                    alert('Game not fully loaded. Please try again.');
                    setScreen('main');
                    return;
                }
                
                const nm = window.gameInstance.networkManager;
                
                // Connect if not already connected
                if (!nm.connected && !nm.connecting) {
                    console.log('Connecting to multiplayer server...');
                    await nm.connect();
                }
                
                // Now do quick match
                const result = await nm.quickMatch(
                    playerName,
                    selectedDog
                );
                
                console.log('Quick match successful:', result);
                
                // Joined a room successfully, start monitoring
                monitorLobbyState();
            } catch (error) {
                console.error('Failed to quick match:', error);
                alert(error.message || 'No available rooms for quick match');
                setScreen('multiplayer');
            }
        };
        
        const renderContent = () => {
            switch (screen) {
                case 'playerSetup':
                    return React.createElement(PlayerIdentitySetup, {
                        onComplete: handlePlayerSetupComplete
                    });
                    
                case 'main':
                    return React.createElement('div', {
                        className: 'max-w-4xl w-full text-center'
                    }, [
                        React.createElement('h1', {
                            key: 'title',
                            className: 'text-6xl md:text-8xl font-black mb-4 mobile-title',
                            style: {
                                fontFamily: '"Comic Sans MS", "Comic Sans", "Arial Black", cursive',
                                background: 'linear-gradient(180deg, #4FFFFF 0%, #2196F3 50%, #1976D2 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                                textFillColor: 'transparent',
                                WebkitTextStroke: '3px #0A47A1',
                                textStroke: '3px #0A47A1',
                                letterSpacing: '2px',
                                transform: 'rotate(-0.5deg)',
                                animation: 'fadeIn 0.4s ease-out, titleBounce 2s ease-in-out infinite 1s',
                                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))'
                            }
                        }, 'SHEEP DOG'),
                        
                        React.createElement('h2', {
                            key: 'subtitle',
                            className: 'text-3xl md:text-4xl font-bold mb-4 mobile-subtitle',
                            style: {
                                fontFamily: '"Comic Sans MS", "Comic Sans", "Arial Black", cursive',
                                color: '#FFD700',
                                WebkitTextStroke: '2px #FF6B00',
                                textStroke: '2px #FF6B00',
                                letterSpacing: '3px',
                                transform: 'rotate(0.5deg)',
                                animation: 'fadeIn 0.4s ease-out 0.1s both, subtitleBounce 2.5s ease-in-out infinite 1.2s',
                                filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.3))'
                            }
                        }, 'SIMULATOR'),
                        
                        // Player greeting
                        playerIdentity && React.createElement('p', {
                            key: 'greeting',
                            className: 'text-white text-opacity-80 mb-8 text-lg',
                            style: { animation: 'fadeIn 0.6s ease-out 0.3s both' }
                        }, `Welcome back, ${playerIdentity.displayName}!`),
                        
                        // Mode selection buttons
                        React.createElement(ModeSelection, {
                            key: 'modes',
                            onSelectMode: handleModeSelect
                        })
                    ]);
                    
                case 'initial':
                    return React.createElement('div', {
                        className: 'max-w-4xl w-full text-center'
                    }, [
                        React.createElement('h1', {
                            key: 'title',
                            className: 'text-6xl md:text-8xl font-black mb-4 mobile-title',
                            style: {
                                fontFamily: '"Comic Sans MS", "Comic Sans", "Arial Black", cursive',
                                background: 'linear-gradient(180deg, #4FFFFF 0%, #2196F3 50%, #1976D2 100%)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                                textFillColor: 'transparent',
                                WebkitTextStroke: '3px #0A47A1',
                                textStroke: '3px #0A47A1',
                                letterSpacing: '2px',
                                transform: 'rotate(-0.5deg)',
                                animation: 'fadeIn 0.4s ease-out, titleBounce 2s ease-in-out infinite 1s',
                                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))'
                            }
                        }, 'SHEEP DOG'),
                        
                        React.createElement('h2', {
                            key: 'subtitle',
                            className: 'text-3xl md:text-4xl font-bold mb-8 mobile-subtitle',
                            style: {
                                fontFamily: '"Comic Sans MS", "Comic Sans", "Arial Black", cursive',
                                color: '#FFD700',
                                WebkitTextStroke: '2px #FF6B00',
                                textStroke: '2px #FF6B00',
                                letterSpacing: '3px',
                                transform: 'rotate(0.5deg)',
                                animation: 'fadeIn 0.4s ease-out 0.1s both, subtitleBounce 2.5s ease-in-out infinite 1.2s',
                                filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.3))'
                            }
                        }, 'SIMULATOR'),
                        
                        // Mode selection buttons only
                        React.createElement(ModeSelection, {
                            key: 'modes',
                            onSelectMode: handleModeSelect
                        })
                    ]);
                    
                case 'dogSelection':
                    return React.createElement('div', {
                        className: 'max-w-4xl w-full dog-selection-wrapper'
                    }, [
                        React.createElement(DogSelection, {
                            key: 'selection',
                            selectedDog: selectedDog,
                            onSelect: setSelectedDog
                        }),
                        
                        React.createElement('div', {
                            key: 'buttons',
                            className: 'flex gap-4 justify-center mt-8 dog-selection-buttons',
                            style: { animation: 'slideUp 0.8s ease-out 0.2s both' }
                        }, [
                            React.createElement('button', {
                                key: 'back',
                                className: 'btn-secondary px-8 py-4 text-lg',
                                onClick: () => setScreen('main')
                            }, '← Back'),
                            React.createElement('button', {
                                key: 'confirm',
                                className: 'btn-primary px-8 py-4 text-lg',
                                onClick: handleDogConfirm
                            }, 'Confirm Selection')
                        ])
                    ]);
                    
                case 'singlePlayerModes':
                    return React.createElement('div', {
                        className: 'max-w-lg w-full',
                        style: { 
                            animation: 'slideUp 0.5s ease-out',
                            background: 'rgba(255, 255, 255, 0.08)',
                            backdropFilter: 'blur(28px)',
                            WebkitBackdropFilter: 'blur(28px)',
                            borderRadius: '1.5rem',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
                            padding: '2.5rem'
                        }
                    }, [
                        React.createElement('h2', {
                            key: 'title',
                            className: 'text-2xl font-bold text-center text-white mb-8',
                            style: {
                                textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                            }
                        }, 'Choose Game Mode'),
                        
                        React.createElement('div', {
                            key: 'modes',
                            className: 'space-y-4'
                        }, [
                            React.createElement('button', {
                                key: 'classic',
                                className: 'w-full cursor-pointer transition-all duration-300 text-white',
                                style: {
                                    background: 'rgba(255, 255, 255, 0.06)',
                                    backdropFilter: 'blur(20px)',
                                    WebkitBackdropFilter: 'blur(20px)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '1rem',
                                    padding: '1.5rem',
                                    boxShadow: '0 3px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
                                    color: 'white'
                                },
                                onMouseEnter: (e) => {
                                    e.target.style.background = 'rgba(255, 255, 255, 0.1)';
                                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                                    e.target.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)';
                                },
                                onMouseLeave: (e) => {
                                    e.target.style.background = 'rgba(255, 255, 255, 0.06)';
                                    e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                    e.target.style.boxShadow = '0 3px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)';
                                },
                                onClick: () => handleSinglePlayerModeSelect('classic')
                            }, [
                                React.createElement('div', {
                                    key: 'content',
                                    className: 'flex items-center justify-between'
                                }, [
                                    React.createElement('div', {
                                        key: 'left',
                                        className: 'flex items-center gap-3'
                                    }, [
                                        React.createElement('span', { key: 'icon', className: 'text-2xl' }, '🎮'),
                                        React.createElement('div', { key: 'text', className: 'text-left' }, [
                                            React.createElement('div', { key: 'title', className: 'font-semibold text-white' }, 'Classic Mode'),
                                            React.createElement('div', { key: 'desc', className: 'text-sm text-white text-opacity-70' }, 'Herd all 200 sheep to the pasture')
                                        ])
                                    ]),
                                    React.createElement('span', { key: 'arrow', className: 'text-white text-opacity-60' }, '→')
                                ])
                            ]),
                            
                            React.createElement('button', {
                                key: 'extreme',
                                className: 'w-full cursor-pointer transition-all duration-300 text-white',
                                style: {
                                    background: 'rgba(255, 107, 107, 0.08)',
                                    backdropFilter: 'blur(20px)',
                                    WebkitBackdropFilter: 'blur(20px)',
                                    border: '1px solid rgba(255, 107, 107, 0.2)',
                                    borderRadius: '1rem',
                                    padding: '1.5rem',
                                    boxShadow: '0 3px 12px rgba(255, 107, 107, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
                                    color: 'white'
                                },
                                onMouseEnter: (e) => {
                                    e.target.style.background = 'rgba(255, 107, 107, 0.15)';
                                    e.target.style.borderColor = 'rgba(255, 107, 107, 0.3)';
                                    e.target.style.boxShadow = '0 4px 16px rgba(255, 107, 107, 0.15), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)';
                                },
                                onMouseLeave: (e) => {
                                    e.target.style.background = 'rgba(255, 107, 107, 0.08)';
                                    e.target.style.borderColor = 'rgba(255, 107, 107, 0.2)';
                                    e.target.style.boxShadow = '0 3px 12px rgba(255, 107, 107, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)';
                                },
                                onClick: () => handleSinglePlayerModeSelect('extreme')
                            }, [
                                React.createElement('div', {
                                    key: 'content',
                                    className: 'flex items-center justify-between'
                                }, [
                                    React.createElement('div', {
                                        key: 'left',
                                        className: 'flex items-center gap-3'
                                    }, [
                                        React.createElement('span', { key: 'icon', className: 'text-2xl' }, '🔥'),
                                        React.createElement('div', { key: 'text', className: 'text-left' }, [
                                            React.createElement('div', { key: 'title', className: 'font-semibold text-white' }, 'Extreme Mode'),
                                            React.createElement('div', { key: 'desc', className: 'text-sm text-white text-opacity-70' }, 'Herd all 1000 sheep - performance challenge!')
                                        ])
                                    ]),
                                    React.createElement('span', { key: 'arrow', className: 'text-white text-opacity-60' }, '→')
                                ])
                            ])
                        ]),
                        
                        React.createElement('button', {
                            key: 'back',
                            className: 'btn-secondary w-full mt-6',
                            onClick: () => setScreen('dogSelection')
                        }, '← Back to Dog Selection')
                    ]);
                    
                case 'multiplayer':
                    return React.createElement(MultiplayerOptions, {
                        onBack: () => setScreen('dogSelection'),
                        onSelectOption: (option) => {
                            if (option === 'create') {
                                setScreen('createRoom');
                            } else if (option === 'join') {
                                setScreen('joinRoom');
                            } else if (option === 'quick') {
                                handleQuickMatch();
                            }
                        }
                    });
                    
                case 'createRoom':
                    return React.createElement(RoomCreation, {
                        onBack: () => setScreen('multiplayer'),
                        onCreate: handleCreateRoom
                    });
                    
                case 'joinRoom':
                    return React.createElement(RoomJoining, {
                        onBack: () => setScreen('multiplayer'),
                        onJoin: handleJoinRoom
                    });
                    
                case 'lobby':
                    return React.createElement(Lobby, {
                        ...lobbyData,
                        onStart: () => {
                            console.log('🎮 Multiplayer lobby: Start Game clicked');
                            
                            // Update the start screen's selected dog
                            if (window.gameInstance && window.gameInstance.startScreen) {
                                window.gameInstance.startScreen.selectedDog = selectedDog;
                                console.log('🐕 Updated selected dog to:', selectedDog);
                            }
                            
                            // Start multiplayer game using proper API
                            if (window.gameInstance && window.gameInstance.startMultiplayerGame) {
                                console.log('🚀 Starting multiplayer game via API');
                                window.gameInstance.startMultiplayerGame();
                            } else {
                                console.error('❌ startMultiplayerGame method not available on game instance');
                                console.log('Available methods:', Object.keys(window.gameInstance || {}));
                            }
                        },
                        onLeave: () => setScreen('dogSelection')
                    });
                    
                case 'leaderboard':
                    return React.createElement(GlobalLeaderboard, {
                        onBack: () => setScreen('main'),
                        playerIdentity: playerIdentity
                    });
            }
        };
        
        
        return React.createElement('div', {
            className: 'fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 safe-area-inset',
            style: { animation: 'fadeIn 0.4s ease-out' }
        }, renderContent());
    }
    
    // ==================== GAME HUD COMPONENTS ====================
    
    // Game State Hook
    function useGameState() {
        const [gameData, setGameData] = useState({
            stamina: 100,
            sheepCount: 0,
            totalSheep: 200,
            gameTime: 0,
            isComplete: false,
            isPaused: false,
            gameMode: 'solo',
            players: [],
            myPlayerId: null,
            scores: {},
            gates: {},
            timeLimit: 0
        });
        
        useEffect(() => {
            // Poll game state
            const pollInterval = setInterval(() => {
                if (window.gameInstance) {
                    const gameState = window.gameInstance.gameState;
                    const gameTimer = window.gameInstance.gameTimer;
                    const networkManager = window.gameInstance.networkManager;
                    const multiplayerUI = window.gameInstance.multiplayerUI;
                    
                    if (gameState && gameTimer) {
                        const sheepdog = window.gameInstance.sheepdog;
                        
                                        // Get sheep count based on game mode and multiplayer status
        let sheepCount = 0;
        const isInMultiplayer = networkManager?.currentRoom;
        const actualGameMode = isInMultiplayer ? (multiplayerUI?.gameMode || networkManager?.currentRoom?.gameMode || 'cooperative') : 'solo';
        
        if (isInMultiplayer && (actualGameMode === 'competitive' || actualGameMode === 'timed')) {
            // In multiplayer racing/timed mode, show player's individual score
            const playerId = networkManager?.getPlayerId();
            sheepCount = gameState.getPlayerScore(playerId) || 0;
        } else if (isInMultiplayer && actualGameMode === 'cooperative') {
            // In cooperative multiplayer mode, show total sheep collected by all players
            sheepCount = gameState.sheepRetired || 0;
        } else {
            // In single player mode, show sheep retired
            sheepCount = gameState.sheepRetired || 0;
        }
                        
                        // Calculate stamina percentage based on dog's max stamina
                        const currentStamina = sheepdog?.stamina || 100;
                        const maxStamina = sheepdog?.maxStamina || 100;
                        const staminaPercentage = Math.round((currentStamina / maxStamina) * 100);
                        
                        const newData = {
                            stamina: currentStamina,
                            maxStamina: maxStamina,
                            staminaPercentage: staminaPercentage,
                            sheepCount: sheepCount,
                            totalSheep: gameState.totalSheep || 200,
                            gameTime: gameTimer.getGameTime ? gameTimer.getGameTime() : 0,
                            isComplete: gameState.isComplete || false,
                            isPaused: gameState.paused || false,
                            gameMode: actualGameMode
                        };
                        
                                        // Add multiplayer data if available
        if (networkManager?.currentRoom) {
            newData.players = multiplayerUI?.currentPlayers || [];
            newData.myPlayerId = networkManager.getPlayerId();
            newData.scores = gameState.playerScores || {};
            newData.gates = gameState.competitiveGates || {};
            
            // Get gameMode from multiple sources, prioritizing gameState
            newData.gameMode = gameState.gameMode || multiplayerUI?.gameMode || networkManager?.currentRoom?.gameMode || 'cooperative';
            newData.timeLimit = newData.gameMode === 'timed' ? 180 : 0;
            
            // Multiplayer data updated
        }
                        
                        setGameData(newData);
                    }
                }
            }, 16); // 60fps
            
            return () => clearInterval(pollInterval);
        }, []);
        
        return gameData;
    }
    
    // Compact Stamina Bar Component (for use within other components)
    function CompactStaminaBar({ stamina }) {
        const isLow = stamina < 30;
        
        return React.createElement('div', {
            className: 'mt-3 pt-3 border-t border-white border-opacity-10'
        }, [
            React.createElement('div', {
                key: 'label',
                className: 'text-white text-xs text-opacity-70 mb-1'
            }, 'Stamina'),
            React.createElement('div', {
                key: 'bar',
                className: 'h-2 bg-gray-700 rounded-full overflow-hidden'
            }, 
                React.createElement('div', {
                    className: `h-full transition-all duration-300 ${
                        isLow ? 'bg-gradient-to-r from-red-500 to-red-600' : 'bg-gradient-to-r from-green-500 to-green-600'
                    }`,
                    style: { width: `${Math.round(stamina)}%` }
                })
            )
        ]);
    }
    
    // Timer Component
    function GameTimer({ gameTime, timeLimit }) {
        const minutes = Math.floor(gameTime / 60);
        const seconds = Math.floor(gameTime % 60);
        const isTimedMode = timeLimit > 0;
        const timeRemaining = Math.max(0, timeLimit - gameTime);
        const remainingMinutes = Math.floor(timeRemaining / 60);
        const remainingSeconds = Math.floor(timeRemaining % 60);
        const isLowTime = isTimedMode && timeRemaining < 30;
        
        return React.createElement('div', {
            className: 'fixed top-6 right-6 z-20',
            style: { animation: 'slideDown 0.5s ease-out 0.1s both' }
        }, 
            React.createElement('div', {
                className: `ui-panel py-2 px-4 ${isLowTime ? 'border-red-500 border-opacity-50' : ''}`
            }, 
                isTimedMode ? [
                    React.createElement('div', {
                        key: 'timed',
                        className: `text-white font-mono text-2xl ${isLowTime ? 'text-red-400' : ''}`
                    }, `${String(remainingMinutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`),
                    React.createElement('div', {
                        key: 'label',
                        className: 'text-white text-opacity-60 text-xs text-center'
                    }, 'Time Remaining')
                ] : React.createElement('div', {
                    className: 'text-white font-mono text-2xl'
                }, `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`)
            )
        );
    }
    
    // Sheep Counter Component (with integrated stamina)
    function SheepCounter({ sheepCount, totalSheep, stamina }) {
        const percentage = Math.round((sheepCount / totalSheep) * 100);
        
        return React.createElement('div', {
            className: 'fixed top-6 left-6 z-20',
            style: { animation: 'slideDown 0.5s ease-out 0.2s both' }
        }, 
            React.createElement('div', {
                className: 'ui-panel p-4 min-w-[200px]'
            }, [
                React.createElement('div', {
                    key: 'sheep-progress',
                    className: 'flex items-center gap-3'
                }, [
                    React.createElement('span', {
                        key: 'icon',
                        className: 'text-2xl'
                    }, '🐑'),
                    React.createElement('div', {
                        key: 'info'
                    }, [
                        React.createElement('div', {
                            key: 'count',
                            className: 'text-white font-semibold'
                        }, `${sheepCount} / ${totalSheep}`),
                        React.createElement('div', {
                            key: 'progress',
                            className: 'text-blue-300 text-xs'
                        }, `${percentage}% complete`)
                    ])
                ]),
                React.createElement(CompactStaminaBar, {
                    key: 'stamina',
                    stamina: stamina
                })
            ])
        );
    }
    
    // Multiplayer Scoreboard Component (with integrated stamina)
    function MultiplayerScoreboard({ players, scores, myPlayerId, gameMode, sheepCount, totalSheep, stamina }) {
        
        const isRacing = gameMode === 'competitive';
        const isTimed = gameMode === 'timed';
        const hasIndividualScores = isRacing || isTimed;
        const isCooperative = gameMode === 'cooperative';
        
        // For modes with individual scores, sort by score. For cooperative, keep original order
        const displayPlayers = hasIndividualScores ? 
            [...(players || [])].sort((a, b) => {
                const scoreA = scores[a.id] || 0;
                const scoreB = scores[b.id] || 0;
                return scoreB - scoreA;
            }) : 
            [...(players || [])];
        
        return React.createElement('div', {
            className: 'fixed top-6 left-6 z-20',
            style: { animation: 'slideInLeft 0.5s ease-out 0.3s both' }
        }, 
            React.createElement('div', {
                className: 'ui-panel p-3 min-w-[220px]'
            }, [
                React.createElement('h3', {
                    key: 'title',
                    className: 'text-blue-400 font-bold mb-3 flex items-center gap-2'
                }, [
                    React.createElement('span', { key: 'icon' }, '🌐'),
                    React.createElement('span', { key: 'text' }, 
                        hasIndividualScores ? (gameMode === 'timed' ? 'Timed Race' : 'Racing') : 'Team Progress')
                ]),
                
                // Show collective progress for cooperative mode
                isCooperative && React.createElement('div', {
                    key: 'collective-progress',
                    className: 'mb-3 p-3 bg-green-500 bg-opacity-10 border border-green-500 border-opacity-30 rounded'
                }, [
                    React.createElement('div', {
                        key: 'sheep-count',
                        className: 'text-center text-white font-bold text-lg'
                    }, `${sheepCount || 0} / ${totalSheep || 200}`),
                    React.createElement('div', {
                        key: 'label',
                        className: 'text-center text-green-300 text-sm'
                    }, 'Sheep Collected Together'),
                    React.createElement('div', {
                        key: 'progress-bar',
                        className: 'mt-2 h-2 bg-gray-700 rounded-full overflow-hidden'
                    }, 
                        React.createElement('div', {
                            className: 'h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-300',
                            style: { width: `${Math.round(((sheepCount || 0) / (totalSheep || 200)) * 100)}%` }
                        })
                    )
                ]),
                
                React.createElement('div', {
                    key: 'players',
                    className: 'space-y-2'
                }, displayPlayers.length === 0 ? 
                    React.createElement('div', {
                        className: 'text-center text-white text-opacity-60 py-2'
                    }, 'No players connected') :
                    displayPlayers.map((player, index) => {
                        const isMe = player.id === myPlayerId;
                        const score = scores && scores[player.id] !== undefined ? scores[player.id] : 0;
                        const isLeader = index === 0 && hasIndividualScores && score > 0;
                        const winThreshold = 101; // For racing mode progress bars
                        
                        return React.createElement('div', {
                            key: player.id || index,
                            className: `p-2 rounded ${
                                isMe ? 'bg-blue-500 bg-opacity-20 border border-blue-400 border-opacity-30' : 
                                'bg-white bg-opacity-5'
                            }`
                        }, [
                            // Player name and score row
                            React.createElement('div', {
                                key: 'player-info',
                                className: 'flex items-center justify-between mb-1'
                            }, [
                                React.createElement('div', {
                                    key: 'left',
                                    className: 'flex items-center gap-2'
                                }, [
                                    isLeader && React.createElement('span', { key: 'crown' }, '👑'),
                                    React.createElement('span', {
                                        key: 'name',
                                        className: 'text-white font-medium'
                                    }, (player.name || player.playerName || 'Unknown Player') + (isMe ? ' (You)' : ''))
                                ]),
                                hasIndividualScores && React.createElement('span', {
                                    key: 'score',
                                    className: 'text-white font-mono font-bold'
                                }, isRacing ? `${score}/${winThreshold}` : `${score}`)
                            ]),
                            
                            // Individual progress bar for racing mode only
                            isRacing && React.createElement('div', {
                                key: 'progress-bar',
                                className: 'h-2 bg-gray-700 rounded-full overflow-hidden'
                            }, 
                                React.createElement('div', {
                                    className: `h-full transition-all duration-300 ${
                                        isMe ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 
                                        isLeader ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                                        'bg-gradient-to-r from-gray-500 to-gray-600'
                                    }`,
                                    style: { width: `${Math.min((score / winThreshold) * 100, 100)}%` }
                                })
                            )
                        ]);
                    })
                ),
                
                React.createElement(CompactStaminaBar, {
                    key: 'stamina',
                    stamina: stamina
                })
            ])
        );
    }
    

    
    // Mobile HUD Component - Compact status bar with minimal stamina
    function MobileHUD({ gameData, stamina }) {
        const minutes = Math.floor(gameData.gameTime / 60);
        const seconds = Math.floor(gameData.gameTime % 60); // Math.floor to remove decimals
        
        return React.createElement('div', {
            className: 'fixed top-2 left-1/2 transform -translate-x-1/2 z-20', // TOP position
            style: { animation: 'slideDown 0.5s ease-out' }
        }, 
            React.createElement('div', {
                className: 'ui-panel p-2 min-w-[180px]' // Vertical layout
            }, [
                // Top row: Sheep count and timer
                React.createElement('div', {
                    key: 'top-row',
                    className: 'flex items-center gap-4'
                }, [
                    // Sheep count
                    React.createElement('div', {
                        key: 'sheep',
                        className: 'flex items-center gap-1'
                    }, [
                        React.createElement('span', { key: 'icon' }, '🐑'),
                        React.createElement('span', { key: 'count', className: 'text-white text-sm' }, 
                            `${gameData.sheepCount}/${gameData.totalSheep}`)
                    ]),
                    
                    // Timer (no decimals)
                    React.createElement('div', {
                        key: 'timer',
                        className: 'flex items-center gap-1'
                    }, [
                        React.createElement('span', { key: 'icon' }, '⏱️'),
                        React.createElement('span', { key: 'time', className: 'text-white font-mono text-sm' }, 
                            `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`)
                    ])
                ]),
                
                // Minimal stamina bar below
                React.createElement('div', {
                    key: 'stamina-bar',
                    className: 'mt-1 h-1 bg-gray-700 bg-opacity-50 rounded-full overflow-hidden'
                }, 
                    React.createElement('div', {
                        className: `h-full transition-all duration-300 ${
                            stamina < 30 ? 'bg-red-500' : 'bg-green-500'
                        }`,
                        style: { width: `${stamina}%` }
                    })
                )
            ])
        );
    }
    
    // Mobile Controls Component
    function MobileControls() {
        const [joystickManager, setJoystickManager] = useState(null);
        const [isSprinting, setIsSprinting] = useState(false);
        const [zoomLevel, setZoomLevel] = useState(80);
        const [isZooming, setIsZooming] = useState(null);
        const joystickRef = useRef(null);
        const zoomIntervalRef = useRef(null);
        
        useEffect(() => {
            if (!window.gameInstance || !joystickRef.current || !window.nipplejs) return;
            
            // Create joystick
            const manager = window.nipplejs.create({
                zone: joystickRef.current,
                mode: 'static',
                position: { left: '75px', bottom: '75px' },
                color: 'white',
                size: 120,
                threshold: 0.1
            });
            
            // Handle joystick movement
            manager.on('move', (evt, data) => {
                if (window.gameInstance && window.gameInstance.inputHandler) {
                    const angle = data.angle.radian;
                    const force = Math.min(data.force, 1);
                    
                    // Convert to game coordinates (negate Z for correct up/down)
                    const moveX = Math.cos(angle) * force;
                    const moveZ = -Math.sin(angle) * force; // NEGATED for correct direction
                    
                    // Update input handler
                    window.gameInstance.inputHandler.keys = {
                        ...window.gameInstance.inputHandler.keys,
                        w: moveZ < -0.3,
                        s: moveZ > 0.3,
                        a: moveX < -0.3,
                        d: moveX > 0.3
                    };
                }
            });
            
            manager.on('end', () => {
                if (window.gameInstance && window.gameInstance.inputHandler) {
                    window.gameInstance.inputHandler.keys = {
                        ...window.gameInstance.inputHandler.keys,
                        w: false,
                        s: false,
                        a: false,
                        d: false
                    };
                }
            });
            
            setJoystickManager(manager);
            
            return () => {
                manager.destroy();
            };
        }, []);
        
        // Cleanup zoom interval on unmount
        useEffect(() => {
            return () => {
                if (zoomIntervalRef.current) {
                    clearInterval(zoomIntervalRef.current);
                }
            };
        }, []);
        
        const handleSprintStart = () => {
            setIsSprinting(true);
            if (window.gameInstance && window.gameInstance.inputHandler) {
                window.gameInstance.inputHandler.keys.shift = true;
            }
        };
        
        const handleSprintEnd = () => {
            setIsSprinting(false);
            if (window.gameInstance && window.gameInstance.inputHandler) {
                window.gameInstance.inputHandler.keys.shift = false;
            }
        };
        
        // Zoom control functions
        const startZoom = (direction) => {
            setIsZooming(direction);
            handleZoomChange(direction === 'in' ? -5 : 5);
            zoomIntervalRef.current = setInterval(() => {
                handleZoomChange(direction === 'in' ? -3 : 3);
            }, 50);
        };
        
        const stopZoom = () => {
            setIsZooming(null);
            if (zoomIntervalRef.current) {
                clearInterval(zoomIntervalRef.current);
                zoomIntervalRef.current = null;
            }
        };
        
        const handleZoomChange = (delta) => {
            setZoomLevel(prevZoom => {
                const newZoom = Math.max(20, Math.min(150, prevZoom + delta));
                if (window.gameInstance?.mobileControls?.onZoomChange) {
                    window.gameInstance.mobileControls.onZoomChange(newZoom);
                }
                return newZoom;
            });
        };
        
        const zoomPercentage = ((150 - zoomLevel) / (150 - 20)) * 100;
        
        return React.createElement('div', {
            className: 'fixed inset-0 pointer-events-none z-10'
        }, [
            // Joystick container
            React.createElement('div', {
                key: 'joystick',
                id: 'joystick-zone',
                ref: joystickRef,
                className: 'pointer-events-auto',
                style: { position: 'fixed', left: '20px', bottom: '20px', width: '150px', height: '150px' }
            }),
            

            
            // Sprint button (positioned lower-right)
            React.createElement('button', {
                key: 'sprint',
                className: `mobile-control ${isSprinting ? 'bg-blue-500 bg-opacity-30' : ''} fixed bottom-8 right-6 w-16 h-16 text-2xl pointer-events-auto ui-panel`,
                onTouchStart: handleSprintStart,
                onTouchEnd: handleSprintEnd,
                onMouseDown: handleSprintStart,
                onMouseUp: handleSprintEnd,
                onMouseLeave: handleSprintEnd
            }, '🏃'),
            
            // Zoom Control
            React.createElement('div', {
                key: 'zoom-control',
                className: 'fixed pointer-events-auto',
                style: {
                    right: 'calc(env(safe-area-inset-right, 0px) + 1.5rem)',
                    bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8rem)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.75rem',
                    zIndex: 200
                }
            }, [
                // Zoom indicator bar
                React.createElement('div', {
                    key: 'indicator',
                    style: {
                        position: 'relative',
                        width: '6px',
                        height: '100px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        boxShadow: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 0 2px 8px rgba(0, 0, 0, 0.1)'
                    }
                }, [
                    React.createElement('div', {
                        key: 'fill',
                        style: {
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: `${zoomPercentage}%`,
                            background: 'linear-gradient(180deg, rgba(0, 191, 255, 0.8) 0%, rgba(0, 150, 255, 0.6) 100%)',
                            transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            borderRadius: '3px'
                        }
                    }),
                    // Notches
                    [0, 25, 50, 75, 100].map(percent => 
                        React.createElement('div', {
                            key: percent,
                            style: {
                                position: 'absolute',
                                left: '-2px',
                                right: '-2px',
                                height: '1px',
                                bottom: `${percent}%`,
                                background: 'rgba(255, 255, 255, 0.3)'
                            }
                        })
                    )
                ]),
                
                // Zoom in button
                React.createElement('button', {
                    key: 'zoom-in',
                    className: `${isZooming === 'in' ? 'active' : ''}`,
                    style: {
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isZooming === 'in' ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: isZooming === 'in' ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.15)',
                        boxShadow: isZooming === 'in' ? 
                            '0 0 20px rgba(0, 255, 136, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.2)' :
                            '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: isZooming === 'in' ? 'scale(0.92)' : 'scale(1)',
                        WebkitTapHighlightColor: 'transparent',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        touchAction: 'manipulation'
                    },
                    onTouchStart: (e) => {
                        e.preventDefault();
                        startZoom('in');
                    },
                    onTouchEnd: (e) => {
                        e.preventDefault();
                        stopZoom();
                    },
                    onMouseDown: () => startZoom('in'),
                    onMouseUp: stopZoom,
                    onMouseLeave: stopZoom
                }, 
                    React.createElement('svg', {
                        width: '20',
                        height: '20',
                        viewBox: '0 0 24 24',
                        fill: 'none',
                        style: { opacity: '0.9' }
                    }, [
                        React.createElement('circle', {
                            key: 'circle',
                            cx: '12',
                            cy: '12',
                            r: '10',
                            stroke: 'currentColor',
                            strokeWidth: '2'
                        }),
                        React.createElement('path', {
                            key: 'plus',
                            d: 'M12 8v8M8 12h8',
                            stroke: 'currentColor',
                            strokeWidth: '2',
                            strokeLinecap: 'round'
                        })
                    ])
                ),
                
                // Zoom out button
                React.createElement('button', {
                    key: 'zoom-out',
                    className: `${isZooming === 'out' ? 'active' : ''}`,
                    style: {
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isZooming === 'out' ? 'rgba(255, 107, 107, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: isZooming === 'out' ? 'rgba(255, 107, 107, 0.4)' : 'rgba(255, 255, 255, 0.15)',
                        boxShadow: isZooming === 'out' ? 
                            '0 0 20px rgba(255, 107, 107, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.2)' :
                            '0 4px 16px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
                        color: 'white',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: isZooming === 'out' ? 'scale(0.92)' : 'scale(1)',
                        WebkitTapHighlightColor: 'transparent',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        touchAction: 'manipulation'
                    },
                    onTouchStart: (e) => {
                        e.preventDefault();
                        startZoom('out');
                    },
                    onTouchEnd: (e) => {
                        e.preventDefault();
                        stopZoom();
                    },
                    onMouseDown: () => startZoom('out'),
                    onMouseUp: stopZoom,
                    onMouseLeave: stopZoom
                }, 
                    React.createElement('svg', {
                        width: '20',
                        height: '20',
                        viewBox: '0 0 24 24',
                        fill: 'none',
                        style: { opacity: '0.9' }
                    }, [
                        React.createElement('circle', {
                            key: 'circle',
                            cx: '12',
                            cy: '12',
                            r: '10',
                            stroke: 'currentColor',
                            strokeWidth: '2'
                        }),
                        React.createElement('path', {
                            key: 'minus',
                            d: 'M8 12h8',
                            stroke: 'currentColor',
                            strokeWidth: '2',
                            strokeLinecap: 'round'
                        })
                    ])
                )
            ])
        ]);
    }
    
    // Main Game HUD Component
    function GameHUD() {
        const gameData = useGameState();
        const platform = usePlatform();
        const isMultiplayer = gameData.gameMode !== 'solo' && gameData.players && gameData.players.length > 0;
        const isRacing = gameData.gameMode === 'competitive';
        const isTimed = gameData.gameMode === 'timed';
        const hasIndividualScores = isRacing || isTimed;
        
        const staminaPercentage = gameData.staminaPercentage || Math.round((gameData.stamina / (gameData.maxStamina || 100)) * 100);
        
                            return React.createElement('div', {
                className: 'game-hud fixed inset-0 pointer-events-none'
            }, [
                // Desktop UI
                platform === 'desktop' && [
                    React.createElement(GameTimer, {
                        key: 'timer',
                        gameTime: gameData.gameTime,
                        timeLimit: gameData.timeLimit
                    }),
                    !isMultiplayer && React.createElement(SheepCounter, {
                        key: 'counter',
                        sheepCount: gameData.sheepCount,
                        totalSheep: gameData.totalSheep,
                        stamina: staminaPercentage
                    }),
                    isMultiplayer && React.createElement(MultiplayerScoreboard, {
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
                
                // Mobile UI
                platform === 'mobile' && [
                    React.createElement(MobileHUD, {
                        key: 'mobile-hud',
                        gameData: gameData,
                        stamina: staminaPercentage
                    }),
                    React.createElement(MobileControls, {
                        key: 'mobile-controls'
                    }),
                    isMultiplayer && React.createElement(MultiplayerScoreboard, {
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
    
    // Main App
    function App() {
        const [gameStarted, setGameStarted] = useState(false);
        
        // Listen for game start
        useEffect(() => {
            const checkGameStart = setInterval(() => {
                const canvas = document.querySelector('canvas');
                const startScreen = document.getElementById('start-screen');
                const gameActive = window.gameInstance?.gameState?.isGameActive();
                
                if (canvas && startScreen && startScreen.style.display === 'none') {
                    console.log('🎯 Game started detected! Canvas found, start screen hidden');
                    setGameStarted(true);
                    clearInterval(checkGameStart);
                    // Ensure react overlay is visible
                    const overlay = document.getElementById('react-overlay');
                    if (overlay) overlay.style.display = '';
                } else if (gameActive) {
                    console.log('🎯 Game started detected via gameState.isGameActive()');
                    setGameStarted(true);
                    clearInterval(checkGameStart);
                    // Ensure react overlay is visible
                    const overlay = document.getElementById('react-overlay');
                    if (overlay) overlay.style.display = '';
                }
            }, 100);
            
            return () => clearInterval(checkGameStart);
        }, []);
        
        return React.createElement(React.Fragment, null, [
            !gameStarted && React.createElement(StartScreen, { key: 'start' }),
            gameStarted && React.createElement(GameHUD, { key: 'hud' })
        ]);
    }
    
    // Mount React app
    const container = document.getElementById('react-overlay');
    if (!container) {
        console.error('❌ React overlay container not found!');
        return;
    }
    console.log('📦 Mounting React app to container:', container);
    
    // Ensure container is visible
    container.style.display = '';
    
    const root = createRoot(container);
    root.render(React.createElement(App));
    
    console.log('✅ React UI initialized successfully');
}
