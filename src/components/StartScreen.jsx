import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameBridge, usePlatform } from '../hooks/useGameBridge.js';
import DogSelector from './DogSelector.jsx';

const StartScreen = () => {
  const { gameState, emit } = useGameBridge();
  const { platform, inputMethod } = usePlatform();
  const [showMusic, setShowMusic] = useState(true);
  
  const handleStartGame = () => {
    emit('start-game', {
      mode: 'solo',
      dog: gameState.selectedDog
    });
  };
  
  const handleDogSelect = (dogId) => {
    emit('select-dog', { dogId });
  };
  
  const enableMusic = () => {
    setShowMusic(false);
    // Enable audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
  };
  
  if (gameState.gameStarted) {
    return null;
  }
  
  return (
    <motion.div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={showMusic ? enableMusic : undefined}
    >
      {/* Background Animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-10 left-10 text-4xl"
          animate={{
            x: [0, 50, 0],
            y: [0, -30, 0],
            rotate: [0, 10, 0]
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          🐑
        </motion.div>
        <motion.div
          className="absolute top-20 right-20 text-4xl"
          animate={{
            x: [0, -40, 0],
            y: [0, 40, 0],
            rotate: [0, -15, 0]
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
        >
          🐑
        </motion.div>
        <motion.div
          className="absolute bottom-20 left-1/4 text-4xl"
          animate={{
            x: [0, 30, 0],
            y: [0, -20, 0],
            rotate: [0, 5, 0]
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 4
          }}
        >
          🐑
        </motion.div>
      </div>
      
      {/* Main Content */}
      <div className="relative max-w-2xl w-full text-center">
        {/* Title */}
        <motion.h1
          className="text-6xl md:text-8xl font-black text-blue-400 mb-4 tracking-wider"
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          style={{
            fontFamily: 'Arial Black, Arial, sans-serif',
            textShadow: '3px 3px 0px #000',
            textTransform: 'uppercase'
          }}
        >
          SHEEP DOG
        </motion.h1>
        
        <motion.h2
          className="text-3xl md:text-4xl font-bold text-blue-300 mb-8"
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          style={{
            textShadow: '2px 2px 0px #000'
          }}
        >
          SIMULATOR
        </motion.h2>
        
        {/* Music Note */}
        <AnimatePresence>
          {showMusic && (
            <motion.p
              className="text-gray-300 text-lg mb-8 italic"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              🎵 Click anywhere to enable music
            </motion.p>
          )}
        </AnimatePresence>
        
        {/* Instructions */}
        <motion.div
          className="ui-panel mb-8 text-left max-w-lg mx-auto"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
        >
          <h3 className="text-blue-400 text-xl font-bold mb-4 text-center">
            How to Play
          </h3>
          <div className="space-y-2 text-white/90">
            <p className="flex items-center gap-2">
              <span>🎯</span>
              Guide all sheep into the pen using herding techniques
            </p>
            <p className="flex items-center gap-2">
              <span>🐕</span>
              Position yourself strategically to influence sheep movement
            </p>
            <p className="flex items-center gap-2">
              <span>⚡</span>
              Manage your stamina - sprint wisely!
            </p>
            <p className="flex items-center gap-2">
              <span>🏃</span>
              Sheep will flee from you and flock together naturally
            </p>
          </div>
        </motion.div>
        
        {/* Dog Selection */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.0 }}
        >
          <DogSelector
            selectedDog={gameState.selectedDog}
            onSelectDog={handleDogSelect}
          />
        </motion.div>
        
        {/* Start Button */}
        <motion.button
          className="btn-primary text-xl py-4 px-8 mt-8 animate-pulse-glow"
          onClick={handleStartGame}
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {platform === 'desktop' ? (
            <>
              <span className="mr-2">🎮</span>
              Press Enter to Start
            </>
          ) : (
            <>
              <span className="mr-2">👆</span>
              Tap to Start
            </>
          )}
        </motion.button>
        
        {/* Platform Hints */}
        <motion.div
          className="mt-6 text-white/70 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.4 }}
        >
          {platform === 'desktop' ? (
            <p>Use WASD to move • Shift to sprint • Mouse to look around</p>
          ) : (
            <p>Touch controls • Pinch to zoom • Tap to sprint</p>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
};

export default StartScreen;