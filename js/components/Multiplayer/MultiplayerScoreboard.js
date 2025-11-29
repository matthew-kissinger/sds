/**
 * MultiplayerScoreboard Component
 * In-game scoreboard for multiplayer modes
 *
 * Type scale:
 * - Title: text-base (14px)
 * - Player names: text-base (14px)
 * - Scores: text-base (14px) mono
 * - Labels: text-sm (12px)
 * - Sheep count: text-lg (20px)
 */
import React, { createElement } from 'react';
import { CompactStaminaBar } from '../GameHUD/CompactStaminaBar.js';

export function MultiplayerScoreboard({ players, scores, myPlayerId, gameMode, sheepCount, totalSheep, stamina }) {
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

    return createElement('div', {
        className: 'fixed top-6 left-6 z-20',
        style: {
            animation: 'slideInLeft 0.5s ease-out 0.3s both',
            paddingTop: 'max(env(safe-area-inset-top, 0px), 0px)'
        }
    },
        createElement('div', {
            className: 'ui-panel p-3 min-w-[220px]'
        }, [
            // Title: text-base from type scale
            createElement('h3', {
                key: 'title',
                className: 'text-base text-blue-400 font-bold mb-3 flex items-center gap-2'
            }, [
                createElement('span', { key: 'icon' }, ''),
                createElement('span', { key: 'text' },
                    hasIndividualScores ? (gameMode === 'timed' ? 'Timed Race' : 'Racing') : 'Team Progress')
            ]),

            // Show collective progress for cooperative mode
            isCooperative && createElement('div', {
                key: 'collective-progress',
                className: 'mb-3 p-3 bg-green-500/10 border border-green-500/30 rounded'
            }, [
                // Sheep count: text-lg from type scale
                createElement('div', {
                    key: 'sheep-count',
                    className: 'text-center text-white font-bold text-lg'
                }, `${sheepCount || 0} / ${totalSheep || 200}`),
                // Label: text-sm from type scale
                createElement('div', {
                    key: 'label',
                    className: 'text-center text-green-300 text-sm'
                }, 'Sheep Collected Together'),
                createElement('div', {
                    key: 'progress-bar',
                    className: 'mt-2 h-2 bg-gray-700 rounded-full overflow-hidden'
                },
                    createElement('div', {
                        className: 'h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-300',
                        style: { width: `${Math.round(((sheepCount || 0) / (totalSheep || 200)) * 100)}%` }
                    })
                )
            ]),

            createElement('div', {
                key: 'players',
                className: 'flex flex-col gap-2'
            }, displayPlayers.length === 0 ?
                createElement('div', {
                    className: 'text-center text-white/60 text-sm py-2'
                }, 'No players connected') :
                displayPlayers.map((player, index) => {
                    const isMe = player.id === myPlayerId;
                    const score = scores && scores[player.id] !== undefined ? scores[player.id] : 0;
                    const isLeader = index === 0 && hasIndividualScores && score > 0;
                    const winThreshold = 101;

                    return createElement('div', {
                        key: player.id || index,
                        className: `p-2 rounded ${isMe ? 'bg-blue-500/20 border border-blue-400/30' : 'bg-white/5'}`
                    }, [
                        // Player name and score row
                        createElement('div', {
                            key: 'player-info',
                            className: 'flex items-center justify-between mb-1'
                        }, [
                            createElement('div', {
                                key: 'left',
                                className: 'flex items-center gap-2'
                            }, [
                                isLeader && createElement('span', { key: 'crown' }, ''),
                                // Player name: text-base from type scale
                                createElement('span', {
                                    key: 'name',
                                    className: 'text-base text-white font-medium'
                                }, (player.name || player.playerName || 'Unknown Player') + (isMe ? ' (You)' : ''))
                            ]),
                            // Score: text-base mono from type scale
                            hasIndividualScores && createElement('span', {
                                key: 'score',
                                className: 'text-base text-white font-mono font-bold'
                            }, isRacing ? `${score}/${winThreshold}` : `${score}`)
                        ]),

                        // Individual progress bar for racing mode only
                        isRacing && createElement('div', {
                            key: 'progress-bar',
                            className: 'h-2 bg-gray-700 rounded-full overflow-hidden'
                        },
                            createElement('div', {
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

            createElement(CompactStaminaBar, {
                key: 'stamina',
                stamina: stamina
            })
        ])
    );
}
