/**
 * GlobalLeaderboard Component
 * View global rankings across all game modes
 */
import React, { createElement, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getNetworkManager } from '../../GameBridge.js';
import { useResponsive } from '../hooks/usePlatform.js';
import { Panel, PanelTitle } from '../ui/Panel.js';
import { Button } from '../ui/Button.js';

// Cycle 8 Phase 3: scene + sheep-count partition selectors.
const SCENE_FILTER_OPTIONS = [
    { id: 'any', label: 'Any scene' },
    { id: 'field', label: 'Home Field' },
    { id: 'rolling-hills', label: 'Rolling Hills' },
    { id: 'open-country', label: 'Open Country' }
];
const SHEEP_FILTER_OPTIONS = [
    { value: 0, label: 'Any size' },
    { value: 200, label: '200 sheep' },
    { value: 250, label: '250 sheep' },
    { value: 1000, label: '1000 sheep' },
    { value: 3000, label: '3000 sheep' },
    { value: 5000, label: '5000 sheep' }
];

export function GlobalLeaderboard({ onBack, playerIdentity }) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('soloClassic');
    const [leaderboards, setLeaderboards] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastRefresh, setLastRefresh] = useState(null);
    const [sceneFilter, setSceneFilter] = useState('any');
    const [sheepFilter, setSheepFilter] = useState(0);
    const { isCompact, isMobile } = useResponsive();

    const tabs = [
        { id: 'soloClassic', labelKey: 'leaderboard.soloClassic' },
        { id: 'soloExtreme', labelKey: 'leaderboard.soloExtreme' },
        // Cycle 8 Phase 2b: Insane (3000 sheep) and Chaos (5000 sheep) get
        // their own boards instead of polluting soloClassic.
        { id: 'soloInsane', labelKey: 'leaderboard.soloInsane' },
        { id: 'soloChaos', labelKey: 'leaderboard.soloChaos' },
        { id: 'timed', labelKey: 'leaderboard.timed' },
        { id: 'competitive', labelKey: 'leaderboard.competitive' },
        { id: 'cooperative', labelKey: 'leaderboard.cooperative' }
    ];

    const loadLeaderboards = async () => {
        setLoading(true);
        setError('');

        try {
            const nm = getNetworkManager();
            if (!nm) {
                throw new Error('Network manager not available');
            }

            if (!nm.isConnected()) {
                console.log('[LEADERBOARD] Attempting to connect to server...');
                await nm.connect();
            }

            const data = await nm.getAllLeaderboards(10, {
                sceneId: sceneFilter,
                sheepCount: sheepFilter
            });
            console.log('[LEADERBOARD] Raw data received:', data);

            setLeaderboards(data);
            setLastRefresh(new Date());

        } catch (err) {
            console.error('[LEADERBOARD] Failed to load:', err);

            if (err.message.includes('Failed to fetch') || err.message.includes('ERR_CONNECTION_REFUSED')) {
                setError('serverOffline');
            } else {
                setError('loadFailed');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLeaderboards();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sceneFilter, sheepFilter]);

    const renderLeaderboardTable = (gameMode) => {
        const data = leaderboards[gameMode] || [];

        if (data.length === 0) {
            return createElement('div', {
                style: {
                    textAlign: 'center',
                    padding: '2rem',
                    color: 'rgba(255, 255, 255, 0.6)'
                }
            }, t('leaderboard.noScores'));
        }

        return createElement('div', {
            style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' }
        }, data.map((entry, index) => {
            const isPlayer = playerIdentity && entry.fullName === playerIdentity.fullName;

            const getRankStyle = (rank) => {
                const base = {
                    width: isCompact ? '28px' : '32px',
                    height: isCompact ? '28px' : '32px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: isCompact ? '0.7rem' : '0.875rem',
                    fontWeight: 'bold'
                };
                if (rank === 1) return { ...base, background: '#eab308', color: 'black' };
                if (rank === 2) return { ...base, background: '#d1d5db', color: 'black' };
                if (rank === 3) return { ...base, background: '#d97706', color: 'white' };
                return { ...base, background: 'rgba(255, 255, 255, 0.1)', color: 'white' };
            };

            return createElement('div', {
                key: index,
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: isCompact ? '0.5rem 0.75rem' : '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    transition: 'all 0.2s',
                    background: isPlayer ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    border: isPlayer ? '1px solid rgba(96, 165, 250, 0.3)' : '1px solid transparent'
                }
            }, [
                createElement('div', {
                    key: 'left',
                    style: { display: 'flex', alignItems: 'center', gap: isCompact ? '0.5rem' : '0.75rem' }
                }, [
                    createElement('div', {
                        key: 'rank',
                        style: getRankStyle(entry.rank)
                    }, entry.rank <= 3 ? [t('leaderboard.ranks.first'), t('leaderboard.ranks.second'), t('leaderboard.ranks.third')][entry.rank - 1] : entry.rank),
                    createElement('div', { key: 'info' }, [
                        createElement('div', {
                            key: 'name',
                            style: {
                                fontWeight: 600,
                                color: isPlayer ? '#93c5fd' : 'white',
                                fontSize: isCompact ? '0.8rem' : '1rem'
                            }
                        }, entry.displayName + (isPlayer ? ` (${t('common.you')})` : '')),
                        !isCompact && createElement('div', {
                            key: 'full',
                            style: {
                                fontSize: '0.75rem',
                                color: 'rgba(255, 255, 255, 0.5)'
                            }
                        }, entry.fullName)
                    ])
                ]),
                createElement('div', {
                    key: 'score',
                    style: {
                        color: 'white',
                        fontFamily: 'monospace',
                        fontWeight: 'bold',
                        fontSize: isCompact ? '0.8rem' : '1rem'
                    }
                }, entry.formattedScore)
            ]);
        }));
    };

    const tabButtonStyle = (isActive) => ({
        padding: isCompact ? '0.5rem 0.75rem' : '0.5rem 1rem',
        borderRadius: '0.5rem',
        fontSize: isCompact ? '0.75rem' : '0.875rem',
        fontWeight: 500,
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        border: isActive ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid transparent',
        background: isActive ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
        color: isActive ? 'white' : 'rgba(255, 255, 255, 0.7)'
    });

    return createElement('div', {
        style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: '100%',
            maxHeight: '100%',
            padding: isMobile ? '0.5rem' : '1rem'
        }
    },
        createElement(Panel, {
            size: 'lg',
            maxWidth: '56rem',
            style: {
                animation: 'slideUp 0.5s ease-out',
                maxHeight: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }
        }, [
            // Header (fixed)
            createElement('div', {
                key: 'header',
                style: {
                    display: 'flex',
                    alignItems: isMobile ? 'flex-start' : 'center',
                    justifyContent: 'space-between',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: isMobile ? '0.75rem' : '0',
                    marginBottom: isCompact ? '1rem' : '1.5rem',
                    flexShrink: 0
                }
            }, [
                createElement(PanelTitle, {
                    key: 'title',
                    style: { marginBottom: 0 }
                }, t('leaderboard.title')),
                createElement('div', {
                    key: 'controls',
                    style: { display: 'flex', alignItems: 'center', gap: '0.75rem' }
                }, [
                    lastRefresh && createElement('span', {
                        key: 'time',
                        style: {
                            fontSize: '0.75rem',
                            color: 'rgba(255, 255, 255, 0.6)'
                        }
                    }, t('leaderboard.updated', { time: lastRefresh.toLocaleTimeString() })),
                    createElement(Button, {
                        key: 'refresh',
                        variant: 'secondary',
                        onClick: loadLeaderboards,
                        disabled: loading,
                        style: { padding: '0.5rem 1rem', fontSize: '0.875rem' }
                    }, loading ? '...' : t('common.refresh'))
                ])
            ]),

            // Tab Navigation (fixed)
            createElement('div', {
                key: 'tabs',
                style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    marginBottom: isCompact ? '0.5rem' : '0.75rem',
                    overflowX: 'auto',
                    flexShrink: 0
                }
            }, tabs.map(tab =>
                createElement('button', {
                    key: tab.id,
                    style: tabButtonStyle(activeTab === tab.id),
                    onClick: () => setActiveTab(tab.id)
                }, t(tab.labelKey))
            )),

            // Cycle 8 Phase 3: scene + sheep-count partition selectors.
            createElement('div', {
                key: 'filters',
                style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    marginBottom: isCompact ? '1rem' : '1.5rem',
                    flexShrink: 0
                }
            }, [
                createElement('label', {
                    key: 'scene-label',
                    style: {
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.7)'
                    }
                }, [
                    createElement('span', { key: 't' }, 'Scene:'),
                    createElement('select', {
                        key: 's',
                        value: sceneFilter,
                        onChange: (e) => setSceneFilter(e.target.value),
                        style: {
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.375rem',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                        }
                    }, SCENE_FILTER_OPTIONS.map(opt =>
                        createElement('option', {
                            key: opt.id,
                            value: opt.id,
                            style: { background: '#1f2937' }
                        }, opt.label)
                    ))
                ]),
                createElement('label', {
                    key: 'sheep-label',
                    style: {
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.7)'
                    }
                }, [
                    createElement('span', { key: 't' }, 'Sheep count:'),
                    createElement('select', {
                        key: 's',
                        value: sheepFilter,
                        onChange: (e) => setSheepFilter(parseInt(e.target.value, 10) || 0),
                        style: {
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.375rem',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                        }
                    }, SHEEP_FILTER_OPTIONS.map(opt =>
                        createElement('option', {
                            key: opt.value,
                            value: opt.value,
                            style: { background: '#1f2937' }
                        }, opt.label)
                    ))
                ])
            ]),

            // Content Area (scrollable)
            createElement('div', {
                key: 'content',
                style: {
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch'
                }
            }, [
                loading && createElement('div', {
                    key: 'loading',
                    style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '3rem 0'
                    }
                }, [
                    createElement('span', {
                        key: 'text',
                        style: { color: 'rgba(255, 255, 255, 0.8)' }
                    }, t('leaderboard.loading'))
                ]),

                error && createElement('div', {
                    key: 'error',
                    style: { textAlign: 'center', padding: '3rem 0' }
                }, [
                    createElement('p', {
                        key: 'message',
                        style: { color: '#f87171', marginBottom: '1rem' }
                    }, t(`leaderboard.${error}`)),
                    createElement(Button, {
                        key: 'retry',
                        variant: 'primary',
                        onClick: loadLeaderboards
                    }, t('common.retry'))
                ]),

                !loading && !error && renderLeaderboardTable(activeTab)
            ]),

            // Back Button (always visible)
            createElement(Button, {
                key: 'back',
                variant: 'secondary',
                onClick: onBack,
                style: {
                    marginTop: isCompact ? '1rem' : '1.5rem',
                    flexShrink: 0
                }
            }, t('common.backToMenu'))
        ])
    );
}
