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

export function GlobalLeaderboard({ onBack, playerIdentity }) {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('soloClassic');
    const [leaderboards, setLeaderboards] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastRefresh, setLastRefresh] = useState(null);
    const { isCompact, isMobile } = useResponsive();

    const tabs = [
        { id: 'soloClassic', labelKey: 'leaderboard.soloClassic' },
        { id: 'soloExtreme', labelKey: 'leaderboard.soloExtreme' },
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

            const data = await nm.getAllLeaderboards(10);
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
    }, []);

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
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%'
        }
    },
        createElement(Panel, {
            size: 'lg',
            maxWidth: '56rem',
            style: { animation: 'slideUp 0.5s ease-out' }
        }, [
            // Header
            createElement('div', {
                key: 'header',
                style: {
                    display: 'flex',
                    alignItems: isMobile ? 'flex-start' : 'center',
                    justifyContent: 'space-between',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: isMobile ? '0.75rem' : '0',
                    marginBottom: isCompact ? '1rem' : '1.5rem'
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

            // Tab Navigation
            createElement('div', {
                key: 'tabs',
                style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    marginBottom: isCompact ? '1rem' : '1.5rem',
                    overflowX: 'auto'
                }
            }, tabs.map(tab =>
                createElement('button', {
                    key: tab.id,
                    style: tabButtonStyle(activeTab === tab.id),
                    onClick: () => setActiveTab(tab.id)
                }, t(tab.labelKey))
            )),

            // Content Area
            createElement('div', {
                key: 'content',
                style: { minHeight: isCompact ? '200px' : '300px' }
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

            // Back Button
            createElement(Button, {
                key: 'back',
                variant: 'secondary',
                onClick: onBack,
                style: { marginTop: isCompact ? '1rem' : '1.5rem' }
            }, t('common.backToMenu'))
        ])
    );
}
