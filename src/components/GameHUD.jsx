import { motion, AnimatePresence } from 'framer-motion';
import { useGameData, usePlatform } from '../hooks/useGameBridge.js';
import MobileHUD from './mobile/MobileHUD.jsx';

const StaminaBar = ({ stamina }) => {
  const isLow = stamina < 30;
  
  return (
    <motion.div
      className="stamina-container fixed top-6 left-1/2 transform -translate-x-1/2 z-20"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      <div className="flex items-center gap-3 ui-panel py-2 px-4">
        <div className="text-2xl">
          {isLow ? '🫁' : '⚡'}
        </div>
        <div className="stamina-bar w-32">
          <motion.div
            className={`stamina-fill ${
              isLow ? 'bg-red-500' : 'bg-green-500'
            }`}
            style={{ width: `${stamina}%` }}
            animate={{
              boxShadow: isLow 
                ? '0 0 10px rgba(239, 68, 68, 0.6)' 
                : '0 0 5px rgba(34, 197, 94, 0.4)'
            }}
          />
        </div>
        <span className="text-white text-sm font-mono min-w-[3rem]">
          {Math.round(stamina)}%
        </span>
      </div>
      
      {/* Low stamina warning */}
      <AnimatePresence>
        {isLow && (
          <motion.div
            className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg px-3 py-1 text-xs text-red-300">
              Low stamina! Rest to recover
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const GameTimer = ({ gameTime }) => {
  const minutes = Math.floor(gameTime / 60);
  const seconds = gameTime % 60;
  
  return (
    <motion.div
      className="fixed top-6 right-6 z-20"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3 }}
    >
      <div className="ui-panel py-2 px-4">
        <div className="text-white font-mono text-xl">
          {String(minutes).padStart(2, '0')}:
          {String(seconds).padStart(2, '0')}
        </div>
      </div>
    </motion.div>
  );
};

const SheepCounter = ({ sheepCount, totalSheep }) => {
  const percentage = Math.round((sheepCount / totalSheep) * 100);
  
  return (
    <motion.div
      className="fixed top-6 left-6 z-20"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.1 }}
    >
      <div className="ui-panel py-2 px-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐑</span>
          <div>
            <div className="text-white font-semibold">
              {sheepCount} / {totalSheep}
            </div>
            <div className="text-blue-300 text-xs">
              {percentage}% complete
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const GameHUD = () => {
  const gameData = useGameData();
  const { platform } = usePlatform();
  
  // Debug logging
  console.log('🎮 GameHUD render:', {
    platform,
    gameData,
    isMobile: platform === 'mobile',
    userAgent: navigator.userAgent
  });
  
  // Mobile: Use dedicated mobile HUD component
  if (platform === 'mobile') {
    console.log('📱 Rendering MobileHUD component');
    return <MobileHUD gameData={gameData} />;
  }
  
  console.log('🖥️ Rendering desktop HUD');
  // Desktop: Keep existing layout unchanged
  return (
    <div className="game-hud pointer-events-auto">
      <StaminaBar stamina={gameData.staminaPercentage || gameData.stamina} />
      <GameTimer gameTime={gameData.gameTime} />
      <SheepCounter 
        sheepCount={gameData.sheepCount} 
        totalSheep={gameData.totalSheep} 
      />
    </div>
  );
};

export default GameHUD;