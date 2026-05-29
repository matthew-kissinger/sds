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
 *
 * Cycle 48 P3: converted from the element-factory .js to JSX .tsx. This leaf
 * carries no inline color — every shade is a Tailwind utility class
 * (text-blue-400, bg-green-500/10, the from-/to- gradient stops) so the
 * conversion is a pure element-factory -> JSX move with no token work. The
 * empty icon/crown spans are placeholders kept for layout parity with the
 * previous MultiplayerScoreboard.js. Behavior is identical.
 */
import type { CSSProperties } from 'react';
import { CompactStaminaBar } from '../GameHUD/CompactStaminaBar.js';

interface Player {
    id?: string;
    name?: string;
    playerName?: string;
}

interface MultiplayerScoreboardProps {
    players?: Player[];
    scores?: Record<string, number>;
    myPlayerId?: string;
    gameMode?: string;
    sheepCount?: number;
    totalSheep?: number;
    stamina: number;
}

export function MultiplayerScoreboard({
    players,
    scores,
    myPlayerId,
    gameMode,
    sheepCount,
    totalSheep,
    stamina,
}: MultiplayerScoreboardProps) {
    const isRacing = gameMode === 'competitive';
    const isTimed = gameMode === 'timed';
    const hasIndividualScores = isRacing || isTimed;
    const isCooperative = gameMode === 'cooperative';

    // For modes with individual scores, sort by score. For cooperative, keep original order
    const displayPlayers = hasIndividualScores
        ? [...(players || [])].sort((a, b) => {
              const scoreA = (scores && a.id ? scores[a.id] : 0) || 0;
              const scoreB = (scores && b.id ? scores[b.id] : 0) || 0;
              return scoreB - scoreA;
          })
        : [...(players || [])];

    const containerStyle: CSSProperties = {
        animation: 'slideInLeft 0.5s ease-out 0.3s both',
        paddingTop: 'max(env(safe-area-inset-top, 0px), 0px)',
    };

    return (
        <div className="fixed top-6 left-6 z-20" style={containerStyle}>
            <div className="ui-panel p-3 min-w-[220px]">
                {/* Title: text-base from type scale */}
                <h3 className="text-base text-blue-400 font-bold mb-3 flex items-center gap-2">
                    <span />
                    <span>
                        {hasIndividualScores
                            ? gameMode === 'timed'
                                ? 'Timed Race'
                                : 'Racing'
                            : 'Team Progress'}
                    </span>
                </h3>

                {/* Show collective progress for cooperative mode */}
                {isCooperative && (
                    <div className="mb-3 p-3 bg-green-500/10 border border-green-500/30 rounded">
                        {/* Sheep count: text-lg from type scale */}
                        <div className="text-center text-white font-bold text-lg">
                            {`${sheepCount || 0} / ${totalSheep || 200}`}
                        </div>
                        {/* Label: text-sm from type scale */}
                        <div className="text-center text-green-300 text-sm">Sheep Collected Together</div>
                        <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-300"
                                style={{
                                    width: `${Math.round(((sheepCount || 0) / (totalSheep || 200)) * 100)}%`,
                                }}
                            />
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    {displayPlayers.length === 0 ? (
                        <div className="text-center text-white/60 text-sm py-2">No players connected</div>
                    ) : (
                        displayPlayers.map((player, index) => {
                            const isMe = player.id === myPlayerId;
                            const score =
                                scores && player.id && scores[player.id] !== undefined
                                    ? scores[player.id]
                                    : 0;
                            const isLeader = index === 0 && hasIndividualScores && score > 0;
                            const winThreshold = 101;

                            return (
                                <div
                                    key={player.id || index}
                                    className={`p-2 rounded ${
                                        isMe ? 'bg-blue-500/20 border border-blue-400/30' : 'bg-white/5'
                                    }`}
                                >
                                    {/* Player name and score row */}
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            {isLeader && <span />}
                                            {/* Player name: text-base from type scale */}
                                            <span className="text-base text-white font-medium">
                                                {(player.name || player.playerName || 'Unknown Player') +
                                                    (isMe ? ' (You)' : '')}
                                            </span>
                                        </div>
                                        {/* Score: text-base mono from type scale */}
                                        {hasIndividualScores && (
                                            <span className="text-base text-white font-mono font-bold">
                                                {isRacing ? `${score}/${winThreshold}` : `${score}`}
                                            </span>
                                        )}
                                    </div>

                                    {/* Individual progress bar for racing mode only */}
                                    {isRacing && (
                                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-300 ${
                                                    isMe
                                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600'
                                                        : isLeader
                                                          ? 'bg-gradient-to-r from-yellow-500 to-yellow-600'
                                                          : 'bg-gradient-to-r from-gray-500 to-gray-600'
                                                }`}
                                                style={{ width: `${Math.min((score / winThreshold) * 100, 100)}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                <CompactStaminaBar stamina={stamina} />
            </div>
        </div>
    );
}
