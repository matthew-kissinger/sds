import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ConnectionStatus = ({ status, ping }) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return '🔗';
      case 'disconnected':
        return '❌';
      case 'connecting':
      case 'reconnecting':
        return '⏳';
      default:
        return '❓';
    }
  };

  const getPingColor = (pingValue) => {
    if (!pingValue || status !== 'connected') return 'text-gray-400';
    if (pingValue < 50) return 'text-green-400';
    if (pingValue < 100) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-lg">{getStatusIcon()}</span>
      <span className={getPingColor(ping)}>
        Ping: {ping && status === 'connected' ? `${Math.round(ping)}ms` : '--ms'}
      </span>
    </div>
  );
};

const ProgressBar = ({ value, max, isLeader, isYou }) => {
  const percentage = Math.min((value / max) * 100, 100);
  
  return (
    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${
          isLeader ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' :
          isYou ? 'bg-gradient-to-r from-blue-400 to-blue-500' :
          'bg-gradient-to-r from-gray-400 to-gray-500'
        }`}
        initial={{ width: 0 }}
        animate={{ width: `${percentage}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  );
};

const PlayerItem = ({ player, score, rank, isYou, isLeader, winThreshold, gameMode }) => {
  return (
    <motion.div
      className={`player-item p-3 rounded-lg bg-white/5 border ${
        isLeader ? 'border-yellow-400/50' :
        isYou ? 'border-blue-400/50' :
        'border-white/20'
      }`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.1 }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">
            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : ''}
          </span>
          <span className={`font-semibold ${isLeader ? 'text-yellow-400' : 'text-white'}`}>
            {isLeader && '👑 '}
            {player.name || player.id || 'Unknown'}
            {isYou && ' (You)'}
          </span>
        </div>
        <span className="text-xl font-bold text-white">{score || 0}</span>
      </div>
      
      {winThreshold && gameMode === 'competitive' && (
        <ProgressBar 
          value={score || 0} 
          max={winThreshold} 
          isLeader={isLeader} 
          isYou={isYou} 
        />
      )}
    </motion.div>
  );
};

const Players = ({ 
  players = [], 
  scores = {}, 
  currentPlayerId, 
  gameMode = 'cooperative',
  winThreshold,
  totalSheep = 200
}) => {
  const [sortedPlayers, setSortedPlayers] = useState([]);
  const [currentLeader, setCurrentLeader] = useState(null);

  useEffect(() => {
    console.log('Players component - players:', players);
    console.log('Players component - scores:', scores);
    console.log('Players component - currentPlayerId:', currentPlayerId);
    
    // Sort players by score
    const sorted = [...players].sort((a, b) => {
      const scoreA = scores[a.id] || 0;
      const scoreB = scores[b.id] || 0;
      return scoreB - scoreA;
    });
    setSortedPlayers(sorted);

    // Determine leader
    let maxScore = -1;
    let leader = null;
    Object.entries(scores).forEach(([playerId, score]) => {
      if (score > maxScore) {
        maxScore = score;
        leader = playerId;
      }
    });
    setCurrentLeader(leader);
  }, [players, scores]);

  if (players.length === 0) {
    return (
      <div className="text-center text-gray-400 py-4">
        No players online
      </div>
    );
  }

  const isCompetitive = gameMode === 'competitive' || gameMode === 'timed';
  const totalCollected = Object.values(scores).reduce((sum, score) => sum + score, 0);

  return (
    <div className="space-y-2">
      <AnimatePresence>
        {sortedPlayers.map((player, index) => (
          <PlayerItem
            key={player.id}
            player={player}
            score={scores[player.id]}
            rank={index + 1}
            isYou={player.id === currentPlayerId}
            isLeader={player.id === currentLeader && (scores[player.id] || 0) > 0}
            winThreshold={winThreshold}
            gameMode={gameMode}
          />
        ))}
      </AnimatePresence>
      
      {/* Progress summary for 3-4 player competitive mode */}
      {isCompetitive && !winThreshold && players.length >= 3 && (
        <motion.div 
          className="text-center text-sm text-gray-400 mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Total: {totalCollected}/{totalSheep} sheep collected
        </motion.div>
      )}
    </div>
  );
};

const MultiplayerHUD = ({ 
  players = [], 
  scores = {}, 
  currentPlayerId,
  connectionStatus = 'disconnected',
  ping = null,
  gameMode = 'cooperative',
  winCondition = null,
  visible = true
}) => {
  const [title, setTitle] = useState('Players Online');
  const [winThreshold, setWinThreshold] = useState(null);

  useEffect(() => {
    // Update title based on game mode
    if (gameMode === 'competitive') {
      if (players.length === 2) {
        setTitle('🏆 Competitive Race (First to 101)');
        setWinThreshold(101);
      } else {
        setTitle('🏆 Competitive Mode (Highest Score)');
        setWinThreshold(null);
      }
    } else if (gameMode === 'timed') {
      setTitle('⏱️ Timed Collection (3 minutes)');
      setWinThreshold(null);
    } else {
      setTitle('Players Online');
      setWinThreshold(null);
    }
  }, [gameMode, players.length]);

  useEffect(() => {
    // Update win progress
    if (winCondition && (gameMode === 'competitive' || gameMode === 'timed')) {
      if (winCondition.type === 'race' && winCondition.threshold) {
        setWinThreshold(winCondition.threshold);
        const progressPercent = Math.round(winCondition.progress * 100);
        setTitle(`🏆 Competitive Race (${progressPercent}% to win)`);
      } else if (winCondition.type === 'highest_score') {
        setTitle(`🏆 Competitive Mode (${winCondition.totalCollected}/${winCondition.totalSheep})`);
      }
    }
  }, [winCondition, gameMode]);

  if (!visible) return null;

  return (
    <motion.div
      className="fixed top-20 left-6 z-20 w-72"
      initial={{ x: -50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      <div className="ui-panel p-4">
        <h3 className="text-lg font-bold text-blue-400 mb-3">{title}</h3>
        
        <Players
          players={players}
          scores={scores}
          currentPlayerId={currentPlayerId}
          gameMode={gameMode}
          winThreshold={winThreshold}
        />
        
        <div className="mt-4 pt-3 border-t border-white/10">
          <ConnectionStatus status={connectionStatus} ping={ping} />
        </div>
      </div>
    </motion.div>
  );
};

// Competition Completion Overlay
export const CompetitionCompleteOverlay = ({ 
  winner, 
  winType, 
  finalScores, 
  players, 
  currentPlayerId,
  onRestart 
}) => {
  const isWinner = winner === currentPlayerId;
  const sortedScores = Object.entries(finalScores)
    .sort(([,a], [,b]) => b - a);

  const getTitle = () => {
    if (isWinner) {
      return winType === 'timeout' ? "⏱️ TIME'S UP - VICTORY! 🏆" : '🏆 VICTORY! 🏆';
    }
    return winType === 'timeout' ? "⏱️ TIME'S UP" : '🥈 Game Complete';
  };

  const getSubtitle = () => {
    if (isWinner) {
      return winType === 'timeout' ? 'You collected the most sheep!' : 'You won the competition!';
    }
    const winnerPlayer = players.find(p => p.id === winner);
    const winnerName = winnerPlayer?.name || winner;
    return winType === 'timeout' ? 
      `${winnerName} collected the most sheep!` : 
      `${winnerName} won the competition!`;
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="ui-panel p-8 max-w-lg w-full mx-4"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <h1 className={`text-3xl font-bold text-center mb-2 ${
            isWinner ? 'text-yellow-400' : 'text-white'
          }`}>
            {getTitle()}
          </h1>
          
          <h2 className="text-xl text-center text-gray-300 mb-6">
            {getSubtitle()}
          </h2>
          
          <div className="space-y-3 mb-6">
            <h3 className="text-lg font-semibold text-blue-400">Final Scores:</h3>
            {sortedScores.map(([playerId, score], index) => {
              const player = players.find(p => p.id === playerId);
              const playerName = player?.name || playerId;
              const isYou = playerId === currentPlayerId;
              const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
              
              return (
                <div key={playerId} className="flex items-center justify-between p-2 rounded bg-white/5">
                  <span className="flex items-center gap-2">
                    <span className="text-lg">{medal}</span>
                    <span className={isYou ? 'font-bold text-blue-400' : 'text-white'}>
                      {playerName}{isYou && ' (You)'}
                    </span>
                  </span>
                  <span className="font-bold text-xl text-white">{score} sheep</span>
                </div>
              );
            })}
          </div>
          
          <button
            onClick={onRestart}
            className="w-full py-3 px-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg font-semibold text-white hover:from-blue-600 hover:to-purple-600 transition-all transform hover:scale-105"
          >
            Play Again
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default MultiplayerHUD;