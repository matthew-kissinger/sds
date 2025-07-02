import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGameBridge, useMultiplayer, useCompetitionComplete } from './hooks/useGameBridge.js';
import StartScreen from './components/StartScreen.jsx';
import GameHUD from './components/GameHUD.jsx';
import MultiplayerHUD, { CompetitionCompleteOverlay } from './components/MultiplayerHUD.jsx';
import gameBridge from './utils/GameBridge.js';

function App() {
  const { gameState } = useGameBridge();
  const multiplayerState = useMultiplayer();
  const [competitionData, setCompetitionData] = useState(null);
  
  // Handle competition completion
  useCompetitionComplete(useCallback((data) => {
    setCompetitionData(data);
  }, []));
  
  const handleRestart = useCallback(() => {
    window.location.reload();
  }, []);
  
  useEffect(() => {
    // Wait for the existing game to initialize
    const initializeGameBridge = () => {
      // Look for the global game instance
      if (window.gameInstance) {
        gameBridge.setGameInstance(window.gameInstance);
        console.log('Game bridge connected to existing game instance');
      } else {
        // Retry after a short delay
        setTimeout(initializeGameBridge, 100);
      }
    };
    
    initializeGameBridge();
    
    // Listen for Enter key on desktop
    const handleKeyPress = (e) => {
      if (e.key === 'Enter' && !gameState.gameStarted) {
        gameBridge.emit('start-game', {
          mode: 'solo',
          dog: gameState.selectedDog
        });
      }
    };
    
    document.addEventListener('keydown', handleKeyPress);
    
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [gameState.gameStarted, gameState.selectedDog]);
  
  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Three.js Canvas container (existing game renders here) */}
      <div id="canvas-container" className="absolute inset-0" />
      
      {/* React UI Layer */}
      <AnimatePresence mode="wait">
        {!gameState.gameStarted && (
          <StartScreen key="start-screen" />
        )}
      </AnimatePresence>
      
      {/* Game HUD - only show when game is running */}
      <AnimatePresence>
        {gameState.gameStarted && (
          <GameHUD key="game-hud" />
        )}
      </AnimatePresence>
      
      {/* Multiplayer HUD - show when multiplayer is enabled */}
      <AnimatePresence>
        {gameState.gameStarted && multiplayerState.enabled && (
          <MultiplayerHUD
            key="multiplayer-hud"
            players={multiplayerState.players}
            scores={multiplayerState.scores}
            currentPlayerId={multiplayerState.currentPlayerId}
            connectionStatus={multiplayerState.connectionStatus}
            ping={multiplayerState.ping}
            gameMode={multiplayerState.gameMode}
            winCondition={multiplayerState.winCondition}
          />
        )}
      </AnimatePresence>
      
      {/* Competition Complete Overlay */}
      {competitionData && (
        <CompetitionCompleteOverlay
          winner={competitionData.winner}
          winType={competitionData.winType}
          finalScores={competitionData.finalScores}
          players={multiplayerState.players}
          currentPlayerId={multiplayerState.currentPlayerId}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}

export default App;