import { useEffect, useState, useCallback } from 'react';
import gameBridge from '../utils/GameBridge.js';

export function useGameBridge() {
  const [gameState, setGameState] = useState({
    gameStarted: false,
    currentScreen: 'start',
    selectedDog: 'jep',
    platform: 'desktop',
    inputMethod: 'mouse'
  });
  
  useEffect(() => {
    // Initial state
    setGameState(gameBridge.getUIState());
    
    // Listen for state changes
    const unsubscribe = gameBridge.on('ui-state-changed', setGameState);
    
    return unsubscribe;
  }, []);
  
  const emit = useCallback((event, data) => {
    gameBridge.emit(event, data);
  }, []);
  
  return { gameState, emit };
}

export function useGameData() {
  const [data, setData] = useState({
    stamina: 100,
    sheepCount: 0,
    totalSheep: 200,
    gameTime: 0
  });
  
  useEffect(() => {
    const handleUpdate = (newData) => {
      setData(newData);
      // Debug log every 5 seconds
      if (newData.gameTime % 5 === 0 && newData.gameTime !== data.gameTime) {
        console.log('📊 React received game data:', newData);
      }
    };
    
    const unsubscribe = gameBridge.on('game-update', handleUpdate);
    return unsubscribe;
  }, []);
  
  return data;
}

export function usePlatform() {
  const [platform, setPlatform] = useState('desktop');
  const [inputMethod, setInputMethod] = useState('mouse');
  
  useEffect(() => {
    const detectPlatform = () => {
      const ua = navigator.userAgent;
      const hasTouch = 'ontouchstart' in window;
      const width = window.innerWidth;
      
      if (/iPhone|iPad|iPod|Android/i.test(ua)) {
        setPlatform('mobile');
      } else if (hasTouch && width < 1024) {
        setPlatform('tablet');
      } else {
        setPlatform('desktop');
      }
    };
    
    const detectInputMethod = () => {
      let lastTouchTime = 0;
      
      const handleTouch = () => {
        lastTouchTime = Date.now();
        setInputMethod('touch');
      };
      
      const handleMouse = () => {
        if (Date.now() - lastTouchTime > 500) {
          setInputMethod('mouse');
        }
      };
      
      document.addEventListener('touchstart', handleTouch);
      document.addEventListener('mousemove', handleMouse);
      
      return () => {
        document.removeEventListener('touchstart', handleTouch);
        document.removeEventListener('mousemove', handleMouse);
      };
    };
    
    detectPlatform();
    const cleanup = detectInputMethod();
    
    window.addEventListener('resize', detectPlatform);
    
    return () => {
      window.removeEventListener('resize', detectPlatform);
      cleanup();
    };
  }, []);
  
  return { platform, inputMethod };
}

// Hook for multiplayer data
export function useMultiplayer() {
  const [multiplayerState, setMultiplayerState] = useState(gameBridge.getMultiplayerState());
  
  useEffect(() => {
    const unsubscribe = gameBridge.on('multiplayer-update', (state) => {
      setMultiplayerState(state);
    });
    
    return unsubscribe;
  }, []);
  
  return multiplayerState;
}

// Hook for competition completion
export function useCompetitionComplete(onComplete) {
  useEffect(() => {
    const unsubscribe = gameBridge.on('competition-complete', onComplete);
    return unsubscribe;
  }, [onComplete]);
}