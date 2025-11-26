/**
 * GlobalLeaderboard Component
 * View global rankings across all game modes
 */
const { createElement, useState, useEffect } = window.React;

export function GlobalLeaderboard({ onBack, playerIdentity }) {
    const [activeTab, setActiveTab] = useState('soloClassic');
    const [leaderboards, setLeaderboards] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastRefresh, setLastRefresh] = useState(null);

    const tabs = [
        { id: 'soloClassic', name: 'Solo Classic', icon: 'Solo' },
        { id: 'soloExtreme', name: 'Solo Extreme', icon: 'Extreme' },
        { id: 'timed', name: 'Timed (3 min)', icon: 'Timed' },
        { id: 'competitive', name: 'Competitive', icon: 'Race' },
        { id: 'cooperative', name: 'Cooperative', icon: 'Co-op' }
    ];

    const loadLeaderboards = async () => {
        setLoading(true);
        setError('');

        try {
            if (!window.gameInstance?.networkManager) {
                throw new Error('Network manager not available');
            }

            const nm = window.gameInstance.networkManager;

            if (!nm.isConnected()) {
                console.log('[LEADERBOARD] Attempting to connect to server...');
                await nm.connect();
            }

            const data = await nm.getAllLeaderboards(10);
            console.log('[LEADERBOARD] Raw data received:', data);

            setLeaderboards(data);
            setLastRefresh(new Date());

        } catch (error) {
            console.error('[LEADERBOARD] Failed to load:', error);

            if (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
                setError('Server offline - Leaderboards unavailable. The server may be starting up or temporarily down.');
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

    const renderLeaderboardTable = (gameMode) => {
        const data = leaderboards[gameMode] || [];

        if (data.length === 0) {
            return createElement('div', {
                className: 'text-center py-8 text-white text-opacity-60'
            }, 'No scores recorded yet. Be the first!');
        }

        return createElement('div', {
            className: 'space-y-2'
        }, data.map((entry, index) => {
            const isPlayer = playerIdentity && entry.fullName === playerIdentity.fullName;

            return createElement('div', {
                key: index,
                className: `flex items-center justify-between p-3 rounded-lg transition-all duration-200 ${
                    isPlayer ? 'bg-blue-500 bg-opacity-20 border border-blue-400 border-opacity-30' : 'bg-white bg-opacity-5'
                }`
            }, [
                createElement('div', {
                    key: 'left',
                    className: 'flex items-center gap-3'
                }, [
                    createElement('div', {
                        key: 'rank',
                        className: `w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                            entry.rank === 1 ? 'bg-yellow-500 text-black' :
                            entry.rank === 2 ? 'bg-gray-300 text-black' :
                            entry.rank === 3 ? 'bg-amber-600 text-white' :
                            'bg-white bg-opacity-10 text-white'
                        }`
                    }, entry.rank <= 3 ? ['1st', '2nd', '3rd'][entry.rank - 1] : entry.rank),
                    createElement('div', { key: 'info' }, [
                        createElement('div', {
                            key: 'name',
                            className: `font-semibold ${isPlayer ? 'text-blue-300' : 'text-white'}`
                        }, entry.displayName + (isPlayer ? ' (You)' : '')),
                        createElement('div', {
                            key: 'full',
                            className: 'text-xs text-white text-opacity-50'
                        }, entry.fullName)
                    ])
                ]),
                createElement('div', {
                    key: 'score',
                    className: 'text-white font-mono font-bold'
                }, entry.formattedScore)
            ]);
        }));
    };

    const panelStyle = {
        animation: 'slideUp 0.5s ease-out',
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderRadius: '1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.12), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        padding: '2rem'
    };

    return createElement('div', {
        className: 'max-w-4xl w-full',
        style: panelStyle
    }, [
        // Header
        createElement('div', {
            key: 'header',
            className: 'flex items-center justify-between mb-6'
        }, [
            createElement('h2', {
                key: 'title',
                className: 'text-3xl font-bold text-white',
                style: { textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)' }
            }, 'Global Leaderboard'),
            createElement('div', {
                key: 'controls',
                className: 'flex items-center gap-3'
            }, [
                lastRefresh && createElement('span', {
                    key: 'time',
                    className: 'text-xs text-white text-opacity-60'
                }, `Updated ${lastRefresh.toLocaleTimeString()}`),
                createElement('button', {
                    key: 'refresh',
                    className: 'btn-secondary py-2 px-4 text-sm',
                    onClick: loadLeaderboards,
                    disabled: loading
                }, loading ? '...' : 'Refresh')
            ])
        ]),

        // Tab Navigation
        createElement('div', {
            key: 'tabs',
            className: 'flex flex-wrap gap-2 mb-6 overflow-x-auto'
        }, tabs.map(tab =>
            createElement('button', {
                key: tab.id,
                className: `px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                    activeTab === tab.id
                        ? 'bg-white bg-opacity-20 text-white border border-white border-opacity-30'
                        : 'bg-white bg-opacity-5 text-white text-opacity-70 hover:bg-opacity-10'
                }`,
                onClick: () => setActiveTab(tab.id)
            }, `${tab.icon}`)
        )),

        // Content Area
        createElement('div', {
            key: 'content',
            className: 'min-h-[400px]'
        }, [
            loading && createElement('div', {
                key: 'loading',
                className: 'flex items-center justify-center py-20'
            }, [
                createElement('div', {
                    key: 'spinner',
                    className: 'spinner mr-3'
                }),
                createElement('span', {
                    key: 'text',
                    className: 'text-white text-opacity-80'
                }, 'Loading leaderboards...')
            ]),

            error && createElement('div', {
                key: 'error',
                className: 'text-center py-20'
            }, [
                createElement('p', {
                    key: 'message',
                    className: 'text-red-400 mb-4'
                }, error),
                createElement('button', {
                    key: 'retry',
                    className: 'btn-primary',
                    onClick: loadLeaderboards
                }, 'Try Again')
            ]),

            !loading && !error && renderLeaderboardTable(activeTab)
        ]),

        // Back Button
        createElement('button', {
            key: 'back',
            className: 'btn-secondary mt-6',
            onClick: onBack
        }, String.fromCharCode(8592) + ' Back to Menu')
    ]);
}
